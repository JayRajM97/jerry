import React, { useMemo, useState } from 'react';
import { Sparkles, AlertTriangle, CheckCircle2, Loader2, Circle, ExternalLink, XCircle, SkipForward } from 'lucide-react';
import type { ApplicationProfile, ApplyResult } from '../types';
import { fetchJobPreview, startApply } from '../services/applyService';

interface Props {
  profile: ApplicationProfile | null;
  cvHtml: string;
  jdText: string;
  submittedKeys: string[];
  onJobFetched: (jdText: string) => void;
  onResult: (result: ApplyResult) => void;
  onEditProfile: () => void;
}

const REQUIRED_PROFILE_FIELDS: (keyof ApplicationProfile)[] = ['firstName', 'lastName', 'email', 'phone'];

type StepKey = 'fetch' | 'plan' | 'render_resume' | 'navigate' | 'fill' | 'submit';
type StepStatus = 'pending' | 'running' | 'done' | 'skipped' | 'failed';

const STEPS: { key: StepKey; label: string }[] = [
  { key: 'fetch',         label: 'Fetch job + questions' },
  { key: 'plan',          label: 'Draft answers in your voice' },
  { key: 'render_resume', label: 'Prepare resume' },
  { key: 'navigate',      label: 'Open apply page' },
  { key: 'fill',          label: 'Fill fields' },
  { key: 'submit',        label: 'Submit application' },
];

const STEP_INDEX: Record<string, number> = Object.fromEntries(STEPS.map((s, i) => [s.key, i]));

const initialStatus = (): Record<StepKey, StepStatus> =>
  STEPS.reduce((a, s) => ({ ...a, [s.key]: 'pending' as StepStatus }), {} as Record<StepKey, StepStatus>);

