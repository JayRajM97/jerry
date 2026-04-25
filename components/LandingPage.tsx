
import React, { useState, useEffect } from 'react';
import { Sparkles, Check, ArrowRight, Shield, Zap, Globe, Send, Users, Target, X } from 'lucide-react';
import { databaseService } from '../services/databaseService';

interface Props {
  onLogin: () => void;
  isLoading: boolean;
}

const ROLES = [
  {
    role: "Product Manager",
    score: 84,
    keywords: "12/15",
    impact: "High",
    suggestion: "Quantify your impact in the 'Cloud Migration' section by adding specific percentage improvements."
  },
  {
    role: "Software Engineer",
    score: 92,
    keywords: "14/15",
    impact: "Very High",
    suggestion: "Highlight your experience with distributed systems and microservices architecture more prominently."
  },
  {
    role: "Frontend Developer",
    score: 78,
    keywords: "10/15",
    impact: "Medium",
    suggestion: "Add more details about your experience with modern React patterns and performance optimization."
  }
];

const USE_CASES = [
  "New Graduate / Entry Level",
  "Career Changer",
  "Senior Professional",
  "International Job Seeker",
  "Freelancer / Contractor",
  "Other"
];

const PRICE_RANGES = [
  "₹299 / month (~$3.99 USD)",
  "₹499 / month (~$5.99 USD)",
  "₹999 / month (~$11.99 USD)"
];

