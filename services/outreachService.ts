
import { GoogleGenAI, Type, GenerateContentParameters } from "@google/genai";
import { CompanyInfo, UserBackground, OutreachEmail, EmailSequence } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

async function callGeminiWithRetry(params: GenerateContentParameters, retries = 5, delay = 2000): Promise<any> {
  try {
    const response = await ai.models.generateContent(params);
    return response;
  } catch (error: any) {
    const errorCode = error?.status || error?.error?.code || error?.statusCode;
    const errorMessage = error?.message || error?.error?.message || JSON.stringify(error);

    const isRetryable =
      errorCode === 429 ||
      errorCode === 503 ||
      errorMessage.includes("429") ||
      errorMessage.includes("quota") ||
      errorMessage.includes("RESOURCE_EXHAUSTED") ||
      errorMessage.includes("Overloaded");

    if (isRetryable && retries > 0) {
      console.warn(`Gemini rate limit hit in outreachService. Retrying in ${delay}ms... (${retries} left)`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return callGeminiWithRetry(params, retries - 1, delay * 2 + Math.random() * 500);
    }
    throw error;
  }
}

function buildPrompt(company: CompanyInfo, user: UserBackground): string {
  const companyContext = [
    `Company: ${company.name}`,
    company.website     ? `Website: ${company.website}`       : null,
    company.description ? `About: ${company.description}`     : null,
    company.contactName ? `Contact: ${company.contactName}`   : null,
  ]
    .filter(Boolean)
    .join("\n");

  return `
You are a world-class B2B outreach copywriter helping a job seeker build authentic, high-converting cold email sequences. Your emails must feel personal, not templated.

CANDIDATE BACKGROUND:
Name: ${user.name}
Current Title: ${user.currentTitle}
Summary: ${user.summary}
Top Skills: ${user.topSkills.join(", ")}

TARGET COMPANY:
${companyContext}

TASK:
Generate exactly 3 cold outreach emails forming a sequence:

EMAIL 1 — Initial (sendAfterDays: 0)
- Subject: short and curiosity-driving, no "following up"
- Body: STRICTLY under 150 words
- Hook with a specific observation about the company (use the About section)
- State clearly who you are and what you offer
- One specific, relevant insight or value-add tied to their business
- Soft CTA: "Would love 15 minutes if relevant"
- Sign with candidate's name

EMAIL 2 — Follow-up (sendAfterDays: 5)
- Subject: reply-style starting with "Re: " followed by the Email 1 subject
- Body: STRICTLY under 100 words
- Reference Email 1 briefly ("Wanted to bump this up...")
- Add one new angle or insight not in Email 1
- Gentle CTA: "Happy to send more context if useful"

EMAIL 3 — Final Bump (sendAfterDays: 12)
- Subject: "Last note on ${company.name}"
- Body: STRICTLY under 80 words
- Acknowledge this is the last touchpoint
- Leave door open gracefully
- No hard sell

STYLE RULES:
- No buzzwords: "passionate", "synergy", "leverage", "excited to", "thrilled"
- No corporate jargon
- Write like a smart human, not like AI
- Vary sentence length
- No bullet points in email body
- Each email must be complete — no placeholders like [INSERT X]

Return JSON with key "emails" containing an array of 3 objects, each with:
- subject (string)
- body (string, plain text, newlines as \\n)
- sendAfterDays (number: 0, 5, or 12)
- type (string: "initial", "follow_up_1", or "follow_up_2")
`.trim();
}

export async function generateEmailSequence(
  companyInfo: CompanyInfo,
  userBackground: UserBackground
): Promise<EmailSequence> {
  const prompt = buildPrompt(companyInfo, userBackground);

  const response = await callGeminiWithRetry({
    model: "gemini-3-flash-preview",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          emails: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                subject:       { type: Type.STRING },
                body:          { type: Type.STRING },
                sendAfterDays: { type: Type.NUMBER },
                type:          { type: Type.STRING },
              },
              required: ["subject", "body", "sendAfterDays", "type"],
            },
          },
        },
        required: ["emails"],
      },
    },
  });

  const parsed = JSON.parse(response.text);

  const emails: OutreachEmail[] = parsed.emails.map((e: any) => ({
    subject:       String(e.subject),
    body:          String(e.body),
    sendAfterDays: Number(e.sendAfterDays),
    type:          e.type as OutreachEmail["type"],
  }));

  return {
    companyInfo,
    emails,
    status: "Draft",
    createdAt: Date.now(),
  };
}
