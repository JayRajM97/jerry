// applySuggestions tests under jsdom: in-place replacement must leave everything
// else byte-identical, keep hyperlinks, tolerate the model's small deviations,
// and report what it could not find instead of guessing.
import { readFileSync } from 'fs';
import { JSDOM } from 'jsdom';
import { applySuggestions, locateSuggestions } from '../../utils/applySuggestions.ts';

import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const doc = new JSDOM('').window.document;
const sample = /export const SAMPLE_CV = `([\s\S]*?)`;/.exec(readFileSync(`${ROOT}/constants.tsx`, 'utf8'))![1];

let pass = 0, total = 0;
const check = (name: string, ok: boolean, detail?: string) => {
  total++; if (ok) pass++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${!ok && detail ? '\n      ' + detail : ''}`);
};

// 1. Realistic: a verbatim <li> from SAMPLE_CV, rewritten but keeping its <a>.
{
  const li = /<li>Built browser-based[\s\S]*?<\/li>/.exec(sample)![0];
  const suggested = li.replace('Built browser-based <strong>marketing automation</strong>', 'Shipped browser-based <strong>marketing automation and QA tooling</strong>');
  const r = applySuggestions(sample, [{ id: 'a', originalHtml: li, suggestedHtml: suggested, applied: true }], doc);
  check('realistic: applied', r.appliedIds.length === 1 && r.unmatchedIds.length === 0);
  check('realistic: new wording present', r.html.includes('marketing automation and QA tooling'));
  check('realistic: Opptra link kept', r.html.includes('href="https://opptra.com"'));
  const before = (sample.match(/<a /g) || []).length, after = (r.html.match(/<a /g) || []).length;
  check('realistic: link count unchanged', before === after, `${before} -> ${after}`);
  // Everything except that one li should be unchanged: compare with the li swapped in.
  const expected = new JSDOM(`<div>${sample.replace(li, suggested)}</div>`).window.document.body.firstElementChild!.innerHTML;
  check('realistic: rest of document byte-identical', r.html === expected);
  check('realistic: header untouched', r.html.includes('<h1>Jayraj Makhar • Senior Product Manager</h1>'));
}

// 2. Tolerance: whitespace + entity differences in the quoted original.
{
  const cv = '<h1>Name</h1><ul><li>Cut ops time by 70% &amp; scaled to 10K+ monthly transactions</li><li>Other bullet</li></ul>';
  const original = '<li>  Cut ops time by 70% & scaled   to 10K+ monthly transactions </li>';
  const r = applySuggestions(cv, [{ id: 'b', originalHtml: original, suggestedHtml: '<li>Cut ops time 70% and scaled to 10K+ monthly transactions (QA-led)</li>', applied: true }], doc);
  check('tolerant: whitespace/entity variation matched', r.appliedIds.length === 1);
  check('tolerant: other bullet untouched', r.html.includes('<li>Other bullet</li>'));
}

// 3. TipTap structure <li><p>…</p></li>: replace inside, keep structure.
{
  const cv = '<ul><li><p>Led A/B testing</p></li><li><p>Keep me</p></li></ul>';
  const r = applySuggestions(cv, [{ id: 'c', originalHtml: '<li>Led A/B testing</li>', suggestedHtml: '<li>Led A/B testing across 10 brands</li>', applied: true }], doc);
  check('tiptap: matched', r.appliedIds.length === 1);
  check('tiptap: structure kept', r.html === '<ul><li><p>Led A/B testing across 10 brands</p></li><li><p>Keep me</p></li></ul>', r.html);
}

// 4. Fuzzy paraphrase accepted; unrelated text rejected (unmatched, not guessed).
{
  const cv = '<ul><li>Launched a white-label solution for B2B travel brands opening new channels</li><li>Hired a team of five engineers</li></ul>';
  const fuzzy = applySuggestions(cv, [{ id: 'd', originalHtml: '<li>Launched white-label solution for B2B travel brands, opening new channels</li>', suggestedHtml: '<li>X</li>', applied: true }], doc);
  check('fuzzy: close paraphrase matched', fuzzy.appliedIds.length === 1 && fuzzy.html.includes('<li>X</li>'));
  const none = applySuggestions(cv, [{ id: 'e', originalHtml: '<li>Completely different sentence about cooking recipes at home</li>', suggestedHtml: '<li>Y</li>', applied: true }], doc);
  check('fuzzy: unrelated reported unmatched', none.unmatchedIds.length === 1 && none.html === cv);
}

// 5. One bullet becomes two: new <li>s land inside the same <ul>.
{
  const cv = '<ul><li>A</li><li>B</li></ul>';
  const r = applySuggestions(cv, [{ id: 'f', originalHtml: '<li>A</li>', suggestedHtml: '<li>A1</li><li>A2</li>', applied: true }], doc);
  check('split: two items inserted in place', r.html === '<ul><li>A1</li><li>A2</li><li>B</li></ul>', r.html);
}

// 6. Not-applied suggestions are ignored; locate reports matchability.
{
  const cv = '<p>Hello world</p>';
  const r = applySuggestions(cv, [{ id: 'g', originalHtml: '<p>Hello world</p>', suggestedHtml: '<p>Bye</p>', applied: false }], doc);
  check('ignored when not applied', r.html === cv && r.appliedIds.length === 0);
  const loc = locateSuggestions(cv, [{ id: 'h', originalHtml: '<p>Hello world</p>', suggestedHtml: '', applied: false }, { id: 'i', originalHtml: '<p>nothing here</p>', suggestedHtml: '', applied: false }], doc);
  check('locate: 1 matched, 1 unmatched', loc.matchedIds.join() === 'h' && loc.unmatchedIds.join() === 'i');
}

// 7. Same text appearing twice: each suggestion consumes a distinct element.
{
  const cv = '<ul><li>Same</li><li>Same</li></ul>';
  const r = applySuggestions(cv, [
    { id: 'j', originalHtml: '<li>Same</li>', suggestedHtml: '<li>First</li>', applied: true },
    { id: 'k', originalHtml: '<li>Same</li>', suggestedHtml: '<li>Second</li>', applied: true },
  ], doc);
  check('duplicates: both replaced distinctly', r.html === '<ul><li>First</li><li>Second</li></ul>', r.html);
}

console.log(`\n${pass}/${total} passed`);
process.exit(pass === total ? 0 : 1);
