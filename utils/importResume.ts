/**
 * Resume import: turn an uploaded .docx or .pdf into the clean HTML the editor,
 * the analyser and the PDF renderer all work on, keeping as much of the original
 * structure as the source format allows — headings, bullets, bold/italic runs
 * and, for PDFs, the hyperlinks (read from the link annotations, which the text
 * layer alone does not carry).
 *
 * `pdfToHtml` takes an already-loaded pdf.js document rather than importing
 * pdf.js itself, so the browser build is used in the app and the legacy build in
 * Node tests, with one implementation.
 */

// ─── Shared helpers ─────────────────────────────────────────────────────────

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Arrows and ticks are deliberately NOT bullets: resumes use them inline ("shipped X → 2x growth").
const BULLET_GLYPHS = '•●▪⁃∙◦■‣○–—\\-\\*·➢';
const LEADING_BULLET = new RegExp(`^\\s*[${BULLET_GLYPHS}]\\s*`);

const DATE_LIKE = /\b((19|20)\d{2}|present|current|jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)\b/i;

function isAllCaps(text: string): boolean {
  const letters = text.replace(/[^\p{L}]/gu, '');
  return letters.length >= 3 && letters === letters.toUpperCase();
}

// ─── DOCX ───────────────────────────────────────────────────────────────────

/**
 * Word heading styles map onto the resume hierarchy the theme expects:
 * Title → name (h1), Heading 1 → section (h2), Heading 2/3 → role (h3).
 */
const DOCX_STYLE_MAP = [
  "p[style-name='Title'] => h1:fresh",
  "p[style-name='Heading 1'] => h2:fresh",
  "p[style-name='Heading 2'] => h3:fresh",
  "p[style-name='Heading 3'] => h3:fresh",
  "p[style-name='Subtitle'] => p:fresh",
];

export async function docxToHtml(arrayBuffer: ArrayBuffer): Promise<string> {
  const mammoth = (await import('mammoth')).default;
  // The browser build reads { arrayBuffer }; the Node build (tests) reads { buffer }.
  const input: any = typeof window === 'undefined' && typeof Buffer !== 'undefined'
    ? { buffer: Buffer.from(arrayBuffer) }
    : { arrayBuffer };
  const result = await mammoth.convertToHtml(input, { styleMap: DOCX_STYLE_MAP });
  return cleanDocxHtml(result.value);
}

/**
 * Tidy mammoth output: fake bullets typed as "• text" become real lists, empty
 * paragraphs go, and a short, fully bold, ALL-CAPS paragraph (how many resumes
 * mark sections without using heading styles) becomes a section heading.
 */
export function cleanDocxHtml(html: string, doc: Document = globalThis.document): string {
  const body = doc.createElement('div');
  body.innerHTML = html;

  const out: Element[] = [];
  let currentList: HTMLElement | null = null;

  for (const child of Array.from(body.children)) {
    const text = (child.textContent || '').trim();
    const tag = child.tagName;

    if (!text && tag === 'P') continue;

    const isFakeBullet = tag === 'P' && LEADING_BULLET.test(text) && text.length > 2;
    if (isFakeBullet) {
      if (!currentList) {
        currentList = doc.createElement('ul');
        out.push(currentList);
      }
      const li = doc.createElement('li');
      li.innerHTML = child.innerHTML.replace(LEADING_BULLET, '');
      currentList.appendChild(li);
      continue;
    }

    currentList = null;

    if (tag === 'P' && text.length <= 48 && isAllCaps(text)) {
      const onlyChild = child.children.length === 1 ? child.children[0] : null;
      const fullyBold = onlyChild?.tagName === 'STRONG' && (onlyChild.textContent || '').trim() === text;
      if (fullyBold || child.children.length === 0) {
        const h2 = doc.createElement('h2');
        h2.textContent = text;
        out.push(h2);
        continue;
      }
    }

    out.push(child.cloneNode(true) as Element);
  }

  return out.map(e => e.outerHTML).join('');
}

// ─── PDF ────────────────────────────────────────────────────────────────────

/** The slice of pdf.js we use, so either build (browser or legacy/Node) fits. */
export interface PdfLikePage {
  getTextContent(): Promise<{ items: any[]; styles: Record<string, { fontFamily?: string }> }>;
  getAnnotations(): Promise<any[]>;
  getViewport(opts: { scale: number }): { width: number; height: number };
  /** Loads the page's fonts (no canvas needed), after which commonObjs has their real names. */
  getOperatorList?(): Promise<unknown>;
  commonObjs?: { has(name: string): boolean; get(name: string): any };
}
export interface PdfLikeDocument {
  numPages: number;
  getPage(n: number): Promise<PdfLikePage>;
}

interface Run {
  text: string;
  bold: boolean;
  italic: boolean;
  url: string | null;
}

