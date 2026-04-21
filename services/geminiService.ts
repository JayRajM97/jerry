
import { GoogleGenAI, Type, GenerateContentParameters } from "@google/genai";
import { CVSection, Suggestion, RewriteMode, OutreachOption, CompanyIntel } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

/**
 * Helper to call Gemini with exponential backoff retry logic.
 * Specifically targets 503 and 429 errors.
 */
async function callGeminiWithRetry(params: GenerateContentParameters, retries = 5, delay = 2000): Promise<any> {
  try {
    const response = await ai.models.generateContent(params);
    return response;
  } catch (error: any) {
    // Detect various forms of rate limiting or temporary unavailability
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
      console.warn(`Gemini API rate limit hit. Retrying in ${delay}ms... (Retries left: ${retries})`);
      await new Promise(resolve => setTimeout(resolve, delay));
      // Exponential backoff with some jitter to avoid thundering herd
      const nextDelay = delay * 2 + Math.random() * 500;
      return callGeminiWithRetry(params, retries - 1, nextDelay);
    }
    throw error;
  }
}

export async function analyzeResume(
  cvHtml: string, 
  jdText: string, 
  mode: RewriteMode,
  missingSkills: string[] = [],
  weakSignals: string[] = []
): Promise<{ sections: CVSection[], suggestions: Suggestion[], skippableContent: string[], profileSuggestions: any[] }> {
  const prompt = `
    You are an expert recruiter and ATS optimization specialist. 
    Analyze the provided CV (in HTML) and Job Description (JD). 
    
    TARGET-DRIVEN OPTIMIZATION:
    The current resume is missing the following required skills: ${missingSkills.join(', ')}
    And has weak signals for: ${weakSignals.join(', ')}
    
    TASK:
    1. Parse the CV into logical sections based on the HTML structure (e.g., headings define sections).
    2. CLEANUP & FORMATTING FIXES (CRITICAL):
       - The input HTML is parsed from a PDF and may have broken line breaks (sentences split across lines) and text-based bullets (e.g., "●", "•", "-").
       - MERGE broken lines into coherent paragraphs. Do not leave hard breaks in the middle of sentences.
       - CONVERT text-based bullet points into proper HTML \`<ul><li>...</li></ul>\` structures.
       - Ensure the final output is clean, semantic HTML.
    3. Propose improvements to the CV to better match the JD while STRICTLY preserving facts (no new skills, dates, companies, or metrics).
       - EXPLICITLY add evidence for the missing skills and weak signals mentioned above. For example, if "QA coordination" is missing, add terms like "QA/UAT/bug triage/acceptance criteria" to relevant bullets.
    4. For the "${mode}" mode: 
       - Conservative: Minimal wording tweaks, add keywords where implied by context.
       - Balanced: Rewrite for clarity and alignment, reorder bullets within the same role.
       - Aggressive: Stronger phrasing, heavy keyword alignment, but still truth-preserving.
    5. For each change, provide a detailed rationale.
    6. IDENTIFY SKIPPABLE CONTENT: Identify 3-5 specific parts of the CV that are less relevant to this specific JD and could be removed to save space. Be specific (e.g., "The 'Interests' section mentioning hiking", "The bullet point about legacy Java systems in the 2015 role").
    7. PROFILE-BASED SUGGESTIONS (High Impact): Identify 2-3 missing but highly impactful points that *could* be true based on the candidate's profile, but are missing. Ask the user a question to verify, and if yes, provide a powerful bullet point that maps directly to the JD's core mission/values.
       - Example: "Did you run A/B testing for consumers? If yes, add: 'Led A/B testing frameworks that increased conversion by 15%, directly supporting the Revenue Automation mission.'"
    
    CV (HTML):
    ${cvHtml}
    
    JD:
    ${jdText}
    
    Return a JSON object with:
    - sections: Array of { id, title, htmlContent, optimizedHtmlContent }
      (optimizedHtmlContent MUST contain the fully rewritten HTML for this section, incorporating all suggestions)
    - suggestions: Array of { 
        id, 
        sectionId, 
        originalHtml, 
        suggestedHtml, 
        reason, 
        rationaleDetails: { matchedKeywords: [], improvedComponent: "skills|responsibilities|tooling|clarity", riskCheck: "safe|needs_confirmation" } 
      }
    - skippableContent: Array of strings (bullet points describing what to skip)
    - profileSuggestions: Array of { id, question, suggestedPoint, rationale }
  `;

  // Using flash model for higher throughput and lower latency
  const response = await callGeminiWithRetry({
    model: "gemini-3-flash-preview",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          sections: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                title: { type: Type.STRING },
                htmlContent: { type: Type.STRING },
                optimizedHtmlContent: { type: Type.STRING }
              },
              required: ["id", "title", "htmlContent", "optimizedHtmlContent"]
            }
          },
          suggestions: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                sectionId: { type: Type.STRING },
                originalHtml: { type: Type.STRING },
                suggestedHtml: { type: Type.STRING },
                reason: { type: Type.STRING },
                rationaleDetails: {
                  type: Type.OBJECT,
                  properties: {
                    matchedKeywords: { type: Type.ARRAY, items: { type: Type.STRING } },
                    improvedComponent: { type: Type.STRING },
                    riskCheck: { type: Type.STRING }
                  },
                  required: ["matchedKeywords", "improvedComponent", "riskCheck"]
                }
              },
              required: ["id", "sectionId", "originalHtml", "suggestedHtml", "reason", "rationaleDetails"]
            }
          },
          skippableContent: {
            type: Type.ARRAY,
            items: { type: Type.STRING }
          },
          profileSuggestions: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                question: { type: Type.STRING },
                suggestedPoint: { type: Type.STRING },
                rationale: { type: Type.STRING }
              },
              required: ["id", "question", "suggestedPoint", "rationale"]
            }
          }
        },
        required: ["sections", "suggestions", "skippableContent", "profileSuggestions"]
      }
    }
  });

  const result = JSON.parse(response.text);
  return {
    sections: result.sections,
    suggestions: result.suggestions.map((s: any) => ({ ...s, applied: true })),
    skippableContent: result.skippableContent || [],
    profileSuggestions: result.profileSuggestions || []
  };
}

