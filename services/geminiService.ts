import { CVSection, Suggestion, RewriteMode } from "../types";

/**
 * Thin client for the server-side Gemini endpoints.
 *
 * The prompt/scoring logic lives in `server/aiCore.ts` and runs on the server so
 * GEMINI_API_KEY is never shipped to the browser. These wrappers keep the exact
 * signatures the UI already imports, so callers are unchanged.
 */
async function callAi<T>(fn: string, args: unknown[]): Promise<T> {
  const res = await fetch(`/api/ai/${fn}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ args }),
  });

  if (!res.ok) {
    // Surface the server's message where there is one; fall back to the status.
    let message = `AI request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
    } catch {
      /* non-JSON error body — keep the status message */
    }
    throw new Error(message);
  }

  const body = await res.json();
  return body.result as T;
}

export async function analyzeResume(
  cvHtml: string,
  jdText: string,
  mode: RewriteMode,
  missingSkills: string[] = [],
  weakSignals: string[] = []
): Promise<{ sections: CVSection[], suggestions: Suggestion[], skippableContent: string[], profileSuggestions: any[] }> {
  return callAi('analyzeResume', [cvHtml, jdText, mode, missingSkills, weakSignals]);
}

export async function generateIntroduction(parsedCv: any, parsedJd: any): Promise<string> {
  return callAi('generateIntroduction', [parsedCv, parsedJd]);
}

export async function calculateATSScore(cvText: string, jdText: string, parsedJdCache?: any): Promise<any> {
  return callAi('calculateATSScore', [cvText, jdText, parsedJdCache]);
}

export async function generateTopChoiceMessage(cvHtml: string, jdText: string): Promise<string> {
  return callAi('generateTopChoiceMessage', [cvHtml, jdText]);
}

export async function generateWellfoundMessage(cvHtml: string, jdText: string): Promise<string> {
  return callAi('generateWellfoundMessage', [cvHtml, jdText]);
}
