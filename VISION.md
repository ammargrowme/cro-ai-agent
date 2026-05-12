# GROWAGENT — Vision & Purpose

**Last updated**: 2026-05-12 (v1.8.0)

---

## What Is GROWAGENT?

GROWAGENT is an AI-powered Conversion Rate Optimization (CRO) audit platform built for the [GrowMe](https://growme.ca) digital agency. It takes any live website URL, analyzes it using multimodal AI (combining code analysis with visual screenshot interpretation), scores it against a professional CRO checklist, and produces a comprehensive, actionable audit report — all in under 30 seconds.

It is designed to replace what traditionally takes a CRO specialist 4-8 hours of manual work per audit: reviewing page structure, evaluating CTAs, checking mobile responsiveness, assessing trust signals, and writing up recommendations.

---

## The Problem It Solves

Most businesses know their website isn't converting as well as it could, but they don't know *why* or *where to start*. Traditional CRO audits are:

- **Expensive**: Agencies charge $2,000-$10,000 per audit
- **Slow**: Takes days to weeks to deliver
- **Inconsistent**: Quality varies by analyst experience
- **One-shot**: A single audit with no ongoing intelligence
- **Siloed**: Insights from one audit don't improve the next

GROWAGENT solves all five problems. It delivers instant, consistent, comprehensive audits at near-zero marginal cost — and it gets smarter with every single audit it runs.

---

## The Ultimate Goal

**GROWAGENT aims to be the world's most intelligent, self-improving CRO audit system.**

The long-term vision is a platform where:

1. **Any business owner** can paste their URL and get a professional-grade CRO audit in seconds — no CRO expertise required.

2. **Every audit makes the system smarter.** The AI learns from every website it analyzes, every chat conversation, and every pattern it detects across hundreds of audits. A recommendation engine that has seen 10,000 websites will produce fundamentally better advice than one that has seen 10.

3. **Competitor intelligence is automatic.** You don't just learn what's wrong with your site — you see exactly what your competitors do better and get specific, actionable ideas to steal and adapt.

4. **The entire conversion funnel is analyzed**, not just a single page. Multi-page analysis scores your homepage, landing pages, pricing page, and checkout flow as a cohesive system, identifying where users drop off and why.

5. **Recommendations aren't just text — they're executable.** Each recommendation comes with ready-to-implement code patches and A/B test copy so development teams can act immediately.

6. **Reports are living documents.** The interactive chat allows stakeholders to ask follow-up questions, request modifications, and drill into specific areas — and the AI adapts the report in real time.

7. **Progress is measurable.** Re-run audits over time to track score improvements, verify that fixes worked, and identify new opportunities as the site evolves.

---

## How It Works Today (v1.8.0)

### The Audit Pipeline
1. **Page Discovery (NEW v1.8.0)** — If the operator enters just a domain, GROWAGENT calls `/api/discover` which cascades through `sitemap.xml` → `sitemap_index.xml` → `Sitemap:` directive in `robots.txt` → homepage link crawl with depth-1 BFS through priority paths (/about, /services, /contact, /pricing). Returns up to 25 same-origin URLs, prioritized intelligently. The operator can preview and deselect URLs before the audit fires.

2. **Data Collection** — Scrapes the target URL plus up to 25 additional pages (raised from 4 in v1.8.0) and any competitor pages in parallel. Fetches Google PageSpeed performance metrics and a visual screenshot. Each scrape preserves both sanitized HTML (for AI) and raw HTML (for static extraction).

3. **Static Health Audit (NEW v1.8.0)** — Pure-JS analysis before any AI call:
   - **Link extraction**: every `<a href>` parsed with CTA detection, phone-label detection, external/internal flags
   - **Button extraction**: `<button>`, `<input type=submit|button>`, `role="button"` elements
   - **Form extraction**: every `<form>` broken down into fields with label/required/inline-label/validation-pattern metadata
   - **URL health check**: HEAD-checks every link (concurrency 10, GET-with-Range fallback for 405/403)
   - **CTA issue detection**: empty hrefs, phone CTAs missing `tel:`, generic CTA copy

4. **AI Analysis** — Runs 4-6 parallel Gemini calls. Every prompt injects the `CXL_PRINCIPLES` constant (persuasive design, awareness levels, friction taxonomy, Relevance/Trust/Stimulance heuristics, fast/slow thinking, copywriting principles) alongside the GrowMe Basic Website Standards checklist:
   - **Overview**: Overall score, summary, strengths, quick wins
   - **Recommendations**: Prioritized action items, with `staticFindings` appendix (broken URLs, CTA mismatches, form-friction flags) passed as ground truth so recs cite specific evidence
   - **Checklist Scoring**: 10-category scoring (0-100 each) plus top 5 critical failures
   - **Competitor Analysis** (when competitors provided): Side-by-side scoring, strategy comparison, steal-worthy ideas
   - **Per-Page Scoring** (batched in v1.8.0): Splits the page list into groups of 5 and scores each batch in parallel so 25-page audits don't overflow Gemini's response budget
   - **Form Friction (NEW v1.8.0)**: Applies CXL form-friction rules to extracted form fields. Returns per-form friction score (0-100), top friction points, concrete fixes

5. **Report Delivery** — All results merge into a single interactive dashboard with:
   - Overall Growth Score (0-100)
   - CRO Checklist with 10 category scores and critical failure flags
   - **Link Health card** (v1.8.0): broken URLs with link text, status, and origin pages
   - **CTA Audit card** (v1.8.0): empty hrefs, phone-CTA mismatches, generic copy
   - **Form Friction card** (v1.8.0): per-form friction score, top friction points, CXL-grounded recommendations
   - **Pages Audited chip list** (v1.8.0): every URL the audit covered
   - Prioritized recommendation cards (flip to reveal solutions)
   - Competitor comparison matrix with visual score differences
   - Site-wide page score grid
   - Code patch generator (Tailwind CSS) per recommendation
   - A/B test copy generator per recommendation
   - AI Strategy Chat terminal for follow-up questions — now CXL-grounded

6. **Learning System** — After every audit:
   - Key findings saved to a shared knowledge base (Upstash Redis)
   - Chat conversations extract reusable CRO insights
   - Future audits receive context from all past audits
   - Recurring patterns across sites are detected and flagged

7. **Export** — 9 export formats: PDF report, Word (.docx), Plain Text, Markdown, Excel (.xlsx), CSV, JSON, PNG screenshot, JPEG screenshot.

### Key Features
- **Just-a-domain audits**: feed GROWAGENT a single URL and it auto-discovers up to 25 same-origin pages (v1.8.0)
- **CXL-grounded reasoning**: every recommendation traces back to a named principle from the GrowMe / CXL training framework (v1.8.0)
- **Broken-link detection**: HEAD-checks every CTA and link on every audited page (v1.8.0)
- **Form friction scoring**: per-form 0-100 score with CXL-grounded fixes (v1.8.0)
- **Target Keywords**: Specify SEO keywords for alignment verification across all analysis
- **Enhanced Competitors**: Side-by-side checklist scoring with steal-worthy ideas
- **Interactive Chat**: Ask questions, modify recommendations, drill into specific areas
- **Learning Memory**: System gets smarter with every audit across all users

---

## Where It's Going (Roadmap)

### Near-Term (Next 1-3 Months)
- **Checklist Drill-Down**: Click any checklist category to see individual item pass/fail details, with CXL principle references on each item
- **Component Extraction**: Split the now 2400+ line `App.jsx` into focused components (`<LinkHealthCard>`, `<CtaAuditCard>`, `<FormFrictionCard>`, page-discovery hook)
- **JS-Rendered SPA Support**: Phase 2 deep-audit mode using `@sparticuz/chromium` + `puppeteer-core` so SPAs that hydrate forms/links at runtime are visible to the audit
- **Heatmap Integration**: Overlay attention heatmaps on page screenshots to show where users actually look
- **Historical Tracking**: Re-run audits and see score trends over time with before/after comparisons

### Medium-Term (3-6 Months)
- **User Authentication**: Personal accounts with saved report history and team collaboration
- **E-Commerce Intelligence**: Specialized analysis for Shopify/WooCommerce stores (cart, checkout, product page optimization)
- **Industry Benchmarking**: Compare scores against anonymized averages for your industry vertical
- **Real-Time Streaming**: Live progress updates as each analysis phase completes (Server-Sent Events)
- **White-Label Reports**: Customizable branding for agency clients

### Long-Term (6-12 Months)
- **Automated Monitoring**: Schedule recurring audits and get alerts when scores drop
- **Implementation Tracking**: Connect to your codebase/CMS and track which recommendations were implemented
- **Revenue Attribution**: Estimate revenue impact of each recommendation based on traffic and conversion data
- **Multi-Language Support**: Analyze and report in any language
- **API Access**: Programmatic access for integrating GROWAGENT into existing workflows and CI/CD pipelines

---

## Guiding Principles

1. **Speed over perfection**: A good audit in 30 seconds beats a perfect audit in 30 days. Deliver value fast, then let the user drill deeper via chat.

2. **Actionable over academic**: Every finding must include a specific "do this next" action. No vague "consider improving your UX" — instead, "Your CTA says 'Submit' — change it to 'Get My Free Quote' and make it 48px tall with #F25430 background."

3. **Cumulative intelligence**: The system must get measurably smarter over time. Every audit, every chat, every pattern feeds back into the AI's knowledge.

4. **Professional output**: Reports should be boardroom-ready. Any stakeholder — developer, marketer, CEO — should be able to understand and act on the findings.

5. **Zero configuration**: Paste a URL, click Analyze. Advanced options exist for power users, but the default experience should produce excellent results with no setup.

6. **Honest scoring**: The AI must not inflate scores to please users. A bad score with clear next steps is more valuable than a good score that hides problems.

---

## Who It's For

- **Agency teams** (like GrowMe) who need to produce CRO audits for clients quickly and consistently
- **Marketing managers** who want data-driven website improvements without hiring a CRO specialist
- **Developers** who need specific, implementable code changes to improve conversion
- **Business owners** who want to understand why their website isn't converting and what to fix first
- **SEO/CRO consultants** who want to augment their manual analysis with AI-powered insights

---

## Technical Foundation

- **Frontend**: React 18, Vite 5, Tailwind CSS (single-file architecture for simplicity)
- **Backend**: Vercel Serverless Functions (Node.js)
- **AI**: Google Gemini 3 Flash (analysis + chat), Gemini 2.5 Flash (code gen + A/B tests)
- **Storage**: Upstash Redis (shared learning database) + localStorage (client fallback)
- **Deployment**: Vercel (auto-deploy on push to main)
- **Export**: jsPDF (programmatic PDF generation), html2canvas (PNG), native (Markdown/CSV/JSON)

---

*This document describes both the current state and the aspirational vision. It should be updated whenever significant features are added or the product direction changes.*

*Built by [GrowMe](https://growme.ca) | Powered by Google Gemini*
