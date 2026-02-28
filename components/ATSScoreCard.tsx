
import React from 'react';
import { ATSScore } from '../types';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, LabelList } from 'recharts';

interface Props {
  title: string;
  score: ATSScore | null;
  highlightColor: string;
}

const MAX_WEIGHTS: Record<string, number> = {
  required_skills: 35,
  preferred_skills: 10,
  tools: 10,
  experience_years: 15,
  title_relevance: 10,
  responsibilities: 10,
  quantified_impact: 5,
  format_hygiene: 5
};

const ATSScoreCard: React.FC<Props> = ({ title, score, highlightColor }) => {
  if (!score) return null;

  const chartData = Object.entries(score.breakdown).map(([key, val]) => {
    const max = MAX_WEIGHTS[key] || 100;
    const percentage = Math.max(0, Math.min(100, Math.round(((val as number) / max) * 100)));
    return {
      name: key.replace(/_/g, ' ').trim().toUpperCase(),
      value: percentage,
      rawValue: Math.round((val as number) * 10) / 10,
      max: max
    };
  });

  return (
    <div className="uber-card p-8 flex flex-col h-full">
      <h3 className="text-base font-bold mb-6 text-black uppercase tracking-tight">{title}</h3>
      <div className="flex items-center gap-6 mb-8">
        <div className="text-5xl font-bold" style={{ color: highlightColor }}>
          {score.total}
        </div>
        <div className="text-xs text-gray-400 font-bold uppercase tracking-widest leading-none">
          ATS<br/>Match<br/>
          <span className="text-[9px] text-gray-300 mt-1 block">{score.band}</span>
        </div>
      </div>
      
      <div className="flex-1 min-h-[250px] w-full mb-8">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} layout="vertical" margin={{ top: 0, right: 30, left: 0, bottom: 0 }}>
            <XAxis type="number" hide domain={[0, 100]} />
            <YAxis 
              dataKey="name" 
              type="category" 
              axisLine={false} 
              tickLine={false} 
              tick={{ fontSize: 9, fill: '#9CA3AF', fontWeight: 'bold', fontFamily: 'Inter' }}
              width={130}
            />
            <Tooltip 
              cursor={{ fill: 'transparent' }}
              contentStyle={{ borderRadius: '4px', border: '1px solid #E5E7EB', fontSize: '12px', fontWeight: 'bold' }}
              formatter={(value: number, name: string, props: any) => [`${props.payload.rawValue} / ${props.payload.max} pts`, 'Score']}
            />
            <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={12}>
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={highlightColor} />
              ))}
              <LabelList 
                dataKey="rawValue" 
                position="right" 
                formatter={(val: number) => {
                   const item = chartData.find(d => d.rawValue === val);
                   return item ? `${val}/${item.max}` : `${val}`;
                }} 
                style={{ fontSize: '10px', fontWeight: 'bold', fill: '#6B7280' }} 
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {score.topImprovements.length > 0 && (
        <div className="mt-auto pt-6 border-t border-gray-100">
          <h4 className="font-bold text-black text-xs mb-3 uppercase tracking-widest">Key Opportunities:</h4>
          <ul className="text-xs text-gray-600 space-y-2">
            {score.topImprovements.map((imp, idx) => (
              <li key={idx} className="flex items-start gap-3">
                <span className="text-black font-bold">→</span>
                {imp.label}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default ATSScoreCard;
