# GROWAGENT — Vision & Purpose

**Last updated**: 2026-03-24 (v1.7.0)

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

## How It Works Today (v1.7.0)

### The Audit Pipeline
1. **Data Collection** — Scrapes the target URL's HTML, fetches Google PageSpeed performance metrics and a visual screenshot, scrapes competitor pages and additional site pages (all in parallel).

2. **AI Analysis** — Runs 3-5 parallel AI calls using Google Gemini:
   - **Overview**: Overall score, summary, strengths, quick wins
   - **Recommendations**: Prioritized action items with implementation details
   - **Checklist Scoring**: 10-category scoring against the GrowMe CRO Standards (50+ criteria)
   - **Competitor Analysis** (when competitors provided): Side-by-side scoring, strategy comparison, steal-worthy ideas
   - **Per-Page Scoring** (when multiple pages provided): Individual page scores with page type detection

3. **Report Delivery** — All results merge into a single interactive dashboard with:
   - Overall Growth Score (0-100)
   - CRO Checklist with 10 category scores and critical failure flags
   - Prioritized recommendation cards (flip to reveal solutions)
   - Competitor comparison matrix with visual score differences
   - Site-wide page score grid
   - Code patch generator (Tailwind CSS) per recommendation
   - A/B test copy generator per recommendation
   - AI Strategy Chat terminal for follow-up questions

4. **Learning System** — After every audit:
   - Key findings are saved to a shared knowledge base (Upstash Redis)
   - Chat conversations extract reusable CRO insights
   - Future audits receive context from all past audits
   - Recurring patterns across sites are detected and flagged

5. **Export** — 9 export formats: PDF report, Word (.docx), Plain Text, Markdown, Excel (.xlsx), CSV, JSON, PNG screenshot, JPEG screenshot. Organized dropdown with Documents/Data/Images sections.

### Key Features
- **Target Keywords**: Specify SEO keywords for alignment verification across all analysis
- **Batch Multi-Page**: Analyze up to 5 pages per site with per-page scoring
- **Enhanced Competitors**: Side-by-side checklist scoring with steal-worthy ideas
- **Interactive Chat**: Ask questions, modify recommendations, drill into specific areas
- **Learning Memory**: System gets smarter with every audit across all users

---

## Where It's Going (Roadmap)

### Near-Term (Next 1-3 Months)
- **Checklist Drill-Down**: Click any checklist category to see individual item pass/fail details
- **Auto-Crawl Mode**: Automatically discover and analyze internal pages instead of manual URL entry
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
