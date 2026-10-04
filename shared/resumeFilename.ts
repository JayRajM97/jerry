/**
 * Resume file naming: First-Last-com-Company-YYYY-MM-DD.<ext>
 *
 * One function, used by the PDF download, the DOCX download and the resume the
 * auto-apply agent uploads to a job board, so a recruiter sees the same name
 * everywhere. Change the pattern here and it changes in all three places.
 */

export interface ResumeFilenameParts {
  firstName: string;
  lastName: string;
  company?: string;
  /** Defaults to today. */
  date?: Date;
  /** Without the dot. Defaults to "pdf". */
  ext?: string;
}

/**
 * Keeps letters and digits from any script, turns every other run of characters
 * into a single hyphen, and trims. Diacritics are folded ("José" → "Jose") so the
 * name is safe on every filesystem and in every ATS upload field.
 */
export function sanitizeFilenamePart(value: string): string {
  return (value || '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function formatFilenameDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** The base name without extension, e.g. "Jayraj-Makhar-com-Stripe-2026-10-04". */
export function buildResumeBasename(parts: ResumeFilenameParts): string {
  const first = sanitizeFilenamePart(parts.firstName) || 'First';
  const last = sanitizeFilenamePart(parts.lastName) || 'Last';
  const company = sanitizeFilenamePart(parts.company || '') || 'Resume';
  const date = formatFilenameDate(parts.date ?? new Date());
  return `${first}-${last}-com-${company}-${date}`;
}

export function buildResumeFilename(parts: ResumeFilenameParts): string {
  const ext = (parts.ext || 'pdf').replace(/^\./, '');
  return `${buildResumeBasename(parts)}.${ext}`;
}
