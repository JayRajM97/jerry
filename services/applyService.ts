import type { ApplicationProfile, ApplyProgress, ApplyResult } from '../types';

export interface JobPreview {
  jobTitle: string;
  company: string;
  applyUrl: string;
  jdText: string;
  boardToken: string;
  jobId: string;
  questionCount: number;
}

export async function fetchJobPreview(url: string): Promise<JobPreview> {
  const res = await fetch('/api/job', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to fetch job');
  return data as JobPreview;
}

interface ApplyArgs {
  url: string;
  cvHtml?: string;
  cvText?: string;
  resumePath?: string;
  profile: ApplicationProfile;
  jdText?: string;
  autoSubmit?: boolean;
}

// POSTs to the SSE endpoint and parses the event stream. Resolves with the final result.
export async function startApply(
  args: ApplyArgs,
  onProgress: (p: ApplyProgress) => void,
): Promise<ApplyResult> {
  const res = await fetch('/api/apply', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  if (!res.ok || !res.body) {
    throw new Error(`Apply request failed (${res.status})`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let result: ApplyResult | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const chunks = buffer.split('\n\n');
    buffer = chunks.pop() || '';
    for (const chunk of chunks) {
      const line = chunk.split('\n').find(l => l.startsWith('data:'));
      if (!line) continue;
      const payload = JSON.parse(line.slice(5).trim()) as ApplyProgress;
      onProgress(payload);
      if (payload.type === 'result' && payload.result) result = payload.result;
      if (payload.type === 'error') throw new Error(payload.message || 'Apply failed');
    }
  }

  if (!result) throw new Error('Apply ended without a result');
  return result;
}
