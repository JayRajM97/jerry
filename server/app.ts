import './env.js';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';
import { resolveJob, buildFieldPlan, runApply } from './greenhouse.js';
import { isAshbyUrl, resolveAshbyJob, runAshbyApply } from './ashby.js';
import { isLeverUrl, resolveLeverJob, runLeverApply } from './lever.js';
import { launchBrowser } from './browser.js';
import { renderResumePdf, renderResumePreviewPng } from './resumePdf.js';
import { sanitizeFilenamePart } from '../shared/resumeFilename.js';
import * as ai from './aiCore.js';
import { voiceStyleLoaded } from './gemini.js';
import { llmStatus, isLlmConfigured, LLM_NOT_CONFIGURED } from './llm.js';
import type { ApplicationProfile } from '../types.js';

export const FORCE_DRY_RUN = ['true', '1'].includes((process.env.APPLY_DRY_RUN || '').toLowerCase());
// Serverless has no display, so headless is forced there regardless of the env var.
export const HEADLESS = process.env.HEADLESS !== 'false' || !!process.env.VERCEL;

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

// The AI functions the browser is allowed to invoke, by name. An explicit allow-list
// keeps /api/ai/:fn from turning into "call any export in the module".
const AI_HANDLERS: Record<string, (...args: any[]) => Promise<unknown>> = {
  analyzeResume: ai.analyzeResume,
  generateIntroduction: ai.generateIntroduction,
  calculateATSScore: ai.calculateATSScore,
  generateTopChoiceMessage: ai.generateTopChoiceMessage,
  generateWellfoundMessage: ai.generateWellfoundMessage,
};

