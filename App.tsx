
import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  CVSection,
  Suggestion,
  ATSScore,
  RewriteMode,
  AppState,
  HistoryItem,
  AppView,
  UserProfile,
  ApplicationProfile
} from './types';
import { Copy, Check, RefreshCw, Sparkles, Moon, Sun, X, CheckCircle2, Circle } from 'lucide-react';
import { 
  analyzeResume, 
  calculateATSScore,
  generateTopChoiceMessage,
  generateWellfoundMessage,
  generateIntroduction
} from './services/geminiService';
import { authService } from './services/authService';
import type { SignInIdentity } from './services/authService';
import { databaseService } from './services/databaseService';
import { SAMPLE_CV, SAMPLE_JD } from './constants';
import ATSScoreCard from './components/ATSScoreCard';
import RichEditor from './components/RichEditor';
import RationalePanel from './components/RationalePanel';
import LoginScreen from './components/LoginScreen';
import AutoApplyPanel from './components/AutoApplyPanel';
import ApplicationProfileForm from './components/ApplicationProfileForm';
import * as pdfjs from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { docxToHtml, pdfToHtml } from './utils/importResume';
import { resumeHtmlToDocxBlob } from './utils/htmlToDocx';
import { applySuggestions, locateSuggestions } from './utils/applySuggestions';
import { usePageFit, ensureResumeThemeStyle } from './utils/pageFit';
import { buildResumeFilename } from './shared/resumeFilename';
import { exportResumePdf, triggerDownload } from './services/exportService';
import PageFitBadge from './components/PageFitBadge';