const AutoApplyPanel: React.FC<Props> = ({
  profile, cvHtml, jdText, submittedKeys, onJobFetched, onResult, onEditProfile,
}) => {
  const [url, setUrl] = useState('');
  const [autoSubmit, setAutoSubmit] = useState(true);
  const [running, setRunning] = useState(false);
  const [stepStatus, setStepStatus] = useState<Record<StepKey, StepStatus>>(initialStatus);
  const [stepDetail, setStepDetail] = useState<Partial<Record<StepKey, string>>>({});
  const [result, setResult] = useState<ApplyResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const missingProfile = !profile || REQUIRED_PROFILE_FIELDS.some(f => !String(profile[f] || '').trim());

  const advanceTo = (key: StepKey, message?: string) => {
    setStepStatus(prev => {
      const next = { ...prev };
      const idx = STEP_INDEX[key];
      for (let i = 0; i < STEPS.length; i++) {
        if (i < idx && next[STEPS[i].key] === 'pending') next[STEPS[i].key] = 'done';
        if (i < idx && next[STEPS[i].key] === 'running') next[STEPS[i].key] = 'done';
      }
      if (next[key] === 'pending') next[key] = 'running';
      return next;
    });
    if (message) setStepDetail(prev => ({ ...prev, [key]: message }));
  };

  const reset = () => {
    setStepStatus(initialStatus());
    setStepDetail({});
    setResult(null);
    setError(null);
  };

  const handleApply = async () => {
    reset();
    if (!url.trim()) { setError('Paste a Greenhouse job URL.'); return; }
    if (missingProfile) { setError('Complete your Application Profile (name, email, phone) first.'); return; }

    setRunning(true);
    try {
      advanceTo('fetch');
      const preview = await fetchJobPreview(url);
      onJobFetched(preview.jdText);
      setStepDetail(prev => ({ ...prev, fetch: `${preview.jobTitle} @ ${preview.company} — ${preview.questionCount} questions` }));

      const key = `${preview.boardToken}/${preview.jobId}`;
      if (submittedKeys.includes(key)) {
        setError(`Already auto-applied to this posting (${key}).`);
        setRunning(false);
        return;
      }

      const res = await startApply(
        {
          url,
          cvHtml,
          profile: profile!,
          jdText: jdText || preview.jdText,
          autoSubmit,
          // Pass the on-disk resume PDF when the user has one — server uploads it directly.
          resumePath: profile!.resumePath?.trim() || undefined,
        },
        (p) => {
          if (p.type === 'progress' && p.step) {
            const raw = p.step;
            if (raw === 'dry_run') {
              setStepStatus(prev => ({ ...prev, fill: prev.fill === 'pending' ? 'pending' : 'done', submit: 'skipped' }));
              setStepDetail(prev => ({ ...prev, submit: 'Dry run — not submitting' }));
            } else if (raw in STEP_INDEX) {
              advanceTo(raw as StepKey, p.message);
            }
          }
        },
      );

      // Finalize step statuses based on result.
      setStepStatus(prev => {
        const next = { ...prev };
        if (res.status === 'submitted') {
          for (const s of STEPS) if (next[s.key] !== 'skipped') next[s.key] = 'done';
        } else if (res.status === 'dry_run') {
          for (const s of STEPS) {
            if (s.key === 'submit') next[s.key] = 'skipped';
            else if (next[s.key] !== 'skipped') next[s.key] = 'done';
          }
        } else {
          for (const k of Object.keys(next) as StepKey[]) if (next[k] === 'running') next[k] = 'failed';
        }
        return next;
      });

      setResult(res);
      onResult(res);
    } catch (e: any) {
      setError(e?.message || 'Auto-apply failed.');
      setStepStatus(prev => {
        const next = { ...prev };
        for (const k of Object.keys(next) as StepKey[]) if (next[k] === 'running') next[k] = 'failed';
        return next;
      });
    } finally {
      setRunning(false);
    }
  };

  const StatusIcon: React.FC<{ s: StepStatus }> = ({ s }) => {
    if (s === 'running') return <Loader2 size={16} className="text-blue-600 animate-spin" />;
    if (s === 'done')    return <CheckCircle2 size={16} className="text-green-600" />;
    if (s === 'skipped') return <SkipForward size={16} className="text-gray-400" />;
    if (s === 'failed')  return <XCircle size={16} className="text-red-600" />;
    return <Circle size={16} className="text-gray-300" />;
  };

  const statusBadge: Record<string, { label: string; color: string }> = {
    submitted: { label: 'Submitted', color: 'bg-green-100 text-green-700 border-green-200' },
    dry_run:   { label: 'Filled — not submitted (dry run)', color: 'bg-blue-100 text-blue-700 border-blue-200' },
    aborted:   { label: 'Aborted before submit', color: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
    error:     { label: 'Error', color: 'bg-red-100 text-red-700 border-red-200' },
  };

  const screenshotUrl = useMemo(
    () => result?.screenshot ? `data:image/png;base64,${result.screenshot}` : '',
    [result?.screenshot],
  );

  return (
    <div className="bg-white dark:bg-[#141414] border border-gray-200 dark:border-[#333333] shadow-sm flex flex-col min-h-0 max-h-[78vh]">
      {/* Header */}
      <div className="p-4 border-b border-gray-100 dark:border-[#333333] shrink-0">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Sparkles size={16} className="text-blue-600" />
            <h2 className="text-sm font-bold tracking-tight dark:text-white uppercase">Auto-Apply (Greenhouse)</h2>
          </div>
          <label className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-gray-600 dark:text-gray-300 cursor-pointer">
            <input
              type="checkbox"
              checked={autoSubmit}
              onChange={(e) => setAutoSubmit(e.target.checked)}
              className="h-4 w-4 accent-blue-600"
            />
            Submit automatically
          </label>
        </div>

        {missingProfile && (
          <button
            onClick={onEditProfile}
            className="w-full mt-3 flex items-center gap-2 text-[11px] font-bold text-yellow-700 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-900 px-3 py-2 text-left"
          >
            <AlertTriangle size={14} />
            Auto-Apply uses your saved profile (name, contact, comp, notice, links) to fill forms without re-typing. Add yours →
          </button>
        )}

        <div className="flex gap-2 mt-3">
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://job-boards.greenhouse.io/company/jobs/123…  or  https://company.com/jobs?gh_jid=…"
            className="flex-1 uber-input text-xs dark:bg-[#0A0A0A] dark:text-white"
          />
          <button
            onClick={handleApply}
            disabled={running}
            className="uber-button-primary text-[10px] font-bold uppercase tracking-widest px-6 whitespace-nowrap"
          >
            {running ? <Loader2 size={14} className="animate-spin" /> : (autoSubmit ? 'Apply' : 'Dry Run')}
          </button>
        </div>

        {error && (
          <p className="mt-3 text-xs text-red-600 dark:text-red-400 flex items-center gap-2">
            <AlertTriangle size={14} /> {error}
          </p>
        )}
      </div>

      {/* Step list */}
      <div className="px-4 py-4 border-b border-gray-100 dark:border-[#333333] shrink-0">
        <ol className="space-y-2">
          {STEPS.map(s => (
            <li key={s.key} className="flex items-start gap-3">
              <span className="mt-0.5"><StatusIcon s={stepStatus[s.key]} /></span>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-bold tracking-tight text-gray-800 dark:text-gray-100">{s.label}</div>
                {stepDetail[s.key] && (
                  <div className="text-[11px] text-gray-500 dark:text-gray-400 truncate">{stepDetail[s.key]}</div>
                )}
              </div>
            </li>
          ))}
        </ol>
      </div>

      {/* Result — scrollable so the screenshot is always reachable */}
      {result && (
        <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-1 border ${statusBadge[result.status].color}`}>
              {statusBadge[result.status].label}
            </span>
            {result.jobTitle && (
              <span className="text-[11px] text-gray-500 dark:text-gray-400 truncate">
                {result.jobTitle} @ {result.company}
              </span>
            )}
          </div>

          {result.blockers && result.blockers.length > 0 && (
            <div className="border border-yellow-200 dark:border-yellow-900 bg-yellow-50 dark:bg-yellow-900/20 p-3">
              <div className="text-[10px] font-bold uppercase tracking-widest text-yellow-700 dark:text-yellow-400 mb-2">Blockers</div>
              <ul className="text-xs text-yellow-800 dark:text-yellow-300 list-disc pl-5 space-y-0.5">
                {result.blockers.map((b, i) => <li key={i}>{b}</li>)}
              </ul>
            </div>
          )}

          {result.answers && result.answers.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="text-[10px] font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400">
                  Answers logged for this posting
                </div>
                <span className="text-[10px] text-gray-400 dark:text-gray-500">
                  per-posting; not reused on other companies
                </span>
              </div>
              <div className="border border-gray-200 dark:border-[#333333]">
                {result.answers.map((a, i) => (
                  <div key={i} className={`p-3 text-xs ${i % 2 === 0 ? 'bg-gray-50 dark:bg-[#0A0A0A]' : ''}`}>
                    <div className="font-bold text-gray-700 dark:text-gray-200 mb-1">{a.label}</div>
                    <div className="text-gray-600 dark:text-gray-400 whitespace-pre-wrap break-words">{a.value}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {screenshotUrl && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="text-[10px] font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400">
                  Final page state
                </div>
                <a
                  href={screenshotUrl} target="_blank" rel="noreferrer"
                  className="text-[10px] font-bold uppercase tracking-widest text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1"
                >
                  Open full size <ExternalLink size={12} />
                </a>
              </div>
              <div className="border border-gray-200 dark:border-[#333333] overflow-hidden">
                <img src={screenshotUrl} alt="Final application state" className="w-full block" />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AutoApplyPanel;
