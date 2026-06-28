import { chromium, Browser, Page } from 'playwright';
import { mkdirSync, mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve as resolvePath } from 'path';
import type { ApplicationProfile, ApplyResult } from '../types';
import { generateApplicationAnswers } from './gemini';

// ─── URL parsing ──────────────────────────────────────────────────────────

export interface ParsedLeverUrl {
  company: string;
  jobId: string;
  sourceUrl: string;
}

// Matches:
//   https://jobs.lever.co/{company}/{jobId}
//   https://jobs.lever.co/{company}/{jobId}/apply
export function parseLeverUrl(raw: string): ParsedLeverUrl {
  const sourceUrl = raw.trim();
  let url: URL;
  try { url = new URL(sourceUrl); } catch { throw new Error('Invalid URL'); }

  if (url.hostname === 'jobs.lever.co') {
    const parts = url.pathname.replace(/^\//, '').split('/');
    if (parts.length >= 2 && parts[0] && parts[1]) {
      return { company: parts[0], jobId: parts[1], sourceUrl };
    }
  }
  throw new Error('Not a recognized Lever URL. Expected: https://jobs.lever.co/{company}/{jobId}');
}

export function isLeverUrl(raw: string): boolean {
  try { parseLeverUrl(raw); return true; } catch { return false; }
}

// ─── Job info from public API ─────────────────────────────────────────────

export interface LeverJobInfo {
  company: string;
  jobId: string;
  jobTitle: string;
  applyUrl: string;
  jdText: string;
}

export async function fetchLeverJob(parsed: ParsedLeverUrl): Promise<LeverJobInfo> {
  const res = await fetch(
    `https://api.lever.co/v0/postings/${parsed.company}/${parsed.jobId}`
  );
  if (!res.ok) throw new Error(`Lever API ${res.status} for ${parsed.company}/${parsed.jobId}`);
  const job = (await res.json()) as any;

  const jdText = (job.descriptionPlain || stripHtml(job.description || '')).trim()
    + (job.additionalPlain ? '\n\n' + job.additionalPlain : '');

  return {
    company: parsed.company.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
    jobId: parsed.jobId,
    jobTitle: job.text,
    applyUrl: `https://jobs.lever.co/${parsed.company}/${parsed.jobId}/apply`,
    jdText,
  };
}

export async function resolveLeverJob(rawUrl: string): Promise<LeverJobInfo> {
  return fetchLeverJob(parseLeverUrl(rawUrl));
}

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
    .replace(/\n{3,}/g, '\n\n').trim();
}

// ─── Form scraping ────────────────────────────────────────────────────────

export interface LeverField {
  name: string;
  label: string;
  type: 'text' | 'email' | 'tel' | 'textarea' | 'select' | 'file' | 'url' | 'radio' | 'checkbox';
  required: boolean;
  options?: string[];
  isFile?: boolean;
}

