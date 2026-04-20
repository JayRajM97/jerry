import React, { useState, useRef, useEffect } from 'react';
import { ApplicationStatus } from '../types';

const STATUS_CONFIG: Record<ApplicationStatus, { label: string; color: string; dot: string }> = {
  saved:     { label: 'Saved',     color: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',      dot: 'bg-gray-400' },
  applied:   { label: 'Applied',   color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400',   dot: 'bg-blue-500' },
  interview: { label: 'Interview', color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400', dot: 'bg-yellow-500' },
  rejected:  { label: 'Rejected',  color: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400',       dot: 'bg-red-500' },
  offer:     { label: 'Offer',     color: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400', dot: 'bg-green-500' },
};

const ALL_STATUSES: ApplicationStatus[] = ['saved', 'applied', 'interview', 'rejected', 'offer'];

interface Props {
  status: ApplicationStatus;
  onChange: (status: ApplicationStatus) => void;
}

const ApplicationStatusBadge: React.FC<Props> = ({ status, onChange }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.saved;

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} className="relative inline-block" onClick={e => e.stopPropagation()}>
      <button
        onClick={() => setOpen(o => !o)}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest ${cfg.color} cursor-pointer hover:opacity-80 transition-opacity`}
      >
        <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
        {cfg.label}
      </button>

      {open && (
        <div className="absolute bottom-full mb-1 left-0 w-36 bg-white dark:bg-[#1F1F1F] border border-gray-200 dark:border-[#333333] shadow-xl rounded z-50 overflow-hidden">
          {ALL_STATUSES.map(s => {
            const c = STATUS_CONFIG[s];
            return (
              <button
                key={s}
                onClick={() => { onChange(s); setOpen(false); }}
                className={`w-full flex items-center gap-2 px-3 py-2 text-[10px] font-bold uppercase tracking-widest hover:bg-gray-50 dark:hover:bg-[#2A2A2A] transition-colors ${s === status ? 'opacity-100' : 'opacity-60'}`}
              >
                <span className={`w-2 h-2 rounded-full ${c.dot}`} />
                {c.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ApplicationStatusBadge;
