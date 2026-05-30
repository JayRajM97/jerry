
export interface CVSection {
  id: string;
  title: string;
  htmlContent: string;
  optimizedHtmlContent?: string;
}

export interface Suggestion {
  id: string;
  sectionId: string;
  originalHtml: string;
  suggestedHtml: string;
  reason: string;
  rationaleDetails: {
    matchedKeywords: string[];
    improvedComponent: 'skills' | 'responsibilities' | 'tooling' | 'clarity';
    riskCheck: 'safe' | 'needs_confirmation';
  };
  applied: boolean;
}

export interface ATSBreakdown {
  required_skills: number;
  preferred_skills: number;
  tools: number;
  experience_years: number;
  title_relevance: number;
  responsibilities: number;
  quantified_impact: number;
  format_hygiene: number;
}

export interface MatchEvidence {
  jd_item: string;
  score: number;
  evidence: string[];
}

export interface ATSScore {
  total: number;
  band: string;
  breakdown: ATSBreakdown;
  missing_required_skills: string[];
  weak_signals: string[];
  matches_with_evidence: {
     required: MatchEvidence[];
     responsibilities: MatchEvidence[];
  };
  diagnostics: {
    missing_required_count: number;
    metric_bullets: number;
    format_flags: string[];
  };
  topImprovements: {
    label: string;
    suggestionId?: string;
  }[];
  parsedJd?: any;
  parsedCv?: any;
}

export enum RewriteMode {
  CONSERVATIVE = 'Conservative',
  BALANCED = 'Balanced',
  AGGRESSIVE = 'Aggressive'
}

export interface ProfileSuggestion {
  id: string;
  question: string;
  suggestedPoint: string;
  rationale: string;
}

export interface AnalysisData {
  sections: CVSection[];
  suggestions: Suggestion[];
  skippableContent: string[];
  profileSuggestions?: ProfileSuggestion[];
}

export interface HistoryItem {
  id: string;
  userId: string; // Added for DB ownership
  timestamp: number;
  jobTitle: string; 
  companyName?: string;
  jdText: string;
  originalCvHtml: string;
  optimizedCvHtml: string;
  topChoiceMessage?: string;
  wellfoundMessage?: string;
  introductionMessage?: string;
  scores: {
    original: ATSScore | null;
    optimized: ATSScore | null;
  };
  analysisData: AnalysisData;
}

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string;
}

// --- Auto-Apply ---

// Extra applicant data Greenhouse forms require that the CV/profile doesn't cover.
// AI must never guess these (work authorization, location); they gate auto-submit.
export interface ApplicationProfile {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  location: string;          // "City, Country"
  workAuthorized: boolean | null;     // authorized to work in the role's country
  needsVisaSponsorship: boolean | null;
  linkedinUrl: string;
  githubUrl: string;
  portfolioUrl: string;
  gender: string;            // used if a posting asks; empty = let demographics setting decide
  currentCompensation: string;
  expectedCompensation: string;
  noticePeriod: string;
  aiShowcaseLink: string;    // for "share a link where you leverage AI"-style questions
  yearsExperience: string;   // e.g. "6.5"
  industry: string;          // preferred label, e.g. "SaaS / internet" — agent may override to "consumer tech" when posting fits
  resumePath: string;        // absolute path on disk to the actual resume PDF (used by auto-apply instead of rendering from HTML)
  // EEO/demographic questions (race/veteran/disability); default to declining.
  declineDemographics: boolean;
}

export type ApplyStatus = 'submitted' | 'dry_run' | 'aborted' | 'error';

export interface ApplyResult {
  status: ApplyStatus;
  jobTitle?: string;
  company?: string;
  boardToken?: string;
  jobId?: string;
  // Reasons the run stopped before submitting (e.g. missing required answers, captcha).
  blockers?: string[];
  // Base64 PNG of the final page state.
  screenshot?: string;
  // Per-field log of what got filled (no file inputs). Used for the per-posting audit entry.
  answers?: { name: string; label: string; value: string }[];
}

export interface ApplicationLogEntry {
  id: string;
  userId: string;
  boardToken: string;
  jobId: string;
  jobTitle: string;
  company: string;
  status: ApplyStatus;
  timestamp: number;
  answers: { name: string; label: string; value: string }[];
}

export interface ApplyProgress {
  type: 'progress' | 'result' | 'error';
  step?: string;
  message?: string;
  result?: ApplyResult;
}

export type AppView = 'workspace' | 'history' | 'profile';

export interface AppState {
  originalSections: CVSection[];
  suggestions: Suggestion[];
  skippableContent: string[];
  profileSuggestions: ProfileSuggestion[];
  currentScore: ATSScore | null;
  suggestedScore: ATSScore | null;
  topChoiceMessage: string;
  wellfoundMessage: string;
  mode: RewriteMode;
  isLoading: boolean;
  loadingStep: string;
}