// --- DETERMINISTIC SCORING ENGINE ---

const ALIAS_MAP: Record<string, string[]> = {
  "product lifecycle management": ["end-to-end ownership","0 to 1","0->1","mvp to scale","built product versions","roadmap","launch","iterate", "lifecycle"],
  "write product requirements": ["prd","user stories","acceptance criteria","spec","requirements doc", "product requirements"],
  "user feedback prioritization": ["customer interviews","user research","voc","feedback analysis","prioritization","backlog grooming", "user feedback"],
  "data insights analysis": ["analytics","funnels","dashboards","mixpanel","metabase","amplitude","insights", "data analysis"],
  "systems-thinking": ["automation","workflows","loops","data models","infra","systems design", "systems thinking"],
  "react": ["reactjs", "react.js"],
  "node": ["nodejs", "node.js"],
  "javascript": ["js", "es6"],
  "typescript": ["ts"]
};

function expandAliases(text: string): string[] {
  let expanded = (text || '').toLowerCase();
  for (const [key, aliases] of Object.entries(ALIAS_MAP)) {
    if (expanded.includes(key) || aliases.some(a => expanded.includes(a))) {
      aliases.forEach(a => expanded += " " + a);
      expanded += " " + key;
    }
  }
  return expanded.split(/[\s\.,\/\|-]+/).filter(Boolean);
}

function evaluateMatch(jdItem: string, cvStrings: string[]) {
   const jdTokens = new Set(expandAliases(jdItem));
   let bestScore = 0;
   let bestEvidence: string[] = [];

   for (const cvStr of cvStrings) {
      if (!cvStr) continue;
      const cvTokens = new Set(expandAliases(cvStr));
      
      let isExact = false;
      const jdItemLower = jdItem.toLowerCase();
      const cvStrLower = cvStr.toLowerCase();
      
      if (cvStrLower.includes(jdItemLower)) isExact = true;
      for (const [key, aliases] of Object.entries(ALIAS_MAP)) {
         if (jdItemLower.includes(key) || aliases.some(a => jdItemLower.includes(a))) {
            if (cvStrLower.includes(key) || aliases.some(a => cvStrLower.includes(a))) {
               isExact = true;
            }
         }
      }

      let score = 0;
      if (isExact) {
         score = 1.0;
      } else {
         let intersection = 0;
         for (const token of jdTokens) {
            if (cvTokens.has(token)) intersection++;
         }
         const union = jdTokens.size + cvTokens.size - intersection;
         const jaccard = union > 0 ? intersection / union : 0;
         
         if (jaccard >= 0.35) score = 0.75;
         else if (jaccard >= 0.2) score = 0.5;
      }

      if (score > bestScore) {
         bestScore = score;
         bestEvidence = [cvStr];
      } else if (score === bestScore && score > 0 && bestEvidence.length < 2 && !bestEvidence.includes(cvStr)) {
         bestEvidence.push(cvStr);
      }
   }

   return { score: bestScore, evidence: bestEvidence };
}

