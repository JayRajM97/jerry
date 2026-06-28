import { chromium, Browser, Page } from 'playwright';
import { mkdirSync, mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve as resolvePath } from 'path';
import type { ApplicationProfile, ApplyResult } from '../types';
import { generateApplicationAnswers } from './gemini';

// ─── URL parsing ────────────────────────────────────────────────────────────

export interface ParsedAshbyUrl {
  orgSlug: string;
  jobId: string;
  sourceUrl: string;
}

// Matches:
//   https://jobs.ashbyhq.com/{orgSlug}/{jobId}
//   https://jobs.ashbyhq.com/{orgSlug}/{jobId}/application
//   https://{orgSlug}.ashbyhq.com/{jobId}          (rare custom subdomain form)
export function parseAshbyUrl(raw: string): ParsedAshbyUrl {
  const sourceUrl = raw.trim();
  let url: URL;
  try { url = new URL(sourceUrl); } catch { throw new Error('Invalid URL'); }

  // jobs.ashbyhq.com/{org}/{jobId}[/application]
  if (url.hostname === 'jobs.ashbyhq.com') {
    const parts = url.pathname.replace(/^\//, '').split('/');
    if (parts.length >= 2 && parts[0] && parts[1]) {
      return { orgSlug: parts[0], jobId: parts[1], sourceUrl };
    }
  }
  // {org}.ashbyhq.com/{jobId}
  if (url.hostname.endsWith('.ashbyhq.com')) {
    const orgSlug = url.hostname.replace('.ashbyhq.com', '');
    const jobId = url.pathname.replace(/^\//, '').split('/')[0];
    if (orgSlug && jobId) return { orgSlug, jobId, sourceUrl };
  }

  throw new Error(
    'Not a recognized Ashby job URL. Expected: https://jobs.ashbyhq.com/{company}/{jobId}'
  );
}

export function isAshbyUrl(raw: string): boolean {
  try { parseAshbyUrl(raw); return true; } catch { return false; }
}

// ─── Job info from public API ─────────────────────────────────────────────

export interface AshbyJobInfo {
  orgSlug: string;
  jobId: string;
  jobTitle: string;
  company: string;
  applyUrl: string;
  jdText: string;
}

export async function fetchAshbyJob(parsed: ParsedAshbyUrl): Promise<AshbyJobInfo> {
  const res = await fetch(
    `https://api.ashbyhq.com/posting-api/job-board/${parsed.orgSlug}`
  );
  if (!res.ok) throw new Error(`Ashby API ${res.status} for org "${parsed.orgSlug}"`);
  const data = (await res.json()) as { jobs: any[] };

  const job = data.jobs.find(j => j.id === parsed.jobId);
  if (!job) throw new Error(`Job ${parsed.jobId} not found on ${parsed.orgSlug} board`);

  const jdText = (job.descriptionPlain || stripHtml(job.descriptionHtml || '')).trim();
  const applyUrl = job.applyUrl || `https://jobs.ashbyhq.com/${parsed.orgSlug}/${parsed.jobId}/application`;

  return {
    orgSlug: parsed.orgSlug,
    jobId: parsed.jobId,
    jobTitle: job.title,
    company: parsed.orgSlug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
    applyUrl,
    jdText,
  };
}

export async function resolveAshbyJob(rawUrl: string): Promise<AshbyJobInfo> {
  return fetchAshbyJob(parseAshbyUrl(rawUrl));
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

export interface AshbyField {
  fieldName: string;   // the name/id attribute value (UUID or _systemfield_*)
  label: string;       // human-readable label
  type: 'text' | 'email' | 'tel' | 'url' | 'textarea' | 'radio' | 'checkbox' | 'file' | 'location';
  required: boolean;
  options?: string[];  // for radio/checkbox
  isFile?: boolean;
  isSystemField?: boolean;
}

export interface AshbyFormSchema {
  fields: AshbyField[];
}

// Scrape the apply page to extract field labels + types.
// Ashby does not expose form fields via its public API — DOM is the only source.
// page.evaluate callback is plain JS — no TS types inside, no named helpers,
// to avoid esbuild injecting __name() which breaks in the browser serialised context.
async function scrapeFormSchema(page: Page): Promise<AshbyFormSchema> {
  await page.waitForSelector('label, input, textarea', { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(1500);

  const raw = await page.evaluate(() => {
    const out: Array<{
      fieldName: string; label: string; type: string; required: boolean;
      options?: string[]; isFile: boolean; isSystemField: boolean;
    }> = [];

    // Location typeahead has no name/id — detect by label text
    const allLabels = Array.from(document.querySelectorAll('label'));
    const hasLocation = allLabels.some(function(l) {
      return /^location$/i.test(l.textContent?.trim() || '');
    });
    if (hasLocation) {
      out.push({ fieldName: '_systemfield_location', label: 'Location', type: 'location', required: false, isFile: false, isSystemField: true });
    }

    const labelEls = Array.from(document.querySelectorAll('label[for]'));
    for (let i = 0; i < labelEls.length; i++) {
      const label = labelEls[i];
      const forId = label.getAttribute('for') || '';
      if (!forId) continue;
      if (forId.indexOf('-labeled-radio-') >= 0 || forId.indexOf('-labeled-checkbox-') >= 0) continue;
      if (forId === '_systemfield_location') continue;

      const el = document.getElementById(forId) || document.querySelector('[name="' + forId + '"]');
      if (!el) continue;

      const labelText = label.textContent?.trim() || forId;
      const tag = el.tagName.toLowerCase();
      const inputType = (el as HTMLInputElement).type?.toLowerCase() || '';

      let fieldType = 'text';
      if (tag === 'textarea') fieldType = 'textarea';
      else if (inputType === 'email') fieldType = 'email';
      else if (inputType === 'tel') fieldType = 'tel';
      else if (inputType === 'url') fieldType = 'url';
      else if (inputType === 'file') fieldType = 'file';
      else if (inputType === 'radio') fieldType = 'radio';
      else if (inputType === 'checkbox') fieldType = 'checkbox';

      let options: string[] | undefined;
      if (fieldType === 'radio' || fieldType === 'checkbox') {
        const radioLabels = Array.from(document.querySelectorAll('label[for^="' + forId + '-labeled-radio-"],label[for^="' + forId + '-labeled-checkbox-"]'));
        options = radioLabels.map(function(l) { return l.textContent?.trim() || ''; }).filter(Boolean);
        if (options.length === 0) {
          const related = Array.from(document.querySelectorAll('label[for*="' + forId + '"]'));
          options = related
            .filter(function(l) { return l.getAttribute('for') !== forId; })
            .map(function(l) { return l.textContent?.trim() || ''; })
            .filter(Boolean);
        }
      }

      const isRequired = !!(label.textContent?.includes('*') || (el as HTMLInputElement).required);

      out.push({
        fieldName: forId,
        label: labelText,
        type: fieldType,
        required: isRequired,
        options: options && options.length ? options : undefined,
        isFile: fieldType === 'file',
        isSystemField: forId.indexOf('_systemfield_') === 0,
      });
    }

    return out;
  });

  return { fields: raw as AshbyField[] };
}

// ─── Field plan ───────────────────────────────────────────────────────────

export interface AshbyPlannedField {
  fieldName: string;
  label: string;
  type: AshbyField['type'];
  value: string;          // fill value; for radio = option label to pick; empty = skip
  required: boolean;
  options?: string[];
  isFile?: boolean;
  isSystemField?: boolean;
}

export interface AshbyFieldPlan {
  fields: AshbyPlannedField[];
  blockers: string[];
}

const EEOC_DECLINE: Record<string, string> = {
  _systemfield_eeoc_gender: 'Decline to self-identify',
  _systemfield_eeoc_race: 'Decline to self-identify',
  _systemfield_eeoc_veteran_status: 'I decline to self-identify for protected veteran status',
  _systemfield_eeoc_disability: 'I do not want to answer',
};

const SYSTEM_TEXT_FIELDS: Record<string, (p: ApplicationProfile) => string> = {
  _systemfield_name: p => `${p.firstName} ${p.lastName}`.trim(),
  _systemfield_email: p => p.email,
};

export async function buildAshbyFieldPlan(
  job: AshbyJobInfo,
  schema: AshbyFormSchema,
  profile: ApplicationProfile,
  cvText: string,
): Promise<AshbyFieldPlan> {
  const fields: AshbyPlannedField[] = [];
  const blockers: string[] = [];

  // Separate: system fields we can fill directly vs. custom UUID fields needing AI
  const aiQuestions = schema.fields.filter(f => {
    if (f.isSystemField) return false;
    if (f.isFile) return false;
    return true;
  });

  // Ask Gemini about custom fields (UUID-named) — pass human label as context
  let aiAnswers: Record<string, { value: string }> = {};
  if (aiQuestions.length > 0) {
    aiAnswers = await generateApplicationAnswers({
      company: job.company,
      jobTitle: job.jobTitle,
      jdText: job.jdText,
      cvText,
      profile,
      questions: aiQuestions.map(f => ({
        name: f.fieldName,
        label: f.label,
        required: f.required,
        type: f.type === 'radio' || f.type === 'checkbox' ? 'multi_value_single_select' : 'input_text',
        options: f.options,
      })),
    });
  }

  for (const f of schema.fields) {
    // File upload
    if (f.isFile) {
      fields.push({ ...f, value: '' });
      continue;
    }

    // Location typeahead
    if (f.type === 'location') {
      fields.push({ ...f, value: profile.location || '' });
      continue;
    }

    // EEOC — always decline
    if (f.fieldName in EEOC_DECLINE) {
      fields.push({ ...f, value: EEOC_DECLINE[f.fieldName] });
      continue;
    }

    // Standard system text fields
    if (f.fieldName in SYSTEM_TEXT_FIELDS) {
      const value = SYSTEM_TEXT_FIELDS[f.fieldName](profile).trim();
      if (!value && f.required) blockers.push(`${f.label} (missing in profile)`);
      fields.push({ ...f, value });
      continue;
    }

    // Phone — detected by type
    if (f.type === 'tel') {
      const value = profile.phone?.trim() || '';
      if (!value && f.required) blockers.push(`${f.label} (missing in profile)`);
      fields.push({ ...f, value });
      continue;
    }

    // LinkedIn URL heuristic
    if (/linkedin/i.test(f.label) && f.type !== 'radio' && f.type !== 'checkbox') {
      fields.push({ ...f, value: profile.linkedinUrl || '' });
      continue;
    }

    // GitHub URL heuristic
    if (/github/i.test(f.label) && f.type !== 'radio' && f.type !== 'checkbox') {
      fields.push({ ...f, value: profile.githubUrl || '' });
      continue;
    }

    // Portfolio/website heuristic
    if (/portfolio|website|personal site/i.test(f.label) && f.type !== 'radio' && f.type !== 'checkbox') {
      fields.push({ ...f, value: profile.portfolioUrl || '' });
      continue;
    }

    // AI-answered custom field
    const ans = aiAnswers[f.fieldName];
    const value = (ans?.value || '').trim();
    if (!value && f.required) blockers.push(`${f.label} (no confident answer)`);
    fields.push({ ...f, value });
  }

  return { fields, blockers };
}

// ─── Page filling ─────────────────────────────────────────────────────────

async function fillAshbyLocationTypeahead(page: Page, location: string): Promise<boolean> {
  try {
    // Location combobox in Ashby has no stable id/name — find by placeholder
    const input = page.locator('input[placeholder*="Start typing"]').first();
    await input.scrollIntoViewIfNeeded();
    await input.click({ timeout: 5000 });
    await input.fill(location);
    await page.waitForTimeout(1500);
    // Click first suggestion in the dropdown
    const suggestion = page.locator('[class*=suggestion], [class*=option], [role=option]').first();
    const visible = await suggestion.isVisible({ timeout: 3000 }).catch(() => false);
    if (visible) { await suggestion.click(); return true; }
    // If no dropdown, just tab out — Ashby may accept typed text
    await page.keyboard.press('Tab');
    return true;
  } catch {
    return false;
  }
}

async function fillAshbyRadio(page: Page, fieldId: string, optionLabel: string): Promise<boolean> {
  try {
    // Radio labels are associated via htmlFor = "{formId}_{fieldId}-labeled-radio-{n}"
    // Find the label with matching text and click the associated input
    const labels = page.locator(`label[for*="${fieldId}-labeled-radio-"]`);
    const count = await labels.count();
    for (let i = 0; i < count; i++) {
      const text = (await labels.nth(i).textContent() || '').trim().toLowerCase();
      if (text === optionLabel.toLowerCase()) {
        await labels.nth(i).click({ timeout: 3000 });
        return true;
      }
    }
    // Fallback: partial match
    for (let i = 0; i < count; i++) {
      const text = (await labels.nth(i).textContent() || '').trim().toLowerCase();
      if (text.includes(optionLabel.toLowerCase()) || optionLabel.toLowerCase().includes(text)) {
        await labels.nth(i).click({ timeout: 3000 });
        return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}

async function fillAshbyCheckbox(page: Page, fieldId: string, optionLabel: string): Promise<boolean> {
  try {
    const labels = page.locator(`label[for*="${fieldId}-labeled-checkbox-"]`);
    const count = await labels.count();
    for (let i = 0; i < count; i++) {
      const text = (await labels.nth(i).textContent() || '').trim().toLowerCase();
      if (text === optionLabel.toLowerCase()) {
        const forAttr = await labels.nth(i).getAttribute('for') || '';
        const cb = page.locator(`#${CSS.escape(forAttr)}`);
        const checked = await cb.isChecked().catch(() => false);
        if (!checked) await cb.click({ timeout: 3000 });
        return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}

async function uploadAshbyResume(page: Page, filePath: string): Promise<boolean> {
  try {
    const input = page.locator('#_systemfield_resume');
    await input.setInputFiles(filePath, { timeout: 6000 });
    await page.waitForTimeout(1000);
    return true;
  } catch {
    try {
      const btn = page.getByRole('button', { name: /upload|attach|resume/i }).first();
      const [chooser] = await Promise.all([
        page.waitForEvent('filechooser', { timeout: 5000 }),
        btn.click(),
      ]);
      await chooser.setFiles(filePath);
      await page.waitForTimeout(800);
      return true;
    } catch {
      return false;
    }
  }
}

// ─── Resume PDF render (reused from greenhouse) ───────────────────────────

const RESUME_CSS = `body{font-family:Calibri,Arial,sans-serif;font-size:11pt;color:#000;line-height:1.3;padding:20mm;}
h1{font-size:18pt;font-weight:bold;border-bottom:1px solid #000;margin:0 0 6pt;}
h2{font-size:14pt;font-weight:bold;margin:12pt 0 6pt;text-transform:uppercase;}
p{margin:0 0 6pt;}ul{margin:0 0 6pt 24pt;}li{margin-bottom:2pt;}
a{color:#0563C1;text-decoration:underline;}strong,b{font-weight:bold;}em,i{font-style:italic;}`;

async function renderResumePdf(browser: Browser, cvHtml: string, baseName: string): Promise<string> {
  const page = await browser.newPage();
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${RESUME_CSS}</style></head><body>${cvHtml}</body></html>`;
  await page.setContent(html, { waitUntil: 'networkidle' });
  const dir = mkdtempSync(join(tmpdir(), 'ashby-apply-'));
  const path = join(dir, `${baseName}.pdf`);
  await page.pdf({ path, format: 'A4', printBackground: true });
  await page.close();
  return path;
}

// ─── Main apply runner ────────────────────────────────────────────────────

type ProgressFn = (step: string, message?: string) => void;

export async function runAshbyApply(opts: {
  job: AshbyJobInfo;
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
    boardToken: job.orgSlug,
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
    videoDir = resolvePath(process.cwd(), 'recordings', `${job.orgSlug}_${job.jobId}_${Date.now()}`);
    mkdirSync(videoDir, { recursive: true });
    progress('navigate', `Recording video to ${videoDir.replace(process.cwd() + '/', '')}`);
  }

  try {
    // Render resume PDF
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

    // Load apply page + scrape form schema
    progress('navigate', `Opening ${job.applyUrl}`);
    await page.goto(job.applyUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    progress('plan', 'Reading form fields and drafting answers');
    const schema = await scrapeFormSchema(page);
    const plan = await buildAshbyFieldPlan(job, schema, profile, cvText);

    base.answers = plan.fields
      .filter(f => !f.isFile && f.value)
      .map(f => ({ name: f.fieldName, label: f.label, value: f.value }));

    if (plan.blockers.length > 0 && !dryRun) {
      return { status: 'aborted', ...base, blockers: plan.blockers };
    }

    // Fill fields
    progress('fill', 'Filling application fields');
    for (const field of plan.fields) {
      if (!field.value) continue;

      if (field.isFile) {
        if (field.fieldName === '_systemfield_resume') {
          const ok = await uploadAshbyResume(page, resolvedResumePath);
          if (!ok) progress('fill', 'Could not attach resume');
        }
        continue;
      }

      if (field.type === 'location') {
        await fillAshbyLocationTypeahead(page, field.value);
        continue;
      }

      if (field.type === 'radio') {
        const ok = await fillAshbyRadio(page, field.fieldName, field.value);
        if (!ok) progress('fill', `Could not fill radio: ${field.label}`);
        continue;
      }

      if (field.type === 'checkbox') {
        // value may be comma-separated for multi-select
        for (const opt of field.value.split(',').map(v => v.trim()).filter(Boolean)) {
          await fillAshbyCheckbox(page, field.fieldName, opt);
        }
        continue;
      }

      // text / email / tel / url / textarea
      try {
        const el = page.locator(`#${CSS.escape(field.fieldName)}, [name="${field.fieldName}"]`).first();
        await el.fill(field.value, { timeout: 5000 });
      } catch {
        progress('fill', `Could not fill: ${field.label}`);
      }
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

    // Submit
    progress('submit', 'Submitting application');
    const submitBtn = page.getByRole('button', { name: /submit application|submit/i }).first();
    await submitBtn.click({ timeout: 10000 });
    await page.waitForLoadState('networkidle').catch(() => {});

    const confirmation = page.getByText(
      /thank you|application (has been )?(submitted|received)|successfully submitted|we('| ha)ve received/i
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
