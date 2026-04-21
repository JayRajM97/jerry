import React, { useState } from 'react';
import { Sparkles, Copy, Check, ChevronDown, ChevronUp } from 'lucide-react';
import { generateApplicationAnswer } from '../services/geminiService';

interface Props {
  jdText: string;
  companyType: 'consumer' | 'enterprise' | 'ai_startup';
  parsedCv: any;
}

interface Answer {
  question: string;
  short: string;
  medium: string;
}

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
      className="flex items-center gap-1 px-2 py-1 text-[9px] font-bold uppercase tracking-widest border border-gray-200 dark:border-[#333333] hover:border-black dark:hover:border-white transition-colors rounded"
    >
      {copied ? <Check size={10} className="text-green-500" /> : <Copy size={10} />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

const SmartQA: React.FC<Props> = ({ jdText, companyType, parsedCv }) => {
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  const handleGetAnswer = async () => {
    if (!question.trim() || loading) return;
    setLoading(true);
    try {
      const result = await generateApplicationAnswer(question.trim(), jdText, companyType, parsedCv);
      const newAnswer: Answer = { question: question.trim(), short: result.short, medium: result.medium };
      setAnswers(prev => [newAnswer, ...prev]);
      setExpandedIdx(0);
      setQuestion('');
    } catch (err) {
      console.error('SmartQA error', err);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleGetAnswer();
  };

  return (
    <div className="space-y-4">
      {/* Input */}
      <div className="space-y-2">
        <textarea
          value={question}
          onChange={e => setQuestion(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Paste the application question here..."
          rows={3}
          className="w-full uber-input text-sm leading-relaxed resize-none bg-white dark:bg-[#0A0A0A] dark:text-white p-3 font-mono"
        />
        <div className="flex items-center justify-between">
          <p className="text-[10px] text-gray-400">
            {companyType === 'consumer' ? 'Consumer lens' : companyType === 'enterprise' ? 'Enterprise lens' : 'AI/Startup lens'} · Cmd+Enter to submit
          </p>
          <button
            onClick={handleGetAnswer}
            disabled={!question.trim() || loading || !jdText}
            className="flex items-center gap-2 uber-button-primary px-5 py-2 text-[10px] font-bold uppercase tracking-widest disabled:opacity-50"
          >
            {loading ? (
              <>
                <div className="uber-loader" />
                Thinking...
              </>
            ) : (
              <>
                <Sparkles size={12} />
                Get Answer
              </>
            )}
          </button>
        </div>
        {!jdText && (
          <p className="text-[10px] text-amber-600 dark:text-amber-400">Add a job description first to get tailored answers.</p>
        )}
      </div>

      {/* Answers */}
      {answers.map((ans, idx) => (
        <div key={idx} className="border border-gray-200 dark:border-[#333333] rounded overflow-hidden">
          <button
            onClick={() => setExpandedIdx(expandedIdx === idx ? null : idx)}
            className="w-full flex items-start justify-between p-4 text-left hover:bg-gray-50 dark:hover:bg-[#1a1a1a] transition-colors"
          >
            <p className="text-sm font-medium text-gray-800 dark:text-gray-200 pr-4 line-clamp-2">{ans.question}</p>
            {expandedIdx === idx ? <ChevronUp size={14} className="shrink-0 mt-0.5 text-gray-400" /> : <ChevronDown size={14} className="shrink-0 mt-0.5 text-gray-400" />}
          </button>

          {expandedIdx === idx && (
            <div className="border-t border-gray-100 dark:border-[#222] divide-y divide-gray-100 dark:divide-[#222]">
              {/* Short */}
              <div className="p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-[9px] font-bold uppercase tracking-widest text-gray-400">Short — 2-4 bullets (character-limited fields)</p>
                  <CopyBtn text={ans.short} />
                </div>
                <div className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-wrap bg-gray-50 dark:bg-[#0A0A0A] p-3 rounded font-mono text-[12px]">
                  {ans.short}
                </div>
              </div>

              {/* Medium */}
              <div className="p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-[9px] font-bold uppercase tracking-widest text-gray-400">Medium — 5-7 bullets (open text fields)</p>
                  <CopyBtn text={ans.medium} />
                </div>
                <div className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-wrap bg-gray-50 dark:bg-[#0A0A0A] p-3 rounded font-mono text-[12px]">
                  {ans.medium}
                </div>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

export default SmartQA;