async function parseResume(cvHtml: string) {
  const prompt = `
    Extract structured JSON from this CV. DO NOT score or analyze. Just extract.
    CV:
    ${cvHtml}
  `;
  const response = await callGeminiWithRetry({
    model: "gemini-3-flash-preview",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          candidate_name: { type: Type.STRING },
          contact: {
            type: Type.OBJECT,
            properties: {
               email: { type: Type.STRING },
               phone: { type: Type.STRING },
               location: { type: Type.STRING },
               links: { type: Type.ARRAY, items: { type: Type.STRING } }
            }
          },
          titles: { type: Type.ARRAY, items: { type: Type.STRING } },
          total_years_experience: { type: Type.NUMBER },
          skills: {
            type: Type.OBJECT,
            properties: {
              hard: { type: Type.ARRAY, items: { type: Type.STRING } },
              soft: { type: Type.ARRAY, items: { type: Type.STRING } },
              tools: { type: Type.ARRAY, items: { type: Type.STRING } },
              domains: { type: Type.ARRAY, items: { type: Type.STRING } }
            }
          },
          experience: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                company: { type: Type.STRING },
                start_date: { type: Type.STRING },
                end_date: { type: Type.STRING },
                bullets: { type: Type.ARRAY, items: { type: Type.STRING } },
                skills_in_role: { type: Type.ARRAY, items: { type: Type.STRING } },
                tools_in_role: { type: Type.ARRAY, items: { type: Type.STRING } },
                metrics_bullets: { type: Type.ARRAY, items: { type: Type.STRING } }
              }
            }
          },
          education: { type: Type.ARRAY, items: { type: Type.STRING } },
          certifications: { type: Type.ARRAY, items: { type: Type.STRING } },
          format_signals: {
            type: Type.OBJECT,
            properties: {
              page_count: { type: Type.NUMBER },
              columns_detected: { type: Type.BOOLEAN },
              tables_detected: { type: Type.BOOLEAN },
              missing_sections: { type: Type.ARRAY, items: { type: Type.STRING } }
            }
          }
        },
        required: ["titles", "total_years_experience", "skills", "experience", "format_signals"]
      }
    }
  });
  return JSON.parse(response.text);
}

async function parseJD(jdText: string) {
  const prompt = `
    Extract structured JSON from this Job Description. DO NOT score or analyze. Just extract.
    
    Update JD parsing logic as follows:

    1) Required Skills:
       - Any item under "Requirements" section that is not labeled as "plus", "nice to have", "bonus", or "preferred".
       - Must be treated as hard requirements.

    2) Preferred Skills:
       - Any item explicitly marked as: plus, bonus, preferred, nice to have, ideally.
       - Tools mentioned as examples (e.g., "e.g. Amplitude, Metabase") should be treated as preferred unless JD states mandatory.

    3) Soft Traits:
       - Items like "communication skills", "systems-thinking mentality", "attention to detail"
       - These must NOT be classified as required or preferred skills.
       - Instead, classify them under: soft_traits

    4) Output format must clearly separate required_skills, preferred_skills, required_tools, preferred_tools, and soft_traits.

    JD:
    ${jdText}
  `;
  const response = await callGeminiWithRetry({
    model: "gemini-3-flash-preview",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          job_title: { type: Type.STRING },
          title_variants: { type: Type.ARRAY, items: { type: Type.STRING } },
          required_hard_skills: { type: Type.ARRAY, items: { type: Type.STRING } },
          soft_traits: { type: Type.ARRAY, items: { type: Type.STRING } },
          preferred_skills: { type: Type.ARRAY, items: { type: Type.STRING } },
          required_tools: { type: Type.ARRAY, items: { type: Type.STRING } },
          preferred_tools: { type: Type.ARRAY, items: { type: Type.STRING } },
          responsibilities: { type: Type.ARRAY, items: { type: Type.STRING } },
          minimum_years_experience: { type: Type.NUMBER },
          domain: { type: Type.STRING }
        },
        required: ["job_title", "title_variants", "required_hard_skills", "soft_traits", "preferred_skills", "required_tools", "preferred_tools", "responsibilities", "minimum_years_experience"]
      }
    }
  });
  return JSON.parse(response.text);
}