export function createApp() {
  const app = express();
  app.use(express.json({ limit: '4mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      forceDryRun: FORCE_DRY_RUN,
      headless: HEADLESS,
      serverless: !!process.env.VERCEL,
      geminiConfigured: !!process.env.GEMINI_API_KEY,
      llm: llmStatus(),
      voiceStyleLoaded,
    });
  });

  // Browser smoke test. Chromium is the most environment-sensitive part of a deploy
  // (it is loaded from disk, not bundled), so this proves it can actually launch
  // without needing a Gemini key or a live job posting.
  app.get('/api/health/browser', async (_req, res) => {
    const started = Date.now();
    let browser: Awaited<ReturnType<typeof launchBrowser>> | undefined;
    try {
      browser = await launchBrowser({ headless: true });
      const page = await browser.newPage();
      await page.setContent('<h1>ok</h1>');
      const heading = await page.textContent('h1');
      res.json({
        ok: heading === 'ok',
        chromiumVersion: browser.version(),
        serverless: !!process.env.VERCEL,
        launchMs: Date.now() - started,
      });
    } catch (err: any) {
      res.status(500).json({
        ok: false,
        error: err?.message || 'Browser launch failed',
        launchMs: Date.now() - started,
      });
    } finally {
      await browser?.close().catch(() => {});
    }
  });

  // Server-side Gemini. Keeps GEMINI_API_KEY out of the client bundle.
  app.post('/api/ai/:fn', async (req, res) => {
    const handler = AI_HANDLERS[req.params.fn];
    if (!handler) {
      res.status(404).json({ error: `Unknown AI function: ${req.params.fn}` });
      return;
    }
    if (!isLlmConfigured()) {
      res.status(500).json({ error: LLM_NOT_CONFIGURED });
      return;
    }
    try {
      const args = Array.isArray(req.body?.args) ? req.body.args : [];
      const result = await handler(...args);
      res.json({ result });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || `${req.params.fn} failed` });
    }
  });

  // Vector PDF export of the resume, shrunk to one page when needed. The browser
  // sends the HTML it is displaying; the server lays it out with the same
  // stylesheet and reports how it fitted in response headers.
  app.post('/api/export/pdf', async (req, res) => {
    const { html, filename } = (req.body || {}) as { html?: unknown; filename?: unknown };
    if (typeof html !== 'string' || !html.trim()) {
      res.status(400).json({ error: 'html is required' });
      return;
    }
    // The client builds the name; only make sure nothing path-like gets through.
    const requested = typeof filename === 'string' ? filename : '';
    const base = requested.replace(/\.pdf$/i, '').split(/[\\/]/).pop() || '';
    const safeName = `${sanitizeFilenamePart(base) || 'Resume'}.pdf`;
    try {
      const out = await renderResumePdf(html);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);
      res.setHeader('X-Resume-Pages', String(out.pages));
      res.setHeader('X-Resume-Scale', out.scale.toFixed(3));
      res.setHeader('X-Resume-Fits', out.fits ? 'true' : 'false');
      res.setHeader('X-Resume-Fill', out.fill.toFixed(3));
      res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition, X-Resume-Pages, X-Resume-Scale, X-Resume-Fits, X-Resume-Fill');
      res.send(out.pdf);
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'PDF export failed' });
    }
  });

  // PNG of the laid-out page (same engine and scale as the PDF).
  app.post('/api/export/preview', async (req, res) => {
    const { html } = (req.body || {}) as { html?: unknown };
    if (typeof html !== 'string' || !html.trim()) {
      res.status(400).json({ error: 'html is required' });
      return;
    }
    try {
      const out = await renderResumePreviewPng(html);
      res.setHeader('Content-Type', 'image/png');
      res.setHeader('X-Resume-Pages', String(out.pages));
      res.setHeader('X-Resume-Scale', out.scale.toFixed(3));
      res.setHeader('X-Resume-Fits', out.fits ? 'true' : 'false');
      res.send(out.png);
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Preview render failed' });
    }
  });

  // Fetch job info so the SPA can preview and auto-fill its JD box.
  app.post('/api/job', async (req, res) => {
    try {
      const url = req.body.url || '';
      if (isAshbyUrl(url)) {
        const job = await resolveAshbyJob(url);
        res.json({
          jobTitle: job.jobTitle,
          company: job.company,
          applyUrl: job.applyUrl,
          jdText: job.jdText,
          boardToken: job.orgSlug,
          jobId: job.jobId,
          questionCount: 0,
          board: 'ashby',
        });
      } else if (isLeverUrl(url)) {
        const job = await resolveLeverJob(url);
        res.json({
          jobTitle: job.jobTitle,
          company: job.company,
          applyUrl: job.applyUrl,
          jdText: job.jdText,
          boardToken: job.company.toLowerCase().replace(/\s+/g, '-'),
          jobId: job.jobId,
          questionCount: 0,
          board: 'lever',
        });
      } else {
        const job = await resolveJob(url);
        res.json({
          jobTitle: job.jobTitle,
          company: job.company,
          applyUrl: job.applyUrl,
          jdText: job.jdText,
          boardToken: job.boardToken,
          jobId: job.jobId,
          questionCount: job.questions.length,
          board: 'greenhouse',
        });
      }
    } catch (err: any) {
      res.status(400).json({ error: err?.message || 'Failed to fetch job' });
    }
  });

  // Run the autonomous fill (+submit unless DRY_RUN). Streams progress over SSE.
  app.post('/api/apply', async (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    // Tell Vercel's proxy not to buffer the stream, so progress arrives live.
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    const send = (obj: unknown) => res.write(`data: ${JSON.stringify(obj)}\n\n`);
    const progress = (step: string, message?: string) => send({ type: 'progress', step, message });

    try {
      const { url, cvHtml, cvText, resumePath, profile, jdText, autoSubmit } = req.body as {
        url: string; cvHtml?: string; cvText?: string; resumePath?: string;
        profile: ApplicationProfile; jdText?: string; autoSubmit?: boolean;
      };
      const dryRun = FORCE_DRY_RUN || autoSubmit === false;
      const resolvedCvText = (cvText && cvText.trim()) || stripHtml(cvHtml || '');

      if (isAshbyUrl(url)) {
        progress('fetch', 'Fetching Ashby job');
        const job = await resolveAshbyJob(url);
        if (jdText) job.jdText = jdText || job.jdText;

        const result = await runAshbyApply({
          job, profile, cvHtml: cvHtml || '', cvText: resolvedCvText,
          resumePath, dryRun, headless: HEADLESS, progress,
        });
        send({ type: 'result', result });
      } else if (isLeverUrl(url)) {
        progress('fetch', 'Fetching Lever job');
        const job = await resolveLeverJob(url);
        if (jdText) job.jdText = jdText || job.jdText;

        const result = await runLeverApply({
          job, profile, cvHtml: cvHtml || '', cvText: resolvedCvText,
          resumePath, dryRun, headless: HEADLESS, progress,
        });
        send({ type: 'result', result });
      } else {
        progress('fetch', 'Fetching job and questions');
        const job = await resolveJob(url);
        if (jdText) job.jdText = jdText || job.jdText;

        progress('plan', 'Drafting answers and mapping fields');
        const plan = await buildFieldPlan(job, profile, resolvedCvText);

        const result = await runApply({
          job, plan, cvHtml: cvHtml || '', resumePath, dryRun, headless: HEADLESS, progress,
        });
        send({ type: 'result', result });
      }
    } catch (err: any) {
      send({ type: 'error', message: err?.message || 'Apply failed' });
    } finally {
      res.end();
    }
  });

  // Local `npm start` serves the built SPA from this same process. On Vercel the
  // static build is served by the CDN and `dist` is not in the function bundle,
  // so this block is simply skipped.
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const distDir = path.resolve(__dirname, '..', 'dist');
  if (process.env.NODE_ENV === 'production' && !process.env.VERCEL && existsSync(distDir)) {
    app.use(express.static(distDir));
    app.get(/^(?!\/api).*/, (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  return app;
}
