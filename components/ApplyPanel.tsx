import React, { useState } from 'react';
import {
  ExternalLink, Copy, Check, Terminal, Upload,
  Linkedin, Mail, FileText, ChevronDown, ChevronUp,
  ClipboardCopy, CheckSquare, Square, Sparkles, ChevronRight
} from 'lucide-react';
import { OutreachOption } from '../types';
import { AutofillData, generateAutofillScript, Platform, PLATFORM_LABELS, detectPlatform } from '../utils/autofillScript';
import SmartQA from './SmartQA';

interface Props {
  jobUrl?: string;
  detectedCompany?: string;
  detectedJobTitle?: string;
  autofillData: AutofillData;
  chosenOutreach: OutreachOption | null;
  onDownloadPDF: () => void;
  onDownloadDOCX: () => void;
  jdText?: string;
  companyType?: 'consumer' | 'enterprise' | 'ai_startup';
  parsedCv?: any;
}

function CopyBtn({ text, label, mono = false }: { text: string; label: string; mono?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
      className={`flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest border border-gray-200 dark:border-[#333333] hover:border-black dark:hover:border-white transition-colors rounded ${mono ? 'font-mono' : ''}`}
    >
      {copied ? <Check size={12} className="text-green-500" /> : <Copy size={12} />}
      {copied ? 'Copied!' : label}
    </button>
  );
}