export async function generateIntroduction(parsedCv: any, parsedJd: any): Promise<string> {
  const prompt = `
    You are generating a "Tell Me About Yourself" introduction in the style of Gayle McDowell.

    STRICT RULES:
    - 45–75 seconds spoken length.
    - Structure must follow: Present → Past → Pattern → Forward.
    - No resume readout.
    - No listing every role.
    - No early career unless relevant.
    - No personal hobbies unless directly relevant.
    - Must feel intentional and structured.

    INPUT:
    Resume JSON:
    ${JSON.stringify(parsedCv)}

    Job Description JSON:
    ${JSON.stringify(parsedJd)}

    TASK:

    1) Present:
       - Current role
       - Scope
       - 1-line impact theme

    2) Past:
       - 1–2 prior roles maximum
       - Show progression of scope/ownership
       - Emphasize growth

    3) Pattern:
       - Identify consistent thread across career
       - Systems built? 0→1? Growth? Marketplace? AI? Fintech?

    4) Forward:
       - Bridge to THIS JD
       - Explain why this role is logical next step
       - Align to company domain (use JD domain field)

    TAILORING:
    If JD domain = fintech: emphasize data, analytics, risk, lifecycle ownership.
    If JD domain = marketplace: emphasize experimentation loops, performance optimization.
    If JD domain = AI: emphasize system thinking + automation.
    If JD domain = startup: emphasize 0→1 + cross-functional ownership.

    OUTPUT:
    Return only the introduction paragraph.
    No bullets.
    No explanation.
    No labels.
  `;

  const response = await callGeminiWithRetry({
    model: "gemini-3-flash-preview",
    contents: prompt,
  });

  return response.text.trim();
}

