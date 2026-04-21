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

  // Strip HTML from cover letter for plain-text fields
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

export function generateAutofillScript(data: AutofillData): string {
  const safeData = JSON.stringify(data);

  return `/* ─── Jerry Autofill Script ──────────────────────────────────────
   Paste this into the browser DevTools Console (F12 → Console tab)
   while on the job application page, then press Enter.
   The script fills common fields but does NOT submit the form.
   Review everything before clicking Submit.
──────────────────────────────────────────────────────────────── */
(function () {
  'use strict';
  var data = ${safeData};
  var filled = [];
  var skipped = [];

  /* ---- React/Vue-safe field setter ---- */
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

  function fill(label, selectors, value) {
    if (!value || !value.trim()) { skipped.push(label + ' (empty)'); return; }
    for (var i = 0; i < selectors.length; i++) {
      var els = document.querySelectorAll(selectors[i]);
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

  /* ---- Field Definitions (Greenhouse, Lever, Ashby, Workday, generic) ---- */

  fill('First Name', [
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
  ], data.whyCompany || data.coverLetter);

  /* ---- Summary ---- */
  var g = 'color:#10B981;font-weight:bold;font-size:13px;';
  var w = 'color:#F59E0B;font-weight:bold;';
  var b = 'color:#6366F1;font-weight:bold;';
  console.log('%c✅ Jerry Autofill — ' + filled.length + ' field(s) filled', g);
  if (filled.length)  console.log('%cFilled: ' + filled.join(' • '), g);
  if (skipped.length) console.log('%cNot found (fill manually): ' + skipped.filter(function(s){ return !s.includes('(empty)'); }).join(', '), w);
  console.log('%c→ Review all fields carefully before clicking Submit!', b);
})();`;
}
