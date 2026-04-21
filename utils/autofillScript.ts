export type Platform = 'auto' | 'linkedin' | 'greenhouse' | 'lever' | 'ashby' | 'workday' | 'keka' | 'generic';

export const PLATFORM_LABELS: Record<Platform, string> = {
  auto: 'Auto-detect',
  linkedin: 'LinkedIn Easy Apply',
  greenhouse: 'Greenhouse',
  lever: 'Lever',
  ashby: 'Ashby',
  workday: 'Workday',
  keka: 'Keka',
  generic: 'Generic / Other',
};

export function detectPlatform(url: string): Platform {
  if (!url) return 'generic';
  const u = url.toLowerCase();
  if (u.includes('linkedin.com')) return 'linkedin';
  if (u.includes('greenhouse.io')) return 'greenhouse';
  if (u.includes('lever.co')) return 'lever';
  if (u.includes('ashbyhq.com')) return 'ashby';
  if (u.includes('myworkdayjobs.com') || u.includes('workday.com')) return 'workday';
  if (u.includes('keka.com') || u.includes('.keka.')) return 'keka';
  return 'generic';
}

export interface AutofillData {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  linkedin: string;
  portfolio: string;
  coverLetter: string;
  whyCompany: string;
  location: string;
}

export function extractAutofillData(
  parsedCv: any,
  userEmail: string,
  coverLetter: string,
  whyCompany: string
): AutofillData {
  const name: string = parsedCv?.candidate_name || '';
  const parts = name.trim().split(/\s+/);
  const firstName = parts[0] || '';
  const lastName = parts.slice(1).join(' ') || '';

  const contact = parsedCv?.contact || {};
  const links: string[] = contact.links || [];

  const linkedin = links.find((l: string) =>
    l.toLowerCase().includes('linkedin.com')
  ) || '';

  const portfolio = links.find((l: string) =>
    !l.toLowerCase().includes('linkedin.com') &&
    !l.toLowerCase().includes('github.com') &&
    (l.startsWith('http') || l.startsWith('www'))
  ) || links.find((l: string) => l.toLowerCase().includes('github.com')) || '';

  const stripHtml = (html: string) => {
    const div = typeof document !== 'undefined' ? document.createElement('div') : null;
    if (div) { div.innerHTML = html; return div.textContent || div.innerText || ''; }
    return html.replace(/<[^>]+>/g, '').replace(/\n\n+/g, '\n\n').trim();
  };

  return {
    firstName,
    lastName,
    email: contact.email || userEmail || '',
    phone: contact.phone || '',
    linkedin,
    portfolio,
    location: contact.location || '',
    coverLetter: stripHtml(coverLetter),
    whyCompany,
  };
}

export function generateAutofillScript(data: AutofillData, platform: Platform = 'generic'): string {
  const safeData = JSON.stringify(data);
  const platformLabel = PLATFORM_LABELS[platform];
  const fillCode = getPlatformFillCode(platform);

  return `/* ─── Jerry Autofill Script ──────────────────────────────────────
   Platform: ${platformLabel}
   Paste this into the browser DevTools Console (F12 → Console tab)
   while on the job application page, then press Enter.
   Does NOT submit the form — review everything before clicking Submit.
──────────────────────────────────────────────────────────────── */
(function () {
  'use strict';
  var data = ${safeData};
  var filled = [];
  var skipped = [];

  function setNativeValue(el, value) {
    var proto = el.tagName === 'TEXTAREA'
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype;
    var setter = Object.getOwnPropertyDescriptor(proto, 'value');
    if (setter && setter.set) {
      setter.set.call(el, value);
    } else {
      el.value = value;
    }
  }

  function fireEvents(el) {
    ['input', 'change', 'blur'].forEach(function (evt) {
      el.dispatchEvent(new Event(evt, { bubbles: true }));
    });
  }

  function fill(label, selectors, value, root) {
    root = root || document;
    if (!value || !value.trim()) { skipped.push(label + ' (empty)'); return; }
    for (var i = 0; i < selectors.length; i++) {
      var els = root.querySelectorAll(selectors[i]);
      for (var j = 0; j < els.length; j++) {
        var el = els[j];
        var tag = el.tagName.toLowerCase();
        if ((tag === 'input' || tag === 'textarea') && !el.disabled && !el.readOnly) {
          setNativeValue(el, value);
          fireEvents(el);
          filled.push(label);
          return;
        }
      }
    }
    skipped.push(label);
  }

${fillCode}

  var g = 'color:#10B981;font-weight:bold;font-size:13px;';
  var w = 'color:#F59E0B;font-weight:bold;';
  var b = 'color:#6366F1;font-weight:bold;';
  console.log('%c\\u2705 Jerry Autofill [${platformLabel}] \\u2014 ' + filled.length + ' field(s) filled', g);
  if (filled.length)  console.log('%cFilled: ' + filled.join(' \\u2022 '), g);
  if (skipped.length) console.log('%cNot found (fill manually): ' + skipped.filter(function(s){ return !s.includes('(empty)'); }).join(', '), w);
  console.log('%c\\u2192 Review all fields carefully before clicking Submit!', b);
})();`;
}

