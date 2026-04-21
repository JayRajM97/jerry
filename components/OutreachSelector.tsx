import React, { useState } from 'react';
import { Copy, Check, Mail, Linkedin } from 'lucide-react';
import { OutreachOption } from '../types';

interface Props {
  options: OutreachOption[];
  chosenId: OutreachOption['id'] | null;
  onChoose: (id: OutreachOption['id']) => void;
  onGenerateCoverLetter: () => void;
  isCoverLetterLoading: boolean;
  coverLetterReady: boolean;
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button
      onClick={handleCopy}
      className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest border border-gray-200 dark:border-[#333333] hover:border-black dark:hover:border-white transition-colors rounded"
    >
      {copied ? <Check size={12} className="text-green-500" /> : <Copy size={12} />}
      {copied ? 'Copied' : label}
    </button>
  );
}

const OPTION_COLORS: Record<OutreachOption['id'], string> = {
  direct:      'border-gray-300 dark:border-gray-600',
  insight:     'border-blue-400 dark:border-blue-500',
  value_first: 'border-purple-400 dark:border-purple-500',
};

const OPTION_ACCENT: Record<OutreachOption['id'], string> = {
  direct:      'bg-gray-900 dark:bg-gray-100 text-white dark:text-black',
  insight:     'bg-blue-600 text-white',
  value_first: 'bg-purple-600 text-white',
};

const OutreachSelector: React.FC<Props> = ({
  options,
  chosenId,
  onChoose,
  onGenerateCoverLetter,
  isCoverLetterLoading,
  coverLetterReady,
}) => {
  if (options.length === 0) return null;

  const chosen = options.find(o => o.id === chosenId);
  const mailtoLink = chosen
    ? `mailto:?subject=${encodeURIComponent(chosen.emailSubject)}&body=${encodeURIComponent(chosen.emailBody)}`
    : '';

  return (
    <div className="space-y-6">
      {/* Option Cards */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {options.map(opt => {
          const isChosen = opt.id === chosenId;
          return (
            <div
              key={opt.id}
              className={`uber-card overflow-hidden border-2 transition-all ${isChosen ? OPTION_COLORS[opt.id] + ' shadow-lg' : 'border-transparent'}`}
            >
              <div className={`px-6 py-4 ${isChosen ? OPTION_ACCENT[opt.id] : 'bg-gray-100 dark:bg-[#1F1F1F] text-gray-700 dark:text-gray-300'}`}>
                <p className="text-[10px] font-bold uppercase tracking-widest">{opt.label}</p>
              </div>
              <div className="p-6 flex flex-col gap-4">
                <p className="text-xs text-gray-500 dark:text-gray-400 italic">{opt.strategy}</p>
                <p className="text-sm leading-relaxed text-gray-800 dark:text-gray-200 line-clamp-4">
                  {opt.linkedInMessage}
                </p>
                <button
                  onClick={() => onChoose(opt.id)}
                  className={`w-full py-2.5 text-[10px] font-bold uppercase tracking-widest transition-all ${
                    isChosen
                      ? 'bg-black dark:bg-white text-white dark:text-black'
                      : 'bg-gray-100 dark:bg-[#2A2A2A] text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-[#333333]'
                  }`}
                >
                  {isChosen ? 'Selected' : 'Use This Approach'}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Expanded Detail Panel for chosen option */}
      {chosen && (
        <div className="uber-card overflow-hidden border border-gray-200 dark:border-[#333333]">
          <div className="bg-black dark:bg-[#1A1A1A] text-white px-8 py-4 flex items-center justify-between">
            <h4 className="font-bold uppercase tracking-widest text-[10px]">Your Outreach — {chosen.label}</h4>
            <div className="flex gap-2">
              <CopyButton text={chosen.linkedInMessage} label="Copy LinkedIn" />
              <a
                href={mailtoLink}
                className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest bg-white dark:bg-[#333333] text-black dark:text-white hover:opacity-80 transition-opacity rounded"
              >
                <Mail size={12} /> Open Email
              </a>
            </div>
          </div>

          <div className="p-8 grid grid-cols-1 xl:grid-cols-2 gap-8">
            {/* LinkedIn */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Linkedin size={14} className="text-blue-600" />
                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400">LinkedIn Message</p>
                <span className="text-[10px] text-gray-400 dark:text-gray-600 ml-auto">{chosen.linkedInMessage.length}/400</span>
              </div>
              <div className="bg-gray-50 dark:bg-[#0A0A0A] p-4 rounded text-sm leading-relaxed whitespace-pre-wrap text-gray-800 dark:text-gray-200">
                {chosen.linkedInMessage}
              </div>
              <CopyButton text={chosen.linkedInMessage} label="Copy" />
            </div>

            {/* Email */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Mail size={14} className="text-gray-500" />
                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400">Email Draft</p>
              </div>
              <div className="bg-gray-50 dark:bg-[#0A0A0A] p-4 rounded space-y-3">
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Subject</p>
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{chosen.emailSubject}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Body</p>
                  <p className="text-sm leading-relaxed text-gray-800 dark:text-gray-200 whitespace-pre-wrap">{chosen.emailBody}</p>
                </div>
              </div>
              <div className="flex gap-2">
                <CopyButton text={`${chosen.emailSubject}\n\n${chosen.emailBody}`} label="Copy All" />
                <a
                  href={mailtoLink}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest border border-gray-200 dark:border-[#333333] hover:border-black dark:hover:border-white transition-colors rounded"
                >
                  <Mail size={12} /> Open in Email Client
                </a>
              </div>
            </div>
          </div>

          {/* Cover Letter CTA */}
          <div className="px-8 pb-8">
            <div className="border-t border-gray-100 dark:border-[#333333] pt-6 flex items-center gap-4">
              <button
                onClick={onGenerateCoverLetter}
                disabled={isCoverLetterLoading || coverLetterReady}
                className="uber-button-primary text-[10px] font-bold uppercase tracking-widest px-6 py-3 disabled:opacity-60"
              >
                {isCoverLetterLoading ? 'Writing Cover Letter...' : coverLetterReady ? 'Cover Letter Ready ↓' : 'Generate Cover Letter'}
              </button>
              <p className="text-xs text-gray-400 dark:text-gray-600">Tailored to your chosen outreach strategy</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OutreachSelector;
