import {
  Document as DocxDocument,
  Packer,
  Paragraph,
  TextRun,
  ExternalHyperlink,
  HeadingLevel,
  LevelFormat,
  AlignmentType,
  BorderStyle,
  convertMillimetersToTwip,
} from 'docx';
import { RESUME_PAGE } from '../shared/resumeTheme';

/**
 * Builds a real Word document from the resume HTML.
 *
 * This replaces html-docx-js, which embedded the HTML as an altChunk: Word
 * displayed it, but the .docx carried no actual paragraphs, so ATS parsers,
 * mammoth and LibreOffice saw an empty file. Here every heading, paragraph,
 * bullet, bold/italic run and hyperlink becomes genuine WordprocessingML, using
 * Word's own Title / Heading 1 / Heading 2 styles so other tools (and our own
 * importer) recognise the structure.
 *
 * Sizes are in half-points. Calibri is used because it is on every machine that
 * has Word; the PDF is the pixel-faithful artifact, the DOCX is for editing.
 */

const BODY_HALF_PT = 21; // 10.5pt

type Inline = TextRun | ExternalHyperlink;

interface RunStyle { bold?: boolean; italics?: boolean; underline?: boolean; link?: string }

function inlineRuns(node: Node, style: RunStyle, out: Inline[]): void {
  if (node.nodeType === 3) {
    const text = (node.textContent || '').replace(/\s+/g, ' ');
    if (!text) return;
    const run = new TextRun({
      text,
      bold: style.bold,
      italics: style.italics,
      underline: style.underline ? {} : undefined,
      style: style.link ? 'Hyperlink' : undefined,
    });
    if (style.link) {
      out.push(new ExternalHyperlink({ link: style.link, children: [run] }));
    } else {
      out.push(run);
    }
    return;
  }
  if (node.nodeType !== 1) return;
  const el = node as Element;
  const tag = el.tagName;
  if (tag === 'BR') { out.push(new TextRun({ break: 1 })); return; }
  const next: RunStyle = { ...style };
  if (tag === 'STRONG' || tag === 'B') next.bold = true;
  if (tag === 'EM' || tag === 'I') next.italics = true;
  if (tag === 'U') next.underline = true;
  if (tag === 'A') {
    const href = el.getAttribute('href') || '';
    if (href) next.link = href;
  }
  for (const child of Array.from(el.childNodes)) inlineRuns(child, next, out);
}

function runsOf(el: Element): Inline[] {
  const out: Inline[] = [];
  for (const child of Array.from(el.childNodes)) inlineRuns(child, {}, out);
  // Trim leading/trailing whitespace-only runs that HTML indentation produces.
  return out;
}

const bottomRule = {
  bottom: { style: BorderStyle.SINGLE, size: 6, color: '000000', space: 1 },
};

