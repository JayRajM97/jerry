import React, { useState } from 'react';
import { Link, AlertCircle, CheckCircle2 } from 'lucide-react';

interface Props {
  jdText: string;
  onJdChange: (text: string) => void;
  fetchStatus: 'idle' | 'fetching' | 'success' | 'error' | 'fallback';
  onFetchUrl: (url: string) => void;
  detectedCompany?: string;
  detectedJobTitle?: string;
}

const JobUrlInput: React.FC<Props> = ({
  jdText,
  onJdChange,
  fetchStatus,
  onFetchUrl,
  detectedCompany,
  detectedJobTitle,
}) => {
  const [url, setUrl] = useState('');
  const [inputMode, setInputMode] = useState<'url' | 'paste'>('url');

  const handleFetch = () => {
    if (!url.trim()) return;
    onFetchUrl(url.trim());
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleFetch();
  };

  return (
    <div className="flex flex-col h-full">
      {/* Mode Toggle */}
      <div className="p-4 border-b border-gray-100 dark:border-[#333333] flex items-center justify-between shrink-0">
        <h2 className="text-lg font-bold tracking-tight dark:text-white">Job Description</h2>
        <div className="flex bg-gray-100 dark:bg-[#141414] p-1">
          <button
            onClick={() => setInputMode('url')}
            className={`px-4 py-1 text-[10px] font-bold tracking-widest ${inputMode === 'url' ? 'bg-white dark:bg-[#333333] text-black dark:text-white shadow-sm' : 'text-gray-400 dark:text-gray-500'}`}
          >
            URL
          </button>
          <button
            onClick={() => setInputMode('paste')}
            className={`px-4 py-1 text-[10px] font-bold tracking-widest ${inputMode === 'paste' ? 'bg-white dark:bg-[#333333] text-black dark:text-white shadow-sm' : 'text-gray-400 dark:text-gray-500'}`}
          >
            PASTE
          </button>
        </div>
      </div>

      {inputMode === 'url' ? (
        <div className="flex flex-col flex-1 p-4 gap-4">
          {/* URL Input Row */}
          <div className="flex gap-2">
            <div className="flex-1 flex items-center gap-2 border border-gray-200 dark:border-[#333333] px-3 bg-white dark:bg-[#0A0A0A]">
              <Link size={14} className="text-gray-400 shrink-0" />
              <input
                type="url"
                value={url}
                onChange={e => setUrl(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="https://jobs.lever.co/... or any job URL"
                className="flex-1 py-3 text-sm bg-transparent outline-none dark:text-white placeholder-gray-400"
              />
            </div>
            <button
              onClick={handleFetch}
              disabled={fetchStatus === 'fetching' || !url.trim()}
              className="uber-button-primary px-6 text-[10px] font-bold uppercase tracking-widest disabled:opacity-60 whitespace-nowrap"
            >
              {fetchStatus === 'fetching' ? (
                <div className="flex items-center gap-2">
                  <div className="uber-loader" />
                  Fetching...
                </div>
              ) : 'Fetch JD'}
            </button>
          </div>

          {/* Status Messages */}
          {fetchStatus === 'success' && (
            <div className="flex items-start gap-2 bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-900 p-3 rounded">
              <CheckCircle2 size={14} className="text-green-600 dark:text-green-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-bold text-green-700 dark:text-green-400">Job description fetched successfully</p>
                {(detectedCompany || detectedJobTitle) && (
                  <p className="text-xs text-green-600 dark:text-green-500 mt-0.5">
                    {detectedJobTitle && <span className="font-medium">{detectedJobTitle}</span>}
                    {detectedJobTitle && detectedCompany && ' at '}
                    {detectedCompany && <span className="font-medium">{detectedCompany}</span>}
                  </p>
                )}
              </div>
            </div>
          )}

          {(fetchStatus === 'error' || fetchStatus === 'fallback') && (
            <div className="flex items-start gap-2 bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-900 p-3 rounded">
              <AlertCircle size={14} className="text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-bold text-red-700 dark:text-red-400">Could not fetch from URL</p>
                <p className="text-xs text-red-600 dark:text-red-500 mt-0.5">
                  The site may block automated access. Switch to Paste mode and copy the JD manually.
                </p>
              </div>
            </div>
          )}

          {/* JD Preview after successful fetch */}
          {fetchStatus === 'success' && jdText && (
            <div className="flex-1 overflow-auto">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Fetched Content Preview</p>
              <div className="bg-gray-50 dark:bg-[#0A0A0A] p-4 text-sm text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-wrap font-mono overflow-auto max-h-64 border border-gray-200 dark:border-[#333333]">
                {jdText.slice(0, 1200)}{jdText.length > 1200 ? '...' : ''}
              </div>
            </div>
          )}

          {fetchStatus === 'idle' && (
            <div className="flex-1 flex flex-col items-center justify-center text-center text-gray-400 dark:text-gray-600">
              <Link size={32} className="mb-4 opacity-30" />
              <p className="text-sm font-medium mb-1">Drop a job link</p>
              <p className="text-xs">Paste any job posting URL — Greenhouse, Lever, LinkedIn, Wellfound, etc.</p>
            </div>
          )}
        </div>
      ) : (
        <textarea
          className="flex-1 w-full uber-input resize-none text-sm leading-relaxed bg-white dark:bg-[#141414] dark:text-white border-0 focus:ring-0 p-4 font-mono"
          value={jdText}
          onChange={e => onJdChange(e.target.value)}
          placeholder="Paste the target JD here..."
        />
      )}
    </div>
  );
};

export default JobUrlInput;
