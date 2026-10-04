import { readFileSync, mkdtempSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { tmpdir } from 'os';
import { fileURLToPath } from 'url';
import { PDFDocument } from 'pdf-lib';
import type { Browser, Page } from 'playwright-core';
import { launchBrowser } from './browser.js';
import {
  resumeDocumentHtml,
  RESUME_PAGE,
  RESUME_MIN_SCALE,
  RESUME_PRINT_CSS,
  PX_PER_MM,
} from '../shared/resumeTheme.js';

/**
 * Renders resume HTML to a real, vector PDF with Chromium: selectable text,
 * working hyperlinks, embedded fonts, crisp at any zoom. This is the one engine
 * behind the Download PDF button and the resume the auto-apply agent uploads.
 *
 * Fit-to-one-page: the shared stylesheet sizes everything off `--resume-scale`,
 * so the renderer measures the laid-out content against the A4 content box and
 * binary-searches the largest scale (down to RESUME_MIN_SCALE) at which it fits.
 * The final page count is read back from the produced PDF rather than trusted
 * from the measurement.
 */

const here = dirname(fileURLToPath(import.meta.url));

/**
 * Open Sans is embedded as base64 @font-face data so the PDF is laid out with the
 * exact font the preview uses, on every machine — local Playwright, the serverless
 * Chromium, a Docker container — with no dependency on installed system fonts.
 */
let fontCssCache: string | null = null;
export function resumeFontFaceCss(): string {
  if (fontCssCache !== null) return fontCssCache;
  const faces = [
    { family: 'Open Sans', file: 'OpenSans-Regular.ttf', weight: 400, style: 'normal' },
    { family: 'Open Sans', file: 'OpenSans-Bold.ttf', weight: 700, style: 'normal' },
    { family: 'Open Sans', file: 'OpenSans-Italic.ttf', weight: 400, style: 'italic' },
    // Per-glyph fallback. Open Sans has no arrows (→), rupee (₹), ticks and the
    // like, and the serverless Chromium has no system font to fall back to, so
    // without this those characters silently vanish from the PDF.
    { family: 'DejaVu Sans', file: 'DejaVuSans.ttf', weight: 400, style: 'normal' },
  ];
  const rules: string[] = [];
  for (const f of faces) {
    try {
      const b64 = readFileSync(join(here, 'fonts', f.file)).toString('base64');
      rules.push(
        `@font-face{font-family:'${f.family}';font-weight:${f.weight};font-style:${f.style};` +
        `font-display:block;src:url(data:font/ttf;base64,${b64}) format('truetype');}`,
      );
    } catch {
      // Font file missing from the bundle: Chromium falls back to a system sans.
      // The PDF still renders, but line wrapping may differ from the preview.
    }
  }
  fontCssCache = rules.join('\n');
  return fontCssCache;
}

export interface FitReport {
  /** True when the content fits one page at `scale`. */
  fits: boolean;
  /** The --resume-scale that was applied (1 = no shrinking). */
  scale: number;
  /** Pages the content needs at `scale` (1 when it fits). */
  pages: number;
  /** Fraction of the one-page content box used at `scale`. >1 means overflow. */
  fill: number;
}

/**
 * Runs inside the page. Written as a source string, not a function, because the
 * TS→JS compilers in play (tsx locally, Vercel's bundler in production) can inject
 * helpers like __name() into function bodies, which then do not exist in the
 * browser context Playwright serialises them into.
 */
function fitScript(minScale: number, contentHeightPx: number): string {
  return `(() => {
    const pageEl = document.querySelector('.resume-page');
    const root = document.querySelector('.resume-root');
    const limit = ${contentHeightPx} - 2; /* 2px of slack so rounding never spills a blank 2nd page */
    const measure = (s) => {
      pageEl.style.setProperty('--resume-scale', String(s));
      void root.offsetHeight;
      return Math.max(root.scrollHeight, root.getBoundingClientRect().height);
    };
    const full = ${contentHeightPx};
    let h = measure(1);
    if (h <= limit) return { fits: true, scale: 1, pages: 1, fill: h / full };
    const hMin = measure(${minScale});
    if (hMin > limit) {
      return { fits: false, scale: ${minScale}, pages: Math.ceil(hMin / full), fill: hMin / full };
    }
    let lo = ${minScale}, hi = 1;
    for (let i = 0; i < 10; i++) {
      const mid = (lo + hi) / 2;
      if (measure(mid) <= limit) lo = mid; else hi = mid;
    }
    const scale = Math.floor(lo * 1000) / 1000;
    h = measure(scale);
    return { fits: true, scale, pages: 1, fill: h / full };
  })()`;
}

export async function fitResumeToOnePage(page: Page): Promise<FitReport> {
  const contentHeightPx = RESUME_PAGE.contentHeightMm * PX_PER_MM;
  return (await page.evaluate(fitScript(RESUME_MIN_SCALE, contentHeightPx))) as FitReport;
}

export async function countPdfPages(pdf: Buffer | Uint8Array): Promise<number> {
  const doc = await PDFDocument.load(pdf, { updateMetadata: false });
  return doc.getPageCount();
}

export interface RenderedResume extends FitReport {
  pdf: Buffer;
}

export interface RenderOptions {
  /** Shrink to fit one page (default true). False renders at scale 1 as-is. */
  fitToOnePage?: boolean;
}

/** Render on a page the caller owns (lets the auto-apply drivers reuse their browser). */
export async function renderResumeOnPage(
  page: Page,
  bodyHtml: string,
  opts: RenderOptions = {},
): Promise<RenderedResume> {
  const html = resumeDocumentHtml(bodyHtml, { extraCss: resumeFontFaceCss() });
  await page.setContent(html, { waitUntil: 'load' });
  // Layout with fallback fonts is wrong; wait for the embedded faces to be usable.
  await page.evaluate('document.fonts ? document.fonts.ready.then(() => true) : true');

  let fit: FitReport;
  if (opts.fitToOnePage === false) {
    fit = { fits: true, scale: 1, pages: 1, fill: 0 };
  } else {
    fit = await fitResumeToOnePage(page);
  }

  const pdf = await page.pdf({
    format: 'A4',
    printBackground: true,
    // Let @page in the stylesheet own size and margins.
    preferCSSPageSize: true,
  });

  // The PDF is the truth; the measurement is only the guide.
  const pages = await countPdfPages(pdf);
  return { pdf, pages, scale: fit.scale, fits: pages <= 1, fill: fit.fill };
}

/**
 * PNG of the laid-out first page at the fitted scale — the same layout the PDF
 * gets, from the same engine. Useful as a thumbnail and for eyeballing output.
 */
export async function renderResumePreviewPng(bodyHtml: string): Promise<{ png: Buffer } & FitReport> {
  const browser = await launchBrowser({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setViewportSize({ width: Math.round(RESUME_PAGE.widthMm * PX_PER_MM), height: Math.round(RESUME_PAGE.heightMm * PX_PER_MM) });
    const html = resumeDocumentHtml(bodyHtml, { extraCss: resumeFontFaceCss() })
      // On screen, show the page as paper with its margins instead of print @page margins.
      .replace('<style>' + RESUME_PRINT_CSS + '</style>', '<style>html,body{margin:0;background:#fff}</style>');
    await page.setContent(html, { waitUntil: 'load' });
    await page.evaluate('document.fonts ? document.fonts.ready.then(() => true) : true');
    const fit = await fitResumeToOnePage(page);
    const png = await page.screenshot({ type: 'png', fullPage: false, clip: { x: 0, y: 0, width: Math.round(RESUME_PAGE.widthMm * PX_PER_MM), height: Math.round(RESUME_PAGE.heightMm * PX_PER_MM) } });
    return { png, ...fit };
  } finally {
    await browser.close();
  }
}

/** One-shot render that manages its own browser. Used by the export endpoint. */
export async function renderResumePdf(bodyHtml: string, opts: RenderOptions = {}): Promise<RenderedResume> {
  const browser = await launchBrowser({ headless: true });
  try {
    const page = await browser.newPage();
    return await renderResumeOnPage(page, bodyHtml, opts);
  } finally {
    await browser.close();
  }
}

/**
 * For the auto-apply drivers: render with their already-open browser and write
 * the PDF to a temp file whose basename becomes the uploaded filename.
 */
export async function renderResumePdfToFile(browser: Browser, bodyHtml: string, baseName: string): Promise<string> {
  const page = await browser.newPage();
  try {
    const { pdf } = await renderResumeOnPage(page, bodyHtml);
    const dir = mkdtempSync(join(tmpdir(), 'resume-'));
    const path = join(dir, `${baseName}.pdf`);
    writeFileSync(path, pdf);
    return path;
  } finally {
    await page.close();
  }
}