interface Line {
  y: number;
  x: number;        // left edge of first item
  right: number;    // right edge of last item
  size: number;     // dominant font size on the line
  runs: Run[];
  text: string;     // plain text
  allBold: boolean;
  bullet: boolean;
}

interface Block {
  type: 'h1' | 'h2' | 'h3' | 'p' | 'li';
  runs: Run[];
  x: number;
  right: number;
  size: number;
}

interface Item {
  str: string;
  x: number;
  y: number;
  w: number;
  size: number;
  font: string;
  bold: boolean;
  italic: boolean;
  url: string | null;
}

const BOLD_RE = /bold|black|heavy|semibold|demibold|extrabold|ultrabold/i;
const ITALIC_RE = /italic|oblique/i;

/**
 * Resolve each font's weight and style.
 *
 * The text layer only carries pdf.js's internal names ("g_d0_f2") and a generic
 * family ("sans-serif"). The real PostScript names ("BAAAAA+Calibri-Bold") sit on
 * the font objects, which pdf.js loads for rendering; getOperatorList() triggers
 * that load without drawing anything. When even the real names say nothing
 * (some generators strip them), fall back to glyph widths: within one family the
 * bold cut is measurably wider per character than the regular one.
 */
async function resolveFontStyles(
  page: PdfLikePage,
  rawItems: any[],
  styles: Record<string, { fontFamily?: string }>,
): Promise<Map<string, { bold: boolean; italic: boolean }>> {
  const names = new Set<string>();
  for (const it of rawItems) if (it.fontName) names.add(it.fontName);

  const realName = new Map<string, string>();
  try {
    if (page.getOperatorList && page.commonObjs) {
      await page.getOperatorList();
      for (const n of names) {
        if (page.commonObjs.has(n)) {
          const f = page.commonObjs.get(n);
          if (f && typeof f.name === 'string') realName.set(n, f.name);
        }
      }
    }
  } catch { /* fall through to the heuristics below */ }

  const out = new Map<string, { bold: boolean; italic: boolean }>();
  let anyInformative = false;
  for (const n of names) {
    const label = `${realName.get(n) || ''} ${styles[n]?.fontFamily || ''} ${n}`;
    const bold = BOLD_RE.test(label);
    const italic = ITALIC_RE.test(label);
    if (bold || italic || /regular|roman|book|light|medium/i.test(label)) anyInformative = true;
    out.set(n, { bold, italic });
  }
  if (anyInformative) return out;

  // Width fallback: average advance per character per unit size, per font.
  const adv = new Map<string, { w: number; n: number }>();
  for (const it of rawItems) {
    const str: string = it.str || '';
    if (str.trim().length < 8) continue;
    const size = Math.hypot(it.transform[0], it.transform[1]) || 1;
    const a = adv.get(it.fontName) || { w: 0, n: 0 };
    a.w += (it.width || 0) / size;
    a.n += str.length;
    adv.set(it.fontName, a);
  }
  let regular: string | null = null;
  let most = -1;
  for (const [n, a] of adv) if (a.n > most) { most = a.n; regular = n; }
  if (!regular) return out;
  const base = adv.get(regular)!.w / adv.get(regular)!.n;
  for (const [n, a] of adv) {
    if (n === regular || a.n < 20) continue;
    const ratio = (a.w / a.n) / base;
    if (ratio >= 1.03) out.set(n, { bold: true, italic: false });
  }
  return out;
}

function rectsOverlap(a: [number, number, number, number], b: [number, number, number, number]): number {
  const w = Math.min(a[2], b[2]) - Math.max(a[0], b[0]);
  const h = Math.min(a[3], b[3]) - Math.max(a[1], b[1]);
  return w > 0 && h > 0 ? w * h : 0;
}

