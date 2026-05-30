import React, { useState } from 'react';
import { Check } from 'lucide-react';
import type { ApplicationProfile } from '../types';

interface Props {
  value: ApplicationProfile;
  onSave: (profile: ApplicationProfile) => void;
}

const textFields: { key: keyof ApplicationProfile; label: string; placeholder: string }[] = [
  { key: 'firstName', label: 'First Name', placeholder: 'Jay' },
  { key: 'lastName', label: 'Last Name', placeholder: 'Raj' },
  { key: 'email', label: 'Email', placeholder: 'you@example.com' },
  { key: 'phone', label: 'Phone', placeholder: '+1 555 000 1234' },
  { key: 'location', label: 'Location (City, Country)', placeholder: 'Bengaluru, India' },
  { key: 'linkedinUrl', label: 'LinkedIn URL', placeholder: 'https://linkedin.com/in/…' },
  { key: 'githubUrl', label: 'GitHub URL', placeholder: 'https://github.com/…' },
  { key: 'portfolioUrl', label: 'Website / Portfolio URL', placeholder: 'https://…' },
  { key: 'gender', label: 'Gender', placeholder: 'Male / Female / …' },
  { key: 'currentCompensation', label: 'Current Compensation', placeholder: '32.5L base + 40L ESOPs' },
  { key: 'expectedCompensation', label: 'Expected Compensation', placeholder: '40L + Variable' },
  { key: 'noticePeriod', label: 'Notice Period', placeholder: 'Immediately / 0 days / 30 days' },
  { key: 'aiShowcaseLink', label: 'AI Showcase Link', placeholder: 'https://… (where you leverage AI)' },
  { key: 'yearsExperience', label: 'Years of Experience', placeholder: '6.5' },
  { key: 'industry', label: 'Preferred Industry Label', placeholder: 'SaaS / internet (consumer tech for consumer-facing roles)' },
  { key: 'resumePath', label: 'Resume File Path (Mac)', placeholder: '/Users/you/Documents/Resume.pdf' },
];

const boolToStr = (v: boolean | null) => (v === null ? '' : v ? 'yes' : 'no');
const strToBool = (s: string): boolean | null => (s === '' ? null : s === 'yes');

const ApplicationProfileForm: React.FC<Props> = ({ value, onSave }) => {
  const [profile, setProfile] = useState<ApplicationProfile>(value);
  const [saved, setSaved] = useState(false);

  const update = (patch: Partial<ApplicationProfile>) => {
    setProfile(prev => ({ ...prev, ...patch }));
    setSaved(false);
  };

  const handleSave = () => {
    onSave(profile);
    setSaved(true);
  };

  return (
    <div className="uber-card p-6">
      <div className="flex justify-between items-start mb-6">
        <div>
          <h3 className="text-lg font-bold dark:text-white">Application Profile</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            This profile is used to auto-fill job applications. Filling it once means future Auto-Apply runs don't have to stop and ask. Work-authorization, comp, and notice are never guessed — set them here.
          </p>
        </div>
        <button onClick={handleSave} className="uber-button-primary text-[10px] font-bold uppercase tracking-widest px-6">
          {saved ? <span className="flex items-center gap-2"><Check size={14} /> Saved</span> : 'Save'}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {textFields.map(f => (
          <div key={f.key}>
            <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-1">{f.label}</label>
            <input
              type="text"
              value={(profile[f.key] as string) || ''}
              onChange={(e) => update({ [f.key]: e.target.value } as Partial<ApplicationProfile>)}
              placeholder={f.placeholder}
              className="w-full uber-input text-sm dark:bg-[#0A0A0A] dark:text-white"
            />
          </div>
        ))}

        <div>
          <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-1">Authorized to work (role's country)</label>
          <select
            value={boolToStr(profile.workAuthorized)}
            onChange={(e) => update({ workAuthorized: strToBool(e.target.value) })}
            className="w-full uber-input text-sm dark:bg-[#0A0A0A] dark:text-white"
          >
            <option value="">—</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        </div>

        <div>
          <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-1">Need visa sponsorship</label>
          <select
            value={boolToStr(profile.needsVisaSponsorship)}
            onChange={(e) => update({ needsVisaSponsorship: strToBool(e.target.value) })}
            className="w-full uber-input text-sm dark:bg-[#0A0A0A] dark:text-white"
          >
            <option value="">—</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        </div>
      </div>

      <label className="flex items-center gap-2 mt-4 text-sm text-gray-700 dark:text-gray-300">
        <input
          type="checkbox"
          checked={profile.declineDemographics}
          onChange={(e) => update({ declineDemographics: e.target.checked })}
        />
        Decline to answer demographic / EEO questions
      </label>
    </div>
  );
};

export default ApplicationProfileForm;
