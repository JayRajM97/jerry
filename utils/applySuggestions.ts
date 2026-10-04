import type { Suggestion } from '../types';

/**
 * Applies accepted suggestions to the user's resume HTML by replacing matched
 * elements in place. Everything a suggestion does not touch stays byte-identical:
 * the header, the hyperlinks, the heading levels, the section order.
 *
 * This replaces the old approach of rebuilding the whole document from the
 * model's rewritten sections, which was what broke formatting.
 *
 * Matching is tolerant on purpose. The model is asked to quote `originalHtml`
 * verbatim, but whitespace, entity encoding and small paraphrases happen, so the
 * target is found by normalised text: exact match on the smallest block whose
 * text equals the original, then containment, then token similarity.
 * A suggestion whose original cannot be located anywhere is reported back as
 * unmatched rather than guessed at.
 */

export type SuggestionLike = Pick<Suggestion, 'id' | 'originalHtml' | 'suggestedHtml' | 'applied'>;

export interface ApplySuggestionsResult {
  html: string;
  appliedIds: string[];
  unmatchedIds: string[];
}

const BLOCK_TAGS = new Set(['LI', 'P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'TD', 'TH', 'DIV', 'BLOCKQUOTE', 'UL', 'OL', 'SECTION', 'ARTICLE']);
const LEAF_BLOCK_TAGS = new Set(['LI', 'P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'TD', 'TH', 'DIV', 'BLOCKQUOTE']);

/** Leading bullet glyphs and dashes the model sometimes includes in a quoted bullet. */
const LEADING_BULLET = /^[\s•●▪⁃∙◦■‣*\-–—]+/;

/** Minimum token-set similarity to accept a fuzzy match. */
const FUZZY_THRESHOLD = 0.72;

export function normalizeText(s: string): string {
  return s
    .normalize('NFKC')
    .replace(LEADING_BULLET, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function tokens(normalized: string): Set<string> {
  return new Set(normalized.split(' ').filter(Boolean));
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / (a.size + b.size - inter);
}

function parseFragment(doc: Document, html: string): HTMLElement {
  const el = doc.createElement('div');
  el.innerHTML = html;
  return el;
}

function isBlock(el: Element): boolean {
  return BLOCK_TAGS.has(el.tagName);
}

function hasBlockChild(el: Element): boolean {
  for (const child of Array.from(el.children)) {
    if (isBlock(child)) return true;
  }
  return false;
}

/** All block elements in document order (containers and leaves). */
function allBlocks(root: Element): Element[] {
  return Array.from(root.querySelectorAll('*')).filter(isBlock);
}

/** Top-level block children of a parsed fragment. */
function topLevelBlocks(fragment: Element): Element[] {
  return Array.from(fragment.children).filter(isBlock);
}

/**
 * The innermost element to take content from: unwrap single-child block
 * nesting such as <li><p>text</p></li> so we never nest a <p> in a <p>.
 */
function innermostContent(el: Element): string {
  let cur = el;
  while (cur.children.length === 1 && isBlock(cur.children[0]) && cur.childNodes.length === 1) {
    cur = cur.children[0];
  }
  return cur.innerHTML;
}

interface Target {
  el: Element;
  how: 'exact' | 'contains' | 'fuzzy';
}

function findTarget(root: Element, originalText: string, used: Set<Element>): Target | null {
  if (!originalText) return null;
  const blocks = allBlocks(root).filter(b => !used.has(b));

  // 1. Exact: the smallest block whose whole text equals the original's.
  let exact: Element | null = null;
  for (const b of blocks) {
    if (normalizeText(b.textContent || '') === originalText) {
      // querySelectorAll is document order, so a later match is a descendant of
      // an earlier one or a sibling; prefer the one with no block children.
      if (!exact || !hasBlockChild(b)) exact = b;
      if (!hasBlockChild(b)) break;
    }
  }
  if (exact) return { el: exact, how: 'exact' };

  // 2. Leaf blocks only from here: containment, then similarity.
  const leaves = blocks.filter(b => LEAF_BLOCK_TAGS.has(b.tagName) && !hasBlockChild(b));
  const origTokens = tokens(originalText);

  for (const b of leaves) {
    const t = normalizeText(b.textContent || '');
    if (!t) continue;
    const longer = Math.max(t.length, originalText.length);
    const shorter = Math.min(t.length, originalText.length);
    if (shorter / longer < 0.85) continue;
    if (t.includes(originalText) || originalText.includes(t)) return { el: b, how: 'contains' };
  }

  let best: { el: Element; score: number } | null = null;
  for (const b of leaves) {
    const t = normalizeText(b.textContent || '');
    if (!t) continue;
    const score = jaccard(origTokens, tokens(t));
    if (score >= FUZZY_THRESHOLD && (!best || score > best.score)) best = { el: b, score };
  }
  return best ? { el: best.el, how: 'fuzzy' } : null;
}

function replaceTarget(doc: Document, target: Element, suggestedHtml: string): void {
  const fragment = parseFragment(doc, suggestedHtml);
  const blocks = topLevelBlocks(fragment);

  if (blocks.length === 0) {
    // Bare inline content: swap the text, keep the element and its place.
    target.innerHTML = fragment.innerHTML;
    return;
  }

  if (blocks.length === 1) {
    target.innerHTML = innermostContent(blocks[0]);
    return;
  }

  // Several blocks (e.g. one bullet became two). Replace at list-item level so
  // new <li>s land inside the existing <ul>, otherwise replace the target itself.
  const firstTag = blocks[0].tagName;
  let anchor: Element = target;
  if (firstTag === 'LI' && target.tagName !== 'LI') {
    const li = target.closest('li');
    if (li) anchor = li;
  }
  const nodes = blocks.map(b => doc.importNode(b, true));
  anchor.replaceWith(...nodes);
}

export function applySuggestions(
  cvHtml: string,
  suggestions: SuggestionLike[],
  doc: Document = globalThis.document,
): ApplySuggestionsResult {
  const root = parseFragment(doc, cvHtml);
  const used = new Set<Element>();
  const appliedIds: string[] = [];
  const unmatchedIds: string[] = [];

  for (const s of suggestions) {
    if (!s.applied) continue;
    const original = parseFragment(doc, s.originalHtml || '');
    const originalText = normalizeText(original.textContent || '');
    const target = findTarget(root, originalText, used);
    if (!target) {
      unmatchedIds.push(s.id);
      continue;
    }
    used.add(target.el);
    replaceTarget(doc, target.el, s.suggestedHtml || '');
    appliedIds.push(s.id);
  }

  return { html: root.innerHTML, appliedIds, unmatchedIds };
}

/**
 * Which suggestions can be located in this HTML at all. Used to warn before the
 * user accepts something that would silently do nothing.
 */
export function locateSuggestions(
  cvHtml: string,
  suggestions: SuggestionLike[],
  doc: Document = globalThis.document,
): { matchedIds: string[]; unmatchedIds: string[] } {
  const probe = applySuggestions(cvHtml, suggestions.map(s => ({ ...s, applied: true })), doc);
  return { matchedIds: probe.appliedIds, unmatchedIds: probe.unmatchedIds };
}