async function pageItems(page: PdfLikePage): Promise<{ items: Item[]; width: number }> {
  const [content, annotations, viewport] = await Promise.all([
    page.getTextContent(),
    page.getAnnotations().catch(() => [] as any[]),
    Promise.resolve(page.getViewport({ scale: 1 })),
  ]);

  const links = (annotations || [])
    .filter(a => a && a.subtype === 'Link' && typeof a.url === 'string' && a.url)
    .map(a => ({ url: a.url as string, rect: a.rect as [number, number, number, number] }))
    .map(l => ({ url: l.url, rect: [Math.min(l.rect[0], l.rect[2]), Math.min(l.rect[1], l.rect[3]), Math.max(l.rect[0], l.rect[2]), Math.max(l.rect[1], l.rect[3])] as [number, number, number, number] }));

  const fontStyles = await resolveFontStyles(page, content.items as any[], content.styles || {});

  const items: Item[] = [];
  for (const it of content.items as any[]) {
    if (typeof it.str !== 'string' || it.str.length === 0) continue;
    const t = it.transform as number[];
    const size = Math.max(it.height || 0, Math.hypot(t[0], t[1])) || 10;
    const x = t[4];
    const y = t[5];
    const w = it.width || 0;
    const { bold, italic } = fontStyles.get(it.fontName) || { bold: false, italic: false };

    let url: string | null = null;
    if (links.length && it.str.trim()) {
      // Glyphs sit roughly 0.25em below to 0.8em above the baseline.
      const box: [number, number, number, number] = [x, y - size * 0.25, x + Math.max(w, size * 0.3), y + size * 0.8];
      const area = (box[2] - box[0]) * (box[3] - box[1]);
      let best: { url: string; frac: number } | null = null;
      for (const l of links) {
        const frac = rectsOverlap(box, l.rect) / area;
        if (frac > 0.4 && (!best || frac > best.frac)) best = { url: l.url, frac };
      }
      url = best?.url || null;
    }

    items.push({ str: it.str, x, y, w, size, font: it.fontName || '', bold, italic, url });
  }
  return { items, width: viewport.width };
}