function StepHeader({ num, title, subtitle, done }: { num: number; title: string; subtitle?: string; done?: boolean }) {
  return (
    <div className="flex items-start gap-4 mb-6">
      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${done ? 'bg-green-500 text-white' : 'bg-black dark:bg-white text-white dark:text-black'}`}>
        {done ? <Check size={14} /> : num}
      </div>
      <div>
        <h3 className="font-bold text-base">{title}</h3>
        {subtitle && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{subtitle}</p>}
      </div>
    </div>
  );
}

const PLATFORM_TIPS: Partial<Record<Platform, string>> = {
  linkedin: 'Click "Easy Apply" on the job posting — the sidebar modal will open. Run the script while the modal is visible.',
  workday: 'Workday wraps forms in iframes. If fields don\'t fill, the form may be cross-origin — use the field-by-field backup below instead.',
  greenhouse: 'Confirm you\'re on a boards.greenhouse.io page. The script uses Greenhouse\'s standard field IDs.',
  lever: 'Confirm you\'re on a jobs.lever.co page. Full Name is filled as a single field.',
  ashby: 'Confirm you\'re on an ashbyhq.com page. Uses data-testid selectors.',
  keka: 'Confirm you\'re on a keka.com careers page.',
};

const CHECKLIST_ITEMS = [
  { id: 'opened', label: 'Opened application page' },
  { id: 'autofilled', label: 'Ran autofill script' },
  { id: 'reviewed', label: 'Reviewed all form fields' },
  { id: 'resume', label: 'Uploaded optimized resume' },
  { id: 'submitted', label: 'Submitted application' },
  { id: 'outreach', label: 'Sent LinkedIn / email outreach' },
];

const ApplyPanel: React.FC<Props> = ({
  jobUrl,
  detectedCompany,
  detectedJobTitle,
  autofillData,
  chosenOutreach,
  onDownloadPDF,
  onDownloadDOCX,
  jdText = '',
  companyType = 'ai_startup',
  parsedCv,
}) => {
  const [scriptExpanded, setScriptExpanded] = useState(false);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [scriptCopied, setScriptCopied] = useState(false);
  const [qaExpanded, setQaExpanded] = useState(false);

  const autoDetected = detectPlatform(jobUrl || '');
  const [manualPlatform, setManualPlatform] = useState<Platform>('auto');
  const effectivePlatform: Platform = manualPlatform === 'auto' ? (autoDetected === 'generic' ? 'generic' : autoDetected) : manualPlatform;

  const script = generateAutofillScript(autofillData, effectivePlatform);

  const toggleCheck = (id: string) => setChecked(p => ({ ...p, [id]: !p[id] }));

  const copyScript = () => {
    navigator.clipboard.writeText(script);
    setScriptCopied(true);
    setTimeout(() => setScriptCopied(false), 3000);
  };

  const mailtoLink = chosenOutreach
    ? `mailto:?subject=${encodeURIComponent(chosenOutreach.emailSubject)}&body=${encodeURIComponent(chosenOutreach.emailBody)}`
    : '';

  const filledCount = Object.values(checked).filter(Boolean).length;

  return (
    <div className="p-8 md:p-12 max-w-4xl mx-auto w-full space-y-8">

      {/* Progress bar */}
      <div>
        <div className="flex justify-between items-center mb-2">
          <h2 className="text-2xl font-bold">Apply</h2>
          <span className="text-sm font-bold text-gray-400">{filledCount}/{CHECKLIST_ITEMS.length} steps done</span>
        </div>
        <div className="h-1.5 bg-gray-100 dark:bg-[#333333] rounded-full overflow-hidden">
          <div
            className="h-full bg-black dark:bg-white rounded-full transition-all"
            style={{ width: `${(filledCount / CHECKLIST_ITEMS.length) * 100}%` }}
          />
        </div>
      </div>

      {/* ── Step 1: Open Application ── */}
      <div className="uber-card p-8">
        <StepHeader num={1} title="Open Application Page" subtitle="Navigate to the job posting to start filling the form" done={checked.opened} />
        <div className="flex flex-col sm:flex-row gap-3">
          {jobUrl ? (
            <>
              <a
                href={jobUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 uber-button-primary text-[10px] font-bold uppercase tracking-widest px-6 py-3"
              >
                <ExternalLink size={14} />
                Open {detectedCompany ? `${detectedCompany} ` : ''}Application
              </a>
              <CopyBtn text={jobUrl} label="Copy URL" />
            </>
          ) : (
            <div className="bg-gray-50 dark:bg-[#0A0A0A] border border-dashed border-gray-300 dark:border-[#333333] p-4 rounded text-sm text-gray-500 dark:text-gray-400">
              No URL detected — navigate to the job application page manually.
            </div>
          )}
        </div>
        <button onClick={() => toggleCheck('opened')} className="mt-4 flex items-center gap-2 text-xs font-bold text-gray-400 hover:text-black dark:hover:text-white transition-colors">
          {checked.opened ? <CheckSquare size={14} className="text-green-500" /> : <Square size={14} />}
          Mark as done
        </button>
      </div>

      {/* ── Step 2: Autofill Script ── */}
      <div className="uber-card p-8">
        <StepHeader
          num={2}
          title="Auto-fill the Form"
          subtitle="Paste the script into DevTools Console on the application page — it fills name, email, phone, LinkedIn, cover letter & more"
          done={checked.autofilled}
        />

        {/* Platform Picker */}
        <div className="mb-5 flex items-center gap-3">
          <label className="text-[10px] font-bold uppercase tracking-widest text-gray-400 shrink-0">Platform</label>
          <select
            value={manualPlatform}
            onChange={e => setManualPlatform(e.target.value as Platform)}
            className="uber-input text-sm py-2 px-3 bg-white dark:bg-[#0A0A0A] dark:text-white flex-1 max-w-xs"
          >
            {(Object.keys(PLATFORM_LABELS) as Platform[]).map(p => (
              <option key={p} value={p}>
                {p === 'auto'
                  ? `Auto-detect${autoDetected !== 'generic' ? ` (${PLATFORM_LABELS[autoDetected]})` : ''}`
                  : PLATFORM_LABELS[p]}
              </option>
            ))}
          </select>
          {effectivePlatform !== 'generic' && effectivePlatform !== 'auto' && (
            <span className="text-[10px] font-bold text-green-600 dark:text-green-400 uppercase tracking-widest">{PLATFORM_LABELS[effectivePlatform]} selectors active</span>
          )}
        </div>

        {/* Platform tip */}
        {PLATFORM_TIPS[effectivePlatform] && (
          <div className="mb-5 bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-900 rounded p-3">
            <p className="text-xs text-blue-700 dark:text-blue-300">{PLATFORM_TIPS[effectivePlatform]}</p>
          </div>
        )}

        {/* Instructions */}
        <div className="bg-gray-50 dark:bg-[#0A0A0A] border border-gray-200 dark:border-[#222] rounded p-5 mb-5 space-y-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">How to use</p>
          <ol className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
            <li className="flex items-start gap-3"><span className="bg-black dark:bg-white text-white dark:text-black w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">1</span>Click <strong>Copy Script</strong> below</li>
            <li className="flex items-start gap-3"><span className="bg-black dark:bg-white text-white dark:text-black w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">2</span>Go to the application page and open <strong>DevTools</strong> (press <kbd className="bg-gray-200 dark:bg-[#333] px-1.5 py-0.5 rounded text-xs font-mono">F12</kbd> or <kbd className="bg-gray-200 dark:bg-[#333] px-1.5 py-0.5 rounded text-xs font-mono">Cmd+Option+J</kbd>)</li>
            <li className="flex items-start gap-3"><span className="bg-black dark:bg-white text-white dark:text-black w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">3</span>Click the <strong>Console</strong> tab</li>
            <li className="flex items-start gap-3"><span className="bg-black dark:bg-white text-white dark:text-black w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">4</span>Paste and press <kbd className="bg-gray-200 dark:bg-[#333] px-1.5 py-0.5 rounded text-xs font-mono">Enter</kbd></li>
            <li className="flex items-start gap-3"><span className="bg-black dark:bg-white text-white dark:text-black w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">5</span>Review filled fields — <strong>do not submit without checking</strong></li>
          </ol>
        </div>

        {/* What will be filled */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-5">
          {[
            { label: 'First Name', value: autofillData.firstName },
            { label: 'Last Name', value: autofillData.lastName },
            { label: 'Email', value: autofillData.email },
            { label: 'Phone', value: autofillData.phone },
            { label: 'LinkedIn', value: autofillData.linkedin },
            { label: 'Location', value: autofillData.location },
            { label: 'Cover Letter', value: autofillData.coverLetter ? '✓ included' : '—' },
            { label: 'Why Company', value: autofillData.whyCompany ? '✓ included' : '—' },
            { label: 'Portfolio', value: autofillData.portfolio || '—' },
          ].map(({ label, value }) => (
            <div key={label} className="bg-gray-50 dark:bg-[#0A0A0A] p-3 rounded">
              <p className="text-[9px] font-bold uppercase tracking-widest text-gray-400 mb-0.5">{label}</p>
              <p className="text-xs text-gray-700 dark:text-gray-300 truncate font-medium">{value || '—'}</p>
            </div>
          ))}
        </div>

        {/* Copy button */}
        <div className="flex gap-3 mb-4">
          <button
            onClick={copyScript}
            className="flex items-center gap-2 uber-button-primary text-[10px] font-bold uppercase tracking-widest px-6 py-3"
          >
            {scriptCopied ? <Check size={14} className="text-green-400" /> : <ClipboardCopy size={14} />}
            {scriptCopied ? 'Script Copied!' : 'Copy Autofill Script'}
          </button>
          <button
            onClick={() => setScriptExpanded(e => !e)}
            className="flex items-center gap-1.5 px-4 py-3 text-[10px] font-bold uppercase tracking-widest border border-gray-200 dark:border-[#333333] hover:border-black dark:hover:border-white transition-colors"
          >
            <Terminal size={12} />
            {scriptExpanded ? 'Hide' : 'Preview'} Script
            {scriptExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
        </div>

        {/* Script preview */}
        {scriptExpanded && (
          <div className="relative bg-[#0D0D0D] text-green-400 font-mono text-[11px] p-5 rounded overflow-auto max-h-72 leading-relaxed">
            <pre className="whitespace-pre-wrap">{script}</pre>
          </div>
        )}

        <button onClick={() => toggleCheck('autofilled')} className="mt-4 flex items-center gap-2 text-xs font-bold text-gray-400 hover:text-black dark:hover:text-white transition-colors">
          {checked.autofilled ? <CheckSquare size={14} className="text-green-500" /> : <Square size={14} />}
          Mark as done
        </button>
      </div>

      {/* ── Step 2.5: Smart Q&A ── */}
      <div className="uber-card p-8">
        <button
          onClick={() => setQaExpanded(e => !e)}
          className="w-full flex items-start justify-between text-left"
        >
          <div className="flex items-start gap-4">
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0 bg-black dark:bg-white text-white dark:text-black">
              <Sparkles size={14} />
            </div>
            <div>
              <h3 className="font-bold text-base">Custom Question Answers</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Paste any application question — get short + medium answers in Jay's voice</p>
            </div>
          </div>
          {qaExpanded ? <ChevronUp size={16} className="shrink-0 mt-1 text-gray-400" /> : <ChevronRight size={16} className="shrink-0 mt-1 text-gray-400" />}
        </button>

        {qaExpanded && (
          <div className="mt-6">
            <SmartQA jdText={jdText} companyType={companyType} parsedCv={parsedCv} />
          </div>
        )}
      </div>

      {/* ── Step 3: Upload Resume ── */}
      <div className="uber-card p-8">
        <StepHeader num={3} title="Upload Your Resume" subtitle="Download the optimized version and upload it to the application form" done={checked.resume} />
        <div className="flex gap-3">
          <button
            onClick={onDownloadDOCX}
            className="flex items-center gap-2 uber-button-secondary text-[10px] font-bold uppercase tracking-widest px-5 py-3"
          >
            <FileText size={14} />
            Download DOCX
          </button>
          <button
            onClick={onDownloadPDF}
            className="flex items-center gap-2 uber-button-primary text-[10px] font-bold uppercase tracking-widest px-5 py-3"
          >
            <Upload size={14} />
            Download PDF
          </button>
        </div>
        <button onClick={() => toggleCheck('resume')} className="mt-4 flex items-center gap-2 text-xs font-bold text-gray-400 hover:text-black dark:hover:text-white transition-colors">
          {checked.resume ? <CheckSquare size={14} className="text-green-500" /> : <Square size={14} />}
          Mark as done
        </button>
      </div>

      {/* ── Step 4: Manual field fallbacks ── */}
      <div className="uber-card p-8">
        <StepHeader num={4} title="Field-by-Field Backup" subtitle="If autofill missed anything, copy individual values here" done={checked.reviewed} />
        <div className="space-y-3">
          {[
            { label: 'First Name', value: autofillData.firstName },
            { label: 'Last Name', value: autofillData.lastName },
            { label: 'Email', value: autofillData.email },
            { label: 'Phone', value: autofillData.phone },
            { label: 'LinkedIn URL', value: autofillData.linkedin },
            { label: 'Location', value: autofillData.location },
            { label: 'Portfolio / Website', value: autofillData.portfolio },
          ].filter(f => f.value).map(({ label, value }) => (
            <div key={label} className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-[#0A0A0A] rounded">
              <div className="flex-1 min-w-0">
                <p className="text-[9px] font-bold uppercase tracking-widest text-gray-400 mb-0.5">{label}</p>
                <p className="text-sm text-gray-800 dark:text-gray-200 truncate">{value}</p>
              </div>
              <CopyBtn text={value} label="Copy" />
            </div>
          ))}

          {autofillData.coverLetter && (
            <div className="p-4 bg-gray-50 dark:bg-[#0A0A0A] rounded space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-[9px] font-bold uppercase tracking-widest text-gray-400">Cover Letter</p>
                <CopyBtn text={autofillData.coverLetter} label="Copy" />
              </div>
              <p className="text-sm text-gray-700 dark:text-gray-300 line-clamp-3 leading-relaxed">{autofillData.coverLetter}</p>
            </div>
          )}
        </div>
        <button onClick={() => toggleCheck('reviewed')} className="mt-4 flex items-center gap-2 text-xs font-bold text-gray-400 hover:text-black dark:hover:text-white transition-colors">
          {checked.reviewed ? <CheckSquare size={14} className="text-green-500" /> : <Square size={14} />}
          Mark as done
        </button>
      </div>

      {/* ── Step 5: Submit + Outreach ── */}
      <div className="uber-card p-8">
        <StepHeader num={5} title="Submit & Follow Up" subtitle="Submit the form, then send your outreach message while it's fresh" done={checked.submitted && checked.outreach} />

        <div className="space-y-4">
          <button onClick={() => toggleCheck('submitted')} className="flex items-center gap-2 text-sm font-bold text-gray-700 dark:text-gray-300 hover:text-black dark:hover:text-white transition-colors">
            {checked.submitted ? <CheckSquare size={16} className="text-green-500" /> : <Square size={16} />}
            I've submitted the application
          </button>

          {chosenOutreach && (
            <div className="border border-gray-200 dark:border-[#333333] rounded p-5 space-y-4">
              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Your Outreach — {chosenOutreach.label}</p>

              <div className="space-y-2">
                <p className="text-[9px] font-bold uppercase tracking-widest text-gray-500">LinkedIn Message ({chosenOutreach.linkedInMessage.length}/400)</p>
                <div className="bg-gray-50 dark:bg-[#0A0A0A] p-3 rounded text-sm leading-relaxed whitespace-pre-wrap text-gray-800 dark:text-gray-200">
                  {chosenOutreach.linkedInMessage}
                </div>
                <div className="flex gap-2">
                  <CopyBtn text={chosenOutreach.linkedInMessage} label="Copy LinkedIn" />
                  <a href="https://www.linkedin.com/jobs/" target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest border border-gray-200 dark:border-[#333333] hover:border-black dark:hover:border-white transition-colors rounded">
                    <Linkedin size={12} className="text-blue-600" /> Open LinkedIn
                  </a>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-[9px] font-bold uppercase tracking-widest text-gray-500">Email</p>
                <div className="bg-gray-50 dark:bg-[#0A0A0A] p-3 rounded space-y-2 text-sm">
                  <p><span className="font-bold text-gray-500">Subject:</span> {chosenOutreach.emailSubject}</p>
                  <p className="whitespace-pre-wrap leading-relaxed text-gray-700 dark:text-gray-300">{chosenOutreach.emailBody}</p>
                </div>
                <div className="flex gap-2">
                  <CopyBtn text={`${chosenOutreach.emailSubject}\n\n${chosenOutreach.emailBody}`} label="Copy Email" />
                  <a href={mailtoLink}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest border border-gray-200 dark:border-[#333333] hover:border-black dark:hover:border-white transition-colors rounded">
                    <Mail size={12} /> Open in Email Client
                  </a>
                </div>
              </div>
            </div>
          )}

          <button onClick={() => toggleCheck('outreach')} className="flex items-center gap-2 text-sm font-bold text-gray-700 dark:text-gray-300 hover:text-black dark:hover:text-white transition-colors">
            {checked.outreach ? <CheckSquare size={16} className="text-green-500" /> : <Square size={16} />}
            Outreach sent
          </button>
        </div>
      </div>

      {/* Done state */}
      {filledCount === CHECKLIST_ITEMS.length && (
        <div className="uber-card p-8 border-2 border-green-500 text-center">
          <p className="text-2xl font-bold mb-2">Application Complete</p>
          <p className="text-gray-500 dark:text-gray-400 text-sm">
            {detectedJobTitle && detectedCompany
              ? `${detectedJobTitle} at ${detectedCompany} — good luck!`
              : 'Good luck!'}
          </p>
        </div>
      )}
    </div>
  );
};

export default ApplyPanel;
