
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

export type AppView = 'landing' | 'home' | 'history' | 'profile';

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

// ─── Outreach Types ───────────────────────────────────────────────────────────

export interface CompanyInfo {
  name: string;
  website?: string;
  description?: string;
  contactName?: string;
  contactEmail?: string;
}

export interface UserBackground {
  name: string;
  currentTitle: string;
  summary: string;
  topSkills: string[];
}

export type OutreachEmailType = 'initial' | 'follow_up_1' | 'follow_up_2';

export interface OutreachEmail {
  subject: string;
  body: string;
  sendAfterDays: number;
  type: OutreachEmailType;
}

export type OutreachStatus =
  | 'Research'
  | 'Draft'
  | 'Sent Email 1'
  | 'Sent Email 2'
  | 'Sent Email 3'
  | 'Replied'
  | 'Closed';

export interface EmailSequence {
  companyInfo: CompanyInfo;
  emails: OutreachEmail[];
  notionPageId?: string;
  gmailThreadId?: string;
  status: OutreachStatus;
  createdAt: number;
}