const LandingPage: React.FC<Props> = ({ onLogin, isLoading }) => {
  const [currentRoleIndex, setCurrentRoleIndex] = useState(0);
  const [showWaitlist, setShowWaitlist] = useState(false);
  const [waitlistSuccess, setWaitlistSuccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form State
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    linkedin: '',
    usecase: [] as string[],
    otherUsecase: '',
    wouldPay: '',
    priceRange: [] as string[],
    additionalNote: ''
  });

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentRoleIndex((prev) => (prev + 1) % ROLES.length);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  const handleWaitlistSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await databaseService.saveWaitlistResponse({
        ...formData,
        usecase: formData.usecase.join(', '),
        priceRange: formData.priceRange.join(', ')
      });
      setWaitlistSuccess(true);
      setTimeout(() => {
        setShowWaitlist(false);
        setWaitlistSuccess(false);
        setFormData({ name: '', email: '', linkedin: '', usecase: [], otherUsecase: '', wouldPay: '', priceRange: [], additionalNote: '' });
      }, 3000);
    } catch (error) {
      console.error("Waitlist error", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleMultiselect = (field: 'usecase' | 'priceRange', value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: prev[field].includes(value)
        ? prev[field].filter(item => item !== value)
        : [...prev[field], value]
    }));
  };

  const currentRole = ROLES[currentRoleIndex];

  return (
    <div className="min-h-screen bg-white text-black font-sans selection:bg-black selection:text-white">
      {/* Navigation */}
      <nav className="h-20 px-8 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white/80 backdrop-blur-md z-50">
        <div className="flex items-center gap-3">
          <div className="bg-black text-white font-bold px-3 py-1 text-lg">JM</div>
          <span className="font-bold tracking-tight text-xl text-black">Jerry Maguire</span>
        </div>
        <div className="flex items-center gap-6">
          <button 
            onClick={onLogin}
            className="text-sm font-bold uppercase tracking-widest hover:opacity-60 transition-opacity"
          >
            Sign In
          </button>
          <button 
            onClick={() => setShowWaitlist(true)}
            className="bg-black text-white px-6 py-2 font-bold text-sm uppercase tracking-widest hover:opacity-80 transition-opacity border-2 border-black"
          >
            Join Waitlist
          </button>
        </div>
      </nav>

      {/* Hero Section */}
      <header className="pt-24 pb-16 px-8 max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
        <div className="space-y-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-gray-100 rounded-full text-[10px] font-bold uppercase tracking-widest">
            <Sparkles size={12} className="text-blue-600" />
            <span>The Proactive Career Suite</span>
          </div>
          <h1 className="text-6xl lg:text-8xl font-bold tracking-tighter leading-[0.9]">
            Crack the <br />
            <span className="text-gray-400">ATS.</span>
          </h1>
          <p className="text-xl text-gray-400 max-w-md leading-relaxed">
            The AI career agent that helps you land the job. We optimize for ATS, apply on your behalf, and find the people to build the relationships you need to win.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 pt-4">
            <button 
              onClick={() => setShowWaitlist(true)}
              className="bg-black text-white px-10 py-4 font-bold text-sm uppercase tracking-widest flex items-center justify-center gap-3 hover:gap-5 transition-all group"
            >
              Get Started <ArrowRight size={18} />
            </button>
          </div>
        </div>
        <div className="relative group">
          <div className="absolute -inset-4 bg-gradient-to-r from-blue-500/10 to-purple-500/10 blur-3xl opacity-50"></div>
          <div className="relative uber-card overflow-hidden border-2 border-black shadow-2xl transform rotate-1 group-hover:rotate-0 transition-transform duration-500">
            <div className="bg-black text-white px-6 py-3 flex justify-between items-center">
              <span className="text-[10px] font-bold uppercase tracking-widest">AI Agent: {currentRole.role} Pipeline</span>
              <div className="flex gap-1">
                <div className="w-2 h-2 rounded-full bg-red-500"></div>
                <div className="w-2 h-2 rounded-full bg-yellow-500"></div>
                <div className="w-2 h-2 rounded-full bg-green-500"></div>
              </div>
            </div>
            <div className="p-8 space-y-8 bg-white">
              <div className="flex items-end gap-4">
                <div className="text-7xl font-bold text-blue-600 tracking-tighter">{currentRole.score}</div>
                <div className="pb-2">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400">ATS Compatibility</div>
                  <div className="text-xs font-bold text-green-500 uppercase tracking-widest">Score Secured</div>
                </div>
              </div>
              
              <div className="space-y-4">
                <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-blue-600 transition-all duration-1000 ease-out" 
                    style={{ width: `${currentRole.score}%` }}
                  ></div>
                </div>
                <div className="p-4 bg-blue-50 border border-blue-100 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded bg-white border border-blue-100 flex items-center justify-center text-blue-600">
                      <Target size={16} />
                    </div>
                    <div>
                      <div className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">Hiring Pipeline</div>
                      <div className="text-xs font-bold text-blue-800">Auto-Injected via Ashby</div>
                    </div>
                  </div>
                  <Check size={16} className="text-blue-600" />
                </div>
              </div>

              <div className="pt-4 border-t border-gray-100">
                <div className="flex items-center gap-2 text-blue-600 text-[10px] font-bold uppercase tracking-widest mb-3">
                  <Globe size={14} /> Global Format Ready
                </div>
                <div className="flex gap-2">
                   {[1,2,3,4,5].map(i => (
                     <div key={i} className="w-8 h-10 bg-gray-100 border border-gray-200 flex flex-col p-1 gap-1">
                        <div className="w-full h-1 bg-gray-300"></div>
                        <div className="w-2/3 h-1 bg-gray-200"></div>
                        <div className="w-full h-1 bg-gray-300"></div>
                     </div>
                   ))}
                   <div className="flex-1 text-[9px] text-gray-500 italic flex items-center pl-2">
                      10+ Recruiter-approved templates...
                   </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Feature Section: The Re-Added Stuff */}
      <section className="py-24 px-8 border-t border-gray-100">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16 space-y-4">
             <h2 className="text-4xl font-bold tracking-tight">The Modern Applicant's Swiss Army Knife</h2>
             <p className="text-gray-500 max-w-2xl mx-auto">Everything you need to go from "Applied" to "Hired".</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
             {[
               { icon: <Target className="text-blue-600" />, title: "ATS-Cracking CVs", desc: "Generate tailored resumes for every JD with precision keyword optimization." },
               { icon: <Globe className="text-green-600" />, title: "Job Board Pipelines", desc: "Live integration with LinkedIn, Greenhouse, and Ashby boards." },
               { icon: <Zap className="text-yellow-600" />, title: "Tone-Perfect Answers", desc: "Automated application responses written in your unique professional voice." },
               { icon: <Sparkles className="text-purple-600" />, title: "Platform Mastery", desc: "LinkedIn Top Choice & Wellfound 'Why Interested' answers ready in seconds." },
               { icon: <Users className="text-red-500" />, title: "Founder Outreach", desc: "Personalized emails and LinkedIn messages to Founders & Hiring Managers." },
               { icon: <Shield className="text-gray-600" />, title: "Application HUD", desc: "Manage all your job applications cross-platform in one central place." },
               { icon: <Send className="text-blue-500" />, title: "Cover Letters", desc: "Stunning cover letters that bridge the gap between your CV and the role." },
               { icon: <Zap className="text-orange-500" />, title: "10+ Templates", desc: "Export to PDF or DOCX using recruiter-approved layouts." }
             ].map((feat, i) => (
               <div key={i} className="p-6 bg-white border border-gray-100 hover:border-black transition-colors space-y-4 shadow-sm">
                  <div className="w-10 h-10 flex items-center justify-center bg-gray-50 rounded">
                    {feat.icon}
                  </div>
                  <h3 className="font-bold uppercase text-xs tracking-widest">{feat.title}</h3>
                  <p className="text-xs text-gray-500 leading-relaxed">{feat.desc}</p>
               </div>
             ))}
          </div>
        </div>
      </section>

      {/* Value Prop: Professional Agent */}
      <section className="py-24 px-8 bg-black text-white overflow-hidden">
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-24 items-center">
          <div className="space-y-12">
            <h2 className="text-5xl lg:text-7xl font-bold tracking-tighter leading-none">
              Your Long-Term<br />
              Professional Agent.
            </h2>
            <p className="text-xl text-gray-400 leading-relaxed max-w-xl">
              We don't just fix your resume. Jerry Maguire acts as your career agent, building professional relationships on your behalf long before you even search for a job.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
              <div className="space-y-4">
                <div className="w-10 h-10 rounded bg-blue-600 flex items-center justify-center text-white">
                  <Users size={20} />
                </div>
                <h3 className="text-lg font-bold uppercase tracking-tight">Referral Champions</h3>
                <p className="text-sm text-gray-500 leading-relaxed">
                  Automatically identifies and connects you with potential champions at companies like Google, Uber, and Rippling.
                </p>
              </div>
              <div className="space-y-4">
                <div className="w-10 h-10 rounded bg-green-600 flex items-center justify-center text-white">
                  <Send size={20} />
                </div>
                <h3 className="text-lg font-bold uppercase tracking-tight">Passive Relationship Building</h3>
                <p className="text-sm text-gray-500 leading-relaxed">
                  While you work your current job, your agent is busy building the network you'll need for your next move.
                </p>
              </div>
            </div>
          </div>
          <div className="relative">
             <div className="absolute -inset-24 bg-blue-600/20 blur-[120px] rounded-full"></div>
             <div className="relative uber-card bg-[#111] border-gray-800 p-8 space-y-8 rounded-2xl shadow-2xl skew-y-3">
                <div className="flex items-center gap-4 border-b border-gray-800 pb-6">
                   <div className="w-12 h-12 bg-blue-600 rounded-full flex items-center justify-center font-bold text-xl italic">JM</div>
                   <div>
                      <div className="text-xs font-bold text-gray-500 uppercase tracking-widest">Professional Agent</div>
                      <div className="text-lg font-bold text-white tracking-tight">Active Relationship Sync</div>
                   </div>
                </div>
                <div className="space-y-4">
                   {[
                     { name: "Sarah L.", company: "Google", status: "Referral Secured" },
                     { name: "David K.", company: "Uber", status: "Coffee Chat Booked" },
                     { name: "Jessica M.", company: "Rippling", status: "Connection Warm" }
                   ].map((item, i) => (
                     <div key={i} className="flex items-center justify-between p-4 bg-black/40 border border-gray-800 rounded-lg group hover:border-blue-500 transition-colors">
                        <div className="flex items-center gap-3">
                           <div className="w-8 h-8 rounded-full bg-gray-700"></div>
                           <div>
                              <div className="text-xs font-bold text-white">{item.name}</div>
                              <div className="text-[10px] text-gray-500">{item.company}</div>
                           </div>
                        </div>
                        <div className="text-[9px] font-bold text-blue-500 uppercase tracking-widest">{item.status}</div>
                     </div>
                   ))}
                </div>
                <div className="pt-4 text-center">
                   <p className="text-[10px] text-gray-600 font-medium">Your agent is always on. Building your future, one connection at a time.</p>
                </div>
             </div>
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="py-24 px-8 bg-gray-50 border-y border-gray-100">
        <div className="max-w-7xl mx-auto text-center mb-16 space-y-4">
          <h2 className="text-4xl font-bold tracking-tight text-black">How It Works</h2>
          <p className="text-gray-500 max-w-2xl mx-auto">
            Traditional tools suggest. We execute. Our agent is the bridge between you and your dream company.
          </p>
        </div>
        <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-12">
          {[
            { step: '01', title: 'Connect Accounts', desc: 'Sync your job board profiles. We integrate directly with the APIs of leading platforms.' },
            { step: '02', title: 'Define Target', desc: 'Tell us where you want to go. We find the champions and the openings simultaneously.' },
            { step: '03', title: 'Agent Deploys', desc: 'We update your CV specifically for each role and apply while introducing you to the team.' }
          ].map((item, i) => (
            <div key={i} className="relative p-8 bg-white border border-gray-100 hover:shadow-xl transition-all group">
              <div className="text-6xl font-bold text-gray-50 absolute -top-8 -left-4 z-0 group-hover:text-blue-50 transition-colors">{item.step}</div>
              <div className="relative z-10 pt-4 space-y-4">
                <h3 className="text-xl font-bold uppercase tracking-tight text-black">{item.title}</h3>
                <p className="text-gray-500 text-sm leading-relaxed">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Waitlist Modal */}
      {showWaitlist && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => !isSubmitting && setShowWaitlist(false)}></div>
          <div className="relative bg-white w-full max-w-xl p-8 shadow-2xl border-2 border-black max-h-[90vh] overflow-y-auto">
            {!waitlistSuccess ? (
              <>
                <button 
                  onClick={() => setShowWaitlist(false)} 
                  className="absolute top-4 right-4 text-gray-400 hover:text-black"
                >
                  <X size={24} />
                </button>
                <div className="mb-8">
                  <h2 className="text-3xl font-bold tracking-tight mb-2">Join the Waitlist</h2>
                  <p className="text-sm text-gray-500">Help us tailor Jerry Maguire to your career path. This takes less than 60 seconds.</p>
                </div>
                
                <form onSubmit={handleWaitlistSubmit} className="space-y-6">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-gray-400">FullName</label>
                      <input 
                        required
                        type="text" 
                        value={formData.name}
                        onChange={(e) => setFormData({...formData, name: e.target.value})}
                        className="w-full uber-input text-sm p-3 border border-gray-200 outline-none focus:border-black" 
                        placeholder="John Doe"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Email Address</label>
                      <input 
                        required
                        type="email" 
                        value={formData.email}
                        onChange={(e) => setFormData({...formData, email: e.target.value})}
                        className="w-full uber-input text-sm p-3 border border-gray-200 outline-none focus:border-black" 
                        placeholder="john@example.com"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-gray-400">LinkedIn URL</label>
                    <input 
                      type="url" 
                      value={formData.linkedin}
                      onChange={(e) => setFormData({...formData, linkedin: e.target.value})}
                      className="w-full uber-input text-sm p-3 border border-gray-200 outline-none focus:border-black" 
                      placeholder="https://linkedin.com/in/username"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Main Use Case (Pick multiple)</label>
                    <div className="grid grid-cols-2 gap-2">
                      {USE_CASES.map(usecase => (
                        <button
                          key={usecase}
                          type="button"
                          onClick={() => toggleMultiselect('usecase', usecase)}
                          className={`text-left px-3 py-2 text-[10px] font-bold uppercase border transition-all ${formData.usecase.includes(usecase) ? 'bg-black text-white border-black' : 'bg-gray-50 border-gray-100 text-gray-500 hover:border-gray-300'}`}
                        >
                          {usecase}
                        </button>
                      ))}
                    </div>
                    {formData.usecase.includes('Other') && (
                      <input 
                        type="text" 
                        value={formData.otherUsecase}
                        onChange={(e) => setFormData({...formData, otherUsecase: e.target.value})}
                        className="w-full uber-input text-xs p-3 border border-gray-200 outline-none focus:border-black mt-2" 
                        placeholder="Please specify your usecase..."
                      />
                    )}
                  </div>

                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Would you pay for this tool?</label>
                      <div className="flex gap-4">
                        {['Yes', 'No'].map(choice => (
                          <button
                            key={choice}
                            type="button"
                            onClick={() => setFormData({...formData, wouldPay: choice})}
                            className={`flex-1 px-4 py-2 text-xs font-bold border transition-all ${formData.wouldPay === choice ? 'bg-black text-white border-black' : 'bg-gray-50 border-gray-100 text-gray-400'}`}
                          >
                            {choice}
                          </button>
                        ))}
                      </div>
                    </div>

                    {formData.wouldPay === 'Yes' && (
                      <div className="space-y-2 animate-in fade-in slide-in-from-top-2 duration-300">
                        <label className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Price Preference (pick multiple)</label>
                        <div className="grid grid-cols-1 gap-2">
                          {PRICE_RANGES.map(price => (
                            <button
                              key={price}
                              type="button"
                              onClick={() => toggleMultiselect('priceRange', price)}
                              className={`text-left px-4 py-3 text-xs font-bold border transition-all ${formData.priceRange.includes(price) ? 'bg-blue-600 text-white border-blue-600' : 'bg-gray-50 border-gray-100 text-gray-500 hover:border-gray-300'}`}
                            >
                              {price}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Additional Notes / Features you want?</label>
                    <textarea 
                      value={formData.additionalNote}
                      onChange={(e) => setFormData({...formData, additionalNote: e.target.value})}
                      className="w-full uber-input text-sm p-3 border border-gray-200 outline-none focus:border-black min-h-[100px]" 
                      placeholder="What else should your personal agent do for you?"
                    />
                  </div>

                  <button 
                    disabled={isSubmitting}
                    type="submit"
                    className="w-full bg-black text-white py-4 font-bold text-sm uppercase tracking-widest hover:opacity-90 transition-opacity disabled:opacity-50"
                  >
                    {isSubmitting ? 'Submitting...' : 'Join Waitlist'}
                  </button>
                </form>
              </>
            ) : (
              <div className="text-center py-12 space-y-4">
                 <div className="w-16 h-16 bg-blue-600 text-white rounded-full flex items-center justify-center mx-auto mb-6">
                    <Check size={32} />
                 </div>
                 <h2 className="text-3xl font-bold tracking-tight">You're on the list!</h2>
                 <p className="text-gray-500 max-w-sm mx-auto">Thank you for your feedback. We'll be in touch soon with exclusive beta access.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="py-12 px-8 border-t border-gray-100 text-center bg-white">
        <div className="max-w-7xl mx-auto flex flex-col items-center gap-6">
          <div className="flex items-center gap-3">
            <div className="bg-black text-white font-bold px-2 py-0.5 text-sm">JM</div>
            <span className="font-bold tracking-tight text-sm text-black">Jerry Maguire</span>
          </div>
          <p className="text-[10px] text-gray-400 uppercase tracking-[0.2em]">
            The World's First Proactive Career Agent • © 2026
          </p>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
