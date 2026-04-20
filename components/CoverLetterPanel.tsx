import React, { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import RichEditor from './RichEditor';

interface Props {
  html: string;
  isLoading: boolean;
  onChange: (html: string) => void;
}

const CoverLetterPanel: React.FC<Props> = ({ html, isLoading, onChange }) => {
  const [copied, setCopied] = useState(false);

  const copyAsText = () => {
    const div = document.createElement('div');
    div.innerHTML = html;
    const text = div.textContent || div.innerText || '';
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const charCount = html.replace(/<[^>]+>/g, '').length;

  return (
    <div id="sec-cover-letter" className="scroll-mt-8 uber-card overflow-hidden">
      <div className="bg-black dark:bg-[#1A1A1A] text-white px-8 py-4 flex items-center justify-between">
        <h4 className="font-bold uppercase tracking-widest text-[10px]">Cover Letter</h4>
        <div className="flex items-center gap-4">
          <span className="text-[10px] text-gray-500">{charCount} chars</span>
          {!isLoading && html && (
            <button
              onClick={copyAsText}
              className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest bg-white dark:bg-[#333333] text-black dark:text-white hover:opacity-80 transition-opacity rounded"
            >
              {copied ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
              {copied ? 'Copied' : 'Copy Plain Text'}
            </button>
          )}
        </div>
      </div>

      <div className="bg-gray-50 dark:bg-[#0A0A0A]" style={{ minHeight: 300 }}>
        {isLoading ? (
          <div className="flex items-center justify-center h-48 gap-3">
            <div className="uber-loader border-gray-200 border-t-black dark:border-t-white" />
            <span className="text-sm text-gray-500 dark:text-gray-400">Writing your cover letter...</span>
          </div>
        ) : html ? (
          <RichEditor
            content={html}
            onChange={onChange}
            className="min-h-[300px]"
            viewMode="fluid"
          />
        ) : (
          <div className="flex items-center justify-center h-48">
            <p className="text-sm text-gray-400 dark:text-gray-600 italic">Cover letter will appear here.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default CoverLetterPanel;
