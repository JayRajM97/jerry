import './env';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';
import { resolveJob, buildFieldPlan, runApply } from './greenhouse';
import type { ApplicationProfile } from '../types';

const app = express();
app.use(express.json({ limit: '2mb' }));

const PORT = Number(process.env.PORT || 8787);
// Env kill-switch: when set to "true" or "1", force dry-run regardless of the request body.
const FORCE_DRY_RUN = ['true', '1'].includes((process.env.APPLY_DRY_RUN || '').toLowerCase());
const HEADLESS = process.env.HEADLESS !== 'false';

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, forceDryRun: FORCE_DRY_RUN, headless: HEADLESS });
});

// Fetch job + questions so the SPA can preview and auto-fill its JD box.
app.post('/api/job', async (req, res) => {
  try {
    const job = await resolveJob(req.body.url || '');
    res.json({
      jobTitle: job.jobTitle,
      company: job.company,
      applyUrl: job.applyUrl,
      jdText: job.jdText,
      boardToken: job.boardToken,
      jobId: job.jobId,
      questionCount: job.questions.length,
    });
  } catch (err: any) {
    res.status(400).json({ error: err?.message || 'Failed to fetch job' });
  }
});

// Run the autonomous fill (+submit unless DRY_RUN). Streams progress over SSE.
app.post('/api/apply', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const send = (obj: unknown) => res.write(`data: ${JSON.stringify(obj)}\n\n`);
  const progress = (step: string, message?: string) => send({ type: 'progress', step, message });

  try {
    const { url, cvHtml, cvText, resumePath, profile, jdText, autoSubmit } = req.body as {
      url: string; cvHtml?: string; cvText?: string; resumePath?: string;
      profile: ApplicationProfile; jdText?: string; autoSubmit?: boolean;
    };
    // Body opts into real submit; env kill-switch can force dry-run regardless.
    const dryRun = FORCE_DRY_RUN || autoSubmit === false;

    progress('fetch', 'Fetching job and questions');
    const job = await resolveJob(url);
    if (jdText) job.jdText = jdText || job.jdText;

    progress('plan', 'Drafting answers and mapping fields');
    const resolvedCvText = (cvText && cvText.trim()) || stripHtml(cvHtml || '');
    const plan = await buildFieldPlan(job, profile, resolvedCvText);

    const result = await runApply({
      job, plan, cvHtml: cvHtml || '', resumePath, dryRun, headless: HEADLESS, progress,
    });

    send({ type: 'result', result });
  } catch (err: any) {
    send({ type: 'error', message: err?.message || 'Apply failed' });
  } finally {
    res.end();
  }
});

// In production (Render), serve the built Vite SPA from the same Express process so
// the user gets a single deployment. In dev, Vite runs separately on :3000 and proxies /api here.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(__dirname, '..', 'dist');
if (process.env.NODE_ENV === 'production' && existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get(/^(?!\/api).*/, (_req, res) => {
    res.sendFile(path.join(distDir, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`[auto-apply] server on :${PORT}  forceDryRun=${FORCE_DRY_RUN}  headless=${HEADLESS}`);
});