function blockParagraphs(el: Element, out: Paragraph[], listLevel = 0, ordered = false): void {
  const tag = el.tagName;
  switch (tag) {
    case 'H1':
      out.push(new Paragraph({ heading: HeadingLevel.TITLE, children: runsOf(el), spacing: { after: 60 }, border: bottomRule }));
      return;
    case 'H2':
      out.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: runsOf(el), spacing: { before: 160, after: 60 }, border: bottomRule }));
      return;
    case 'H3':
    case 'H4':
    case 'H5':
    case 'H6':
      out.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: runsOf(el), spacing: { before: 120, after: 40 } }));
      return;
    case 'UL':
    case 'OL':
      for (const li of Array.from(el.children)) {
        if (li.tagName !== 'LI') continue;
        // A list item may hold a <p> (TipTap) and/or a nested list.
        const nested = Array.from(li.children).filter(c => c.tagName === 'UL' || c.tagName === 'OL');
        const clone = li.cloneNode(true) as Element;
        for (const n of Array.from(clone.children)) if (n.tagName === 'UL' || n.tagName === 'OL') n.remove();
        out.push(new Paragraph({
          numbering: { reference: tag === 'OL' ? 'numbers' : 'bullets', level: Math.min(listLevel, 2) },
          children: runsOf(clone),
          spacing: { after: 30 },
        }));
        for (const n of nested) blockParagraphs(n, out, listLevel + 1, n.tagName === 'OL');
      }
      return;
    case 'P':
    case 'DIV':
    case 'SECTION':
    case 'BLOCKQUOTE': {
      const blockChildren = Array.from(el.children).filter(c => /^(P|DIV|UL|OL|H[1-6]|SECTION|BLOCKQUOTE|TABLE)$/.test(c.tagName));
      if (blockChildren.length && tag !== 'P') {
        for (const c of Array.from(el.children)) blockParagraphs(c, out, listLevel, ordered);
        return;
      }
      const runs = runsOf(el);
      if (runs.length) out.push(new Paragraph({ children: runs, spacing: { after: 60 } }));
      return;
    }
    case 'TABLE': {
      // Keep it simple and ATS-safe: each cell becomes its own paragraph.
      for (const cell of Array.from(el.querySelectorAll('td, th'))) {
        const runs = runsOf(cell);
        if (runs.length) out.push(new Paragraph({ children: runs, spacing: { after: 40 } }));
      }
      return;
    }
    default: {
      const runs = runsOf(el);
      if (runs.length) out.push(new Paragraph({ children: runs, spacing: { after: 60 } }));
    }
  }
}

export function buildResumeDocument(html: string, doc: Document = globalThis.document): DocxDocument {
  const root = doc.createElement('div');
  root.innerHTML = html;
  const paragraphs: Paragraph[] = [];
  for (const child of Array.from(root.children)) blockParagraphs(child, paragraphs);

  const margin = convertMillimetersToTwip(RESUME_PAGE.paddingMm);

  return new DocxDocument({
    creator: 'Jerry Maguire',
    styles: {
      default: {
        document: { run: { font: 'Calibri', size: BODY_HALF_PT, color: '000000' } },
      },
      paragraphStyles: [
        { id: 'Title', name: 'Title', basedOn: 'Normal', next: 'Normal', quickFormat: true,
          run: { size: 36, bold: true, font: 'Calibri', color: '000000' }, paragraph: { spacing: { after: 60 } } },
        { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
          run: { size: 24, bold: true, font: 'Calibri', color: '000000', allCaps: true }, paragraph: { spacing: { before: 160, after: 60 } } },
        { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
          run: { size: 22, bold: true, font: 'Calibri', color: '000000' }, paragraph: { spacing: { before: 120, after: 40 } } },
      ],
    },
    numbering: {
      config: [
        {
          reference: 'bullets',
          levels: [0, 1, 2].map(level => ({
            level,
            format: LevelFormat.BULLET,
            text: level === 0 ? '•' : '◦',
            alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 360 + level * 360, hanging: 260 } } },
          })),
        },
        {
          reference: 'numbers',
          levels: [0, 1, 2].map(level => ({
            level,
            format: LevelFormat.DECIMAL,
            text: '%' + (level + 1) + '.',
            alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 360 + level * 360, hanging: 260 } } },
          })),
        },
      ],
    },
    sections: [{
      properties: {
        page: {
          size: { width: convertMillimetersToTwip(RESUME_PAGE.widthMm), height: convertMillimetersToTwip(RESUME_PAGE.heightMm) },
          margin: { top: margin, bottom: margin, left: margin, right: margin },
        },
      },
      children: paragraphs,
    }],
  });
}

/** Browser: a Blob ready to download. */
export async function resumeHtmlToDocxBlob(html: string): Promise<Blob> {
  return Packer.toBlob(buildResumeDocument(html));
}

/** Node (tests, scripts): raw bytes. */
export async function resumeHtmlToDocxBuffer(html: string, doc: Document): Promise<Uint8Array> {
  return Packer.toBuffer(buildResumeDocument(html, doc));
}