export async function calculateATSScore(cvText: string, jdText: string, parsedJdCache?: any): Promise<any> {
  // 1. LLM Parsing Layer
  const cv = await parseResume(cvText);
  const jd = parsedJdCache || await parseJD(jdText);

  // 2. Deterministic Scoring Layer
  const allCvStrings = [
    ...(cv.skills?.hard || []),
    ...(cv.skills?.soft || []),
    ...(cv.skills?.tools || []),
    ...(cv.skills?.domains || []),
    ...(cv.experience || []).flatMap((e: any) => [
       ...(e.bullets || []), 
       ...(e.skills_in_role || []), 
       ...(e.tools_in_role || [])
    ])
  ].filter(Boolean);

  const scoreSkillList = (requiredList: string[]) => {
    let scoreSum = 0;
    const missing = [];
    const matches = [];

    for (const req of requiredList) {
      const match = evaluateMatch(req, allCvStrings);
      scoreSum += match.score;
      if (match.score === 0) {
         missing.push(req);
      }
      matches.push({ jd_item: req, score: match.score, evidence: match.evidence });
    }
    const ratio = requiredList.length ? scoreSum / requiredList.length : 1;
    return { ratio, missing, matches };
  };

  // Required Hard Skills (35)
  const reqHard = scoreSkillList(jd.required_hard_skills || []);
  let s_req = 35 * reqHard.ratio;
  s_req -= Math.min(10, reqHard.missing.length * 2);
  s_req = Math.max(0, s_req);

  // Required Soft Skills (Weak Signals)
  const reqSoft = scoreSkillList(jd.soft_traits || []);
  const weakSignals = reqSoft.missing.map(s => `Missing evidence for soft skill: ${s}. Consider adding a bullet demonstrating this.`);

  // Preferred Skills (10)
  const prefSkills = scoreSkillList(jd.preferred_skills || []);
  const s_pref = 10 * prefSkills.ratio;

  // Tools (10)
  const reqTools = scoreSkillList(jd.required_tools || []);
  const prefTools = scoreSkillList(jd.preferred_tools || []);
  const s_tools = 10 * (0.7 * reqTools.ratio + 0.3 * prefTools.ratio);

  // Experience Years (15)
  let s_exp = 15;
  const minYears = jd.minimum_years_experience || 0;
  const cvYears = cv.total_years_experience || 0;
  if (minYears > 0) {
    const ratio = cvYears / minYears;
    if (ratio >= 1) s_exp = 15;
    else if (ratio >= 0.8) s_exp = 15 * 0.75;
    else if (ratio >= 0.6) s_exp = 15 * 0.5;
    else s_exp = 15 * 0.25;
  }

  // Title Relevance (10)
  let maxTitleSim = 0;
  const recentTitle = (cv.titles && cv.titles[0]) ? cv.titles[0] : "";
  const variants = [jd.job_title, ...(jd.title_variants || [])].filter(Boolean);
  if (variants.length === 0) {
    maxTitleSim = 1;
  } else {
    for (const v of variants) {
      maxTitleSim = Math.max(maxTitleSim, evaluateMatch(recentTitle, [v]).score);
    }
  }
  let s_title = 0;
  if (maxTitleSim >= 0.9) s_title = 10;
  else if (maxTitleSim >= 0.75) s_title = 7.5;
  else if (maxTitleSim >= 0.5) s_title = 5;
  else s_title = 2.5;

  // Responsibilities Coverage (10)
  const respList = jd.responsibilities || [];
  let respScoreSum = 0;
  const respMatches = [];
  for (const resp of respList) {
     const match = evaluateMatch(resp, allCvStrings);
     respScoreSum += match.score;
     respMatches.push({ jd_item: resp, score: match.score, evidence: match.evidence });
  }
  const respRatio = respList.length ? respScoreSum / respList.length : 1;
  const s_resp = 10 * respRatio;

  // Quantified Impact (5)
  const metricBullets = (cv.experience || []).flatMap((e: any) => e.metrics_bullets || []).length;
  const expectedMetrics = Math.min(10, Math.max(1, (cv.experience || []).length * 2));
  const impactRatio = Math.min(1, metricBullets / expectedMetrics);
  const s_impact = 5 * impactRatio;

  // Format Hygiene (5)
  let formatScore = 1;
  const formatFlags = [];
  const signals = cv.format_signals || {};
  if (signals.page_count > 2) { formatScore -= 0.1; formatFlags.push("Page count > 2"); }
  if (signals.columns_detected) { formatScore -= 0.2; formatFlags.push("Columns detected"); }
  if (signals.tables_detected) { formatScore -= 0.2; formatFlags.push("Tables detected"); }
  if ((signals.missing_sections || []).includes("experience")) { formatScore -= 0.4; formatFlags.push("Missing experience section"); }
  formatScore = Math.max(0, Math.min(1, formatScore));
  const s_format = 5 * formatScore;

  // Final Score
  const total = Math.round(s_req + s_pref + s_tools + s_exp + s_title + s_resp + s_impact + s_format);
  let band = "Weak";
  if (total >= 90) band = "Perfect";
  else if (total >= 80) band = "Strong";
  else if (total >= 70) band = "Good";

  const topImprovements = [];
  reqHard.missing.slice(0, 3).forEach(req => topImprovements.push({ label: `Missing required skill: ${req}` }));
  weakSignals.slice(0, 2).forEach(ws => topImprovements.push({ label: ws }));
  if (impactRatio < 1) topImprovements.push({ label: `Add more quantified metrics (found ${metricBullets}, expected ${expectedMetrics})` });
  formatFlags.forEach(f => topImprovements.push({ label: `Format issue: ${f}` }));
  if (topImprovements.length === 0) topImprovements.push({ label: "Keep tailoring bullets to JD responsibilities." });

  return {
    total,
    band,
    breakdown: {
      required_skills: s_req,
      preferred_skills: s_pref,
      tools: s_tools,
      experience_years: s_exp,
      title_relevance: s_title,
      responsibilities: s_resp,
      quantified_impact: s_impact,
      format_hygiene: s_format
    },
    missing_required_skills: reqHard.missing,
    weak_signals: weakSignals,
    matches_with_evidence: {
       required: reqHard.matches,
       responsibilities: respMatches
    },
    diagnostics: {
      missing_required_count: reqHard.missing.length,
      metric_bullets: metricBullets,
      format_flags: formatFlags
    },
    topImprovements,
    parsedJd: jd,
    parsedCv: cv
  };
}

