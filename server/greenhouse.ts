import { chromium, Browser, Page } from 'playwright';
import { mkdirSync, mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve as resolvePath } from 'path';
import type { ApplicationProfile, ApplyResult } from '../types';
import { generateApplicationAnswers } from './gemini';

// --- Greenhouse Job Board API types (subset we use) ---
interface GhFieldValue { label: string; value: string | number; }
interface GhField { name: string; type: string; values?: GhFieldValue[]; }
interface GhQuestion { label: string; required: boolean; fields: GhField[]; description?: string | null; }
interface GhJob {
  id: number;
  title: string;
  absolute_url: string;
  content: string; // HTML-encoded JD
  questions?: GhQuestion[];
  location_questions?: GhQuestion[];
  compliance?: { questions: GhQuestion[] }[];
  company_name?: string;
}

export interface ParsedJobUrl { boardToken: string | null; jobId: string; sourceUrl: string; }

export interface JobInfo {
  boardToken: string;
  jobId: string;
  jobTitle: string;
  company: string;
  applyUrl: string;
  jdText: string;
  questions: GhQuestion[];
}

export interface PlannedField {
  name: string;
  type: string;
  label: string;
  required: boolean;
  value: string;          // text value, or chosen option label for selects
  isFile?: boolean;
  options?: GhFieldValue[];
}

export interface FieldPlan {
  fields: PlannedField[];
  blockers: string[];     // required fields we could not confidently fill
}

const STANDARD_TEXT_FIELDS: Record<string, (p: ApplicationProfile) => string> = {
  first_name: p => p.firstName,
  last_name: p => p.lastName,
  email: p => p.email,
  phone: p => p.phone,
};

// Accept boards.greenhouse.io, job-boards.greenhouse.io, and company pages with ?gh_jid=.
// boardToken is null for company-embedded URLs and is resolved later via discoverBoardToken().
export function parseGreenhouseUrl(raw: string): ParsedJobUrl {
  const sourceUrl = raw.trim();
  let url: URL;
  try {
    url = new URL(sourceUrl);
  } catch {
    throw new Error('Invalid URL');
  }

  const ghJid = url.searchParams.get('gh_jid');
  const pathMatch = url.pathname.match(/\/([^/]+)\/jobs\/(\d+)/);

  if (url.hostname.endsWith('greenhouse.io') && pathMatch) {
    return { boardToken: pathMatch[1], jobId: pathMatch[2], sourceUrl };
  }
  if (ghJid) {
    // Company career page embedding Greenhouse — token discovered from the live page.
    return { boardToken: null, jobId: ghJid, sourceUrl };
  }
  throw new Error('Not a recognized Greenhouse job URL (need a boards.greenhouse.io link or a ?gh_jid= page).');
}

// Company pages load the board token at runtime; sniff the boards-api call to recover it.
export async function discoverBoardToken(pageUrl: string): Promise<string> {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    let token: string | null = null;
    page.on('request', req => {
      const m = req.url().match(/boards-api\.greenhouse\.io\/v1\/boards\/([^/?]+)/);
      if (m) token = m[1];
    });
    await page.goto(pageUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(5000);
    if (!token) throw new Error('Could not discover the Greenhouse board token from this page.');
    return token;
  } finally {
    await browser.close();
  }
}

// Parse a URL and resolve the board token (discovering it for company-embedded pages).
export async function resolveJob(rawUrl: string): Promise<JobInfo> {
  const parsed = parseGreenhouseUrl(rawUrl);
  const boardToken = parsed.boardToken || await discoverBoardToken(parsed.sourceUrl);
  return fetchJob({ boardToken, jobId: parsed.jobId, sourceUrl: parsed.sourceUrl });
}

