// DOCX round trip: the real Word document we generate must come back through
// our own importer (mammoth) with headings, bullets, bold and links intact —
// which is also what an ATS parser will see.
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { JSDOM } from 'jsdom';
import { resumeHtmlToDocxBuffer } from '../../utils/htmlToDocx.ts';
import { docxToHtml } from '../../utils/importResume.ts';

import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = resolve(ROOT, 'scripts', 'test', 'out');
const sample = /export const SAMPLE_CV = `([\s\S]*?)`;/.exec(readFileSync(`${ROOT}/constants.tsx`, 'utf8'))![1];
const jsdomDoc = new JSDOM('').window.document;
(globalThis as any).document = jsdomDoc;

const count = (h: string, re: RegExp) => (h.match(re) || []).length;
const text = (h: string) => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

(async () => {
  mkdirSync(OUT, { recursive: true });
  const bytes = await resumeHtmlToDocxBuffer(sample, jsdomDoc);
  const buf = Buffer.from(bytes);
  writeFileSync(`${OUT}/roundtrip.docx`, buf);

  // What document.xml actually contains (this is what an ATS reads).
  const { execSync } = await import('child_process');
  const xml = execSync(`unzip -p "${OUT}/roundtrip.docx" word/document.xml`).toString();
  const xmlText = xml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

  const html = await docxToHtml(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer);
  writeFileSync(`${OUT}/roundtrip.html`, html);

  const stats = (h: string) => ({ links: count(h, /<a /g), h1: count(h, /<h1/g), h2: count(h, /<h2/g), h3: count(h, /<h3/g), li: count(h, /<li/g), strong: count(h, /<strong/g), em: count(h, /<em/g) });
  console.log('docx→html:', JSON.stringify(stats(html)));
  console.log('sample   :', JSON.stringify(stats(sample)));
  const n = (x: string) => text(x).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const sLis = (sample.match(/<li>[\s\S]*?<\/li>/g) || []).map(n);
  const pLis = (html.match(/<li>[\s\S]*?<\/li>/g) || []).map(n);
  const same = sLis.filter(l => pLis.includes(l)).length;
  for (const l of sLis) if (!pLis.includes(l)) console.log('   sample-only:', l.slice(0, 90));

  const checks: [string, boolean][] = [
    ['docx is a zip', buf.subarray(0, 2).toString() === 'PK'],
    ['document.xml carries the real text (ATS-readable)', xmlText.includes('Jayraj Makhar') && xmlText.includes('WORK EXPERIENCE') && xmlText.includes('Opptra')],
    ['document.xml has no altChunk', !/altChunk/.test(xml)],
    ['document.xml has 16 bullet paragraphs', count(xml, /<w:numPr>/g) === 16],
    ['document.xml has 18 hyperlinks', count(xml, /<w:hyperlink /g) === 18],
    ['name heading survives re-import', /<h1>[\s\S]*?Jayraj Makhar/.test(html)],
    ['section headings survive (3)', count(html, /<h2>/g) === 3],
    ['role headings survive (4)', count(html, /<h3>/g) === 4],
    ['bullets survive (16)', count(html, /<li/g) === 16],
    ['all bullet texts identical', same === 16],
    ['links survive (18)', count(html, /<a /g) === 18],
    ['bold survives', count(html, /<strong/g) >= 10],
    ['italic survives', count(html, /<em/g) >= 1],
  ];
  let pass = 0;
  for (const [name, ok] of checks) { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); if (ok) pass++; }
  console.log(`\n${pass}/${checks.length} passed  (identical bullets ${same}/16)`);
  process.exit(pass === checks.length ? 0 : 1);
})().catch(e => { console.error(e); process.exit(2); });