export async function generateTopChoiceMessage(cvHtml: string, jdText: string): Promise<string> {
  const prompt = `
    You are a helpful career coach assisting a candidate in writing a "Top Choice" message for a job application on LinkedIn.
    
    CONTEXT:
    The candidate is applying for a job with the following description (JD):
    ${jdText}
    
    The candidate's CV (HTML) is:
    ${cvHtml}
    
    TASK:
    Write a short, genuine, and humane message (max 400 characters) explaining why this specific job is the candidate's top choice.
    
    GUIDELINES:
    - STRICTLY under 400 characters.
    - Do NOT sound like AI. Avoid buzzwords like "thrilled", "excited to apply", "perfect match", "synergy".
    - Be specific about why the role/company is interesting based on the JD and how the candidate fits.
    - Sound professional but conversational.
    - Focus on the "Why us?" aspect.
    - Do not use hashtags.
    - Do not use a salutation or signature, just the message body.
    - **FORMAT:** Use bullet points (•) for readability where possible, but keep it very brief to fit the character limit.
    
    Output ONLY the message text.
  `;

  const response = await callGeminiWithRetry({
    model: "gemini-3-flash-preview",
    contents: prompt,
    config: {
      responseMimeType: "text/plain",
    }
  });

  return response.text.trim();
}

export async function generateWellfoundMessage(cvHtml: string, jdText: string): Promise<string> {
  const prompt = `
    You are a helpful career coach assisting a candidate in writing a message for a job application on Wellfound (formerly AngelList).

    CONTEXT:
    The candidate is applying for a job with the following description (JD):
    ${jdText}

    The candidate's CV (HTML) is:
    ${cvHtml}

    TASK:
    Write a short, honest, and raw message (max 400 characters) answering the question: "What interests you about working for this company?"

    GUIDELINES:
    - STRICTLY under 400 characters.
    - Be very honest and raw. Avoid corporate jargon.
    - Show genuine interest and personality.
    - Connect the candidate's background to the company's mission or product in a direct way.
    - Do not use hashtags.
    - Do not use a salutation or signature, just the message body.
    - **FORMAT:** Use bullet points (•) for readability where possible, but keep it very brief to fit the character limit.

    Output ONLY the message text.
  `;

  const response = await callGeminiWithRetry({
    model: "gemini-3-flash-preview",
    contents: prompt,
    config: {
      responseMimeType: "text/plain",
    }
  });

  return response.text.trim();
}

export async function generateOutreachOptions(
  cvHtml: string,
  jdText: string,
  companyIntel: CompanyIntel | null
): Promise<OutreachOption[]> {
  const intelContext = companyIntel
    ? `Company Intel Available:
       - Recent News: ${(companyIntel.recentNews || []).join(' | ')}
       - Product Context: ${companyIntel.productContext || 'N/A'}
       - Stage: ${companyIntel.stage || 'N/A'}`
    : 'No company intel available — derive insights from the JD itself.';

  const prompt = `
    You are an expert career strategist. Generate 3 distinct outreach strategies for this job application.

    CV (HTML):
    ${cvHtml}

    Job Description:
    ${jdText}

    ${intelContext}

    Generate exactly 3 outreach options:

    Option A — "direct": Short, sharp, direct intro. Professional but conversational. No buzzwords.
    Option B — "insight": References a specific product detail, company news, or market observation. Shows the candidate did their homework.
    Option C — "value_first": Positions the candidate as bringing a specific audit, idea, or gap they noticed. Value-forward before asking for anything.

    For each option:
    - linkedInMessage: ≤400 characters. No salutation. No hashtags. No "thrilled/excited". Sound human.
    - emailSubject: Concise, specific subject line (max 60 chars).
    - emailBody: 3-4 sentence email. Professional but not stiff. End with a clear, low-friction CTA.
    - strategy: One sentence describing the angle of this option.

    Return a JSON array of exactly 3 options.
  `;

  const response = await callGeminiWithRetry({
    model: "gemini-3-flash-preview",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            id: { type: Type.STRING },
            label: { type: Type.STRING },
            strategy: { type: Type.STRING },
            linkedInMessage: { type: Type.STRING },
            emailSubject: { type: Type.STRING },
            emailBody: { type: Type.STRING },
          },
          required: ["id", "label", "strategy", "linkedInMessage", "emailSubject", "emailBody"]
        }
      }
    }
  });

  const raw: any[] = JSON.parse(response.text);
  const ids: OutreachOption['id'][] = ['direct', 'insight', 'value_first'];
  const labels = ['Option A: Direct Intro', 'Option B: Insight-Led', 'Option C: Value-First'];
  return raw.slice(0, 3).map((item, idx) => ({
    ...item,
    id: ids[idx],
    label: labels[idx],
  })) as OutreachOption[];
}