// Lever has a fixed standard form + optional custom questions section.
// page.evaluate callback must be pure JS — no TypeScript types, no named helpers
// that esbuild would rewrite with __name(). Serialised as a string and run in browser.
async function scrapeLeverForm(page: Page): Promise<LeverField[]> {
  await page.waitForSelector('[name="name"], [data-qa="name-input"]', { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(1500);

  const raw = await page.evaluate(() => {
    const fields: Array<{
      name: string; label: string; type: string; required: boolean;
      isFile: boolean; options?: string[];
    }> = [];

    // Standard fixed fields
    const stds: Array<[string, string, string, boolean]> = [
      ['[name="resume"], #resume-upload-input', 'resume', 'Resume', false],
      ['[name="name"], [data-qa="name-input"]', 'name', 'Full name', true],
      ['[name="email"], [data-qa="email-input"]', 'email', 'Email', true],
      ['[name="phone"], [data-qa="phone-input"]', 'phone', 'Phone', true],
      ['[name="org"], [data-qa="org-input"]', 'org', 'Current company', true],
      ['#location-input, [name="location"]', 'location', 'Location', false],
    ];
    for (const [sel, name, label, required] of stds) {
      const el = document.querySelector(sel);
      if (el) {
        const t = el.getAttribute('type') || '';
        fields.push({ name, label, type: t === 'file' ? 'file' : t || 'text', required, isFile: t === 'file' });
      }
    }

    // Social URL fields (urls[LinkedIn], urls[GitHub], …)
    const urlEls = document.querySelectorAll('[name^="urls["]');
    urlEls.forEach(function(inp) {
      const n = inp.getAttribute('name') || '';
      const closest = inp.closest('li');
      const lbl = (closest && (closest.querySelector('label') || closest.querySelector('.application-label')))?.textContent?.trim() || n;
      fields.push({ name: n, label: lbl, type: 'url', required: false, isFile: false });
    });

    // Custom questions
    const stdNames = ['name','email','phone','org','location'];
    const customEls = document.querySelectorAll('.application-question, [class*="custom-question"]');
    customEls.forEach(function(item) {
      const inp = item.querySelector('input:not([type=hidden]):not([type=file]),textarea,select');
      if (!inp) return;
      const name = inp.getAttribute('name') || '';
      if (!name || stdNames.indexOf(name) >= 0 || name.indexOf('urls[') === 0) return;
      const lbl = (item.querySelector('label') || item.querySelector('.application-label') || item.querySelector('h4'))?.textContent?.trim() || name;
      let type = 'text';
      if (inp.tagName === 'TEXTAREA') type = 'textarea';
      else if (inp.tagName === 'SELECT') type = 'select';
      else type = inp.getAttribute('type') || 'text';

      let opts: string[] | undefined;
      if (type === 'select') {
        opts = Array.from((inp as HTMLSelectElement).options).map(function(o) { return o.text; }).filter(Boolean);
      } else if (type === 'radio' || type === 'checkbox') {
        opts = Array.from(item.querySelectorAll('label')).map(function(l) { return l.textContent?.trim() || ''; }).filter(Boolean);
      }
      fields.push({ name, label: lbl, type, required: (inp as HTMLInputElement).required || false, isFile: false, options: opts });
    });

    return fields;
  });

  return raw as LeverField[];
}

// ─── Field plan ───────────────────────────────────────────────────────────

export interface LeverFieldPlan {
  fields: { name: string; label: string; type: LeverField['type']; value: string; isFile?: boolean; options?: string[] }[];
  blockers: string[];
}

export async function buildLeverFieldPlan(
  job: LeverJobInfo,
  fields: LeverField[],
  profile: ApplicationProfile,
  cvText: string,
): Promise<LeverFieldPlan> {
  const planned: LeverFieldPlan['fields'] = [];
  const blockers: string[] = [];

  // Identify custom fields needing AI
  const standardNames = new Set(['resume', 'name', 'email', 'phone', 'org', 'location']);
  const aiFields = fields.filter(f =>
    !f.isFile && !standardNames.has(f.name) && !f.name.startsWith('urls[')
  );

  let aiAnswers: Record<string, { value: string }> = {};
  if (aiFields.length > 0) {
    aiAnswers = await generateApplicationAnswers({
      company: job.company,
      jobTitle: job.jobTitle,
      jdText: job.jdText,
      cvText,
      profile,
      questions: aiFields.map(f => ({
        name: f.name,
        label: f.label,
        required: f.required,
        type: f.type === 'select' || f.type === 'radio' ? 'multi_value_single_select' : 'input_text',
        options: f.options,
      })),
    });
  }

  for (const f of fields) {
    if (f.isFile) {
      planned.push({ ...f, value: '' });
      continue;
    }

    // Standard
    if (f.name === 'name') { planned.push({ ...f, value: `${profile.firstName} ${profile.lastName}`.trim() }); continue; }
    if (f.name === 'email') { planned.push({ ...f, value: profile.email }); continue; }
    if (f.name === 'phone') { planned.push({ ...f, value: profile.phone }); continue; }
    if (f.name === 'org') { planned.push({ ...f, value: 'ShopOS' }); continue; }
    if (f.name === 'location') { planned.push({ ...f, value: profile.location }); continue; }

    // Social URLs
    if (f.name === 'urls[LinkedIn]') { planned.push({ ...f, value: profile.linkedinUrl }); continue; }
    if (f.name === 'urls[GitHub]' || f.name === 'urls[Github]') { planned.push({ ...f, value: profile.githubUrl }); continue; }
    if (/portfolio|website|personal/i.test(f.name) || /portfolio|website|personal/i.test(f.label)) {
      planned.push({ ...f, value: profile.portfolioUrl }); continue;
    }
    if (f.name.startsWith('urls[')) {
      // Other URL fields — Twitter, personal site, etc. Skip unless we have something
      planned.push({ ...f, value: '' }); continue;
    }

    // AI custom
    const ans = aiAnswers[f.name];
    const value = (ans?.value || '').trim();
    if (!value && f.required) blockers.push(`${f.label} (no confident answer)`);
    planned.push({ ...f, value });
  }

  return { fields: planned, blockers };
}

// ─── Resume PDF render ────────────────────────────────────────────────────

const RESUME_CSS = `body{font-family:Calibri,Arial,sans-serif;font-size:11pt;color:#000;line-height:1.3;padding:20mm;}
h1{font-size:18pt;font-weight:bold;border-bottom:1px solid #000;margin:0 0 6pt;}
h2{font-size:14pt;font-weight:bold;margin:12pt 0 6pt;text-transform:uppercase;}
p{margin:0 0 6pt;}ul{margin:0 0 6pt 24pt;}li{margin-bottom:2pt;}
a{color:#0563C1;text-decoration:underline;}strong,b{font-weight:bold;}em,i{font-style:italic;}`;

async function renderResumePdf(browser: Browser, cvHtml: string, baseName: string): Promise<string> {
  const page = await browser.newPage();
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${RESUME_CSS}</style></head><body>${cvHtml}</body></html>`;
  await page.setContent(html, { waitUntil: 'networkidle' });
  const dir = mkdtempSync(join(tmpdir(), 'lever-apply-'));
  const path = join(dir, `${baseName}.pdf`);
  await page.pdf({ path, format: 'A4', printBackground: true });
  await page.close();
  return path;
}

// ─── Filling helpers ──────────────────────────────────────────────────────

async function fillLeverLocation(page: Page, location: string): Promise<void> {
  try {
    const inp = page.locator('#location-input, [name="location"]').first();
    await inp.fill(location, { timeout: 4000 });
    await page.waitForTimeout(1200);
    // Click first autocomplete suggestion if it appears
    const suggestion = page.locator('.menu-item, [class*=suggestion], [class*=autocomplete] li').first();
    const visible = await suggestion.isVisible({ timeout: 2000 }).catch(() => false);
    if (visible) await suggestion.click();
    // Otherwise just leave typed text — Lever accepts free-text location
  } catch { /* non-critical */ }
}

async function uploadLeverResume(page: Page, filePath: string): Promise<boolean> {
  try {
    const input = page.locator('#resume-upload-input, [name="resume"]').first();
    await input.setInputFiles(filePath, { timeout: 6000 });
    await page.waitForTimeout(1500);
    return true;
  } catch { return false; }
}

// ─── Main apply runner ────────────────────────────────────────────────────

type ProgressFn = (step: string, message?: string) => void;

export async function runLeverApply(opts: {
  job: LeverJobInfo;
  profile: ApplicationProfile;
  cvHtml: string;
  cvText: string;
  resumePath?: string;
  dryRun: boolean;
  headless: boolean;
  progress: ProgressFn;
}): Promise<ApplyResult> {
  const { job, profile, cvHtml, cvText, resumePath, dryRun, headless, progress } = opts;

  const base = {
    jobTitle: job.jobTitle,
    company: job.company,
    boardToken: job.company.toLowerCase().replace(/\s+/g, '-'),
    jobId: job.jobId,
    answers: [] as { name: string; label: string; value: string }[],
  };

  const resumeBase = `${profile.firstName}_${profile.lastName}_Resume`.replace(/[^A-Za-z0-9_]/g, '') || 'Resume';

  const browser = await chromium.launch({ headless, slowMo: headless ? 0 : 350 });

  const recordVideoEnv = (process.env.RECORD_VIDEO || '').toLowerCase();
  const recordVideo = recordVideoEnv === '1' || recordVideoEnv === 'true'
    || (process.env.NODE_ENV !== 'production' && !headless);
  let videoDir: string | undefined;
  if (recordVideo) {
    videoDir = resolvePath(process.cwd(), 'recordings', `${base.boardToken}_${job.jobId}_${Date.now()}`);
    mkdirSync(videoDir, { recursive: true });
    progress('navigate', `Recording video to ${videoDir.replace(process.cwd() + '/', '')}`);
  }

  try {
    // Render/resolve resume PDF
    let resolvedResumePath: string;
    if (resumePath) {
      progress('render_resume', `Using provided resume: ${resumePath.split('/').pop()}`);
      resolvedResumePath = resumePath;
    } else {
      progress('render_resume', 'Rendering resume PDF');
      resolvedResumePath = await renderResumePdf(browser, cvHtml, resumeBase);
    }

    const context = await browser.newContext(
      videoDir ? { recordVideo: { dir: videoDir, size: { width: 1280, height: 800 } } } : undefined,
    );
    const page = await context.newPage();

    progress('navigate', `Opening ${job.applyUrl}`);
    await page.goto(job.applyUrl, { waitUntil: 'domcontentloaded', timeout: 25000 });
    await page.waitForTimeout(2000);

    progress('plan', 'Reading form fields and drafting answers');
    const schemaFields = await scrapeLeverForm(page);
    const plan = await buildLeverFieldPlan(job, schemaFields, profile, cvText);

    base.answers = plan.fields
      .filter(f => !f.isFile && f.value)
      .map(f => ({ name: f.name, label: f.label, value: f.value }));

    if (plan.blockers.length > 0 && !dryRun) {
      return { status: 'aborted', ...base, blockers: plan.blockers };
    }

    // Fill fields
    progress('fill', 'Filling application fields');
    for (const field of plan.fields) {
      if (!field.value && !field.isFile) continue;

      if (field.isFile && field.name === 'resume') {
        const ok = await uploadLeverResume(page, resolvedResumePath);
        if (!ok) progress('fill', 'Could not attach resume');
        continue;
      }

      if (field.name === 'location') {
        await fillLeverLocation(page, field.value);
        continue;
      }

      try {
        const el = page.locator(
          `[name="${field.name}"], [data-qa="${field.name}-input"], #${field.name}-input`
        ).first();
        if (field.type === 'select') {
          await el.selectOption({ label: field.value }, { timeout: 4000 });
        } else {
          await el.fill(field.value, { timeout: 4000 });
        }
      } catch {
        progress('fill', `Could not fill: ${field.label}`);
      }
    }

    // Lever always has hCaptcha — cannot submit autonomously.
    // Return the filled form as a screenshot so the user can see what was prepared.
    const hasHCaptcha = await page.locator('#hcaptchaResponseInput, iframe[src*=hcaptcha]')
      .first().isVisible().catch(() => false);

    if (hasHCaptcha && !dryRun) {
      const shot = await page.screenshot({ fullPage: true });
      return {
        status: 'aborted',
        ...base,
        blockers: ['Lever requires hCaptcha on every submission — autonomous submit not possible. Form is fully filled above; open the URL and click Submit manually.'],
        screenshot: shot.toString('base64'),
      };
    }

    if (dryRun) {
      progress('dry_run', 'Dry run — not submitting');
      const shot = await page.screenshot({ fullPage: true });
      return {
        status: 'dry_run', ...base,
        blockers: plan.blockers.length ? plan.blockers : undefined,
        screenshot: shot.toString('base64'),
      };
    }

    // Attempt submit (only if hCaptcha somehow absent)
    progress('submit', 'Submitting application');
    const submitBtn = page.getByRole('button', { name: /submit application/i }).first();
    await submitBtn.click({ timeout: 8000 });
    await page.waitForLoadState('networkidle').catch(() => {});

    const confirmation = page.getByText(
      /thank you|application (has been )?(submitted|received)|successfully/i
    ).first();
    const confirmed = await confirmation.isVisible({ timeout: 8000 }).catch(() => false);
    const shot = await page.screenshot({ fullPage: true });

    if (!confirmed) {
      return {
        status: 'error', ...base,
        blockers: ['Clicked submit but no confirmation detected — verify manually'],
        screenshot: shot.toString('base64'),
      };
    }
    return { status: 'submitted', ...base, screenshot: shot.toString('base64') };

  } catch (err: any) {
    return { status: 'error', ...base, blockers: [err?.message || 'Unknown error'] };
  } finally {
    await browser.close();
  }
}
