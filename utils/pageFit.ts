import { useEffect, useState } from 'react';
import { RESUME_CSS, RESUME_PAGE, RESUME_MIN_SCALE, PX_PER_MM } from '../shared/resumeTheme';

/**
 * Client-side page-fit measurement.
 *
 * Lays the resume HTML out in an off-screen A4 page using the shared stylesheet
 * and finds the largest `--resume-scale` at which it fits one page — the same
 * search the server runs before producing the PDF. The preview applies the
 * resulting scale, so what the user sees on screen is what the file will be.
 */

export interface PageFit {
  /** True when the content fits one page at `scale`. */
  fits: boolean;
  /** 1 means no shrinking was needed. */
  scale: number;
  /** Pages needed at `scale`. */
  pages: number;
  /** Fraction of one page used at `scale`; >1 means overflow. */
  fill: number;
  /** How many more lines than fit, when it does not fit even at the minimum scale. */
  overflowLines: number;
}

const STYLE_ID = 'resume-theme-style';

/** Inject the shared stylesheet once; safe to call repeatedly. */
export function ensureResumeThemeStyle(): void {
  if (typeof document === 'undefined') return;
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = RESUME_CSS;
  document.head.appendChild(style);
}

let host: HTMLDivElement | null = null;

function ensureHost(): HTMLDivElement {
  if (host && host.isConnected) return host;
  ensureResumeThemeStyle();
  host = document.createElement('div');
  host.className = 'resume-page';
  host.setAttribute('aria-hidden', 'true');
  // Off-screen but laid out. visibility:hidden keeps layout; display:none would not.
  host.style.cssText = 'position:absolute;left:-10000px;top:0;visibility:hidden;pointer-events:none;';
  const root = document.createElement('div');
  root.className = 'resume-root';
  host.appendChild(root);
  document.body.appendChild(host);
  return host;
}

export async function measurePageFit(html: string): Promise<PageFit> {
  const contentHeightPx = RESUME_PAGE.contentHeightMm * PX_PER_MM;
  const empty: PageFit = { fits: true, scale: 1, pages: 1, fill: 0, overflowLines: 0 };
  if (typeof document === 'undefined' || !html.trim()) return empty;

  // Fallback fonts wrap differently; measure with the real one.
  try { await (document as any).fonts?.ready; } catch { /* no Font Loading API */ }

  const page = ensureHost();
  const root = page.firstElementChild as HTMLElement;
  root.innerHTML = html;

  const measure = (s: number) => {
    page.style.setProperty('--resume-scale', String(s));
    void root.offsetHeight;
    return Math.max(root.scrollHeight, root.getBoundingClientRect().height);
  };
  // Same 2px slack the server uses, so both agree on borderline cases.
  const limit = contentHeightPx - 2;

  let result: PageFit;
  let h = measure(1);
  if (h <= limit) {
    result = { fits: true, scale: 1, pages: 1, fill: h / contentHeightPx, overflowLines: 0 };
  } else {
    const hMin = measure(RESUME_MIN_SCALE);
    if (hMin > limit) {
      // Estimate a line as the root font size × line-height at min scale.
      const lineHeightPx = parseFloat(getComputedStyle(root).fontSize) * 1.3;
      result = {
        fits: false,
        scale: RESUME_MIN_SCALE,
        pages: Math.ceil(hMin / contentHeightPx),
        fill: hMin / contentHeightPx,
        overflowLines: Math.max(1, Math.ceil((hMin - contentHeightPx) / lineHeightPx)),
      };
    } else {
      let lo = RESUME_MIN_SCALE, hi = 1;
      for (let i = 0; i < 10; i++) {
        const mid = (lo + hi) / 2;
        if (measure(mid) <= limit) lo = mid; else hi = mid;
      }
      const scale = Math.floor(lo * 1000) / 1000;
      h = measure(scale);
      result = { fits: true, scale, pages: 1, fill: h / contentHeightPx, overflowLines: 0 };
    }
  }

  root.innerHTML = '';
  page.style.setProperty('--resume-scale', '1');
  return result;
}

/** Debounced live measurement for React. Returns null until the first result. */
export function usePageFit(html: string, delayMs = 250): PageFit | null {
  const [fit, setFit] = useState<PageFit | null>(null);
  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(() => {
      measurePageFit(html).then(r => { if (!cancelled) setFit(r); }).catch(() => { /* leave last value */ });
    }, delayMs);
    return () => { cancelled = true; clearTimeout(t); };
  }, [html, delayMs]);
  return fit;
}

/** Short, human description for a badge. */
export function describePageFit(fit: PageFit | null): { label: string; tone: 'ok' | 'warn' | 'bad' } {
  if (!fit) return { label: 'Measuring…', tone: 'ok' };
  if (!fit.fits) {
    return {
      label: `${fit.pages} pages even at minimum size — cut about ${fit.overflowLines} line${fit.overflowLines === 1 ? '' : 's'}`,
      tone: 'bad',
    };
  }
  if (fit.scale < 1) {
    return { label: `1 page · shrunk to ${Math.round(fit.scale * 100)}% to fit`, tone: 'warn' };
  }
  return { label: `1 page · ${Math.round(fit.fill * 100)}% full`, tone: 'ok' };
}