function groupLines(items: Item[]): Line[] {
  const sorted = [...items].sort((a, b) => (b.y - a.y) || (a.x - b.x));
  const groups: Item[][] = [];
  for (const it of sorted) {
    const g = groups[groups.length - 1];
    if (g) {
      const ref = g[0];
      const tol = Math.max(ref.size, it.size) * 0.45;
      if (Math.abs(ref.y - it.y) <= tol) { g.push(it); continue; }
    }
    groups.push([it]);
  }

  const lines: Line[] = [];
  for (const g of groups) {
    g.sort((a, b) => a.x - b.x);
    const runs: Run[] = [];
    let text = '';
    let prev: Item | null = null;
    for (const it of g) {
      let piece = it.str;
      if (prev) {
        const gap = it.x - (prev.x + prev.w);
        const needsSpace = !prev.str.endsWith(' ') && !piece.startsWith(' ');
        // A word boundary where the font changes (plain → bold) often has its space
        // swallowed into the previous run's advance width; put it back.
        const wordBoundaryAtFontChange = prev.font !== it.font && gap > -prev.size * 0.1
          && /[\p{L}\p{N})\]]$/u.test(prev.str) && /^[(\p{L}\p{N}]/u.test(piece);
        const bracketAfterWord = gap > prev.size * 0.04
          && /[\p{L}\p{N}]$/u.test(prev.str) && /^[(\[]/.test(piece);
        if (gap > prev.size * 1.6 && needsSpace) {
          // A column jump (e.g. role on the left, dates on the right).
          piece = ' | ' + piece;
        } else if ((gap > prev.size * 0.12 || wordBoundaryAtFontChange || bracketAfterWord) && needsSpace) {
          piece = ' ' + piece;
        }
      }
      const last = runs[runs.length - 1];
      if (last && last.bold === it.bold && last.italic === it.italic && last.url === it.url) {
        last.text += piece;
      } else {
        runs.push({ text: piece, bold: it.bold, italic: it.italic, url: it.url });
      }
      text += piece;
      prev = it;
    }
    const sizes = new Map<number, number>();
    for (const it of g) sizes.set(Math.round(it.size * 2) / 2, (sizes.get(Math.round(it.size * 2) / 2) || 0) + it.str.length);
    let size = g[0].size;
    let bestCount = -1;
    for (const [s, c] of sizes) if (c > bestCount) { bestCount = c; size = s; }
    const nonSpace = runs.filter(r => r.text.trim());
    const allBold = nonSpace.length > 0 && nonSpace.every(r => r.bold);
    const trimmed = text.replace(/\s+/g, ' ').trim();
    if (!trimmed) continue;
    lines.push({
      y: g[0].y, x: g[0].x, right: Math.max(...g.map(i => i.x + i.w)), size, runs, text: trimmed,
      allBold, bullet: LEADING_BULLET.test(text) && trimmed.length > 1,
    });
  }
  return lines;
}

function stripLeadingBullet(runs: Run[]): Run[] {
  const out = runs.map(r => ({ ...r }));
  for (const r of out) {
    const before = r.text;
    r.text = r.text.replace(LEADING_BULLET, '');
    if (r.text !== before) break;
    if (r.text.trim()) break;
  }
  return out.filter(r => r.text.length > 0);
}

function runsToHtml(runs: Run[], opts: { heading?: boolean } = {}): string {
  let html = '';
  for (const r of runs) {
    let t = escapeHtml(r.text.replace(/(\p{Ll})\((?=\p{L})/gu, '$1 ('));
    if (!t) continue;
    const visibleWeight = !opts.heading && /[\p{L}\p{N}]/u.test(r.text);
    if (r.bold && visibleWeight) t = `<strong>${t}</strong>`;
    if (r.italic) t = `<em>${t}</em>`;
    if (r.url) t = `<a href="${escapeHtml(r.url)}">${t}</a>`;
    html += t;
  }
  return html.replace(/\s+/g, ' ').trim();
}

function appendRuns(target: Run[], extra: Run[], joiner: string): void {
  if (joiner && target.length) target[target.length - 1].text += joiner;
  for (const r of extra) {
    const last = target[target.length - 1];
    if (last && last.bold === r.bold && last.italic === r.italic && last.url === r.url) last.text += r.text;
    else target.push({ ...r });
  }
}

export async function pdfToHtml(pdf: PdfLikeDocument): Promise<string> {
  const pages: { lines: Line[]; width: number }[] = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n);
    const { items, width } = await pageItems(page);
    pages.push({ lines: groupLines(items), width });
  }

  // Body size = the size carrying the most characters across the document.
  const sizeWeight = new Map<number, number>();
  for (const p of pages) for (const l of p.lines) {
    const k = Math.round(l.size * 2) / 2;
    sizeWeight.set(k, (sizeWeight.get(k) || 0) + l.text.length);
  }
  let bodySize = 10;
  let bestW = -1;
  for (const [s, w] of sizeWeight) if (w > bestW) { bestW = w; bodySize = s; }

  const blocks: Block[] = [];
  let sawH1 = false;

  for (const [pageIndex, page] of pages.entries()) {
    const { lines, width } = page;
    if (!lines.length) continue;
    // Where a "full" line ends on this page: wrapped lines reach near this edge.
    const rights = lines.map(l => l.right).sort((a, b) => a - b);
    const pageRightEdge = rights[Math.floor(rights.length * 0.9)] || width;
    const wideThreshold = pageRightEdge - Math.max(width * 0.06, bodySize * 3);

    for (const line of lines) {
      const ratio = line.size / bodySize;
      const chars = line.text.length;
      let type: Block['type'];
      let runs = line.runs;

      const isFirstLineOfDoc = pageIndex === 0 && blocks.length === 0;

      if (line.bullet) {
        type = 'li';
        runs = stripLeadingBullet(runs);
      } else if (!sawH1 && (ratio >= 1.4 || (isFirstLineOfDoc && ratio >= 1.1 && chars <= 80))) {
        // The name: the document's first line, set larger than the body.
        type = 'h1'; sawH1 = true;
      } else if (ratio >= 1.4) {
        type = 'h2';
      } else if (ratio >= 1.12 && chars <= 60) {
        type = 'h2';
      } else if (isAllCaps(line.text) && chars <= 48 && (line.allBold || ratio > 1.02)) {
        type = 'h2';
      } else if (chars <= 130 && !/[.!?]$/.test(line.text) && (line.allBold || (line.runs[0]?.bold && DATE_LIKE.test(line.text)))) {
        type = 'h3';
      } else {
        type = 'p';
      }

      const prev = blocks[blocks.length - 1];
      if (prev && (type === 'p') && (prev.type === 'li' || prev.type === 'p')) {
        const prevText = prev.runs.map(r => r.text).join('').trim();
        const prevWide = prev.right >= wideThreshold;
        const startsLower = /^[\p{Ll}(]/u.test(line.text);
        const endsSentence = /[.!?:;]$/.test(prevText);
        const aligned = line.x >= prev.x - bodySize * 0.5;
        const sameSize = Math.abs(line.size - prev.size) < 0.6;
        const continuation = sameSize && (prevWide || startsLower || (!endsSentence && aligned && prev.type === 'li'));
        if (continuation) {
          if (/-$/.test(prevText) && startsLower) {
            prev.runs[prev.runs.length - 1].text = prev.runs[prev.runs.length - 1].text.replace(/-\s*$/, '');
            appendRuns(prev.runs, runs, '');
          } else {
            appendRuns(prev.runs, runs, ' ');
          }
          prev.right = line.right;
          continue;
        }
      }

      blocks.push({ type, runs, x: line.x, right: line.right, size: line.size });
    }
  }

  // Serialise, wrapping consecutive list items in one <ul>.
  let html = '';
  let inList = false;
  for (const b of blocks) {
    const inner = runsToHtml(b.runs, { heading: b.type === 'h1' || b.type === 'h2' || b.type === 'h3' });
    if (!inner) continue;
    if (b.type === 'li') {
      if (!inList) { html += '<ul>'; inList = true; }
      html += `<li>${inner}</li>`;
      continue;
    }
    if (inList) { html += '</ul>'; inList = false; }
    html += `<${b.type}>${inner}</${b.type}>`;
  }
  if (inList) html += '</ul>';
  return html;
}