function decodeHtmlToText(html: string): string {
  // Greenhouse returns content HTML-entity-encoded, so decode entities BEFORE stripping tags.
  const decoded = html
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
  return decoded
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export async function fetchJob({ boardToken, jobId }: { boardToken: string; jobId: string; sourceUrl?: string }): Promise<JobInfo> {
  const apiUrl = `https://boards-api.greenhouse.io/v1/boards/${boardToken}/jobs/${jobId}?questions=true`;
  const res = await fetch(apiUrl);
  if (!res.ok) {
    throw new Error(`Greenhouse API returned ${res.status} for ${boardToken}/${jobId}`);
  }
  const job = (await res.json()) as GhJob;

  const questions = [
    ...(job.questions || []),
    ...(job.location_questions || []),
    ...((job.compliance || []).flatMap(c => c.questions || [])),
  ];

  return {
    boardToken,
    jobId,
    jobTitle: job.title,
    company: job.company_name || boardToken,
    applyUrl: job.absolute_url,
    jdText: decodeHtmlToText(job.content || ''),
    questions,
  };
}

const SELECT_TYPES = new Set(['multi_value_single_select', 'multi_value_multi_select']);

export async function buildFieldPlan(
  job: JobInfo,
  profile: ApplicationProfile,
  cvText: string,
): Promise<FieldPlan> {
  const fields: PlannedField[] = [];
  const blockers: string[] = [];

  // Questions that need AI: free-text customs + selects (option chosen by AI given profile).
  const aiQuestions = job.questions.filter(q => {
    const f = q.fields[0];
    if (!f) return false;
    if (STANDARD_TEXT_FIELDS[f.name]) return false;
    if (f.type === 'input_file') return false;
    return true;
  });

  const aiAnswers = await generateApplicationAnswers({
    company: job.company,
    jobTitle: job.jobTitle,
    jdText: job.jdText,
    cvText,
    profile,
    questions: aiQuestions.map(q => ({
      name: q.fields[0].name,
      label: q.label,
      required: q.required,
      type: q.fields[0].type,
      options: (q.fields[0].values || []).map(v => v.label),
    })),
  });

  for (const q of job.questions) {
    const f = q.fields[0];
    if (!f) continue;

    // Standard contact fields from profile.
    if (STANDARD_TEXT_FIELDS[f.name]) {
      const value = (STANDARD_TEXT_FIELDS[f.name](profile) || '').trim();
      if (!value && q.required) blockers.push(`${q.label} (missing in your Application Profile)`);
      fields.push({ name: f.name, type: f.type, label: q.label, required: q.required, value });
      continue;
    }

    // Resume / cover letter file inputs.
    if (f.type === 'input_file') {
      fields.push({ name: f.name, type: f.type, label: q.label, required: q.required, value: '', isFile: true });
      continue;
    }

    // AI-handled (free-text or select).
    const ans = aiAnswers[f.name];
    const value = (ans?.value || '').trim();
    const isSelect = SELECT_TYPES.has(f.type);

    if (isSelect && value) {
      // Validate the chosen label actually exists in the options.
      const match = (f.values || []).find(v => v.label.toLowerCase() === value.toLowerCase());
      if (!match) {
        if (q.required) blockers.push(`${q.label} (no confident answer)`);
        fields.push({ name: f.name, type: f.type, label: q.label, required: q.required, value: '', options: f.values });
        continue;
      }
    }

    if (!value && q.required) blockers.push(`${q.label} (no confident answer)`);
    fields.push({ name: f.name, type: f.type, label: q.label, required: q.required, value, options: f.values });
  }

  return { fields, blockers };
}

type ProgressFn = (step: string, message?: string) => void;

const RESUME_CSS = `body{font-family:Calibri,Arial,sans-serif;font-size:11pt;color:#000;line-height:1.3;padding:20mm;}
h1{font-size:18pt;font-weight:bold;border-bottom:1px solid #000;margin:0 0 6pt;}
h2{font-size:14pt;font-weight:bold;margin:12pt 0 6pt;text-transform:uppercase;}
p{margin:0 0 6pt;}ul{margin:0 0 6pt 24pt;}li{margin-bottom:2pt;}
a{color:#0563C1;text-decoration:underline;}strong,b{font-weight:bold;}em,i{font-style:italic;}`;

// Render the CV HTML to a PDF named after the candidate (the basename becomes the uploaded filename).
async function renderResumePdf(browser: Browser, cvHtml: string, baseName: string): Promise<string> {
  const page = await browser.newPage();
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${RESUME_CSS}</style></head><body>${cvHtml}</body></html>`;
  await page.setContent(html, { waitUntil: 'networkidle' });
  const dir = mkdtempSync(join(tmpdir(), 'auto-apply-'));
  const path = join(dir, `${baseName}.pdf`);
  await page.pdf({ path, format: 'A4', printBackground: true });
  await page.close();
  return path;
}

// GH shows the filename + a remove control once a file is attached (give React a moment to render).
async function resumeAttached(page: Page, fileName: string): Promise<boolean> {
  try {
    await page.getByText(fileName, { exact: false }).first().waitFor({ state: 'visible', timeout: 4000 });
    return true;
  } catch {
    return false;
  }
}

// GH's React uploader sometimes ignores a direct setInputFiles; fall back to the Attach filechooser.
async function uploadResume(page: Page, filePath: string, fileName: string): Promise<boolean> {
  try {
    await page.locator('[id="resume"], [name="resume"]').first().setInputFiles(filePath, { timeout: 5000 });
  } catch { /* try fallback */ }
  if (await resumeAttached(page, fileName)) return true;

  try {
    const attach = page.getByRole('button', { name: /^attach$/i }).first();
    const [chooser] = await Promise.all([
      page.waitForEvent('filechooser', { timeout: 5000 }),
      attach.click(),
    ]);
    await chooser.setFiles(filePath);
    await page.waitForTimeout(800);
  } catch { /* nothing else to try */ }
  return await resumeAttached(page, fileName);
}

// Greenhouse custom dropdowns are react-select comboboxes (input[role=combobox], id=field name,
// classNamePrefix "select"). Open by clicking, filter by typing, then click the option by EXACT
// text inside .select__menu — scoping here avoids the phone widget's always-present country list.
async function fillSelect(page: Page, name: string, optionLabel: string): Promise<boolean> {
  const input = page.locator(`[id="${name}"], [name="${name}"]`).first();
  try {
    await input.scrollIntoViewIfNeeded();
    await input.click({ timeout: 5000 });
    await page.keyboard.type(optionLabel, { delay: 30 });
    const option = page.locator('.select__menu .select__option')
      .getByText(optionLabel, { exact: true }).first();
    await option.waitFor({ state: 'visible', timeout: 4000 });
    await option.click();
    return true;
  } catch {
    return false;
  }
}

async function fillText(page: Page, name: string, value: string): Promise<boolean> {
  const input = page.locator(`[id="${name}"], [name="${name}"]`).first();
  try {
    await input.fill(value, { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

// True only for a *visible interactive* challenge (reCAPTCHA v2 checkbox / hCaptcha),
// not the invisible reCAPTCHA v3 badge that Greenhouse loads on every board.
async function detectCaptcha(page: Page): Promise<boolean> {
  const challenge = page.locator(
    'iframe[src*="recaptcha/api2/anchor"]:not([src*="size=invisible"]), iframe[src*="hcaptcha.com"][src*="frame=checkbox"]'
  );
  return await challenge.first().isVisible().catch(() => false);
}

export async function runApply(opts: {
  job: JobInfo;
  plan: FieldPlan;
  cvHtml: string;
  resumePath?: string;
  dryRun: boolean;
  headless: boolean;
  progress: ProgressFn;
}): Promise<ApplyResult> {
  const { job, plan, cvHtml, resumePath, dryRun, headless, progress } = opts;

  // Per-posting audit log of what got filled (no file fields, no empty values).
  const answers = plan.fields
    .filter(f => !f.isFile && f.value)
    .map(f => ({ name: f.name, label: f.label, value: f.value }));
  const base = { jobTitle: job.jobTitle, company: job.company, boardToken: job.boardToken, jobId: job.jobId, answers };

  // Hard gate: never submit a real application with unresolved required fields.
  if (plan.blockers.length > 0 && !dryRun) {
    return { status: 'aborted', ...base, blockers: plan.blockers };
  }

  const nameFor = (n: string) => plan.fields.find(f => f.name === n)?.value || '';
  const resumeBase = `${nameFor('first_name')}_${nameFor('last_name')}_Resume`.replace(/[^A-Za-z0-9_]/g, '') || 'Resume';

  // Slow down actions when visible so the user can follow the automation.
  const browser = await chromium.launch({ headless, slowMo: headless ? 0 : 350 });

  // Record video only in local/dev runs (never in production — Render disk is ephemeral).
  // Toggle by env RECORD_VIDEO=1/true, or implicitly when running non-headless in dev.
  const recordVideoEnv = (process.env.RECORD_VIDEO || '').toLowerCase();
  const recordVideo = recordVideoEnv === '1' || recordVideoEnv === 'true'
    || (process.env.NODE_ENV !== 'production' && !headless);
  let videoDir: string | undefined;
  if (recordVideo) {
    videoDir = resolvePath(process.cwd(), 'recordings', `${job.boardToken}_${job.jobId}_${Date.now()}`);
    mkdirSync(videoDir, { recursive: true });
    progress('navigate', `Recording video to ${videoDir.replace(process.cwd() + '/', '')}`);
  }

  try {
    // Prefer the user's real resume file when provided; otherwise render the CV HTML to PDF.
    let resolvedResumePath: string;
    if (resumePath) {
      progress('render_resume', `Using provided resume: ${resumePath.split('/').pop()}`);
      resolvedResumePath = resumePath;
    } else {
      progress('render_resume', 'Rendering resume PDF from CV HTML');
      resolvedResumePath = await renderResumePdf(browser, cvHtml, resumeBase);
    }
    const resumeFileName = resolvedResumePath.split('/').pop() || `${resumeBase}.pdf`;

    // BrowserContext (not browser.newPage) is required for video capture.
    const context = await browser.newContext(
      videoDir ? { recordVideo: { dir: videoDir, size: { width: 1280, height: 800 } } } : undefined,
    );
    const page = await context.newPage();
    progress('navigate', `Opening ${job.applyUrl}`);
    await page.goto(job.applyUrl, { waitUntil: 'domcontentloaded' });
    // Wait for the React form to hydrate before filling, else change handlers (e.g. resume) are missed.
    await page.locator('[id="first_name"], [id="email"], input[type="file"]').first()
      .waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(1500);

    progress('fill', 'Filling application fields');
    for (const field of plan.fields) {
      if (field.isFile) {
        if (field.name === 'resume') {
          const ok = await uploadResume(page, resolvedResumePath, resumeFileName);
          if (!ok) progress('fill', 'Could not attach resume');
        }
        continue;
      }
      if (!field.value) continue;
      const ok = SELECT_TYPES.has(field.type)
        ? await fillSelect(page, field.name, field.value)
        : await fillText(page, field.name, field.value);
      if (!ok) progress('fill', `Could not fill: ${field.label}`);
    }

    // Dry run: capture the filled form without submitting (shows result even if a captcha is present).
    if (dryRun) {
      progress('dry_run', 'Dry run — not submitting');
      const shot = await page.screenshot({ fullPage: true });
      return {
        status: 'dry_run', ...base,
        blockers: plan.blockers.length ? plan.blockers : undefined,
        screenshot: shot.toString('base64'),
      };
    }

    // Only a *visible interactive* challenge blocks autonomous submit; invisible v3 does not.
    if (await detectCaptcha(page)) {
      const shot = await page.screenshot({ fullPage: true });
      return {
        status: 'aborted', ...base,
        blockers: ['Interactive CAPTCHA detected — autonomous submit blocked'],
        screenshot: shot.toString('base64'),
      };
    }

    progress('submit', 'Submitting application');
    const submit = page.getByRole('button', { name: /submit application|submit/i }).first();
    await submit.click({ timeout: 10000 });
    await page.waitForLoadState('networkidle').catch(() => {});

    // Confirm the submission actually went through before reporting success.
    const confirmation = page.getByText(
      /thank you|application (has been )?(submitted|received)|successfully|we('| ha)ve received/i
    ).first();
    const confirmed = await confirmation.isVisible({ timeout: 8000 }).catch(() => false);
    const shot = await page.screenshot({ fullPage: true });

    if (!confirmed) {
      return {
        status: 'error', ...base,
        blockers: ['Clicked submit but no confirmation was detected — verify manually'],
        screenshot: shot.toString('base64'),
      };
    }
    return {
      status: 'submitted', ...base,
      screenshot: shot.toString('base64'),
    };
  } catch (err: any) {
    return { status: 'error', ...base, blockers: [err?.message || 'Unknown error'] };
  } finally {
    await browser.close();
  }
}
