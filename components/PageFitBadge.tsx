import React from 'react';
import type { PageFit } from '../utils/pageFit';
import { describePageFit } from '../utils/pageFit';

interface Props {
  fit: PageFit | null;
  className?: string;
}

/**
 * Live one-page indicator. Green: fits as-is. Amber: fits after shrinking the
 * scale (the PDF will be shrunk the same amount). Red: does not fit even at the
 * minimum size, with a line estimate so the user knows how much to cut.
 */
const PageFitBadge: React.FC<Props> = ({ fit, className = '' }) => {
  const { label, tone } = describePageFit(fit);
  const tones = {
    ok: 'bg-green-50 text-green-800 border-green-200 dark:bg-green-900/20 dark:text-green-300 dark:border-green-800',
    warn: 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-800',
    bad: 'bg-red-50 text-red-800 border-red-200 dark:bg-red-900/20 dark:text-red-300 dark:border-red-800',
  } as const;
  const dot = { ok: 'bg-green-500', warn: 'bg-amber-500', bad: 'bg-red-500' } as const;

  return (
    <div
      className={`inline-flex items-center gap-2 border px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest ${tones[tone]} ${className}`}
      title="Measured with the same layout the PDF uses"
    >
      <span className={`inline-block w-2 h-2 rounded-full ${dot[tone]}`} />
      <span>{label}</span>
    </div>
  );
};

export default PageFitBadge;
