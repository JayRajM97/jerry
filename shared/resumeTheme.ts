/**
 * The one resume stylesheet.
 *
 * It is used by the on-screen preview/editor (injected as a <style> tag), by the
 * client-side page-fit measurement, by the server-side PDF export, and by the
 * auto-apply resume render. Keeping a single source means the page the user sees
 * is laid out with the same rules as the PDF that gets downloaded or uploaded to
 * a job board — "fits on one page" on screen is true in the file too.
 *
 * Everything inside `.resume-root` is sized in `em` off a single root font-size
 * that is multiplied by `--resume-scale`. Fitting a long resume onto one page is
 * then a matter of lowering that one variable: every size and gap shrinks in
 * proportion, so the design does not change, only its scale.
 */

/** A4 geometry. The content box is what has to hold one page of resume. */
export const RESUME_PAGE = {
  widthMm: 210,
  heightMm: 297,
  paddingMm: 20,
  get contentWidthMm() { return this.widthMm - this.paddingMm * 2; },
  get contentHeightMm() { return this.heightMm - this.paddingMm * 2; },
} as const;

/** Base body size at scale 1. Open Sans is wide: 10pt here sets like 11pt Calibri. */
export const RESUME_BASE_PT = 10;

/**
 * The smallest scale fit-to-page may use before giving up. 0.8 × 10.5pt = 8.4pt,
 * which is still legible in print and on screen; below that a resume starts to
 * look squeezed, and the honest answer is "cut some lines", not "shrink more".
 */
export const RESUME_MIN_SCALE = 0.8;

/** CSS px per mm at the 96dpi every browser uses for physical units. */
export const PX_PER_MM = 96 / 25.4;

// 'DejaVu Sans' is embedded server-side as the per-glyph fallback (arrows, ₹, ticks);
// on screen the browser falls back to system fonts for the same characters.
export const RESUME_FONT_FAMILY = `'Open Sans', 'DejaVu Sans', 'Segoe UI', Arial, Helvetica, sans-serif`;

export const RESUME_CSS = `
.resume-page {
  --resume-scale: 1;
  width: ${RESUME_PAGE.widthMm}mm;
  padding: ${RESUME_PAGE.paddingMm}mm;
  box-sizing: border-box;
  background: #ffffff;
  color: #000000;
}

.resume-root {
  font-family: ${RESUME_FONT_FAMILY};
  font-size: calc(${RESUME_BASE_PT}pt * var(--resume-scale, 1));
  line-height: 1.25;
  color: #000000;
  text-align: left;
  overflow-wrap: break-word;
  word-break: normal;
  -webkit-font-smoothing: antialiased;
}
.resume-root > :first-child { margin-top: 0; }

.resume-root h1 {
  font-size: 1.7em;
  font-weight: 700;
  line-height: 1.15;
  margin: 0 0 0.2em;
  padding-bottom: 0.12em;
  border-bottom: 1px solid #000000;
}
.resume-root h1 + p { margin-top: 0.1em; }

.resume-root h2 {
  font-size: 1.15em;
  font-weight: 700;
  line-height: 1.2;
  text-transform: uppercase;
  letter-spacing: 0.02em;
  margin: 0.75em 0 0.3em;
  padding-bottom: 0.08em;
  border-bottom: 1px solid #000000;
}

.resume-root h3 {
  font-size: 1.05em;
  font-weight: 700;
  line-height: 1.2;
  margin: 0.55em 0 0.15em;
}

.resume-root h4, .resume-root h5, .resume-root h6 {
  font-size: 1em;
  font-weight: 700;
  margin: 0.5em 0 0.15em;
}

.resume-root p { margin: 0 0 0.3em; }

.resume-root ul, .resume-root ol {
  margin: 0 0 0.3em 1.2em;
  padding: 0;
}
.resume-root ul { list-style: disc; }
.resume-root ol { list-style: decimal; }
.resume-root li {
  display: list-item;
  margin: 0 0 0.12em;
  padding-left: 0.1em;
}
/* TipTap wraps list-item text in a <p>; keep it inline so bullets stay tight. */
.resume-root li p { margin: 0; display: inline; }

.resume-root a { color: #0563C1; text-decoration: underline; }
.resume-root strong, .resume-root b { font-weight: 700; }
.resume-root em, .resume-root i { font-style: italic; }
.resume-root u { text-decoration: underline; }

.resume-root table { border-collapse: collapse; width: 100%; }
.resume-root td, .resume-root th { vertical-align: top; padding: 0 0.3em 0.15em 0; }

/* Print pagination hints, for the rare resume that legitimately runs to two pages. */
.resume-root h1, .resume-root h2, .resume-root h3 { break-after: avoid; page-break-after: avoid; }
.resume-root li, .resume-root p { break-inside: avoid; page-break-inside: avoid; }
`;

/**
 * Styles that only make sense in the print/PDF document, not in the editor.
 *
 * In print the page margin lives on @page rather than as padding, so a resume
 * that genuinely overflows gets the same margins on page 2. The content box is
 * the same 170×257mm the preview has, so the fit measurement is identical.
 */
export const RESUME_PRINT_CSS = `
@page { size: A4; margin: ${RESUME_PAGE.paddingMm}mm; }
html, body { margin: 0; padding: 0; background: #ffffff; }
.resume-page { width: ${RESUME_PAGE.contentWidthMm}mm; padding: 0; }
`;

export interface ResumeDocumentOptions {
  /** Extra CSS, e.g. @font-face rules with embedded font data. */
  extraCss?: string;
  /** Starting scale; the fitter overrides it on the element at runtime. */
  scale?: number;
}

/**
 * Full standalone HTML document for rendering a resume body to PDF.
 * The structure (.resume-page > .resume-root) matches what the preview renders,
 * so the same measurement works on both.
 */
export function resumeDocumentHtml(bodyHtml: string, opts: ResumeDocumentOptions = {}): string {
  const scale = opts.scale ?? 1;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Resume</title>
<style>${opts.extraCss || ''}</style>
<style>${RESUME_CSS}</style>
<style>${RESUME_PRINT_CSS}</style>
</head>
<body>
<div class="resume-page" style="--resume-scale: ${scale}">
<div class="resume-root">${bodyHtml}</div>
</div>
</body>
</html>`;
}