function getPlatformFillCode(platform: Platform): string {
  switch (platform) {
    case 'linkedin':
      return `  // LinkedIn Easy Apply modal
  fill('First Name', [
    'input[id$="firstName"]', 'input[id*="firstName"]',
    '.artdeco-text-input--input[id*="first" i]',
    'input[placeholder="First name"]', 'input[autocomplete="given-name"]'
  ], data.firstName);

  fill('Last Name', [
    'input[id$="lastName"]', 'input[id*="lastName"]',
    '.artdeco-text-input--input[id*="last" i]',
    'input[placeholder="Last name"]', 'input[autocomplete="family-name"]'
  ], data.lastName);

  fill('Email', [
    'input[id*="email"]', 'input[type="email"]',
    '.artdeco-text-input--input[id*="email" i]'
  ], data.email);

  fill('Phone', [
    'input[id*="phoneNumber"]', 'input[id*="phone-number"]',
    'input[id*="phone"]', 'input[type="tel"]'
  ], data.phone);

  fill('City', [
    'input[id*="city"]', 'input[id*="location"]',
    'input[placeholder*="City" i]', 'input[placeholder*="Location" i]'
  ], data.location);

  fill('Cover Letter', [
    'textarea[id*="cover-letter"]', 'textarea[id*="coverLetter"]',
    'textarea[id*="cover_letter"]', 'textarea[placeholder*="Cover" i]',
    'textarea'
  ], data.coverLetter);`;

    case 'greenhouse':
      return `  // Greenhouse
  fill('First Name', ['#first_name', 'input[name="first_name"]'], data.firstName);
  fill('Last Name', ['#last_name', 'input[name="last_name"]'], data.lastName);
  fill('Email', ['#email', 'input[name="email"]', 'input[type="email"]'], data.email);
  fill('Phone', ['#phone', 'input[name="phone"]', 'input[type="tel"]'], data.phone);
  fill('LinkedIn', ['#linkedin_profile', 'input[name="linkedin_profile"]', 'input[id*="linkedin" i]'], data.linkedin);
  fill('Website', ['#website', 'input[name="website"]', 'input[name="personal_website"]'], data.portfolio);
  fill('Location', ['#location', 'input[name="location"]'], data.location);
  fill('Cover Letter', ['#cover_letter', 'textarea[name="cover_letter"]', 'textarea[id*="cover" i]'], data.coverLetter);`;

    case 'lever':
      return `  // Lever
  fill('Full Name', ['input[name="name"]', 'input[id="name"]'], (data.firstName + ' ' + data.lastName).trim());
  fill('Email', ['input[name="email"]', '[data-qa="email-input"]', 'input[type="email"]'], data.email);
  fill('Phone', ['input[name="phone"]', '[data-qa="phone-input"]', 'input[type="tel"]'], data.phone);
  fill('LinkedIn', ['input[name="urls[LinkedIn]"]', 'input[name="urls[linkedin]"]', 'input[placeholder*="LinkedIn" i]'], data.linkedin);
  fill('Portfolio', ['input[name="urls[Portfolio]"]', 'input[name="urls[Other]"]', 'input[name="urls[Website]"]'], data.portfolio);
  fill('Cover Letter', ['textarea[name="comments"]', 'textarea[name="cover_letter"]', 'textarea[placeholder*="cover" i]'], data.coverLetter);`;

    case 'ashby':
      return `  // Ashby
  fill('First Name', [
    'input[name="firstName"]', '[data-testid="firstName"] input',
    'input[id*="firstName"]', 'input[placeholder*="First" i]'
  ], data.firstName);
  fill('Last Name', [
    'input[name="lastName"]', '[data-testid="lastName"] input',
    'input[id*="lastName"]', 'input[placeholder*="Last" i]'
  ], data.lastName);
  fill('Email', ['input[name="email"]', '[data-testid="email"] input', 'input[type="email"]'], data.email);
  fill('Phone', [
    'input[name="phone"]', '[data-testid="phone"] input',
    'input[name="phoneNumber"]', 'input[type="tel"]'
  ], data.phone);
  fill('LinkedIn', [
    'input[name="linkedIn"]', 'input[name="linkedin"]',
    '[data-testid="linkedin"] input', 'input[placeholder*="LinkedIn" i]'
  ], data.linkedin);
  fill('Cover Letter', [
    'textarea[name="coverLetter"]', '[data-testid="coverLetter"] textarea',
    'textarea[placeholder*="cover" i]', 'textarea'
  ], data.coverLetter);`;

    case 'workday':
      return `  // Workday — tries document first, then traverses same-origin iframes
  var roots = [document];
  document.querySelectorAll('iframe').forEach(function(fr) {
    try { if (fr.contentDocument) roots.push(fr.contentDocument); } catch(e) {}
  });

  roots.forEach(function(root) {
    fill('First Name', [
      '[data-automation-id="legalNameSection_firstName"] input',
      '[data-automation-id="firstName"] input',
      'input[data-automation-id*="firstName"]'
    ], data.firstName, root);

    fill('Last Name', [
      '[data-automation-id="legalNameSection_lastName"] input',
      '[data-automation-id="lastName"] input',
      'input[data-automation-id*="lastName"]'
    ], data.lastName, root);

    fill('Email', [
      '[data-automation-id="email"] input',
      'input[data-automation-id*="email" i]',
      'input[type="email"]'
    ], data.email, root);

    fill('Phone', [
      '[data-automation-id="phone-number"] input',
      'input[data-automation-id*="phone" i]',
      'input[type="tel"]'
    ], data.phone, root);

    fill('City', [
      '[data-automation-id="addressSection_city"] input',
      'input[data-automation-id*="city" i]'
    ], data.location, root);
  });`;

    case 'keka':
      return `  // Keka
  fill('First Name', [
    'input[placeholder="First name"]', 'input[placeholder="First Name"]',
    'input[name="firstName"]', 'input[id*="firstName" i]'
  ], data.firstName);
  fill('Last Name', [
    'input[placeholder="Last name"]', 'input[placeholder="Last Name"]',
    'input[name="lastName"]', 'input[id*="lastName" i]'
  ], data.lastName);
  fill('Email', ['input[type="email"]', 'input[placeholder*="Email" i]', 'input[name="email"]'], data.email);
  fill('Phone', ['input[type="tel"]', 'input[placeholder*="Phone" i]', 'input[name="phone"]'], data.phone);
  fill('LinkedIn', [
    'input[placeholder*="LinkedIn" i]', 'input[name*="linkedin" i]',
    'input[id*="linkedin" i]'
  ], data.linkedin);
  fill('Cover Letter', ['textarea[placeholder*="Cover" i]', 'textarea[name*="cover" i]', 'textarea'], data.coverLetter);`;

    default: // generic
      return `  fill('First Name', [
    '#first_name', 'input[name="first_name"]', 'input[name="firstName"]',
    '[data-qa="name-first"]', 'input[autocomplete="given-name"]',
    'input[placeholder*="First" i]', '[aria-label*="First name" i]',
    'input[id*="first" i][type="text"]'
  ], data.firstName);

  fill('Last Name', [
    '#last_name', 'input[name="last_name"]', 'input[name="lastName"]',
    '[data-qa="name-last"]', 'input[autocomplete="family-name"]',
    'input[placeholder*="Last" i]', '[aria-label*="Last name" i]',
    'input[id*="last" i][type="text"]'
  ], data.lastName);

  fill('Full Name', [
    'input[name="name"]', 'input[id="name"]', '[data-qa="name"]',
    'input[placeholder*="Full name" i]', '[aria-label*="Full name" i]',
    'input[autocomplete="name"]'
  ], (data.firstName + ' ' + data.lastName).trim());

  fill('Email', [
    '#email', 'input[type="email"]', 'input[name="email"]',
    '[data-qa="email"]', 'input[placeholder*="Email" i]',
    '[aria-label*="Email" i]', 'input[autocomplete="email"]'
  ], data.email);

  fill('Phone', [
    '#phone', 'input[type="tel"]', 'input[name="phone"]',
    'input[name="phone_number"]', '[data-qa="phone"]',
    'input[placeholder*="Phone" i]', '[aria-label*="Phone" i]',
    'input[autocomplete="tel"]'
  ], data.phone);

  fill('Location / City', [
    '#location', 'input[name="location"]', 'input[name="city"]',
    'input[placeholder*="Location" i]', 'input[placeholder*="City" i]',
    '[aria-label*="Location" i]', 'input[autocomplete="address-level2"]'
  ], data.location);

  fill('LinkedIn URL', [
    '#linkedin_profile', 'input[name="linkedin_profile"]',
    'input[name="linkedIn"]', 'input[name="linkedin"]',
    '[data-qa="linkedin"]', 'input[placeholder*="LinkedIn" i]',
    'input[id*="linkedin" i]', 'input[name*="linkedin" i]'
  ], data.linkedin);

  fill('Website / Portfolio', [
    '#website', 'input[name="website"]', 'input[name="portfolio"]',
    'input[name="personal_website"]', '[data-qa="website"]',
    'input[placeholder*="Website" i]', 'input[placeholder*="Portfolio" i]',
    'input[id*="website" i]', 'input[name*="website" i]',
    'input[autocomplete="url"]'
  ], data.portfolio);

  fill('Cover Letter', [
    '#cover_letter', 'textarea[name="cover_letter"]',
    'textarea[name="coverLetter"]', '[data-qa="cover-letter"]',
    'textarea[placeholder*="Cover letter" i]', 'textarea[id*="cover" i]',
    'textarea[name*="cover" i]', 'textarea[placeholder*="letter" i]'
  ], data.coverLetter);

  fill('Why This Company', [
    'textarea[name*="why" i]', 'textarea[id*="why" i]',
    'textarea[placeholder*="Why do you" i]', 'textarea[placeholder*="what interests you" i]',
    'textarea[placeholder*="why are you interested" i]',
    'textarea[placeholder*="tell us why" i]', 'textarea[name*="interest" i]',
    'textarea[placeholder*="motivation" i]'
  ], data.whyCompany || data.coverLetter);`;
  }
}
