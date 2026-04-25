
import React, { useState } from 'react';
import { Suggestion, CVSection } from '../types';
import { computeSimpleDiff } from '../utils/diffHelper';

interface Props {
  section: CVSection;
  suggestions: Suggestion[];
  onToggle: (id: string) => void;
}

const DiffSection: React.FC<Props> = ({ section, suggestions, onToggle }) => {
  const [viewMode, setViewMode] = useState<'unified' | 'split'>('unified');
  
  // Calculate final text for this section based on applied suggestions
  const sectionSuggestions = suggestions.filter(s => s.sectionId === section.id);
  let currentContent = section.content;
  
  // Simple replacement simulation
  sectionSuggestions.forEach(s => {
    if (s.applied) {
      currentContent = currentContent.replace(s.originalText, s.suggestedText);
    }
  });

  const diffParts = computeSimpleDiff(section.content, currentContent);

  return (
    <div className="duo-card bg-white overflow-hidden mb-6 border border-gray-200">
      <div className="bg-gray-100 p-3 flex justify-between items-center border-b-2 border-gray-200">
        <h4 className="font-bold text-gray-700 uppercase tracking-wide text-sm">{section.title}</h4>
        <div className="flex bg-gray-200 rounded-lg p-1 text-xs font-bold">
          <button 
            onClick={() => setViewMode('unified')}
            className={`px-3 py-1 rounded ${viewMode === 'unified' ? 'bg-white shadow-sm text-blue-500' : 'text-gray-500'}`}
          >
            Unified
          </button>
          <button 
            onClick={() => setViewMode('split')}
            className={`px-3 py-1 rounded ${viewMode === 'split' ? 'bg-white shadow-sm text-blue-500' : 'text-gray-500'}`}
          >
            Split
          </button>
        </div>
      </div>

      <div className="p-0 font-mono text-sm overflow-x-auto bg-white">
        {viewMode === 'unified' ? (
          <div className="min-w-full">
            {diffParts.map((part, idx) => (
              <div 
                key={idx} 
                className={`px-4 py-0.5 flex whitespace-pre-wrap ${part.added ? 'bg-green-100 text-green-800 border-l-4 border-green-500' : part.removed ? 'bg-red-100 text-red-800 border-l-4 border-red-500' : 'text-gray-600'}`}
              >
                <span className="w-6 opacity-50 shrink-0">{part.added ? '+' : part.removed ? '-' : ' '}</span>
                {part.value}
              </div>
            ))}
          </div>
        ) : (
          <div className="flex min-w-full divide-x divide-gray-200">
            <div className="w-1/2">
              <div className="bg-gray-50 px-4 py-1 font-bold text-xs text-gray-500 border-b border-gray-200">Original</div>
              {section.content.split('\n').map((line, i) => (
                <div key={i} className="px-4 py-0.5 text-gray-600 whitespace-pre-wrap">{line}</div>
              ))}
            </div>
            <div className="w-1/2">
               <div className="bg-gray-50 px-4 py-1 font-bold text-xs text-gray-500 border-b border-gray-200">Suggested</div>
               {currentContent.split('\n').map((line, i) => (
                <div key={i} className={`px-4 py-0.5 text-gray-600 whitespace-pre-wrap ${line !== section.content.split('\n')[i] ? 'bg-green-50' : ''}`}>{line}</div>
              ))}
            </div>
          </div>
        )}
      </div>

      {sectionSuggestions.length > 0 && (
        <div className="p-4 bg-blue-50 border-t-2 border-blue-100">
          <p className="text-xs font-bold text-blue-600 uppercase mb-3">Proposed Changes:</p>
          {sectionSuggestions.map(s => (
            <div key={s.id} className="flex items-start gap-3 mb-3 last:mb-0">
              <input 
                type="checkbox" 
                checked={s.applied}
                onChange={() => onToggle(s.id)}
                className="mt-1 w-5 h-5 rounded border-gray-300 bg-white text-blue-600 focus:ring-blue-500"
              />
              <div>
                <p className="text-sm font-bold text-gray-800">{s.reason}</p>
                {s.riskFlag && (
                   <span className="inline-block mt-1 bg-orange-100 text-orange-700 text-[10px] font-bold px-2 py-0.5 rounded uppercase">
                     ⚠️ Factuality Check Recommended
                   </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default DiffSection;
