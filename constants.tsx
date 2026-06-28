import React from 'react';

// Jay's actual master resume. Used as the default seed for masterCvHtml / cvHtml
// when no version exists in the database yet. Hyperlinks preserved from the PDF.
export const SAMPLE_CV = `
<h1>Jayraj Makhar • Senior Product Manager</h1>
<p><a href="mailto:jayraj.mka@gmail.com">jayraj.mka@gmail.com</a>, <a href="tel:+919993639957">+91 99936 39957</a>, <a href="https://linkedin.com/in/jayrajmakhar">LinkedIn</a>, <a href="https://jayrajmakhar.com">Website</a>, <a href="https://github.com/JayRajM97">Github</a>, Bangalore</p>

<h2>WORK EXPERIENCE</h2>

<h3><a href="https://shopos.ai">ShopOS</a> (AI Agents) | Senior Product Manager | June 2025 – Feb 2026 | Bangalore</h3>
<p><em>AI Operating System for self improving e-commerce stores. AI Agents that help modern &amp; retail businesses.</em></p>
<ul>
  <li>Built and scaled the first agentic product suite (Enterprise Studio, Pro Creator) Photography Agent (LLMs + diffusion + tool-calling + brand memory), reducing creative costs by &gt;95% (₹7/image vs ~$12K shoots)</li>
  <li>Built <strong>Loops</strong> (beta), an <strong>AI-powered experimentation platform</strong> (Simulate → Listen → Test) → onboarded 10+ beta brands → enabled continuous optimization across creatives, ads, and PDPs</li>
  <li>Led Amazon Copilot — PDP generation using AI (images, A+ content, copy) → uncovered whitespace in catalog workflows → launched with Amazon-newsletter GTM → <strong>scaled to ~$50K run-rate</strong></li>
  <li>Built browser-based <strong>marketing automation</strong> for non-API marketplaces (Noon, Namshi), <strong>built with <a href="https://opptra.com">Opptra</a> as a design partner</strong> and deployed across a house of brands with 10+ companies</li>
</ul>

<h3><a href="https://teleportvisa.com">Teleport</a> (acquired by <a href="https://stampmyvisa.com">StampMyVisa</a>) | Founding Team — Product Lead | Jul 2022 – June 2025 | Bangalore</h3>
<p><em>Teleport is a travel-tech platform simplifying visa applications across 50+ countries for consumers and travel businesses. Led the platform from MVP to scale — 100K+ users &amp; ₹6Cr+ monthly revenue. Built 3 full product versions, hired cross-functional teams, and owned acquisition, engagement, retention, and data infrastructure.</em></p>
<ul>
  <li>Built MVP in 2 weeks using no-code tools → validated idea with 250+ agents and early users → gave founders conviction to invest in full tech stack → led to hiring of full engineering &amp; growth teams</li>
  <li>Cut ops time per visa application from 15 mins to 2 mins by automating internal workflows and designing CRM tools → enabled each agent to process 5x more applications → reduced cost per application by 70% → allowed ops headcount to stay flat while scaling to 10K+ monthly transactions</li>
  <li>Launched a <strong>white-label solution for B2B travel brands (<a href="https://yatra.com">Yatra</a>, MMT, TravClan)</strong> → opened new channels → added ₹60L/month in revenue → validated a new GTM and shifted focus to B2B expansion</li>
  <li>Launched a <a href="https://teleportvisa.com/agents"><strong>semi-white-label platform for B2B agents</strong></a> → helped close the <strong>visa application loop 50% faster</strong> reducing manual ops and delays</li>
  <li>Owned entire data stack (Metabase, Mixpanel) → built dashboards for 3 teams → enabled faster decisions on funnel fixes, activation rates, cohort retention, and churn across B2B user segments</li>
</ul>

<h3><a href="https://tickertape.in">Tickertape</a> (by smallcase) | Product Manager — Growth Focus | Aug 2021 – Dec 2022 | Bangalore — Remote</h3>
<ul>
  <li><strong>Built and scaled "Beat the Street" trading game</strong> → <strong>drove 10% of app traffic</strong>, boosted feature usage by 15% → unlocked <strong>gamification as a repeatable growth loop</strong></li>
  <li>Launched SEO-driven listicle pages → drove a 9% uplift in organic traffic → increased TOFU growth</li>
  <li><strong>Led product for Diwali Muhurat Trading campaign</strong> → resulted in highest revenue day of the year → validated time-sensitive GTM as a high-performing motion</li>
  <li>Led the discovery of an incentive-driven referral program (₹100 credit/Tickertape Pro access)</li>
</ul>

<h3><a href="https://boardinfinity.com">Board Infinity</a> (EdTech Platform) | Product Manager | Jun 2019 – Jul 2021 | Mumbai</h3>
<ul>
  <li>Built and launched a full-stack <a href="https://boardinfinity.com/coaching"><strong>Coaching Marketplace</strong></a> → increased MRR by <strong>15%</strong>. Built a <a href="https://boardinfinity.com/jobs"><strong>Job Board</strong></a> for learners, companies, and the B2B team, which helped 200+ companies roll out 1,500+ offers</li>
  <li>Designed referral program → acquired 25K+ users, 8% conversion to paid, resulting in 22% revenue growth</li>
  <li>Shipped key internal tools including LMS, CRM, and reporting dashboards, became the backbone of the <a href="https://boardinfinity.com/learning">learning experience</a>, used by 1,000+ coaches and 50,000+ learners</li>
</ul>

<h2>EDUCATION</h2>
<p><strong><a href="https://growthx.club">GrowthX</a>, Product &amp; Growth Program</strong><br/>Comprehensive program covering acquisition, retention &amp; monetization, with a hands-on capstone project.</p>
<p><strong>Lovely Professional University, Punjab</strong><br/>Bachelor of Technology in <strong>Computer Science</strong> with a minor in Machine Learning | CGPA: 8</p>

<h2>OUTSIDE OF WORK</h2>
<p>I'm known for thoughtful gifts, fiercely competitive in sports, and the one who drops surprise <a href="https://spotify.com">Spotify</a> Jam sessions, music and moments matter to me.</p>
`;

export const SAMPLE_JD = `
Job Title: Senior Lifecycle Marketing Manager
Location: Remote

We are looking for a data-driven Senior Lifecycle Marketing Manager to own our retention strategies. You will be responsible for lifecycle marketing, customer segmentation, and optimizing user journeys.

Key Responsibilities:
- Lead lifecycle marketing initiatives across email, push, and in-app notifications.
- Use CRM tools like HubSpot to drive customer retention.
- Collaborate with Product teams to improve the user onboarding experience.
- Track and report on key performance metrics (LTV, CAC, Retention).

Requirements:
- 5+ years of experience in lifecycle or growth marketing.
- Proficiency in CRM platforms and data analytics tools.
- Strong understanding of customer segmentation and A/B testing.
- Experience with ROI-focused budget management.
`;
