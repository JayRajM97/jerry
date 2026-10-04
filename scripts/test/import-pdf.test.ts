// PDF import test: parse Jay's real resume PDF and compare against SAMPLE_CV,
// the hand-made HTML of the same document that constants.tsx carries.
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { pdfToHtml } from '../../utils/importResume.ts';

import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = resolve(ROOT, 'scripts', 'test', 'out');
const PDF = `${ROOT}/2026 - Jayraj Makhar - AI Product Manager.pdf`;

const count = (html: string, re: RegExp) => (html.match(re) || []).length;
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

(async () => {
  const data = new Uint8Array(readFileSync(PDF));
  const pdf = await pdfjs.getDocument({
    data,
    standardFontDataUrl: `${ROOT}/node_modules/pdfjs-dist/standard_fonts/`,
    verbosity: 0,
  }).promise;
  const html = await pdfToHtml(pdf as any);

  const sample = /export const SAMPLE_CV = `([\s\S]*?)`;/.exec(readFileSync(`${ROOT}/constants.tsx`, 'utf8'))![1];

  const stats = (h: string) => ({
    links: count(h, /<a /g), h1: count(h, /<h1/g), h2: count(h, /<h2/g), h3: count(h, /<h3/g),
    li: count(h, /<li/g), p: count(h, /<p/g), strong: count(h, /<strong/g), chars: text(h).length,
  });
  console.log('parsed :', JSON.stringify(stats(html)));
  console.log('sample :', JSON.stringify(stats(sample)));

  const sampleLinks = Array.from(sample.matchAll(/href="([^"]+)"/g)).map(m => m[1]);
  const parsedLinks = Array.from(html.matchAll(/href="([^"]+)"/g)).map(m => m[1]);
  const norm = (u: string) => u.replace(/\/$/, '').replace(/^https?:\/\/(www\.)?/, '').toLowerCase();
  const recovered = sampleLinks.filter(u => parsedLinks.some(p => norm(p) === norm(u)));
  console.log(`links recovered: ${recovered.length}/${sampleLinks.length}`);
  const missing = sampleLinks.filter(u => !recovered.includes(u));
  if (missing.length) console.log('  missing:', missing);

  const parsedText = text(html).toLowerCase();
  const checks: [string, boolean][] = [
    ['h1 is the name', /<h1>[^<]*Jayraj Makhar/i.test(html)],
    ['WORK EXPERIENCE is a section heading', /<h2>[^<]*WORK EXPERIENCE/i.test(html)],
    ['EDUCATION is a section heading', /<h2>[^<]*EDUCATION/i.test(html)],
    ['has a bullet list', count(html, /<ul>/g) >= 1],
    ['≥ 12 bullets (sample has 16)', count(html, /<li>/g) >= 12],
    ['≥ 12 of 18 links recovered', recovered.length >= 12],
    ['email link recovered', parsedLinks.some(l => /^mailto:/i.test(l))],
    ['no unescaped ampersand', !/&(?!amp;|lt;|gt;|quot;|#)/.test(html)],
    ['no line broken mid-sentence into separate <p>s (ShopOS bullet intact)', parsedText.includes('reducing creative costs')],
    ['no doubled spaces', !/  /.test(text(html))],
    ['3 section headings', count(html, /<h2>/g) === 3],
    ['≥ 4 role headings (h3)', count(html, /<h3>/g) >= 4],
    ['italic descriptions kept', count(html, /<em>/g) >= 1],
    ['bold runs kept', count(html, /<strong>/g) >= 10],
    ['no bold wrapper inside headings', !/<h[123]><strong>/.test(html)],
    ['space before bracket restored ("suite (Enterprise")', parsedText.includes('suite (enterprise')],
    ['bullet texts match sample (≥ 14 of 16 identical after normalising)', (() => {
      const n = (x: string) => text(x).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
      const sLis = (sample.match(/<li>[\s\S]*?<\/li>/g) || []).map(n);
      const pLis = (html.match(/<li>[\s\S]*?<\/li>/g) || []).map(n);
      const same = sLis.filter(l => pLis.includes(l)).length;
      console.log(`   identical bullets: ${same}/${sLis.length}; parsed has ${pLis.length}`);
      for (const l of sLis) if (!pLis.includes(l)) console.log('   sample-only:', l.slice(0, 90));
      for (const l of pLis) if (!sLis.includes(l)) console.log('   parsed-only:', l.slice(0, 90));
      return same >= 14;
    })()],
  ];
  mkdirSync(OUT, { recursive: true }); writeFileSync(resolve(OUT, 'parsed-resume.html'), html);
  let pass = 0;
  for (const [name, ok] of checks) { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); if (ok) pass++; }
  console.log(`\n${pass}/${checks.length} passed`);
  
  process.exit(pass === checks.length ? 0 : 1);
})().catch(e => { console.error(e); process.exit(2); });