// PDF.js worker ships with the app bundle rather than being fetched from a CDN at runtime.
pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const App: React.FC = () => {
  // --- Auth State ---
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);

  // --- Persistent Data State (Fetched from DB) ---
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [masterCvHtml, setMasterCvHtml] = useState<string>('');
  const [applicationProfile, setApplicationProfile] = useState<ApplicationProfile | null>(null);
  const [submittedKeys, setSubmittedKeys] = useState<string[]>([]);

  // --- View State ---
  const [currentView, setCurrentView] = useState<AppView>('workspace');
  
  // --- Workspace State ---
  const [cvHtml, setCvHtml] = useState('');
  const [jdText, setJdText] = useState('');
  
  // New state for the "final" edited HTML in the preview tab
  const [finalPreviewHtml, setFinalPreviewHtml] = useState('');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Company the current application targets. Fills from the job URL fetch or the
  // JD parse; the user can correct it. It names the exported file.
  const [targetCompany, setTargetCompany] = useState('');
  // Suggestions whose quoted original could not be located in the resume HTML.
  const [unmatchedSuggestionIds, setUnmatchedSuggestionIds] = useState<string[]>([]);
  const [isExporting, setIsExporting] = useState(false);

  // Shared resume stylesheet (also used by the PDF renderer) must be present
  // before anything measures or displays a resume.
  useEffect(() => { ensureResumeThemeStyle(); }, []);

  const [isDarkMode, setIsDarkMode] = useState(() => {
    const saved = localStorage.getItem('darkMode');
    return saved === 'true' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches);
  });

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('darkMode', 'true');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('darkMode', 'false');
    }
  }, [isDarkMode]);

  const toastTimer = useRef<number | null>(null);
  const showToast = (msg: string, ms = 3500) => {
    setToastMessage(msg);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToastMessage(null), ms);
  };

  const [state, setState] = useState<AppState>({
    originalSections: [],
    suggestions: [],
    skippableContent: [],
    profileSuggestions: [],
    currentScore: null,
    suggestedScore: null,
    topChoiceMessage: '',
    wellfoundMessage: '',
    introductionMessage: '',
    mode: RewriteMode.BALANCED,
    isLoading: false,
    loadingStep: ''
  });

  const [activeTab, setActiveTab] = useState<'input' | 'analyze' | 'preview'>('input');
  const [inputMethod, setInputMethod] = useState<'upload' | 'paste'>('paste');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- INITIALIZATION ---
  useEffect(() => {
    const initApp = async () => {
      // 1. Init Database Schema
      await databaseService.initDB();

      // 2. Check Auth
      const currentUser = await authService.getCurrentUser();
      setUser(currentUser);
      setIsAuthLoading(false);

      if (currentUser) {
        loadUserData(currentUser.id, currentUser);
      }
    };
    initApp();
  }, []);

  // The app has no real identity provider, so "owner" just means the email the
  // seeded resume and profile belong to. Anyone else starts from a blank profile
  // rather than inheriting these details into their job applications.
  const OWNER_EMAIL = 'jayraj.mka@gmail.com';
  const isOwnerEmail = (email?: string | null) =>
    (email || '').trim().toLowerCase() === OWNER_EMAIL;

  const makeDefaultProfile = (u: UserProfile | null): ApplicationProfile => {
    if (isOwnerEmail(u?.email)) {
      return {
        firstName: 'Jayraj',
        lastName: 'Makhar',
        email: 'jayraj.mka@gmail.com',
        phone: '+919993639957',
        location: 'Bangalore, India',
        workAuthorized: true,          // authorized in India; set false when applying to US roles
        needsVisaSponsorship: false,   // no sponsorship needed in India; true for US roles
        linkedinUrl: 'https://linkedin.com/in/jayrajmakhar',
        githubUrl: 'https://github.com/JayRajM97',
        portfolioUrl: 'https://jayrajmakhar.com',
        gender: 'Male',
        currentCompensation: '32.5L base + 40L ESOPs',
        expectedCompensation: '40L + Variable',
        noticePeriod: 'Immediately available — 0 days notice',
        aiShowcaseLink: 'https://shopos.ai',
        yearsExperience: '6.5',
        industry: 'SaaS / internet',
        // Empty on purpose: auto-apply renders the resume PDF from the CV HTML.
        // A local absolute path does not exist on the deployed server.
        resumePath: '',
        declineDemographics: true,
      };
    }

    const nameParts = (u?.name || '').trim().split(/\s+/).filter(Boolean);
    return {
      firstName: nameParts[0] || '',
      lastName: nameParts.slice(1).join(' '),
      email: u?.email || '',
      phone: '',
      location: '',
      // null, not false: the answer agent is told never to guess work
      // authorization, so it leaves these blank instead of asserting something
      // untrue on a real application.
      workAuthorized: null,
      needsVisaSponsorship: null,
      linkedinUrl: '',
      githubUrl: '',
      portfolioUrl: '',
      gender: '',
      currentCompensation: '',
      expectedCompensation: '',
      noticePeriod: '',
      aiShowcaseLink: '',
      yearsExperience: '',
      industry: '',
      resumePath: '',
      declineDemographics: true,
    };
  };

  const loadUserData = async (userId: string, forUser: UserProfile | null) => {
    // Parallel data fetching
    const [fetchedHistory, fetchedMaster, fetchedAppProfile, fetchedSubmitted] = await Promise.all([
      databaseService.getHistory(userId),
      databaseService.getMasterCV(userId),
      databaseService.getApplicationProfile(userId),
      databaseService.getSubmittedKeys(userId)
    ]);

    // Only the owner's account is seeded with the bundled resume. Everyone else
    // starts empty and uploads or pastes their own, which then persists as their
    // master. Scoping the legacy-sample reset to the owner too means it can never
    // clobber someone else's saved resume.
    const seedMaster = isOwnerEmail(forUser?.email) ? SAMPLE_CV : '';
    const isLegacySample = !!seedMaster && !!fetchedMaster
      && /TechGrow|CreativeAgencies|Growth Marketing Manager/i.test(fetchedMaster);
    const effectiveMaster = (!fetchedMaster || isLegacySample) ? seedMaster : fetchedMaster;
    if (isLegacySample) {
      try { await databaseService.saveMasterCV(userId, seedMaster); } catch { /* localStorage fallback handles it */ }
    }

    setHistory(fetchedHistory);
    setMasterCvHtml(effectiveMaster);
    setSubmittedKeys(fetchedSubmitted);
    // If saved profile is empty (no name/email), seed it with Jay's real data.
    const isEmptyProfile = !fetchedAppProfile || (!fetchedAppProfile.firstName && !fetchedAppProfile.email);
    const effectiveProfile = isEmptyProfile ? makeDefaultProfile(forUser) : fetchedAppProfile;
    if (isEmptyProfile) {
      try { await databaseService.saveApplicationProfile(userId, effectiveProfile); } catch { /* ok */ }
    }
    setApplicationProfile(effectiveProfile);

    // Restore whatever this user last uploaded or pasted; only fall back to their
    // master (or the seed) when there is no saved draft.
    const workingCv = databaseService.getWorkingCV(userId);
    if (!cvHtml) setCvHtml(workingCv || effectiveMaster);
  };

  /**
   * Remember the resume the user is working with, keyed to them.
   *
   * Also adopts it as their master when they do not have one yet: a person whose
   * first action is to paste their resume clearly means that to be their resume.
   * It never overwrites an existing master, so a tailored per-application version
   * cannot degrade the canonical one.
   */
  const rememberWorkingCV = useCallback((html: string) => {
    setCvHtml(html);
    if (!user || !html.trim()) return;
    databaseService.saveWorkingCV(user.id, html);
    if (!masterCvHtml.trim()) {
      setMasterCvHtml(html);
      databaseService.saveMasterCV(user.id, html).catch(() => { /* local fallback handles it */ });
    }
  }, [user, masterCvHtml]);

  // --- AUTH HANDLERS ---
  const handleLogin = async (identity: SignInIdentity) => {
    setIsAuthLoading(true);
    try {
      const newUser = await authService.signInWithGoogle(identity);
      setUser(newUser);
      await loadUserData(newUser.id, newUser);
    } catch (e) {
      console.error("Login failed", e);
      alert("Login failed. Please try again.");
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    await authService.signOut();
    setUser(null);
    setHistory([]);
    setMasterCvHtml('');
    setCvHtml('');
    setApplicationProfile(null);
    setSubmittedKeys([]);
  };

  const saveApplicationProfile = async (profile: ApplicationProfile) => {
    setApplicationProfile(profile);
    if (user) await databaseService.saveApplicationProfile(user.id, profile);
  };

  const handleApplyResult = async (result: import('./types').ApplyResult) => {
    if (!user || !result.boardToken || !result.jobId) return;
    // Persist per-posting Q+A audit (no cross-company reuse).
    await databaseService.saveApplicationLog({
      id: `${Date.now()}`,
      userId: user.id,
      boardToken: result.boardToken,
      jobId: result.jobId,
      jobTitle: result.jobTitle || '',
      company: result.company || '',
      status: result.status,
      timestamp: Date.now(),
      answers: result.answers || [],
    });
    // Dedupe only after a real submit.
    if (result.status === 'submitted') {
      setSubmittedKeys(prev => [...prev, `${result.boardToken}/${result.jobId}`]);
      await databaseService.recordSubmitted(user.id, result.boardToken, result.jobId);
    }
  };


  // --- Helper Functions ---
  
  const extractJobTitle = (text: string): string => {
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    const explicitLine = lines.find(l => /^(job title|role|position):/i.test(l));
    if (explicitLine) return explicitLine.replace(/^(job title|role|position):/i, '').trim();
    return lines[0]?.length < 60 ? lines[0] : "Untitled Position";
  };

  const saveToHistory = async (
    currentSections: CVSection[], 
    currentSuggestions: Suggestion[],
    currentSkippable: string[],
    currentProfileSuggestions: any[],
    scoreOriginal: ATSScore | null,
    scoreOptimized: ATSScore | null,
    topChoiceMsg: string,
    wellfoundMsg: string,
    introMsg: string
  ) => {
    if (!user) return;

    const finalHtml = applySuggestions(cvHtml, currentSuggestions).html;
    
    const newItem: HistoryItem = {
      id: Date.now().toString(),
      userId: user.id,
      timestamp: Date.now(),
      jobTitle: extractJobTitle(jdText),
      companyName: targetCompany,
      jdText: jdText,
      originalCvHtml: cvHtml,
      optimizedCvHtml: finalHtml,
      topChoiceMessage: topChoiceMsg,
      wellfoundMessage: wellfoundMsg,
      introductionMessage: introMsg,
      scores: {
        original: scoreOriginal,
        optimized: scoreOptimized
      },
      analysisData: {
        sections: currentSections,
        suggestions: currentSuggestions,
        skippableContent: currentSkippable,
        profileSuggestions: currentProfileSuggestions
      }
    };
    
    // Optimistic Update
    setHistory(prev => [newItem, ...prev]);
    
    // Async DB Save
    await databaseService.saveHistoryItem(user.id, newItem);
  };

  const loadHistoryItem = (item: HistoryItem) => {
    setCvHtml(item.originalCvHtml);
    setJdText(item.jdText);
    setState({
      originalSections: item.analysisData.sections,
      suggestions: item.analysisData.suggestions,
      skippableContent: item.analysisData.skippableContent || [],
      profileSuggestions: item.analysisData.profileSuggestions || [],
      currentScore: item.scores.original,
      suggestedScore: item.scores.optimized,
      topChoiceMessage: item.topChoiceMessage || '',
      wellfoundMessage: item.wellfoundMessage || '',
      introductionMessage: item.introductionMessage || '',
      mode: RewriteMode.BALANCED,
      isLoading: false,
      loadingStep: ''
    });
    setFinalPreviewHtml(item.optimizedCvHtml);
    setTargetCompany(item.companyName || '');
    setCurrentView('workspace');
    setActiveTab('analyze');
  };

  const startNewApplication = () => {
    setCvHtml(masterCvHtml);
    setJdText('');
    setFinalPreviewHtml('');
    setTargetCompany('');
    setUnmatchedSuggestionIds([]);
    setState({
      originalSections: [],
      suggestions: [],
      skippableContent: [],
      profileSuggestions: [],
      currentScore: null,
      suggestedScore: null,
      topChoiceMessage: '',
      wellfoundMessage: '',
      mode: RewriteMode.BALANCED,
      isLoading: false,
      loadingStep: ''
    });
    setActiveTab('input');
    setCurrentView('workspace');
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, target: 'workspace' | 'profile') => {
    const file = e.target.files?.[0];
    if (!file) return;

    setState(prev => ({ ...prev, isLoading: true, loadingStep: `Parsing ${file.name}` }));
    
    try {
      const arrayBuffer = await file.arrayBuffer();
      let parsedHtml = '';

      const lower = file.name.toLowerCase();
      if (lower.endsWith('.docx')) {
        parsedHtml = await docxToHtml(arrayBuffer);
      } else if (lower.endsWith('.pdf')) {
        const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
        parsedHtml = await pdfToHtml(pdf as any);
      } else {
        alert("Unsupported file format");
        setState(prev => ({ ...prev, isLoading: false }));
        return;
      }

      if (target === 'profile') {
        setMasterCvHtml(parsedHtml);
        if (user) {
            await databaseService.saveMasterCV(user.id, parsedHtml);
        }
        alert("Master Resume Updated!");
      } else {
        rememberWorkingCV(parsedHtml);
        setInputMethod('paste');
        alert("Resume loaded for this application.");
      }
      
      setState(prev => ({ ...prev, isLoading: false }));
    } catch (err) {
      console.error(err);
      alert("Failed to read file.");
      setState(prev => ({ ...prev, isLoading: false }));
    }
  };

  const updateMasterCV = async (newHtml: string) => {
      setMasterCvHtml(newHtml);
      if (user) {
          // Debounce could be added here in a real app
          await databaseService.saveMasterCV(user.id, newHtml);
      }
  };

  const hashString = (str: string) => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(16);
  };

  const handleGenerate = async () => {
    if (!cvHtml || !jdText) return;
    
    setState(prev => ({ ...prev, isLoading: true, loadingStep: 'Starting' }));
    try {
      setState(prev => ({ ...prev, loadingStep: 'Evaluating match' }));
      const currentScore = await calculateATSScore(cvHtml, jdText);
      if (!targetCompany.trim() && currentScore?.parsedJd?.company) {
        setTargetCompany(String(currentScore.parsedJd.company));
      }
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      setState(prev => ({ ...prev, loadingStep: 'Optimizing phrasing' }));
      const { sections, suggestions, skippableContent, profileSuggestions } = await analyzeResume(
        cvHtml, 
        jdText, 
        state.mode,
        currentScore.missing_required_skills || [],
        currentScore.weak_signals || []
      );

      // Generate Top Choice Message and Wellfound Message in parallel
      setState(prev => ({ ...prev, loadingStep: 'Drafting messages' }));
      const [topChoiceMsg, wellfoundMsg, introMsg] = await Promise.all([
        generateTopChoiceMessage(cvHtml, jdText),
        generateWellfoundMessage(cvHtml, jdText),
        generateIntroduction(currentScore.parsedCv, currentScore.parsedJd)
      ]);

      let appliedSuggestions = suggestions.map(s => ({ ...s, applied: true }));
      // Score what will actually ship: the user's HTML with the suggestions applied
      // in place, not the model's rewritten sections.
      let optimizedFullHtml = applySuggestions(cvHtml, appliedSuggestions).html;
      
      await new Promise(resolve => setTimeout(resolve, 1500));

      setState(prev => ({ ...prev, loadingStep: 'Finalizing scores' }));
      let suggestedScore = await calculateATSScore(
        optimizedFullHtml,
        jdText,
        currentScore.parsedJd
      );

      // --- INSTRUMENTATION ---
      const hashInitialText = hashString(cvHtml);
      const hashOptimizedText = hashString(optimizedFullHtml);
      const hashInitialJson = hashString(JSON.stringify(currentScore.parsedCv || {}));
      const hashOptimizedJson = hashString(JSON.stringify(suggestedScore.parsedCv || {}));
      
      console.log("--- INSTRUMENTATION ---");
      console.log("hash(initial_resume_text):", hashInitialText);
      console.log("hash(optimized_resume_text):", hashOptimizedText);
      console.log("hash(initial_resume_json):", hashInitialJson);
      console.log("hash(optimized_resume_json):", hashOptimizedJson);
      
      if (hashInitialText === hashOptimizedText) {
          console.warn("Pipeline is not applying optimization (texts are identical).");
      }
      if (hashInitialJson === hashOptimizedJson) {
          console.warn("Pipeline is not applying optimization (JSONs are identical).");
      }

      // --- REGRESSION GUARDRAIL ---
      let attempts = 0;
      while (suggestedScore.total < currentScore.total && attempts < 2) {
         attempts++;
         setState(prev => ({ ...prev, loadingStep: `Fixing score regression (Attempt ${attempts})...` }));
         
         // Revert all suggestions to ensure monotonicity
         appliedSuggestions = appliedSuggestions.map(s => ({ ...s, applied: false }));
         optimizedFullHtml = cvHtml;
         
         suggestedScore = await calculateATSScore(optimizedFullHtml, jdText, currentScore.parsedJd);
      }

      if (suggestedScore.total < currentScore.total) {
         // Hard fallback
         suggestedScore = currentScore;
         optimizedFullHtml = cvHtml;
         appliedSuggestions = appliedSuggestions.map(s => ({ ...s, applied: false }));
         console.warn("Score regression guardrail triggered: Reverted to initial score.");
      }

      // --- SAVE HISTORY ---
      await saveToHistory(sections, appliedSuggestions, skippableContent, profileSuggestions, currentScore, suggestedScore, topChoiceMsg, wellfoundMsg, introMsg);
      // --------------------

      setState(prev => ({
        ...prev,
        originalSections: sections,
        suggestions: appliedSuggestions,
        skippableContent,
        profileSuggestions,
        currentScore,
        suggestedScore,
        topChoiceMessage: topChoiceMsg,
        wellfoundMessage: wellfoundMsg,
        introductionMessage: introMsg,
        isLoading: false
      }));
      setActiveTab('analyze');
    } catch (error: any) {
      console.error("Analysis failed", error);
      setState(prev => ({ ...prev, isLoading: false }));
      alert("Analysis failed. Please try again.");
    }
  };

  const updateSuggestionText = (id: string, newHtml: string) => {
    setState(s => ({
      ...s,
      suggestions: s.suggestions.map(sg => sg.id === id ? { ...sg, suggestedHtml: newHtml } : sg)
    }));
  };

  const toggleSuggestion = (id: string, applied?: boolean) => {
    setState(s => ({
      ...s,
      suggestions: s.suggestions.map(sg =>
        sg.id === id ? { ...sg, applied: applied ?? !sg.applied } : sg
      ),
    }));
  };

  const setAllSuggestions = (applied: boolean) => {
    setState(s => ({
      ...s,
      suggestions: s.suggestions.map(sg => ({ ...sg, applied })),
    }));
  };

  // Save the tailored CV to the master, set it as the active workspace CV (used by
  // AutoApplyPanel + server PDF render), and jump to the Input tab where the auto-apply lives.
  const handleUseForAutoApply = async () => {
    const finalHtml = finalPreviewHtml || cvHtml;
    if (!finalHtml) {
      showToast('No CV content to save yet.');
      return;
    }
    await updateMasterCV(finalHtml);
    setCvHtml(finalHtml);
    setActiveTab('input');
    showToast('Saved. Paste a job URL below to auto-apply with this CV.');
    setTimeout(() => {
      document.getElementById('auto-apply-anchor')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  };

  // The final CV is the user's own HTML with accepted suggestions swapped in
  // element by element. Nothing else is regenerated, so formatting survives.
  useEffect(() => {
    if (!cvHtml) {
      setFinalPreviewHtml('');
      setUnmatchedSuggestionIds([]);
      return;
    }
    if (state.suggestions.length === 0) {
      setFinalPreviewHtml(cvHtml);
      setUnmatchedSuggestionIds([]);
      return;
    }
    setFinalPreviewHtml(applySuggestions(cvHtml, state.suggestions).html);
    setUnmatchedSuggestionIds(locateSuggestions(cvHtml, state.suggestions).unmatchedIds);
  }, [state.suggestions, cvHtml]);

  // Live one-page measurement of what the preview shows, using the PDF's own layout rules.
  const previewFit = usePageFit(finalPreviewHtml || cvHtml);

  const resumeFilename = (ext: 'pdf' | 'docx') => {
    const [fallbackFirst = '', ...fallbackRest] = (user?.name || '').trim().split(/\s+/);
    return buildResumeFilename({
      firstName: applicationProfile?.firstName || fallbackFirst,
      lastName: applicationProfile?.lastName || fallbackRest.join(' '),
      company: targetCompany,
      ext,
    });
  };

  const handleDownloadPDF = async () => {
    const html = finalPreviewHtml || cvHtml;
    if (!html.trim()) {
      showToast('Nothing to export yet.');
      return;
    }
    setIsExporting(true);
    try {
      const out = await exportResumePdf(html, resumeFilename('pdf'));
      triggerDownload(out.blob, out.filename);
      if (!out.fits) {
        showToast(`Saved ${out.filename} — still ${out.pages} pages even at minimum size. Trim a few lines.`, 6000);
      } else if (out.scale < 1) {
        showToast(`Saved ${out.filename} — shrunk to ${Math.round(out.scale * 100)}% to fit one page.`, 5000);
      } else {
        showToast(`Saved ${out.filename} — one page.`);
      }
    } catch (e: any) {
      showToast(e?.message || 'PDF export failed.', 6000);
    } finally {
      setIsExporting(false);
    }
  };

  const handleDownloadDOCX = async () => {
    const html = finalPreviewHtml || cvHtml;
    if (!html.trim()) {
      showToast('Nothing to export yet.');
      return;
    }
    try {
      // Real Word paragraphs (not an HTML altChunk), so ATS parsers can read it.
      const blob = await resumeHtmlToDocxBlob(html);
      const name = resumeFilename('docx');
      triggerDownload(blob, name);
      showToast(`Saved ${name}.`);
    } catch (e) {
      console.error('DOCX Generation Error:', e);
      showToast('Error creating DOCX file.', 6000);
    }
  };

  // --- RENDERING ---

  if (isAuthLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-white dark:bg-[#141414]">
        <div className="uber-loader border-gray-200 border-t-black"></div>
      </div>
    );
  }

  if (!user) {
    return <LoginScreen onLogin={handleLogin} isLoading={isAuthLoading} />;
  }

  return (
    <div className="h-screen flex flex-col bg-white dark:bg-black overflow-hidden">
      {/* Uber Base Header */}
      <header className="bg-black dark:bg-black dark:border-b dark:border-[#333333] text-white h-16 flex items-center px-8 shrink-0 z-50 no-print justify-between">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-4 cursor-pointer" onClick={startNewApplication}>
            <div className="bg-white dark:bg-black text-black dark:text-white border dark:border-white font-bold px-3 py-1 text-base">JM</div>
            <h1 className="text-lg font-bold tracking-tight">Jerry Maguire</h1>
          </div>
          
          <div className="h-8 w-px bg-gray-800 mx-2"></div>

          <nav className="flex gap-1">
             <button 
                onClick={startNewApplication}
                className={`px-4 py-2 text-xs font-bold uppercase tracking-widest rounded transition-colors ${currentView === 'workspace' && activeTab === 'input' && state.originalSections.length === 0 ? 'bg-gray-800 text-white' : 'text-gray-400 hover:text-white'}`}
             >
                + New App
             </button>
             <button 
                onClick={() => setCurrentView('history')}
                className={`px-4 py-2 text-xs font-bold uppercase tracking-widest rounded transition-colors ${currentView === 'history' ? 'bg-gray-800 text-white' : 'text-gray-400 hover:text-white'}`}
             >
                History
             </button>
          </nav>
        </div>

        <div className="flex items-center gap-6">
            <button 
              onClick={() => setIsDarkMode(!isDarkMode)}
              className="p-2 rounded-full text-gray-400 hover:text-white transition-colors"
              title="Toggle Dark Mode"
            >
              {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
            </button>
            <button 
                onClick={() => setCurrentView('profile')}
                className={`flex items-center gap-2 px-4 py-2 text-xs font-bold uppercase tracking-widest rounded transition-colors ${currentView === 'profile' ? 'bg-white text-black dark:bg-[#141414] dark:text-white' : 'text-gray-400 hover:text-white'}`}
             >
                <span className="text-lg">👤</span> Profile
             </button>
             
             <div className="h-8 w-px bg-gray-800 mx-2"></div>
             
             <div className="flex items-center gap-3 group relative cursor-pointer">
                <img src={user.avatarUrl} alt={user.name} className="w-8 h-8 rounded-full border border-gray-700" />
                <div className="absolute top-full right-0 mt-2 w-48 bg-white dark:bg-[#141414] text-black dark:text-white shadow-xl border border-gray-200 dark:border-[#333333] hidden group-hover:block rounded z-50">
                    <div className="p-4 border-b border-gray-100 dark:border-[#333333]">
                        <p className="font-bold text-sm">{user.name}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{user.email}</p>
                    </div>
                    <button onClick={handleLogout} className="w-full text-left px-4 py-3 text-sm hover:bg-gray-50 dark:hover:bg-[#1F1F1F] text-red-600 dark:text-red-400 font-bold">Sign Out</button>
                </div>
             </div>
        </div>
      </header>
      
      {/* SUB-HEADER FOR WORKSPACE NAVIGATION (Only visible in Workspace view) */}
      {currentView === 'workspace' && (
        <div className="bg-white dark:bg-black border-b border-gray-200 dark:border-[#333333] px-8 h-12 flex items-center justify-center shrink-0">
          {[
            { id: 'input', label: '1. Input' },
            { id: 'analyze', label: '2. Analyze' },
            { id: 'preview', label: '3. Preview' },
          ].map(tab => (
            <button 
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-8 h-full flex items-center text-xs font-bold uppercase tracking-widest border-b-2 transition-all ${activeTab === tab.id ? 'border-black dark:border-white text-black dark:text-white' : 'border-transparent text-gray-400 hover:text-gray-600 dark:hover:text-gray-200'}`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {/* Toast Notification (all views) */}
      {toastMessage && (
        <div className="fixed bottom-8 left-8 bg-black dark:bg-white text-white dark:text-black px-6 py-4 rounded shadow-2xl z-[60] flex items-center gap-3 max-w-xl">
          <Check size={18} className="text-green-400 shrink-0" />
          <span className="text-sm font-bold tracking-wide">{toastMessage}</span>
        </div>
      )}

      <main className="flex-1 flex flex-col overflow-hidden bg-[#F9F9F9] dark:bg-[#0A0A0A]">
        
        {/* === HISTORY VIEW === */}
        {currentView === 'history' && (
           <div className="p-12 max-w-6xl mx-auto w-full h-full overflow-y-auto">
              <h2 className="text-3xl font-bold mb-8">Application History</h2>
              {history.length === 0 ? (
                  <div className="text-center py-20 text-gray-400 dark:text-gray-500">
                      <p className="mb-4 text-xl">No history yet.</p>
                      <button onClick={startNewApplication} className="uber-button-primary">Start First Application</button>
                  </div>
              ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {history.map(item => (
                          <div key={item.id} className="uber-card p-6 flex flex-col h-64 hover:shadow-lg transition-shadow cursor-pointer group" onClick={() => loadHistoryItem(item)}>
                              <div className="flex-1">
                                  <p className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-2">
                                      {new Date(item.timestamp).toLocaleDateString()} • {new Date(item.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                  </p>
                                  <h3 className="text-xl font-bold mb-2 line-clamp-2">{item.jobTitle}</h3>
                                  <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-3">{item.jdText}</p>
                              </div>
                              <div className="mt-4 pt-4 border-t border-gray-100 dark:border-[#333333] flex justify-between items-end">
                                  <div>
                                      <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500">Score</p>
                                      <p className="text-2xl font-bold text-blue-600">{item.scores.optimized?.total || 'N/A'}</p>
                                  </div>
                                  <span className="text-xs font-bold underline group-hover:text-blue-600">Open &rarr;</span>
                              </div>
                          </div>
                      ))}
                  </div>
              )}
           </div>
        )}

        {/* === PROFILE VIEW === */}
        {currentView === 'profile' && (
           <div className="p-12 max-w-5xl mx-auto w-full h-full overflow-y-auto flex flex-col gap-8">
              <div className="flex justify-between items-end shrink-0">
                  <div>
                    <h2 className="text-3xl font-bold mb-2">Master Resume</h2>
                    <p className="text-gray-500 dark:text-gray-400">This resume will be used as the starting point for all new applications.</p>
                  </div>
                  <div className="relative">
                     <button onClick={() => fileInputRef.current?.click()} className="uber-button-secondary text-xs uppercase tracking-widest font-bold">Import from File</button>
                     <input type="file" ref={fileInputRef} hidden accept=".docx,.pdf" onChange={(e) => handleFileUpload(e, 'profile')} />
                  </div>
              </div>
              <div className="uber-card overflow-hidden flex flex-col min-h-[400px]">
                   <RichEditor
                      content={masterCvHtml}
                      onChange={updateMasterCV}
                      className="h-full w-full border-0"
                      viewMode="fluid"
                   />
              </div>
              {applicationProfile && (
                <ApplicationProfileForm value={applicationProfile} onSave={saveApplicationProfile} />
              )}
           </div>
        )}

        {/* === WORKSPACE VIEW === */}
        {currentView === 'workspace' && (
          <>
            {activeTab === 'input' && (
              <div className="flex-1 flex flex-col lg:flex-row p-6 gap-6 overflow-hidden no-print">
                {/* Left Column: Resume Editor */}
                <div className="flex-1 flex flex-col bg-white dark:bg-[#141414] border border-gray-200 dark:border-[#333333] shadow-sm min-h-0">
                  <div className="p-4 border-b border-gray-100 dark:border-[#333333] flex justify-between items-center shrink-0">
                      <h2 className="text-lg font-bold tracking-tight dark:text-white">Resume Content</h2>
                      <div className="flex bg-gray-100 dark:bg-[#141414] p-1">
                        <button onClick={() => setInputMethod('upload')} className={`px-4 py-1 text-[10px] font-bold tracking-widest ${inputMethod === 'upload' ? 'bg-white dark:bg-[#333333] text-black dark:text-white shadow-sm' : 'text-gray-400 dark:text-gray-500'}`}>FILE</button>
                        <button onClick={() => setInputMethod('paste')} className={`px-4 py-1 text-[10px] font-bold tracking-widest ${inputMethod === 'paste' ? 'bg-white dark:bg-[#333333] text-black dark:text-white shadow-sm' : 'text-gray-400 dark:text-gray-500'}`}>EDIT</button>
                      </div>
                  </div>
                  
                  {inputMethod === 'upload' ? (
                      <div className="flex-1 flex flex-col items-center justify-center bg-gray-50 dark:bg-[#000000] p-12">
                        <p className="text-xs font-bold text-gray-400 mb-8 uppercase tracking-widest">Supports .docx and .pdf</p>
                        <button onClick={() => fileInputRef.current?.click()} className="uber-button-primary px-12 uppercase tracking-widest text-xs font-bold">SELECT FILE</button>
                        <input type="file" ref={fileInputRef} hidden accept=".docx,.pdf" onChange={(e) => handleFileUpload(e, 'workspace')} />
                      </div>
                  ) : (
                      <RichEditor content={cvHtml} onChange={rememberWorkingCV} className="flex-1 overflow-hidden" viewMode="fluid" />
                  )}
                </div>

                {/* Right Column: JD + Controls */}
                <div className="flex-1 flex flex-col min-h-0 gap-6">
                  <div className="flex-1 flex flex-col bg-white dark:bg-[#141414] border border-gray-200 dark:border-[#333333] shadow-sm min-h-0">
                    <div className="p-4 border-b border-gray-100 dark:border-[#333333] shrink-0">
                        <h2 className="text-lg font-bold tracking-tight dark:text-white">Job Description</h2>
                    </div>
                    <textarea 
                      className="flex-1 w-full uber-input resize-none text-sm leading-relaxed bg-white dark:bg-[#141414] dark:text-white border-0 focus:ring-0 p-4 font-mono"
                      value={jdText}
                      onChange={(e) => setJdText(e.target.value)}
                      placeholder="Paste the target JD here..."
                    />
                  </div>

                  <div className="bg-white dark:bg-[#141414] border border-gray-200 dark:border-[#333333] shadow-sm p-4 shrink-0 flex items-end gap-4 relative">
                    <div className="w-1/3 relative">
                        <div className="flex items-center gap-1 mb-2">
                          <p className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest">Mode</p>
                          <div className="group relative">
                              <span className="cursor-help text-gray-400 dark:text-gray-500 text-[10px]">ⓘ</span>
                              <div className="absolute bottom-full left-0 mb-2 w-48 hidden group-hover:block bg-black dark:bg-white text-white dark:text-black text-[10px] p-3 rounded shadow-lg z-50 leading-relaxed">
                                <strong className="block mb-1 text-white">Conservative:</strong> Minimal wording tweaks.
                                <strong className="block mb-1 text-white mt-2">Balanced:</strong> Improved phrasing & alignment.
                                <strong className="block mb-1 text-white mt-2">Aggressive:</strong> Stronger keywords & confidence.
                              </div>
                          </div>
                        </div>
                        <select 
                          value={state.mode}
                          onChange={(e) => setState(s => ({ ...s, mode: e.target.value as RewriteMode }))}
                          className="w-full bg-gray-50 dark:bg-[#141414] p-3 text-xs font-bold border border-gray-200 dark:border-[#333333] text-black dark:text-white uppercase tracking-widest outline-none focus:border-black dark:focus:border-white"
                        >
                          {Object.values(RewriteMode).map(m => <option key={m} value={m}>{m}</option>)}
                        </select>
                    </div>
                    <button 
                      onClick={handleGenerate}
                      disabled={state.isLoading}
                      className="uber-button-primary flex-1 h-[50px] uppercase tracking-[0.2em] font-bold text-xs"
                    >
                      {state.isLoading ? (
                        <div className="flex items-center gap-3">
                          <div className="uber-loader"></div>
                          <span>{state.loadingStep}...</span>
                        </div>
                      ) : 'ANALYZE MATCH'}
                    </button>
                  </div>

                  <div id="auto-apply-anchor" />
                  <AutoApplyPanel
                    profile={applicationProfile}
                    cvHtml={finalPreviewHtml || cvHtml}
                    jdText={jdText}
                    submittedKeys={submittedKeys}
                    onJobFetched={(jd, company) => { setJdText(jd); if (company) setTargetCompany(company); }}
                    onResult={handleApplyResult}
                    onEditProfile={() => setCurrentView('profile')}
                  />
                </div>
              </div>
            )}

            {activeTab === 'analyze' && (
              <div className="flex-1 overflow-auto bg-white dark:bg-[#141414] no-print relative scroll-smooth">
                <div className="p-8 md:p-12 max-w-[1600px] mx-auto w-full">
                  
                  {/* Top Section: Scores (50-50) */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-16">
                     <ATSScoreCard title="Initial Match" score={state.currentScore} highlightColor="#000000" />
                     <ATSScoreCard title="Optimized Match" score={state.suggestedScore} highlightColor="#276EF1" />
                  </div>

                  {/* Weak Signals & Missing Skills */}
                  {(state.suggestedScore?.weak_signals?.length > 0 || state.suggestedScore?.missing_required_skills?.length > 0) && (
                    <div className="mb-16 grid grid-cols-1 md:grid-cols-2 gap-8">
                      {state.suggestedScore?.missing_required_skills?.length > 0 && (
                        <div className="uber-card p-6 border-l-4 border-red-500">
                          <h4 className="font-bold text-xs uppercase tracking-widest text-red-600 mb-4">Missing Hard Skills</h4>
                          <ul className="space-y-2">
                            {state.suggestedScore.missing_required_skills.map((s, i) => (
                              <li key={i} className="text-sm text-gray-700 flex items-start gap-2">
                                <span className="text-red-500 mt-1">•</span> {s}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {state.suggestedScore?.weak_signals?.length > 0 && (
                        <div className="uber-card p-6 border-l-4 border-yellow-500">
                          <h4 className="font-bold text-xs uppercase tracking-widest text-yellow-600 mb-4">Weak Signals (Soft Traits)</h4>
                          <ul className="space-y-2">
                            {state.suggestedScore.weak_signals.map((s, i) => (
                              <li key={i} className="text-sm text-gray-700 flex items-start gap-2">
                                <span className="text-yellow-500 mt-1">•</span> {s}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="flex gap-16 items-start">
                    {/* Left Sidebar: TOC */}
                    <div className="hidden lg:block w-64 shrink-0 sticky top-8">
                       <h3 className="font-bold text-xs uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-6">Contents</h3>
                       <nav className="space-y-1 border-l-2 border-gray-100 dark:border-[#333333]">
                          {state.originalSections.map(sec => (
                             <a key={sec.id} href={`#sec-${sec.id}`} className="block pl-4 py-2 text-xs font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500 hover:text-black dark:hover:text-white hover:border-l-2 hover:border-black dark:hover:border-white -ml-[2px] transition-all truncate">
                                {sec.title}
                             </a>
                          ))}
                          {state.skippableContent.length > 0 && (
                             <a href="#sec-skippable" className="block pl-4 py-2 text-xs font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500 hover:text-red-600 dark:hover:text-red-400 hover:border-l-2 hover:border-red-600 dark:hover:border-red-400 -ml-[2px] transition-all truncate">
                                Skippable Content
                             </a>
                          )}
                          {state.profileSuggestions && state.profileSuggestions.length > 0 && (
                             <a href="#sec-profile-suggestions" className="block pl-4 py-2 text-xs font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500 hover:text-blue-600 dark:hover:text-blue-400 hover:border-l-2 hover:border-blue-600 dark:hover:border-blue-400 -ml-[2px] transition-all truncate">
                                High Impact Additions
                             </a>
                          )}
                          <a href="#sec-messages" className="block pl-4 py-2 text-xs font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500 hover:text-blue-600 dark:hover:text-blue-400 hover:border-l-2 hover:border-blue-600 dark:hover:border-blue-400 -ml-[2px] transition-all truncate">
                             Application Messages
                          </a>
                       </nav>
                       
                       {state.originalSections.length > 0 && (
                         <div className="mt-8 space-y-3">
                           <p className="font-bold text-[10px] uppercase tracking-widest text-gray-400 dark:text-gray-500">With accepted changes</p>
                           <PageFitBadge fit={previewFit} className="w-full justify-center" />
                           {unmatchedSuggestionIds.length > 0 && (
                             <p className="text-[10px] leading-relaxed text-amber-700 dark:text-amber-400">
                               {unmatchedSuggestionIds.length} suggestion{unmatchedSuggestionIds.length === 1 ? '' : 's'} could not be located in your resume and will not apply automatically. Copy the text in manually if you want {unmatchedSuggestionIds.length === 1 ? 'it' : 'them'}.
                             </p>
                           )}
                         </div>
                       )}

                       <button 
                          onClick={() => setActiveTab('preview')}
                          className="mt-8 w-full uber-button-primary py-4 font-bold tracking-[0.2em] text-[10px] uppercase shadow-xl hover:shadow-2xl transition-all transform hover:-translate-y-1"
                        >
                          PROCEED TO EDITOR
                       </button>

                       <button 
                          onClick={handleGenerate}
                          disabled={state.isLoading}
                          className="mt-4 w-full bg-white dark:bg-[#141414] border border-gray-200 dark:border-[#333333] text-gray-600 dark:text-gray-400 hover:text-black dark:hover:text-white hover:border-black dark:hover:border-white py-3 font-bold tracking-[0.2em] text-[10px] uppercase transition-all flex items-center justify-center gap-2"
                        >
                          <RefreshCw size={14} className={state.isLoading ? "animate-spin" : ""} />
                          {state.isLoading ? "Regenerating..." : "Regenerate Analysis"}
                       </button>
                    </div>

                    {/* Main Content: Centered & Wider */}
                    <div className="flex-1 min-w-0 space-y-24">
                       {state.originalSections.length === 0 ? (
                          <div className="space-y-8 opacity-60 pointer-events-none">
                            <div className="uber-card p-12 bg-white dark:bg-[#141414] flex flex-col items-center justify-center text-center">
                               <p className="text-gray-500">Analysis will appear here.</p>
                            </div>
                          </div>
                       ) : (
                         <>
                           {/* Render Sections */}
                           {state.originalSections.map(sec => {
                              const sectionSugs = state.suggestions.filter(s => s.sectionId === sec.id);
                              return (
                                <div id={`sec-${sec.id}`} key={sec.id} className="scroll-mt-8">
                                   <div className="uber-card overflow-hidden">
                                       <div className="bg-black dark:bg-black text-white px-8 py-4">
                                          <h4 className="font-bold uppercase tracking-widest text-[10px]">{sec.title}</h4>
                                       </div>
                                       <div className="p-8">
                                          {sectionSugs.length > 0 ? (
                                            <div className="space-y-12">
                                               <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400 -mt-4">
                                                 <span>{sectionSugs.filter(x => x.applied).length} / {sectionSugs.length} accepted in this section</span>
                                                 <div className="flex gap-3">
                                                   <button
                                                     onClick={() => sectionSugs.forEach(sg => toggleSuggestion(sg.id, true))}
                                                     className="text-green-700 dark:text-green-400 hover:underline"
                                                   >Accept all</button>
                                                   <button
                                                     onClick={() => sectionSugs.forEach(sg => toggleSuggestion(sg.id, false))}
                                                     className="text-gray-500 dark:text-gray-400 hover:underline"
                                                   >Reject all</button>
                                                 </div>
                                               </div>
                                               {sectionSugs.map(s => (
                                                 <div key={s.id} className={`border rounded-sm shadow-sm transition-all ${s.applied ? 'border-green-300 dark:border-green-800' : 'border-gray-200 dark:border-[#333333] opacity-60'}`}>
                                                    <div className={`p-6 space-y-4 ${s.applied ? 'bg-green-50/40 dark:bg-green-900/10' : 'bg-gray-50/50 dark:bg-[#141414]/50'}`}>
                                                       <div className="flex items-center justify-between gap-3">
                                                         <span className={`text-[10px] font-bold uppercase tracking-widest ${unmatchedSuggestionIds.includes(s.id) ? 'text-amber-700 dark:text-amber-400' : s.applied ? 'text-green-700 dark:text-green-400' : 'text-gray-400 dark:text-gray-500'}`}>
                                                           {unmatchedSuggestionIds.includes(s.id)
                                                             ? 'Not found in your resume — copy manually'
                                                             : s.applied ? 'Accepted — will appear in final CV' : 'Rejected — original kept'}
                                                         </span>
                                                         <div className="flex gap-2">
                                                           <button
                                                             onClick={() => toggleSuggestion(s.id, true)}
                                                             className={`flex items-center gap-1 px-3 py-1 text-[10px] font-bold uppercase tracking-widest border transition-colors ${s.applied ? 'bg-green-600 text-white border-green-600' : 'bg-white dark:bg-[#141414] text-gray-600 dark:text-gray-300 border-gray-200 dark:border-[#333333] hover:border-green-500'}`}
                                                           >
                                                             <Check size={12} /> Accept
                                                           </button>
                                                           <button
                                                             onClick={() => toggleSuggestion(s.id, false)}
                                                             className={`flex items-center gap-1 px-3 py-1 text-[10px] font-bold uppercase tracking-widest border transition-colors ${!s.applied ? 'bg-gray-800 text-white border-gray-800' : 'bg-white dark:bg-[#141414] text-gray-600 dark:text-gray-300 border-gray-200 dark:border-[#333333] hover:border-gray-500'}`}
                                                           >
                                                             <X size={12} /> Reject
                                                           </button>
                                                         </div>
                                                       </div>
                                                       <div className="diff-removed text-sm opacity-60">
                                                          <div dangerouslySetInnerHTML={{ __html: s.originalHtml }} />
                                                       </div>
                                                       <div className="relative group">
                                                          <div className="absolute -top-3 left-0 bg-green-100 text-green-800 text-[9px] px-2 py-0.5 font-bold uppercase tracking-widest rounded-r">Editable</div>
                                                          <div
                                                            className="diff-added text-sm outline-none p-3 -mx-3 rounded transition-all cursor-text focus:bg-white dark:focus:bg-[#1F1F1F] focus:ring-2 focus:ring-green-500/20"
                                                            contentEditable
                                                            suppressContentEditableWarning
                                                            onBlur={(e) => updateSuggestionText(s.id, e.currentTarget.innerHTML)}
                                                            dangerouslySetInnerHTML={{ __html: s.suggestedHtml }}
                                                          />
                                                       </div>
                                                    </div>
                                                    <RationalePanel suggestion={s} />
                                                 </div>
                                               ))}
                                            </div>
                                          ) : (
                                            <div className="text-black text-sm">
                                              <div dangerouslySetInnerHTML={{ __html: sec.htmlContent }} className="cv-content resume-root" />
                                              <div className="mt-8 pt-4 border-t border-gray-50 dark:border-[#333333] text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest">
                                                No optimizations needed.
                                              </div>
                                            </div>
                                          )}
                                       </div>
                                   </div>
                                </div>
                              );
                           })}

                           {/* Profile Suggestions (High Impact) */}
                           {state.profileSuggestions && state.profileSuggestions.length > 0 && (
                              <div id="sec-profile-suggestions" className="scroll-mt-8">
                                <div className="uber-card overflow-hidden border-2 border-blue-600 shadow-xl">
                                   <div className="bg-blue-600 text-white px-8 py-4 flex justify-between items-center">
                                      <div className="flex items-center gap-2">
                                        <Sparkles size={16} className="text-yellow-300" />
                                        <h4 className="font-bold uppercase tracking-widest text-[10px]">High Impact Additions</h4>
                                      </div>
                                      <span className="text-[10px] bg-white dark:bg-[#141414] text-blue-600 dark:text-blue-400 px-2 py-0.5 font-bold rounded">Score Boosters</span>
                                   </div>
                                   <div className="p-8 bg-blue-50/30 dark:bg-blue-900/10">
                                      <p className="text-xs text-gray-500 dark:text-gray-400 mb-6 font-medium">Based on your profile, adding these points (if true) could significantly boost your match score:</p>
                                      <div className="space-y-6">
                                        {state.profileSuggestions.map((item, idx) => (
                                          <div key={idx} className="bg-white dark:bg-[#141414] p-6 rounded border border-blue-100 dark:border-blue-900 shadow-sm">
                                            <p className="text-sm font-bold text-gray-800 dark:text-gray-200 mb-3 flex items-start gap-2">
                                              <span className="text-blue-600 dark:text-blue-400">Q:</span> {item.question}
                                            </p>
                                            <div className="pl-4 border-l-2 border-blue-200 dark:border-blue-900 ml-1">
                                              <p className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-1">Suggested Point:</p>
                                              <div className="bg-gray-50 dark:bg-[#1F1F1F] p-3 rounded text-sm text-gray-800 dark:text-gray-200 font-medium mb-2">
                                                {item.suggestedPoint}
                                              </div>
                                              <p className="text-[10px] text-gray-500 dark:text-gray-400 italic">
                                                <span className="font-bold">Why:</span> {item.rationale}
                                              </p>
                                              <button 
                                                onClick={() => {
                                                  navigator.clipboard.writeText(item.suggestedPoint);
                                                  showToast("Suggestion copied! Paste it into your CV.");
                                                }}
                                                className="mt-3 text-[10px] font-bold uppercase tracking-widest text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                                              >
                                                <Copy size={12} /> Copy to CV
                                              </button>
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                   </div>
                                </div>
                              </div>
                           )}

                           {/* Skippable Content */}
                           {state.skippableContent.length > 0 && (
                              <div id="sec-skippable" className="scroll-mt-8">
                                <div className="uber-card overflow-hidden border border-red-100">
                                   <div className="bg-red-50 text-red-800 px-8 py-4 border-b border-red-100">
                                      <h4 className="font-bold uppercase tracking-widest text-[10px]">Skippable Content (Save Space)</h4>
                                   </div>
                                   <div className="p-8 bg-white dark:bg-[#141414]">
                                      <p className="text-xs text-gray-500 dark:text-gray-400 mb-6 font-medium">The following parts of your CV appear less relevant to this specific role and could be removed to improve density:</p>
                                      <ul className="space-y-4">
                                        {state.skippableContent.map((item, idx) => (
                                          <li key={idx} className="flex items-start gap-4 text-sm text-gray-700">
                                            <span className="text-red-400 mt-1.5 text-[10px] shrink-0">●</span>
                                            <span className="leading-relaxed">{item}</span>
                                          </li>
                                        ))}
                                      </ul>
                                   </div>
                                </div>
                              </div>
                           )}

                           {/* Messages */}
                           <div id="sec-messages" className="scroll-mt-8 grid grid-cols-1 xl:grid-cols-2 gap-8">
                              {/* Introduction Message */}
                              <div className="uber-card overflow-hidden border-2 border-black dark:border-[#333333] flex flex-col h-full xl:col-span-2">
                                 <div className="bg-black dark:bg-[#1A1A1A] text-white px-8 py-4 flex justify-between items-center">
                                    <h4 className="font-bold uppercase tracking-widest text-[10px]">"Tell Me About Yourself" (Gayle McDowell Style)</h4>
                                 </div>
                                 <div className="p-8 bg-gray-50 dark:bg-[#1A1A1A] flex-1 flex flex-col">
                                    <div className="mb-6 text-sm text-gray-600 flex justify-between items-start">
                                      <div>
                                        <p className="font-bold mb-1">Your 60-Second Intro</p>
                                        <p className="text-xs opacity-70">Structured as: Present → Past → Pattern → Forward. Tailored to the JD domain.</p>
                                      </div>
                                      <button 
                                         onClick={() => {
                                            navigator.clipboard.writeText(state.introductionMessage || '');
                                            showToast("Intro message copied!");
                                         }}
                                         className="p-2 hover:bg-gray-200 dark:hover:bg-[#333333] rounded-full transition-colors text-gray-600 dark:text-gray-400 hover:text-black dark:hover:text-white"
                                         title="Copy to Clipboard"
                                       >
                                         <Copy size={18} />
                                       </button>
                                    </div>
                                    <textarea 
                                      className="w-full uber-input text-sm font-sans flex-1 bg-white dark:bg-[#141414] dark:text-white p-4 border-0 focus:ring-0 resize-none leading-relaxed"
                                      rows={6}
                                      value={state.introductionMessage || ''}
                                      onChange={(e) => {
                                        setState(s => ({ ...s, introductionMessage: e.target.value }));
                                      }}
                                      placeholder="Draft your intro here..."
                                    />
                                 </div>
                              </div>

                              {/* LinkedIn Message */}
                              <div className="uber-card overflow-hidden border-2 border-black dark:border-[#333333] flex flex-col h-full">
                                 <div className="bg-black dark:bg-[#1A1A1A] text-white px-8 py-4 flex justify-between items-center">
                                    <h4 className="font-bold uppercase tracking-widest text-[10px]">LinkedIn "Top Choice"</h4>
                                    <span className="text-[10px] bg-white dark:bg-[#141414] text-black dark:text-white px-2 py-0.5 font-bold rounded">{(state.topChoiceMessage || '').length}/400</span>
                                 </div>
                                 <div className="p-8 bg-gray-50 dark:bg-[#1A1A1A] flex-1 flex flex-col">
                                    <div className="mb-6 text-sm text-gray-600 flex justify-between items-start">
                                      <div>
                                        <p className="font-bold mb-1">Mark this job as a top choice</p>
                                        <p className="text-xs opacity-70">Applicants who do this are 43% more likely to hear back.</p>
                                      </div>
                                      <button 
                                         onClick={() => {
                                            navigator.clipboard.writeText(state.topChoiceMessage || '');
                                            showToast("LinkedIn message copied!");
                                         }}
                                         className="p-2 hover:bg-gray-200 dark:hover:bg-[#333333] rounded-full transition-colors text-gray-600 dark:text-gray-400 hover:text-black dark:hover:text-white"
                                         title="Copy to Clipboard"
                                       >
                                         <Copy size={18} />
                                       </button>
                                    </div>
                                    <textarea 
                                      className="w-full uber-input text-sm font-sans flex-1 bg-white dark:bg-[#141414] dark:text-white p-4 border-0 focus:ring-0 resize-none leading-relaxed"
                                      rows={12}
                                      value={state.topChoiceMessage || ''}
                                      onChange={(e) => {
                                        if (e.target.value.length <= 400) {
                                          setState(s => ({ ...s, topChoiceMessage: e.target.value }));
                                        }
                                      }}
                                      placeholder="Draft your message here..."
                                    />
                                 </div>
                              </div>

                              {/* Wellfound Message */}
                              <div className="uber-card overflow-hidden border-2 border-black dark:border-[#333333] flex flex-col h-full">
                                 <div className="bg-black dark:bg-[#1A1A1A] text-white px-8 py-4 flex justify-between items-center">
                                    <h4 className="font-bold uppercase tracking-widest text-[10px]">Wellfound Interest</h4>
                                    <span className="text-[10px] bg-white dark:bg-[#141414] text-black dark:text-white px-2 py-0.5 font-bold rounded">{(state.wellfoundMessage || '').length}/400</span>
                                 </div>
                                 <div className="p-8 bg-gray-50 dark:bg-[#1A1A1A] flex-1 flex flex-col">
                                    <div className="mb-6 text-sm text-gray-600 flex justify-between items-start">
                                      <div>
                                        <p className="font-bold mb-1">What interests you?</p>
                                        <p className="text-xs opacity-70">Honest and raw response tailored for Wellfound.</p>
                                      </div>
                                      <button 
                                         onClick={() => {
                                            navigator.clipboard.writeText(state.wellfoundMessage || '');
                                            showToast("Wellfound message copied!");
                                         }}
                                         className="p-2 hover:bg-gray-200 dark:hover:bg-[#333333] rounded-full transition-colors text-gray-600 dark:text-gray-400 hover:text-black dark:hover:text-white"
                                         title="Copy to Clipboard"
                                       >
                                         <Copy size={18} />
                                       </button>
                                    </div>
                                    <textarea 
                                      className="w-full uber-input text-sm font-sans flex-1 bg-white dark:bg-[#141414] dark:text-white p-4 border-0 focus:ring-0 resize-none leading-relaxed"
                                      rows={12}
                                      value={state.wellfoundMessage || ''}
                                      onChange={(e) => {
                                        if (e.target.value.length <= 400) {
                                          setState(s => ({ ...s, wellfoundMessage: e.target.value }));
                                        }
                                      }}
                                      placeholder="Draft your message here..."
                                    />
                                 </div>
                              </div>
                           </div>
                         </>
                       )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'preview' && (
              <div className="flex-1 bg-[#E8E8E8] dark:bg-[#0A0A0A] flex flex-col items-center overflow-hidden">
                <div className="w-full bg-white dark:bg-[#141414] border-b border-gray-200 dark:border-[#333333] p-4 px-8 flex justify-between items-center shrink-0 shadow-sm z-20 no-print">
                  <div className="flex items-center gap-6">
                      <div>
                        <h2 className="text-lg font-bold tracking-tight">Final Editor</h2>
                        <p className="text-xs text-gray-500 font-medium">What you see here is what the PDF will be.</p>
                      </div>
                      <PageFitBadge fit={previewFit} />
                  </div>
                  <div className="flex items-center gap-4">
                      <label className="flex flex-col">
                        <span className="text-[9px] font-bold uppercase tracking-widest text-gray-400">Company</span>
                        <input
                          value={targetCompany}
                          onChange={e => setTargetCompany(e.target.value)}
                          placeholder="e.g. Stripe"
                          className="w-40 border border-gray-200 dark:border-[#333333] bg-white dark:bg-[#141414] px-2 py-1 text-xs font-bold outline-none focus:border-black dark:focus:border-white"
                        />
                        <span className="text-[9px] text-gray-400 font-mono mt-1 truncate max-w-[240px]" title={resumeFilename('pdf')}>{resumeFilename('pdf')}</span>
                      </label>
                      <button onClick={() => setActiveTab('analyze')} className="px-6 py-2 uber-button-secondary text-[10px] font-bold uppercase tracking-widest">BACK</button>
                      <button onClick={handleDownloadDOCX} className="uber-button-secondary bg-blue-50 text-blue-600 border-blue-200 text-[10px] font-bold tracking-widest uppercase hover:bg-blue-100">DOWNLOAD DOCX</button>
                      <button onClick={handleDownloadPDF} disabled={isExporting} className="uber-button-secondary text-[10px] font-bold tracking-widest uppercase disabled:opacity-50">{isExporting ? 'EXPORTING…' : 'DOWNLOAD PDF'}</button>
                      <button onClick={handleUseForAutoApply} className="uber-button-primary text-[10px] font-bold tracking-widest uppercase flex items-center gap-2">
                        <Sparkles size={12} /> SAVE & USE TO APPLY
                      </button>
                  </div>
                </div>

                <div className="flex-1 w-full overflow-y-auto flex flex-col relative">
                  <div className="px-4 py-8">
                    <RichEditor
                        content={finalPreviewHtml}
                        onChange={setFinalPreviewHtml}
                        className="h-auto w-full"
                        viewMode="page"
                        pageScale={previewFit?.scale ?? 1}
                    />

                    {/* Messages in Preview */}
                    <div className="max-w-[210mm] mx-auto mt-12 mb-24 grid grid-cols-1 md:grid-cols-2 gap-8">
                      {/* LinkedIn Message */}
                      <div className="uber-card overflow-hidden border-2 border-black dark:border-[#333333] flex flex-col">
                         <div className="bg-black dark:bg-[#1A1A1A] text-white px-8 py-4 flex justify-between items-center">
                            <h4 className="font-bold uppercase tracking-widest text-[10px]">LinkedIn "Top Choice"</h4>
                            <span className="text-[10px] bg-white dark:bg-[#141414] text-black dark:text-white px-2 py-0.5 font-bold rounded">{(state.topChoiceMessage || '').length}/400</span>
                         </div>
                         <div className="p-8 bg-gray-50 dark:bg-[#1A1A1A] flex-1 flex flex-col">
                            <div className="mb-4 text-sm text-gray-600">
                              <p className="font-bold mb-1">Mark this job as a top choice (Optional)</p>
                              <p>Applicants who let hirers know when a job is their top choice are 43% more likely to hear back.</p>
                            </div>
                            <textarea 
                              className="w-full uber-input min-h-[120px] text-sm mb-4 font-sans flex-1"
                              value={state.topChoiceMessage || ''}
                              onChange={(e) => {
                                if (e.target.value.length <= 400) {
                                  setState(s => ({ ...s, topChoiceMessage: e.target.value }));
                                }
                              }}
                              placeholder="Draft your message here..."
                            />
                            <div className="flex justify-end">
                               <button 
                                 onClick={() => {
                                    navigator.clipboard.writeText(state.topChoiceMessage || '');
                                    alert("Message copied to clipboard!");
                                 }}
                                 className="uber-button-secondary text-[10px] font-bold uppercase tracking-widest"
                               >
                                 Copy to Clipboard
                               </button>
                            </div>
                         </div>
                      </div>

                      {/* Wellfound Message */}
                      <div className="uber-card overflow-hidden border-2 border-black dark:border-[#333333] flex flex-col">
                         <div className="bg-black dark:bg-[#1A1A1A] text-white px-8 py-4 flex justify-between items-center">
                            <h4 className="font-bold uppercase tracking-widest text-[10px]">Wellfound Interest</h4>
                            <span className="text-[10px] bg-white dark:bg-[#141414] text-black dark:text-white px-2 py-0.5 font-bold rounded">{(state.wellfoundMessage || '').length}/400</span>
                         </div>
                         <div className="p-8 bg-gray-50 dark:bg-[#1A1A1A] flex-1 flex flex-col">
                            <div className="mb-4 text-sm text-gray-600">
                              <p className="font-bold mb-1">What interests you about working for this company?</p>
                              <p>An honest and raw response tailored for Wellfound applications.</p>
                            </div>
                            <textarea 
                              className="w-full uber-input min-h-[120px] text-sm mb-4 font-sans flex-1"
                              value={state.wellfoundMessage || ''}
                              onChange={(e) => {
                                if (e.target.value.length <= 400) {
                                  setState(s => ({ ...s, wellfoundMessage: e.target.value }));
                                }
                              }}
                              placeholder="Draft your message here..."
                            />
                            <div className="flex justify-end">
                               <button 
                                 onClick={() => {
                                    navigator.clipboard.writeText(state.wellfoundMessage || '');
                                    alert("Message copied to clipboard!");
                                 }}
                                 className="uber-button-secondary text-[10px] font-bold uppercase tracking-widest"
                               >
                                 Copy to Clipboard
                               </button>
                            </div>
                         </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
};

export default App;