export async function generateCoverLetter(
  cvHtml: string,
  jdText: string,
  companyIntel: CompanyIntel | null,
  chosenOutreach: OutreachOption
): Promise<string> {
  const intelContext = companyIntel
    ? `Company: ${companyIntel.productContext || ''} ${companyIntel.stage ? `(${companyIntel.stage})` : ''}`
    : '';

  const prompt = `
    Write a professional cover letter for this job application.

    CV (HTML):
    ${cvHtml}

    Job Description:
    ${jdText}

    ${intelContext}

    Outreach Strategy Chosen: ${chosenOutreach.label} — ${chosenOutreach.strategy}

    GUIDELINES:
    - 3 focused paragraphs. No more, no less.
    - Para 1: Opening — who you are, why this specific role/company. Hook from the ${chosenOutreach.id === 'insight' ? 'insight angle' : chosenOutreach.id === 'value_first' ? 'value-first angle' : 'direct angle'}.
    - Para 2: Evidence — 2-3 concrete accomplishments from the CV that directly map to the JD's key requirements.
    - Para 3: Forward — why now, why this company, clear and confident close. No desperate language.
    - Tone: Confident, specific, human. No buzzwords. No "I am writing to express my interest".
    - Do NOT add "Dear Hiring Manager" or sign-off — those will be added by the user.

    Return clean HTML with <p> tags for each paragraph.
  `;

  const response = await callGeminiWithRetry({
    model: "gemini-3-flash-preview",
    contents: prompt,
    config: {
      responseMimeType: "text/plain",
    }
  });

  const text = response.text.trim();
  // Wrap in paragraphs if the model didn't return HTML
  if (!text.includes('<p>')) {
    return text.split(/\n\n+/).map((p: string) => `<p>${p.trim()}</p>`).join('');
  }
  return text;
}

export async function gatherCompanyIntel(
  companyName: string,
  jobTitle: string
): Promise<CompanyIntel> {
  const prompt = `
    Research the company "${companyName}" for a job candidate targeting the role: "${jobTitle}".

    Provide:
    1. recentNews: 2-3 bullet summaries of notable recent news, funding, product launches, or milestones (last 12 months). Each bullet max 120 chars.
    2. productContext: 1-2 sentences describing what the company builds and its core mission.
    3. teamContext: Brief description of the team structure or hiring focus relevant to this role.
    4. stage: Company stage (e.g. "Seed", "Series A", "Series B", "Series C", "Growth", "Public", "Bootstrapped").
    5. companySize: Rough employee count (e.g. "10-50", "50-200", "200-500", "500-2000", "2000+").
    6. hiringManager: If you can reasonably infer a likely hiring manager name for this role (e.g. VP Product, Head of Engineering), provide it. If not certain, leave blank.

    Be factual. Do not hallucinate funding rounds or events you're not confident about.
    If info is unavailable, use null for that field.
  `;

  try {
    const response = await callGeminiWithRetry({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }] as any,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            recentNews: { type: Type.ARRAY, items: { type: Type.STRING } },
            productContext: { type: Type.STRING },
            teamContext: { type: Type.STRING },
            stage: { type: Type.STRING },
            companySize: { type: Type.STRING },
            hiringManager: { type: Type.STRING },
          },
        }
      }
    });

    const raw = JSON.parse(response.text);
    return {
      recentNews: raw.recentNews || [],
      productContext: raw.productContext || '',
      teamContext: raw.teamContext || '',
      stage: raw.stage || '',
      companySize: raw.companySize || '',
      hiringManager: raw.hiringManager || '',
      fetchedAt: Date.now(),
    };
  } catch (_) {
    return { fetchedAt: Date.now() };
  }
}

