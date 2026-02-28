
import React from 'react';
import { Suggestion } from '../types';

interface Props {
  suggestion: Suggestion;
}

const RationalePanel: React.FC<Props> = ({ suggestion }) => {
  const { matchedKeywords, improvedComponent, riskCheck } = suggestion.rationaleDetails;

  return (
    <div className="px-6 py-4 bg-white dark:bg-[#141414] border-t border-gray-100 dark:border-[#333333]">
      <div className="flex flex-col gap-3">
         <p className="text-sm font-medium text-black dark:text-white leading-relaxed">{suggestion.reason}</p>
         
         <div className="flex flex-wrap items-center gap-2">
             <span className="text-[9px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest border border-gray-200 dark:border-[#333333] px-2 py-0.5 bg-gray-50 dark:bg-[#141414]">
               Impact: {improvedComponent}
             </span>
             {matchedKeywords.map(kw => (
               <span key={kw} className="bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-300 border border-blue-100 dark:border-blue-900/50 text-[9px] px-2 py-0.5 font-bold uppercase tracking-tighter">
                 {kw}
               </span>
             ))}
             {riskCheck === 'needs_confirmation' && (
                <span className="text-[9px] px-2 py-0.5 font-bold uppercase text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/20 border border-orange-100 dark:border-orange-900/50 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-orange-500"></span>
                  Verify Metrics
                </span>
             )}
         </div>
      </div>
    </div>
  );
};

export default RationalePanel;
