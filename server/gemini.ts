import { GoogleGenAI, Type } from '@google/genai';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import type { ApplicationProfile } from '../types';

// Voice/style guide is a repo asset (voice/style.md). Read once; restart picks up edits.
// Stripped of header lines so only the real style content reaches the prompt.
function loadVoiceStyle(): string {
  try {
    const raw = readFileSync(resolve(process.cwd(), 'voice/style.md'), 'utf8');
    const trimmed = raw.replace(/^---[\s\S]*?---\s*/g, '').trim();
    if (/Empty for now/i.test(trimmed) || trimmed.length < 20) return '';
    return trimmed;
  } catch {
    return '';
  }
}
const VOICE_STYLE = loadVoiceStyle();

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Retry transient 429/503 (model overloaded) with exponential backoff.
async function generateWithRetry(params: any, retries = 4, delay = 2000): Promise<any> {
  try {
    return await ai.models.generateContent(params);
  } catch (error: any) {
    const code = error?.status || error?.error?.code || error?.statusCode;
    const msg = error?.message || error?.error?.message || JSON.stringify(error);
    const retryable = code === 429 || code === 503 || /429|503|overloaded|UNAVAILABLE|RESOURCE_EXHAUSTED/i.test(msg);
    if (retryable && retries > 0) {
      await new Promise(r => setTimeout(r, delay));
      return generateWithRetry(params, retries - 1, delay * 2);
    }
    throw error;
  }
}

export interface AnswerableQuestion {
  name: string;
  label: string;
  required: boolean;
  type: string;
  options: string[]; // empty for free-text
}

export interface GeneratedAnswer { value: string; kind: 'text' | 'option'; }

interface Args {
  company: string;
  jobTitle: string;
  jdText: string;
  cvText: string;
  profile: ApplicationProfile;
  questions: AnswerableQuestion[];
}

// Returns a map of field name -> answer. Empty value means "could not answer confidently".
export async function generateApplicationAnswers(args: Args): Promise<Record<string, GeneratedAnswer>> {
  if (args.questions.length === 0) return {};

  const profileFacts = JSON.stringify({
    location: args.profile.location,
    workAuthorized: args.profile.workAuthorized,
    needsVisaSponsorship: args.profile.needsVisaSponsorship,
    linkedinUrl: args.profile.linkedinUrl,
    githubUrl: args.profile.githubUrl,
    portfolioUrl: args.profile.portfolioUrl,
    gender: args.profile.gender,
    currentCompensation: args.profile.currentCompensation,
    expectedCompensation: args.profile.expectedCompensation,
    noticePeriod: args.profile.noticePeriod,
    aiShowcaseLink: args.profile.aiShowcaseLink,
    yearsExperience: args.profile.yearsExperience,
    industryPreferred: args.profile.industry,
    declineDemographics: args.profile.declineDemographics,
  }, null, 2);

  const voiceBlock = VOICE_STYLE
    ? `\nVOICE / STYLE GUIDE (apply to free-text answers only; do not let style override facts):\n${VOICE_STYLE}\n`
    : '';

  const prompt = `You are filling out a job application for ${args.jobTitle} at ${args.company}.
${voiceBlock}
APPLICANT PROFILE FACTS (authoritative — never contradict or invent beyond these):
${profileFacts}

RESUME (for free-text answers):
${args.cvText.slice(0, 6000)}

JOB DESCRIPTION (for "why this role/company" answers):
${args.jdText.slice(0, 4000)}

QUESTIONS TO ANSWER (JSON):
${JSON.stringify(args.questions, null, 2)}

RULES:
- For questions with non-empty "options": return "kind":"option" and "value" EXACTLY equal to one of the listed options. Pick using the profile facts (e.g. visa sponsorship, work authorization, location/country). If the profile does not let you decide confidently, return an empty "value".
- For free-text questions (empty "options"): return "kind":"text" with a concise, specific, first-person answer grounded in the resume and JD. 1-3 sentences. No placeholders, no markdown.
- Compensation questions (current/expected/CTC/salary) → use currentCompensation / expectedCompensation. Notice-period questions → use noticePeriod (if it asks for a number of days and the profile says immediate/0, answer "0"). Questions asking for a link showcasing AI work → use aiShowcaseLink. Website/portfolio → portfolioUrl. LinkedIn → linkedinUrl. GitHub → githubUrl.
- Years-of-experience questions (e.g. "Total years", "Years as PM") → use yearsExperience from the profile.
- Industry / "what industry are you from" questions → default to industryPreferred (e.g. "SaaS / internet"). For consumer-facing companies (D2C, e-commerce, food, mobility, social), use "consumer tech" instead — pick whichever fits the role best.
- Gender questions: if "gender" is set in the profile, choose the matching option (or answer it for free-text). For other EEO/demographic questions (race / veteran / disability / Hispanic-Latino): if declineDemographics is true and a decline-style option exists (e.g. "Decline to self-identify", "I don't wish to answer"), choose it; otherwise empty.
- NEVER guess work-authorization, visa, or location answers not supported by the profile facts — return empty value instead.
- Return one entry per question, keyed by its "name".`;

  const response = await generateWithRetry({
    model: 'gemini-3-flash-preview',
    contents: prompt,
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          answers: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                value: { type: Type.STRING },
                kind: { type: Type.STRING },
              },
              required: ['name', 'value', 'kind'],
            },
          },
        },
        required: ['answers'],
      },
    },
  });

  try {
    const parsed = JSON.parse(response.text || '{"answers":[]}');
    const out: Record<string, GeneratedAnswer> = {};
    for (const a of parsed.answers || []) {
      out[a.name] = { value: a.value || '', kind: a.kind === 'option' ? 'option' : 'text' };
    }
    return out;
  } catch {
    return {};
  }
}
