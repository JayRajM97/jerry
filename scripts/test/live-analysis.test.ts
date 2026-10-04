// Live end-to-end against a deployment with a real AI key: score the bundled
// resume against the bundled JD, get suggestions, and prove they apply to the
// user's own HTML in place (links kept, nothing else touched).
// Usage: BASE=https://… npx tsx scripts/test/live-analysis.test.ts
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { JSDOM } from 'jsdom';
import { applySuggestions, locateSuggestions } from '../../utils/applySuggestions.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = resolve(ROOT, 'scripts', 'test', 'out');
const BASE = process.env.BASE || 'https://jerry-hazel-eight.vercel.app';
const consts = readFileSync(`${ROOT}/constants.tsx`, 'utf8');
const SAMPLE_CV = /export const SAMPLE_CV = `([\s\S]*?)`;/.exec(consts)![1];
const SAMPLE_JD = /export const SAMPLE_JD = `([\s\S]*?)`;/.exec(consts)![1];
const doc = new JSDOM('').window.document;

let pass = 0, total = 0;
const check = (name: string, ok: boolean, detail?: string) => { total++; if (ok) pass++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`); };

async function ai<T>(fn: string, args: unknown[]): Promise<{ result: T; ms: number }> {
  const t0 = Date.now();
  const res = await fetch(`${BASE}/api/ai/${fn}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ args }) });
  const body = await res.json();
  if (!res.ok) throw new Error(`${fn} → ${res.status}: ${body?.error || 'unknown'}`);
  return { result: body.result as T, ms: Date.now() - t0 };
}

(async () => {
  mkdirSync(OUT, { recursive: true });
  const health = await (await fetch(`${BASE}/api/health`)).json();
  console.log('provider:', JSON.stringify(health.llm));
  check('an AI provider is configured', !!health.llm?.configured, JSON.stringify(health.llm));

  // 1. ATS score (parseResume + parseJD under the hood).
  const score = await ai<any>('calculateATSScore', [SAMPLE_CV, SAMPLE_JD]);
  console.log(`calculateATSScore ${score.ms}ms → total ${score.result?.total} (${score.result?.band}), missing: ${(score.result?.missing_required_skills || []).slice(0, 5).join(', ')}`);
  check('score is a number in range', typeof score.result?.total === 'number' && score.result.total >= 0 && score.result.total <= 100);
  check('parsedJd returned with job_title', typeof score.result?.parsedJd?.job_title === 'string' && score.result.parsedJd.job_title.length > 0, score.result?.parsedJd?.job_title);
  check('parsedJd.company extracted (new field)', typeof score.result?.parsedJd?.company === 'string', JSON.stringify(score.result?.parsedJd?.company));
  check('parsedCv found experience entries', Array.isArray(score.result?.parsedCv?.experience) && score.result.parsedCv.experience.length >= 3, String(score.result?.parsedCv?.experience?.length));

  // 2. Suggestions.
  const an = await ai<any>('analyzeResume', [SAMPLE_CV, SAMPLE_JD, 'Balanced', score.result.missing_required_skills || [], score.result.weak_signals || []]);
  const { sections, suggestions, skippableContent, profileSuggestions } = an.result;
  console.log(`analyzeResume ${an.ms}ms → ${sections?.length} sections, ${suggestions?.length} suggestions, ${skippableContent?.length} skippable, ${profileSuggestions?.length} profile`);
  writeFileSync(`${OUT}/live-analysis.json`, JSON.stringify(an.result, null, 2));
  check('3–8 suggestions ("a few options")', suggestions.length >= 3 && suggestions.length <= 8, String(suggestions.length));
  check('every suggestion has original + suggested + reason', suggestions.every((s: any) => s.originalHtml && s.suggestedHtml && s.reason));

  // 3. The contract that keeps formatting: originals must be locatable in the user's HTML.
  const loc = locateSuggestions(SAMPLE_CV, suggestions, doc);
  console.log(`locatable: ${loc.matchedIds.length}/${suggestions.length}${loc.unmatchedIds.length ? '  unmatched: ' + loc.unmatchedIds.join(',') : ''}`);
  for (const s of suggestions) {
    const tag = loc.unmatchedIds.includes(s.id) ? 'UNMATCHED' : 'ok';
    const strip = (h: string) => h.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    console.log(`  [${tag}] ${s.id}: "${strip(s.originalHtml).slice(0, 70)}…" → "${strip(s.suggestedHtml).slice(0, 70)}…"`);
  }
  check('≥ 80% of suggestions locate in the resume', loc.matchedIds.length >= Math.ceil(suggestions.length * 0.8), `${loc.matchedIds.length}/${suggestions.length}`);

  const applied = applySuggestions(SAMPLE_CV, suggestions.map((s: any) => ({ ...s, applied: true })), doc);
  writeFileSync(`${OUT}/live-applied.html`, applied.html);
  const links = (h: string) => (h.match(/<a /g) || []).length;
  check('hyperlink count unchanged after applying', links(applied.html) === links(SAMPLE_CV), `${links(SAMPLE_CV)} → ${links(applied.html)}`);
  check('header untouched', applied.html.includes('<h1>Jayraj Makhar • Senior Product Manager</h1>'));
  check('section headings untouched', (applied.html.match(/<h2>/g) || []).length === 3);
  check('bullet count not reduced', (applied.html.match(/<li/g) || []).length >= 16);

  // Did the text actually change where it should?
  const changedCount = suggestions.filter((s: any) => applied.html.includes(s.suggestedHtml.replace(/<\/?li>/g, '').trim().slice(0, 40))).length;
  check('suggested wording present in applied HTML', changedCount >= 1, `${changedCount} found verbatim`);

  // 4. Re-score the applied HTML (the real "optimised" score).
  const after = await ai<any>('calculateATSScore', [applied.html, SAMPLE_JD, score.result.parsedJd]);
  console.log(`re-score ${after.ms}ms → ${score.result.total} → ${after.result.total}`);
  check('re-score succeeds', typeof after.result?.total === 'number');

  // 5. One message, to cover the plain-text path.
  const msg = await ai<string>('generateTopChoiceMessage', [SAMPLE_CV, SAMPLE_JD]);
  console.log(`generateTopChoiceMessage ${msg.ms}ms → ${msg.result.length} chars: "${msg.result.slice(0, 90)}…"`);
  check('message is plain text ≤ 400 chars', typeof msg.result === 'string' && msg.result.length > 20 && msg.result.length <= 400, String(msg.result.length));

  console.log(`\n${pass}/${total} passed`);
  process.exit(pass === total ? 0 : 1);
})().catch(e => { console.error('ERROR:', e.message); process.exit(2); });
