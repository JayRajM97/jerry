import React from 'react';
import { Building2, Users, Newspaper, ExternalLink } from 'lucide-react';
import { CompanyIntel } from '../types';

interface Props {
  intel: CompanyIntel | null;
  isLoading: boolean;
  companyName?: string;
}

const CompanyIntelCard: React.FC<Props> = ({ intel, isLoading, companyName }) => {
  if (!isLoading && !intel && !companyName) return null;

  return (
    <div className="uber-card overflow-hidden mb-16">
      <div className="bg-black dark:bg-[#1A1A1A] text-white px-8 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Building2 size={14} />
          <h4 className="font-bold uppercase tracking-widest text-[10px]">Company Intelligence</h4>
          {companyName && <span className="text-gray-400 text-[10px] ml-2">— {companyName}</span>}
        </div>
        {intel && (
          <span className="text-[10px] text-gray-500">
            Updated {new Date(intel.fetchedAt).toLocaleDateString()}
          </span>
        )}
      </div>

      <div className="p-8">
        {isLoading && (
          <div className="space-y-4 animate-pulse">
            <div className="flex gap-3">
              <div className="h-6 w-24 bg-gray-200 dark:bg-[#333333] rounded-full" />
              <div className="h-6 w-20 bg-gray-200 dark:bg-[#333333] rounded-full" />
            </div>
            <div className="h-4 w-3/4 bg-gray-200 dark:bg-[#333333] rounded" />
            <div className="h-4 w-1/2 bg-gray-200 dark:bg-[#333333] rounded" />
            <div className="h-4 w-2/3 bg-gray-200 dark:bg-[#333333] rounded" />
          </div>
        )}

        {!isLoading && !intel && (
          <p className="text-sm text-gray-400 dark:text-gray-600 italic">No company intelligence available for this role.</p>
        )}

        {!isLoading && intel && (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
            {/* Left: Meta + Hiring Manager */}
            <div className="space-y-6">
              {/* Stage / Size Badges */}
              {(intel.stage || intel.companySize) && (
                <div className="flex flex-wrap gap-2">
                  {intel.stage && (
                    <span className="px-3 py-1 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 text-[10px] font-bold uppercase tracking-widest rounded-full">
                      {intel.stage}
                    </span>
                  )}
                  {intel.companySize && (
                    <span className="flex items-center gap-1 px-3 py-1 bg-gray-100 dark:bg-[#1F1F1F] text-gray-600 dark:text-gray-400 text-[10px] font-bold uppercase tracking-widest rounded-full">
                      <Users size={10} />
                      {intel.companySize}
                    </span>
                  )}
                </div>
              )}

              {/* Product Context */}
              {intel.productContext && (
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Product / Mission</p>
                  <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">{intel.productContext}</p>
                </div>
              )}

              {/* Team Context */}
              {intel.teamContext && (
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Team Context</p>
                  <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">{intel.teamContext}</p>
                </div>
              )}

              {/* Hiring Manager */}
              {intel.hiringManager && (
                <div className="bg-blue-50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-900 p-4 rounded">
                  <p className="text-[10px] font-bold text-blue-700 dark:text-blue-400 uppercase tracking-widest mb-1">Potential Hiring Contact</p>
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-bold text-gray-800 dark:text-gray-200">{intel.hiringManager}</p>
                    <a
                      href={`https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(intel.hiringManager)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-[10px] font-bold text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      Search LinkedIn <ExternalLink size={10} />
                    </a>
                  </div>
                </div>
              )}
            </div>

            {/* Right: Recent News */}
            {intel.recentNews && intel.recentNews.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <Newspaper size={14} className="text-gray-400" />
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Recent Activity</p>
                </div>
                <ul className="space-y-3">
                  {intel.recentNews.map((item, idx) => (
                    <li key={idx} className="flex items-start gap-3 text-sm text-gray-700 dark:text-gray-300">
                      <span className="text-gray-300 dark:text-gray-600 mt-1 text-[10px] shrink-0">{idx + 1}.</span>
                      <span className="leading-relaxed">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default CompanyIntelCard;
