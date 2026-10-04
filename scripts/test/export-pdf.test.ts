// End-to-end export test against a deployed URL (the serverless Chromium).
// Usage: BASE=https://... [BYPASS=<vercel bypass secret>] npx tsx test-export.ts
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { PDFDocument } from 'pdf-lib';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';

import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = resolve(ROOT, 'scripts', 'test', 'out');
const BASE = process.env.BASE || 'https://jerry-hazel-eight.vercel.app';
const BYPASS = process.env.BYPASS || '';
const sample = /export const SAMPLE_CV = `([\s\S]*?)`;/.exec(readFileSync(`${ROOT}/constants.tsx`, 'utf8'))![1];

let pass = 0, total = 0;
let baseScale = 1;
const check = (name: string, ok: boolean, detail?: string) => { total++; if (ok) pass++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`); };

import { execFileSync } from 'child_process';
let seq = 0;
async function exportPdf(html: string, filename: string): Promise<{ res: { status: number; headers: { get(k: string): string | null } }; buf: Buffer; ms: number }> {
  const t0 = Date.now();
  if (process.env.VIA_VERCEL_CURL) {
    // Protected preview: let the Vercel CLI mint the bypass and pass the request to curl.
    const id = ++seq;
    const bodyFile = `${OUT}/req-${id}.json`, outFile = `${OUT}/res-${id}.bin`, hdrFile = `${OUT}/res-${id}.hdr`;
    writeFileSync(bodyFile, JSON.stringify({ html, filename }));
    try {
      execFileSync('npx', ['-y', 'vercel@latest', 'curl', `${BASE}/api/export/pdf`, '--scope', process.env.VIA_VERCEL_CURL,
        '-s', '--max-time', '240', '-o', outFile, '-D', hdrFile, '-X', 'POST', '-H', 'Content-Type: application/json', '--data-binary', `@${bodyFile}`],
        { stdio: ['ignore', 'ignore', 'inherit'], cwd: ROOT, timeout: 300000 });
    } catch (e) { /* non-2xx exit is fine; we read the header file */ }
    const raw = readFileSync(hdrFile, 'utf8');
    const status = Number(/^HTTP\/[\d.]+ (\d{3})/m.exec(raw)?.[1] || '0');
    const map = new Map<string, string>();
    for (const line of raw.split(/\r?\n/)) { const m = /^([^:]+):\s*(.*)$/.exec(line); if (m) map.set(m[1].toLowerCase(), m[2]); }
    const buf = readFileSync(outFile);
    return { res: { status, headers: { get: (k: string) => map.get(k.toLowerCase()) ?? null } }, buf, ms: Date.now() - t0 };
  }
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (BYPASS) { headers['x-vercel-protection-bypass'] = BYPASS; headers['x-vercel-set-bypass-cookie'] = 'true'; }
  const res = await fetch(`${BASE}/api/export/pdf`, { method: 'POST', headers, body: JSON.stringify({ html, filename }) });
  const buf = Buffer.from(await res.arrayBuffer());
  return { res: { status: res.status, headers: res.headers }, buf, ms: Date.now() - t0 };
}

async function inspect(buf: Buffer) {
  const pages = (await PDFDocument.load(buf, { updateMetadata: false })).getPageCount();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf), verbosity: 0 }).promise;
  const page = await doc.getPage(1);
  const tc = await page.getTextContent();
  const text = (tc.items as any[]).map(i => i.str).join(' ').replace(/\s+/g, ' ');
  const ann = await page.getAnnotations();
  const links = ann.filter((a: any) => a.subtype === 'Link' && a.url).map((a: any) => a.url);
  const first = (tc.items as any[]).find(i => i.str?.trim());
  const vp = page.getViewport({ scale: 1 });
  const fonts = new Set((tc.items as any[]).map(i => i.fontName));
  return { pages, text, links, firstX: first?.transform[4], firstYFromTop: first ? vp.height - first.transform[5] : NaN, width: vp.width, height: vp.height, fontCount: fonts.size };
}

(async () => {
  mkdirSync(OUT, { recursive: true });
  // 1. Jay's resume: one page, text layer, links, named file.
  {
    const name = 'Jayraj-Makhar-com-Stripe-2026-10-04.pdf';
    const { res, buf, ms } = await exportPdf(sample, name);
    check('status 200', res.status === 200, `${res.status} in ${ms}ms`);
    check('content-type pdf', (res.headers.get('content-type') || '').includes('application/pdf'));
    check('is a PDF', buf.subarray(0, 5).toString() === '%PDF-');
    check('filename honoured', (res.headers.get('content-disposition') || '').includes(name), res.headers.get('content-disposition') || '');
    const hdr = { pages: res.headers.get('x-resume-pages'), scale: res.headers.get('x-resume-scale'), fits: res.headers.get('x-resume-fits'), fill: res.headers.get('x-resume-fill') };
    console.log('   headers:', JSON.stringify(hdr));
    baseScale = Number(hdr.scale);
    check('base resume fits at ≥ 90% scale (readable size)', baseScale >= 0.9, `scale ${baseScale}`);
    const info = await inspect(buf);
    check('exactly 1 page', info.pages === 1, `${info.pages}`);
    check('A4 size', Math.abs(info.width - 595.3) < 1 && Math.abs(info.height - 841.9) < 1, `${info.width.toFixed(1)}x${info.height.toFixed(1)}pt`);
    check('text layer has the name', info.text.includes('Jayraj Makhar'));
    check('text layer has a late bullet (nothing clipped)', /Outside of work|OUTSIDE OF WORK|Spotify|spotify/i.test(info.text), info.text.slice(-120));
    check('hyperlinks preserved (≥ 15 of 18)', info.links.length >= 15, `${info.links.length}`);
    check('arrows (→) survive in the text layer', info.text.includes('→'), info.text.match(/Simulate.{0,12}Listen/)?.[0] || 'not found');
    check('rupee sign (₹) survives in the text layer', info.text.includes('₹'), info.text.match(/\(.{0,3}7\/image/)?.[0] || 'not found');
    check('20mm page margin (left ≈ 56.7pt)', Math.abs((info.firstX || 0) - 56.7) < 3, `${info.firstX?.toFixed(1)}pt`);
    check('20mm top margin (first line < 80pt from top)', info.firstYFromTop > 50 && info.firstYFromTop < 85, `${info.firstYFromTop.toFixed(1)}pt`);
    check('server reports fits', hdr.fits === 'true');
    writeFileSync(`${OUT}/export-sample.pdf`, buf);
  }

  // 2. Two more bullets than the base: must still be one page, by shrinking a bit more than the base did.
  {
    const bullets = (sample.match(/<li>[\s\S]*?<\/li>/g) || []);
    const longer = sample.replace('</ul>', bullets.slice(0, 2).join('') + '</ul>');
    const { res, buf } = await exportPdf(longer, 'long.pdf');
    const info = await inspect(buf);
    const scale = Number(res.headers.get('x-resume-scale'));
    check('long: still 1 page', info.pages === 1, `${info.pages} pages`);
    check('long: shrunk more than the base (scale < base)', scale < baseScale, `scale ${scale} vs base ${baseScale}`);
    check('long: scale ≥ minimum 0.8', scale >= 0.8);
    check('long: fits reported', res.headers.get('x-resume-fits') === 'true');
    writeFileSync(`${OUT}/export-long.pdf`, buf);
  }

  // 3. 3× the content: cannot fit; must say so honestly, not clip.
  {
    const triple = sample + sample + sample;
    const { res, buf } = await exportPdf(triple, 'triple.pdf');
    const info = await inspect(buf);
    check('triple: multiple pages produced (no clipping)', info.pages >= 2, `${info.pages} pages`);
    check('triple: fits=false reported', res.headers.get('x-resume-fits') === 'false');
    check('triple: pages header matches PDF', Number(res.headers.get('x-resume-pages')) === info.pages);
  }

  // 4. Validation + filename sanitising.
  {
    const bad = await exportPdf('', 'x.pdf');
    check('empty html → 400', bad.res.status === 400);
    const { res } = await exportPdf('<p>hi</p>', '../../evil name?.pdf');
    check('path-like filename sanitised', /filename="evil-name\.pdf"/.test(res.headers.get('content-disposition') || ''), res.headers.get('content-disposition') || '');
  }

  console.log(`\n${pass}/${total} passed`);
  process.exit(pass === total ? 0 : 1);
})().catch(e => { console.error(e); process.exit(2); });
