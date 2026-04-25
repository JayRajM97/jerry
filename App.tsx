
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { 
  CVSection, 
  Suggestion, 
  ATSScore, 
  RewriteMode, 
  AppState,
  HistoryItem,
  AppView,
  UserProfile
} from './types';
import { Copy, Check, RefreshCw, Sparkles, Moon, Sun, User } from 'lucide-react';
import { 
  analyzeResume, 
  calculateATSScore,
  generateTopChoiceMessage,
  generateWellfoundMessage,
  generateIntroduction
} from './services/geminiService';
import { authService } from './services/authService';
import { databaseService } from './services/databaseService';
import { SAMPLE_CV, SAMPLE_JD } from './constants';
import ATSScoreCard from './components/ATSScoreCard';
import RichEditor from './components/RichEditor';
import RationalePanel from './components/RationalePanel';
import LandingPage from './components/LandingPage';
import mammoth from 'mammoth';
import * as pdfjs from 'pdfjs-dist';
// @ts-ignore
import { asBlob } from 'html-docx-js-typescript';

// Initialize PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `https://esm.sh/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs`;

// Helper to clean up DOCX HTML (fake bullets)
const cleanDocxHtml = (html: string): string => {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const body = doc.body;
  
  const newChildren: Element[] = [];
  let currentList: HTMLElement | null = null;
  
  Array.from(body.children).forEach(child => {
    const text = child.textContent || '';
    // Match bullets: •, ●, -, *, ▪, ⁃
    const bulletRegex = /^(\s*([•●\-\*▪⁃]|[\u2022\u2023\u25E6\u2043\u2219])\s+)/;
    const isFakeBullet = child.tagName === 'P' && bulletRegex.test(text);
    
    if (child.tagName === 'UL' || child.tagName === 'OL') {
        currentList = null;
        newChildren.push(child.cloneNode(true) as Element);
    } else if (isFakeBullet) {
        if (!currentList) {
            currentList = document.createElement('ul');
            newChildren.push(currentList);
        }
        const li = document.createElement('li');
        li.innerHTML = child.innerHTML.replace(bulletRegex, '');
        currentList.appendChild(li);
    } else {
        currentList = null;
        newChildren.push(child.cloneNode(true) as Element);
    }
  });
  
  return newChildren.map(c => c.outerHTML).join('');
};

const App: React.FC = () => {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  );
};