export async function fetchAndParseJobUrl(
  url: string
): Promise<{ jdText: string; companyName?: string; jobTitle?: string }> {
  let rawHtml: string;

  try {
    const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;
    const res = await fetch(proxyUrl, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error('proxy_failed');
    const data = await res.json();
    rawHtml = data.contents || '';
    if (!rawHtml || rawHtml.length < 300) throw new Error('empty_content');
  } catch (_) {
    throw { code: 'PROXY_FAILED', message: 'Could not fetch the URL via proxy.' };
  }

  // Strip to first 30k chars to stay within Gemini limits
  const truncated = rawHtml.slice(0, 30000);

  const prompt = `
    The following is raw HTML from a job posting page. Extract the job information.

    HTML:
    ${truncated}

    Extract:
    - jdText: The full job description as clean plain text. Include all requirements, responsibilities, and qualifications. Preserve structure with newlines. Remove navigation, ads, footer, and unrelated content.
    - companyName: The hiring company name (not the job board name).
    - jobTitle: The exact job title.

    If you cannot extract a meaningful job description (e.g., page is behind a login wall or is a CAPTCHA), return jdText as an empty string.
  `;

  const response = await callGeminiWithRetry({
    model: "gemini-3-flash-preview",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          jdText: { type: Type.STRING },
          companyName: { type: Type.STRING },
          jobTitle: { type: Type.STRING },
        },
        required: ["jdText"]
      }
    }
  });

  const result = JSON.parse(response.text);

  if (!result.jdText || result.jdText.trim().length < 100) {
    throw { code: 'PROXY_FAILED', message: 'Could not extract job description from the page.' };
  }

  return {
    jdText: result.jdText.trim(),
    companyName: result.companyName || undefined,
    jobTitle: result.jobTitle || undefined,
  };
}

export async function generateApplicationAnswer(
  question: string,
  jdText: string,
  companyType: 'consumer' | 'enterprise' | 'ai_startup',
  parsedCv: any
): Promise<{ short: string; medium: string }> {
  const personalizationMap = {
    consumer: `
COMPANY TYPE: Consumer Tech
- Highlight consumer product experience and large user bases
- Use examples: Teleport (100K+ users, consumer visa flows), Tickertape (gamification, growth loops, 20%+ CTR notifications)
- Emphasize: user empathy, growth mindset, simplifying complex flows
- Tone: energetic, product-led, user-obsessed`,
    enterprise: `
COMPANY TYPE: Enterprise / B2B
- Show curiosity about the company's product and domain
- Use examples: ShopOS (enterprise AI agents, Amazon Copilot ~$50K run-rate), Teleport B2B white-label (Yatra, MMT, TravClan → ₹60L/month)
- Emphasize: systems thinking, scalability, AI-driven problem solving, efficiency gains
- Tone: structured, strategic, problem-solving`,
    ai_startup: `
COMPANY TYPE: AI / Startup
- Lead with ShopOS AI agent work
- Use examples: Photography Agent (₹7/image vs ~$12K shoots, >95% cost reduction), Loops (10+ beta brands), Amazon Copilot ($50K run-rate)
- Emphasize: 0→1 ownership, agentic product thinking, cost/efficiency impact
- Tone: builder mentality, sharp, excited about the problem space`,
  };

  const cvSummary = parsedCv
    ? `Candidate: ${parsedCv.candidate_name || 'Jay'}. Roles: ${(parsedCv.experience || []).map((e: any) => `${e.title} at ${e.company}`).join(', ')}.`
    : `Senior PM with experience at ShopOS (AI agents), Teleport (travel-tech, 100K users), Tickertape (fintech growth), Board Infinity (EdTech).`;

  const prompt = `You are answering a job application question on behalf of Jay (Jayraj Makhar), a Senior Product Manager.
Use his exact voice: specific, human, metric-driven. Never sound like AI.

NEVER say: "thrilled", "excited to apply", "perfect fit", "synergy", "leverage", "passionate about"
Language: simple, very humane, sharp. Sound like a person, not a resume.
Always tie to a specific metric or example.

${personalizationMap[companyType]}

Jay's background summary:
${cvSummary}

Full JD context:
${jdText.slice(0, 3000)}

APPLICATION QUESTION:
${question}

Generate two answers:

SHORT (2-4 bullet points) — for character-limited fields (under ~400 chars total)
- Ultra crisp, one strong example or metric per bullet
- No intros or headers

MEDIUM (5-7 bullet points) — for open text fields
- Line 1: specific hook about why this role/company
- Lines 2-3: 2 relevant experience points with concrete numbers
- Lines 4-5: why this is the right next move for Jay

Return JSON: { "short": "bullet1\\n• bullet2\\n• ...", "medium": "bullet1\\n• bullet2\\n• ..." }
Each answer starts directly with "•" bullet points, no intro text.`;

  const response = await callGeminiWithRetry({
    model: "gemini-3-flash-preview",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          short: { type: Type.STRING },
          medium: { type: Type.STRING },
        },
        required: ["short", "medium"],
      },
    },
  });

  const result = JSON.parse(response.text);
  return {
    short: result.short || '',
    medium: result.medium || '',
  };
}