const AppContent: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  
  // --- Auth State ---
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);

  // --- Persistent Data State (Fetched from DB) ---
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [masterCvHtml, setMasterCvHtml] = useState<string>('');

  // --- Workspace State ---
  const [cvHtml, setCvHtml] = useState('');
  const [jdText, setJdText] = useState('');
  
  // New state for the "final" edited HTML in the preview tab
  const [finalPreviewHtml, setFinalPreviewHtml] = useState('');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Sync currentView with URL
  const path = location.pathname.split('/')[1];
  const currentView = path === 'access' ? 'home' : (path || 'landing');

  const setCurrentView = (view: string) => {
    if (view === 'home' || view === 'access') navigate('/home');
    else if (view === 'history') navigate('/history');
    else if (view === 'profile') navigate('/profile');
    else navigate('/');
  };

  // Redirect to /home if logged in and at root or /access
  useEffect(() => {
    if (user && (location.pathname === '/' || location.pathname === '/access')) {
      navigate('/home');
    }
    // Auto-trigger login if visiting /access and not logged in
    if (!user && !isAuthLoading && location.pathname === '/access') {
      handleLogin();
    }
  }, [user, isAuthLoading, location.pathname, navigate]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
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
        loadUserData(currentUser.id);
      }
    };
    initApp();
  }, []);

  const loadUserData = async (userId: string) => {
    // Parallel data fetching
    const [fetchedHistory, fetchedMaster] = await Promise.all([
      databaseService.getHistory(userId),
      databaseService.getMasterCV(userId)
    ]);

    setHistory(fetchedHistory);
    setMasterCvHtml(fetchedMaster || `<p>${SAMPLE_CV.split('\n').join('</p><p>')}</p>`);
    
    // Initialize workspace with master CV if available
    if (fetchedMaster && !cvHtml) {
        setCvHtml(fetchedMaster);
    } else if (!cvHtml && !fetchedMaster) {
        setCvHtml(`<p>${SAMPLE_CV.split('\n').join('</p><p>')}</p>`);
    } else if (!cvHtml && fetchedMaster) {
        setCvHtml(fetchedMaster);
    }
  };

  // --- AUTH HANDLERS ---
  const handleLogin = async () => {
    setIsAuthLoading(true);
    try {
      const newUser = await authService.signInWithGoogle();
      setUser(newUser);
      await loadUserData(newUser.id);
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

    const finalHtml = compileFinalHtml(currentSections, currentSuggestions);
    
    const newItem: HistoryItem = {
      id: Date.now().toString(),
      userId: user.id,
      timestamp: Date.now(),
      jobTitle: extractJobTitle(jdText),
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
    setCurrentView('home');
    setActiveTab('analyze');
  };

  const startNewApplication = () => {
    setCvHtml(masterCvHtml);
    setJdText('');
    setFinalPreviewHtml('');
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
    setCurrentView('home');
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, target: 'home' | 'profile') => {
    const file = e.target.files?.[0];
    if (!file) return;

    setState(prev => ({ ...prev, isLoading: true, loadingStep: `Parsing ${file.name}` }));
    
    try {
      const arrayBuffer = await file.arrayBuffer();
      let parsedHtml = '';

      if (file.name.endsWith('.docx')) {
        const result = await mammoth.convertToHtml({ arrayBuffer });
        parsedHtml = cleanDocxHtml(result.value);
      } else if (file.name.endsWith('.pdf')) {
        const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
        
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const textContent = await page.getTextContent();
          
          const heights = textContent.items.map((item: any) => item.height);
          const modeHeight = heights.sort((a,b) =>
            heights.filter(v => v===a).length - heights.filter(v => v===b).length
          ).pop() || 12;

          // --- PDF PARSING LOGIC ---
          // 1. Group items by Y-coordinate (lines)
          const items = textContent.items as any[];
          const lines: { y: number, items: any[] }[] = [];
          
          items.forEach(item => {
             const y = item.transform[5];
             // Tolerance of 4 units for same line
             const existingLine = lines.find(l => Math.abs(l.y - y) < 4);
             if (existingLine) {
                 existingLine.items.push(item);
             } else {
                 lines.push({ y, items: [item] });
             }
          });

          // Sort lines top-to-bottom
          lines.sort((a, b) => b.y - a.y);

          // 2. Classify lines into Blocks
          const blocks: { type: string, content: string }[] = [];

          lines.forEach((line) => {
             // Sort items left-to-right
             line.items.sort((a, b) => a.transform[4] - b.transform[4]);
             
             // Determine max height in this line to guess if it's a header
             const maxHeight = Math.max(...line.items.map(i => i.height));
             const isHeader = maxHeight > modeHeight * 1.1; 
             const isBigHeader = maxHeight > modeHeight * 1.4;
             
             // Reconstruct text with basic formatting
             let lineHtml = '';
             line.items.forEach((item: any) => {
                 if (!item.str) return;
                 let text = item.str;
                 
                 // Basic font style detection
                 const styleObj = textContent.styles[item.fontName];
                 const fontNameStr = styleObj?.fontFamily || '';
                 const fontNameLower = item.fontName ? item.fontName.toLowerCase() : '';
                 const familyLower = fontNameStr.toLowerCase();
                 
                 const isBold = familyLower.includes('bold') || fontNameLower.includes('bold') || fontNameLower.includes('black');
                 const isItalic = familyLower.includes('italic') || familyLower.includes('oblique') || fontNameLower.includes('italic');
                 
                 if (isBold) text = `<strong>${text}</strong>`;
                 if (isItalic) text = `<em>${text}</em>`;
                 
                 lineHtml += text;
             });

             // --- BULLET DETECTION ---
             const trimmedLine = lineHtml.trim();
             const bulletRegex = /^(\s*([•●\-\*▪⁃]|[\u2022\u2023\u25E6\u2043\u2219])\s+)/;
             const isBullet = bulletRegex.test(trimmedLine);

             // --- HEADER DETECTION OVERRIDE ---
             const finalIsHeader = (isHeader || isBigHeader) && !isBullet;

             if (finalIsHeader) {
                 blocks.push({ type: isBigHeader ? 'h1' : 'h2', content: lineHtml });
             } else if (isBullet) {
                 const cleanContent = lineHtml.replace(bulletRegex, '').trim();
                 blocks.push({ type: 'li', content: cleanContent });
             } else {
                 if (trimmedLine.length > 0) {
                     blocks.push({ type: 'p', content: lineHtml });
                 }
             }
          });

          // 3. Merge Paragraphs (Fix broken lines)
          const mergedBlocks: { type: string, content: string }[] = [];
          
          blocks.forEach((block, idx) => {
             if (idx === 0) {
                 mergedBlocks.push(block);
                 return;
             }
             
             const prev = mergedBlocks[mergedBlocks.length - 1];
             
             // Merge if both are 'p' and prev doesn't end in punctuation
             const stripTags = (s: string) => s.replace(/<[^>]+>/g, '').trim();
             const endsWithPunctuation = /[.!?]$/.test(stripTags(prev.content));
             
             if (block.type === 'p' && prev.type === 'p' && !endsWithPunctuation) {
                 prev.content += ' ' + block.content;
             } else {
                 mergedBlocks.push(block);
             }
          });

          // 4. Generate HTML from Blocks
          let pageHtml = '';
          let inList = false;
          
          mergedBlocks.forEach(block => {
              if (inList && block.type !== 'li') {
                  pageHtml += '</ul>';
                  inList = false;
              }
              
              if (block.type === 'li') {
                  if (!inList) {
                      pageHtml += '<ul>';
                      inList = true;
                  }
                  pageHtml += `<li>${block.content}</li>`;
              } else {
                  pageHtml += `<${block.type}>${block.content}</${block.type}>`;
              }
          });
          
          if (inList) pageHtml += '</ul>';
          
          parsedHtml += pageHtml;
        }
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
        setCvHtml(parsedHtml);
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

      let optimizedFullHtml = sections.map(s => s.optimizedHtmlContent || s.htmlContent).join('');
      let appliedSuggestions = suggestions.map(s => ({ ...s, applied: true }));
      
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
         optimizedFullHtml = sections.map(s => s.htmlContent).join(''); 
         
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

  const compileFinalHtml = (sections: CVSection[], suggestions: Suggestion[]) => {
    if (sections.length > 0) {
      return sections.map(sec => {
        let content = sec.optimizedHtmlContent || sec.htmlContent;
        suggestions
          .filter(s => s.sectionId === sec.id && !s.applied)
          .forEach(s => {
            if (content.includes(s.suggestedHtml)) {
               content = content.replace(s.suggestedHtml, s.originalHtml);
            }
          });
        return `<h2>${sec.title}</h2>${content}`;
      }).join('');
    }
    return '';
  };

  useEffect(() => {
    setFinalPreviewHtml(compileFinalHtml(state.originalSections, state.suggestions) || cvHtml);
  }, [state.originalSections, state.suggestions, cvHtml]);

  const handleDownloadPDF = () => {
    // Check if we are in preview mode to find the element
    // We select the A4 page container
    const element = document.querySelector('.a4-page');
    if (!element) {
        alert("Please ensure you are in the Preview tab to download PDF.");
        return;
    }
    
    const opt = {
      margin: 0, 
      filename: 'resume.pdf',
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    // @ts-ignore
    if (window.html2pdf) {
        // @ts-ignore
        window.html2pdf().set(opt).from(element).save();
    } else {
        // Fallback if library failed to load
        window.print();
    }
  };

  const handleDownloadDOCX = async () => {
      // Ensure we have content
      if (!finalPreviewHtml) {
        alert("No content to download.");
        return;
      }

      // Construct a clean, standard HTML document for the converter
      const htmlString = `<!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Resume</title>
        <style>
          body { font-family: Calibri, Arial, sans-serif; font-size: 11pt; color: #000000; line-height: 1.15; }
          h1 { font-size: 18pt; font-weight: bold; border-bottom: 1px solid #000; margin-bottom: 6pt; color: #000000; }
          h2 { font-size: 14pt; font-weight: bold; margin-top: 12pt; margin-bottom: 6pt; color: #000000; text-transform: uppercase; }
          p { margin-bottom: 6pt; margin-top: 0; }
          ul { margin-bottom: 6pt; margin-left: 24pt; padding-left: 0; }
          li { margin-bottom: 2pt; }
          a { color: #0563C1; text-decoration: underline; }
          strong, b { font-weight: bold; }
          em, i { font-style: italic; }
        </style>
      </head>
      <body>
        ${finalPreviewHtml}
      </body>
      </html>`;
      
      try {
          // Use asBlob from library
          const blob = await asBlob(htmlString) as Blob;
          if (blob && blob.size > 0) {
              const url = URL.createObjectURL(blob);
              const link = document.createElement('a');
              link.href = url;
              link.download = 'optimized_resume.docx';
              document.body.appendChild(link);
              link.click();
              document.body.removeChild(link);
              URL.revokeObjectURL(url);
          } else {
             alert("Generated DOCX is empty. Please verify content.");
          }
      } catch (e) {
          console.error("DOCX Generation Error:", e);
          alert("Error creating DOCX file.");
      }
  };

  // --- RENDERING ---

  if (isAuthLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-white">
        <div className="uber-loader border-gray-200 border-t-black"></div>
      </div>
    );
  }

  if (!user) {
    return <LandingPage onLogin={handleLogin} isLoading={isAuthLoading} />;
  }

  return (
    <div className="h-screen flex flex-col bg-white overflow-hidden">
      {/* Uber Base Header */}
      <header className="bg-black text-white h-16 flex items-center px-8 shrink-0 z-50 no-print justify-between">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-4 cursor-pointer" onClick={() => navigate('/home')}>
            <div className="bg-white text-black border font-bold px-3 py-1 text-base">JM</div>
            <h1 className="text-lg font-bold tracking-tight">Jerry Maguire</h1>
          </div>
          
          <div className="h-8 w-px bg-gray-800 mx-2"></div>

          <nav className="flex gap-1">
             <button 
                onClick={startNewApplication}
                className={`px-4 py-2 text-xs font-bold uppercase tracking-widest rounded transition-colors ${location.pathname === '/home' && activeTab === 'input' && state.originalSections.length === 0 ? 'bg-gray-800 text-white' : 'text-gray-400 hover:text-white'}`}
             >
                + New App
             </button>
             <button 
                onClick={() => navigate('/history')}
                className={`px-4 py-2 text-xs font-bold uppercase tracking-widest rounded transition-colors ${location.pathname === '/history' ? 'bg-gray-800 text-white' : 'text-gray-400 hover:text-white'}`}
             >
                History
             </button>
          </nav>
        </div>

        <div className="flex items-center gap-6">
            <button 
                onClick={() => navigate('/profile')}
                className={`flex items-center gap-2 px-4 py-2 text-xs font-bold uppercase tracking-widest rounded transition-colors ${location.pathname === '/profile' ? 'bg-white text-black border border-gray-200' : 'text-gray-400 hover:text-white'}`}
             >
                <User size={16} /> Profile
             </button>
             
             <div className="h-8 w-px bg-gray-800 mx-2"></div>
             
             <div className="flex items-center gap-3 group relative cursor-pointer">
                <img src={user.avatarUrl} alt={user.name} className="w-8 h-8 rounded-full border border-gray-700" />
                <div className="absolute top-full right-0 mt-2 w-48 bg-white text-black shadow-xl border border-gray-200 hidden group-hover:block rounded z-50">
                    <div className="p-4 border-b border-gray-100">
                        <p className="font-bold text-sm">{user.name}</p>
                        <p className="text-xs text-gray-500 truncate">{user.email}</p>
                    </div>
                    <button onClick={handleLogout} className="w-full text-left px-4 py-3 text-sm hover:bg-gray-50 text-red-600 font-bold">Sign Out</button>
                </div>
             </div>
        </div>
      </header>
      
      {/* SUB-HEADER FOR WORKSPACE NAVIGATION (Only visible in Home view) */}
      {currentView === 'home' && (
        <div className="bg-white border-b border-gray-200 px-8 h-12 flex items-center justify-center shrink-0">
          {[
            { id: 'input', label: '1. Input' },
            { id: 'analyze', label: '2. Analyze' },
            { id: 'preview', label: '3. Preview' },
          ].map(tab => (
            <button 
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-8 h-full flex items-center text-xs font-bold uppercase tracking-widest border-b-2 transition-all ${activeTab === tab.id ? 'border-black text-black' : 'border-transparent text-gray-400 hover:text-gray-600'}`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      <main className="flex-1 flex flex-col overflow-hidden bg-[#F9F9F9]">
        
        {/* === HISTORY VIEW === */}
        {currentView === 'history' && (
           <div className="p-12 max-w-6xl mx-auto w-full h-full overflow-y-auto">
              <h2 className="text-3xl font-bold mb-8">Application History</h2>
              {history.length === 0 ? (
                  <div className="text-center py-20 text-gray-400">
                      <p className="mb-4 text-xl">No history yet.</p>
                      <button onClick={startNewApplication} className="uber-button-primary">Start First Application</button>
                  </div>
              ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {history.map(item => (
                          <div key={item.id} className="uber-card p-6 flex flex-col h-64 hover:shadow-lg transition-shadow cursor-pointer group" onClick={() => loadHistoryItem(item)}>
                              <div className="flex-1">
                                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">
                                      {new Date(item.timestamp).toLocaleDateString()} • {new Date(item.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                  </p>
                                  <h3 className="text-xl font-bold mb-2 line-clamp-2">{item.jobTitle}</h3>
                                  <p className="text-xs text-gray-500 line-clamp-3">{item.jdText}</p>
                              </div>
                              <div className="mt-4 pt-4 border-t border-gray-100 flex justify-between items-end">
                                  <div>
                                      <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Score</p>
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
           <div className="p-12 max-w-5xl mx-auto w-full h-full overflow-hidden flex flex-col">
              <div className="flex justify-between items-end mb-8 shrink-0">
                  <div>
                    <h2 className="text-3xl font-bold mb-2">Master Resume</h2>
                    <p className="text-gray-500">This resume will be used as the starting point for all new applications.</p>
                  </div>
                  <div className="relative">
                     <button onClick={() => fileInputRef.current?.click()} className="uber-button-secondary text-xs uppercase tracking-widest font-bold">Import from File</button>
                     <input type="file" ref={fileInputRef} hidden accept=".docx,.pdf" onChange={(e) => handleFileUpload(e, 'profile')} />
                  </div>
              </div>
              <div className="flex-1 uber-card overflow-hidden flex flex-col">
                   <RichEditor 
                      content={masterCvHtml} 
                      onChange={updateMasterCV} 
                      className="h-full w-full border-0" 
                      viewMode="fluid" 
                   />
              </div>
           </div>
        )}

        {/* === WORKSPACE VIEW === */}
        {currentView === 'home' && (
          <>
            {activeTab === 'input' && (
              <div className="flex-1 flex flex-col lg:flex-row p-6 gap-6 overflow-hidden no-print">
                {/* Left Column: Resume Editor */}
                <div className="flex-1 flex flex-col bg-white dark:bg-[#141414] border border-gray-200 dark:border-[#333333] shadow-sm min-h-0">
                  <div className="p-4 border-b border-gray-100 flex justify-between items-center shrink-0">
                      <h2 className="text-lg font-bold tracking-tight">Resume Content</h2>
                      <div className="flex bg-gray-100 p-1">
                        <button onClick={() => setInputMethod('upload')} className={`px-4 py-1 text-[10px] font-bold tracking-widest ${inputMethod === 'upload' ? 'bg-white text-black shadow-sm' : 'text-gray-400'}`}>FILE</button>
                        <button onClick={() => setInputMethod('paste')} className={`px-4 py-1 text-[10px] font-bold tracking-widest ${inputMethod === 'paste' ? 'bg-white text-black shadow-sm' : 'text-gray-400'}`}>EDIT</button>
                      </div>
                  </div>
                  
                  {inputMethod === 'upload' ? (
                      <div className="flex-1 flex flex-col items-center justify-center bg-gray-50 p-12">
                        <p className="text-xs font-bold text-gray-400 mb-8 uppercase tracking-widest">Supports .docx and .pdf</p>
                        <button onClick={() => fileInputRef.current?.click()} className="uber-button-primary px-12 uppercase tracking-widest text-xs font-bold">SELECT FILE</button>
                        <input type="file" ref={fileInputRef} hidden accept=".docx,.pdf" onChange={(e) => handleFileUpload(e, 'home')} />
                      </div>
                  ) : (
                      <RichEditor content={cvHtml} onChange={setCvHtml} className="flex-1 overflow-hidden" viewMode="fluid" />
                  )}
                </div>

                {/* Right Column: JD + Controls */}
                <div className="flex-1 flex flex-col min-h-0 gap-6">
                  <div className="flex-1 flex flex-col bg-white border border-gray-200 shadow-sm min-h-0">
                    <div className="p-4 border-b border-gray-100 shrink-0">
                        <h2 className="text-lg font-bold tracking-tight">Job Description</h2>
                    </div>
                    <textarea 
                      className="flex-1 w-full uber-input resize-none text-sm leading-relaxed bg-white border-0 focus:ring-0 p-4 font-mono"
                      value={jdText}
                      onChange={(e) => setJdText(e.target.value)}
                      placeholder="Paste the target JD here..."
                    />
                  </div>

                  <div className="bg-white border border-gray-200 shadow-sm p-4 shrink-0 flex items-end gap-4 relative">
                    <div className="w-1/3 relative">
                        <div className="flex items-center gap-1 mb-2">
                          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Mode</p>
                          <div className="group relative">
                              <span className="cursor-help text-gray-400 text-[10px]">ⓘ</span>
                              <div className="absolute bottom-full left-0 mb-2 w-48 hidden group-hover:block bg-black text-white text-[10px] p-3 rounded shadow-lg z-50 leading-relaxed">
                                <strong className="block mb-1 text-white">Conservative:</strong> Minimal wording tweaks.
                                <strong className="block mb-1 text-white mt-2">Balanced:</strong> Improved phrasing & alignment.
                                <strong className="block mb-1 text-white mt-2">Aggressive:</strong> Stronger keywords & confidence.
                              </div>
                          </div>
                        </div>
                        <select 
                          value={state.mode}
                          onChange={(e) => setState(s => ({ ...s, mode: e.target.value as RewriteMode }))}
                          className="w-full bg-gray-50 p-3 text-xs font-bold border border-gray-200 text-black uppercase tracking-widest outline-none focus:border-black"
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
                </div>
              </div>
            )}

            {activeTab === 'analyze' && (
              <div className="flex-1 overflow-auto bg-white no-print relative scroll-smooth">
                {/* Toast Notification */}
                {toastMessage && (
                  <div className="fixed bottom-8 left-8 bg-black text-white px-6 py-4 rounded shadow-2xl z-50 flex items-center gap-3 animate-in fade-in slide-in-from-bottom-4 duration-300">
                    <Check size={18} className="text-green-400" />
                    <span className="text-sm font-bold tracking-wide">{toastMessage}</span>
                  </div>
                )}

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
                       <h3 className="font-bold text-xs uppercase tracking-widest text-gray-400 mb-6">Contents</h3>
                       <nav className="space-y-1 border-l-2 border-gray-100">
                          {state.originalSections.map(sec => (
                             <a key={sec.id} href={`#sec-${sec.id}`} className="block pl-4 py-2 text-xs font-bold uppercase tracking-widest text-gray-400 hover:text-black hover:border-l-2 hover:border-black -ml-[2px] transition-all truncate">
                                {sec.title}
                             </a>
                          ))}
                          {state.skippableContent.length > 0 && (
                             <a href="#sec-skippable" className="block pl-4 py-2 text-xs font-bold uppercase tracking-widest text-gray-400 hover:text-red-600 hover:border-l-2 hover:border-red-600 -ml-[2px] transition-all truncate">
                                Skippable Content
                             </a>
                          )}
                          {state.profileSuggestions && state.profileSuggestions.length > 0 && (
                             <a href="#sec-profile-suggestions" className="block pl-4 py-2 text-xs font-bold uppercase tracking-widest text-gray-400 hover:text-blue-600 hover:border-l-2 hover:border-blue-600 -ml-[2px] transition-all truncate">
                                High Impact Additions
                             </a>
                          )}
                          <a href="#sec-messages" className="block pl-4 py-2 text-xs font-bold uppercase tracking-widest text-gray-400 hover:text-blue-600 hover:border-l-2 hover:border-blue-600 -ml-[2px] transition-all truncate">
                             Application Messages
                          </a>
                       </nav>
                       
                       <button 
                          onClick={() => setActiveTab('preview')}
                          className="mt-12 w-full uber-button-primary py-4 font-bold tracking-[0.2em] text-[10px] uppercase shadow-xl hover:shadow-2xl transition-all transform hover:-translate-y-1"
                        >
                          PROCEED TO EDITOR
                       </button>

                       <button 
                          onClick={handleGenerate}
                          disabled={state.isLoading}
                          className="mt-4 w-full bg-white border border-gray-200 text-gray-600 hover:text-black hover:border-black py-3 font-bold tracking-[0.2em] text-[10px] uppercase transition-all flex items-center justify-center gap-2"
                        >
                          <RefreshCw size={14} className={state.isLoading ? "animate-spin" : ""} />
                          {state.isLoading ? "Regenerating..." : "Regenerate Analysis"}
                       </button>
                    </div>

                    {/* Main Content: Centered & Wider */}
                    <div className="flex-1 min-w-0 space-y-24">
                       {state.originalSections.length === 0 ? (
                          <div className="space-y-8 opacity-60 pointer-events-none">
                            <div className="uber-card p-12 bg-white flex flex-col items-center justify-center text-center">
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
                                       <div className="bg-black text-white px-8 py-4">
                                          <h4 className="font-bold uppercase tracking-widest text-[10px]">{sec.title}</h4>
                                       </div>
                                       <div className="p-8">
                                          {sectionSugs.length > 0 ? (
                                            <div className="space-y-12">
                                               {sectionSugs.map(s => (
                                                 <div key={s.id} className="border border-gray-100 rounded-sm shadow-sm">
                                                    <div className="bg-gray-50/50 p-6 space-y-4">
                                                       <div className="diff-removed text-sm opacity-60">
                                                          <div dangerouslySetInnerHTML={{ __html: s.originalHtml }} />
                                                       </div>
                                                       <div className="relative group">
                                                          <div className="absolute -top-3 left-0 bg-green-100 text-green-800 text-[9px] px-2 py-0.5 font-bold uppercase tracking-widest rounded-r">Editable</div>
                                                          <div 
                                                            className="diff-added text-sm outline-none p-3 -mx-3 rounded transition-all cursor-text focus:bg-white focus:ring-2 focus:ring-green-500/20"
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
                                              <div dangerouslySetInnerHTML={{ __html: sec.htmlContent }} className="cv-content" />
                                              <div className="mt-8 pt-4 border-t border-gray-50 text-[10px] font-bold text-gray-400 uppercase tracking-widest">
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
                                      <span className="text-[10px] bg-white text-blue-600 px-2 py-0.5 font-bold rounded">Score Boosters</span>
                                   </div>
                                   <div className="p-8 bg-blue-50/30">
                                      <p className="text-xs text-gray-500 mb-6 font-medium">Based on your profile, adding these points (if true) could significantly boost your match score:</p>
                                      <div className="space-y-6">
                                        {state.profileSuggestions.map((item, idx) => (
                                          <div key={idx} className="bg-white p-6 rounded border border-blue-100 shadow-sm">
                                            <p className="text-sm font-bold text-gray-800 mb-3 flex items-start gap-2">
                                              <span className="text-blue-600">Q:</span> {item.question}
                                            </p>
                                            <div className="pl-4 border-l-2 border-blue-200 ml-1">
                                              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Suggested Point:</p>
                                              <div className="bg-gray-50 p-3 rounded text-sm text-gray-800 font-medium mb-2">
                                                {item.suggestedPoint}
                                              </div>
                                              <p className="text-[10px] text-gray-500 italic">
                                                <span className="font-bold">Why:</span> {item.rationale}
                                              </p>
                                              <button 
                                                onClick={() => {
                                                  navigator.clipboard.writeText(item.suggestedPoint);
                                                  showToast("Suggestion copied! Paste it into your CV.");
                                                }}
                                                className="mt-3 text-[10px] font-bold uppercase tracking-widest text-blue-600 hover:underline flex items-center gap-1"
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
                                   <div className="p-8 bg-white">
                                      <p className="text-xs text-gray-500 mb-6 font-medium">The following parts of your CV appear less relevant to this specific role and could be removed to improve density:</p>
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
                              <div className="uber-card overflow-hidden border-2 border-black flex flex-col h-full xl:col-span-2">
                                 <div className="bg-black dark:bg-black text-white px-8 py-4 flex justify-between items-center">
                                    <h4 className="font-bold uppercase tracking-widest text-[10px]">"Tell Me About Yourself" (Gayle McDowell Style)</h4>
                                 </div>
                                 <div className="p-8 bg-gray-50 dark:bg-[#141414] flex-1 flex flex-col">
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
                                 <div className="bg-black dark:bg-black text-white px-8 py-4 flex justify-between items-center">
                                    <h4 className="font-bold uppercase tracking-widest text-[10px]">LinkedIn "Top Choice"</h4>
                                    <span className="text-[10px] bg-white text-black px-2 py-0.5 font-bold rounded">{(state.topChoiceMessage || '').length}/400</span>
                                 </div>
                                 <div className="p-8 bg-gray-50 dark:bg-[#141414] flex-1 flex flex-col">
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
                                 <div className="bg-black dark:bg-black text-white px-8 py-4 flex justify-between items-center">
                                    <h4 className="font-bold uppercase tracking-widest text-[10px]">Wellfound Interest</h4>
                                    <span className="text-[10px] bg-white text-black px-2 py-0.5 font-bold rounded">{(state.wellfoundMessage || '').length}/400</span>
                                 </div>
                                 <div className="p-8 bg-gray-50 dark:bg-[#141414] flex-1 flex flex-col">
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
              <div className="flex-1 bg-[#E8E8E8] flex flex-col items-center overflow-hidden">
                <div className="w-full bg-white border-b border-gray-200 p-4 px-8 flex justify-between items-center shrink-0 shadow-sm z-20 no-print">
                  <div>
                      <h2 className="text-lg font-bold tracking-tight">Final Editor</h2>
                      <p className="text-xs text-gray-500 font-medium">Make final tweaks before downloading.</p>
                  </div>
                  <div className="flex gap-4">
                      <button onClick={() => setActiveTab('analyze')} className="px-6 py-2 uber-button-secondary text-[10px] font-bold uppercase tracking-widest">BACK</button>
                      <button onClick={handleDownloadDOCX} className="uber-button-secondary bg-blue-50 text-blue-600 border-blue-200 text-[10px] font-bold tracking-widest uppercase hover:bg-blue-100">DOWNLOAD DOCX</button>
                      <button onClick={handleDownloadPDF} className="uber-button-primary text-[10px] font-bold tracking-widest uppercase">DOWNLOAD PDF</button>
                  </div>
                </div>

                <div className="flex-1 w-full overflow-hidden flex flex-col relative">
                  <div className="flex-1 overflow-y-auto p-8">
                    <RichEditor 
                        content={finalPreviewHtml} 
                        onChange={setFinalPreviewHtml} 
                        className="h-full w-full min-h-[1000px]"
                        viewMode="page"
                    />
                    
                    {/* Messages in Preview */}
                    <div className="max-w-[210mm] mx-auto mt-12 mb-24 grid grid-cols-1 md:grid-cols-2 gap-8">
                      {/* LinkedIn Message */}
                      <div className="uber-card overflow-hidden border-2 border-black dark:border-[#333333] flex flex-col">
                         <div className="bg-black dark:bg-black text-white px-8 py-4 flex justify-between items-center">
                            <h4 className="font-bold uppercase tracking-widest text-[10px]">LinkedIn "Top Choice"</h4>
                            <span className="text-[10px] bg-white dark:bg-[#141414] text-black dark:text-white px-2 py-0.5 font-bold rounded">{(state.topChoiceMessage || '').length}/400</span>
                         </div>
                         <div className="p-8 bg-gray-50 dark:bg-[#141414] flex-1 flex flex-col">
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
                         <div className="bg-black dark:bg-black text-white px-8 py-4 flex justify-between items-center">
                            <h4 className="font-bold uppercase tracking-widest text-[10px]">Wellfound Interest</h4>
                            <span className="text-[10px] bg-white dark:bg-[#141414] text-black dark:text-white px-2 py-0.5 font-bold rounded">{(state.wellfoundMessage || '').length}/400</span>
                         </div>
                         <div className="p-8 bg-gray-50 dark:bg-[#141414] flex-1 flex flex-col">
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
