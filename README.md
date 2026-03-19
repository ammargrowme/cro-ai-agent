# GROWAGENT: Advanced CRO AI Audit Agent

GROWAGENT is a high-performance, AI-driven Conversion Rate Optimization (CRO) audit tool. It scrapes live website data, analyzes visual hierarchies using multimodal AI, scores against a professional CRO checklist, and generates comprehensive revenue-boosting strategies that get smarter with every run.

---

## Table of Contents
- [Key Features](#key-features)
- [How to Use](#how-to-use)
- [The Learning System](#the-learning-system)
- [CRO Checklist](#cro-checklist)
- [For AI Agents & Developers](#for-ai-agents--developers)
- [Tech Stack](#tech-stack)
- [Quick Start](#quick-start)
- [Roadmap](#roadmap)

---

## Key Features

- **Live Site Scraper**: Automatically extracts HTML, CSS structure, and DOM hierarchy from any public URL.
- **Multimodal Analysis**: Combines text-based code analysis with visual screenshot interpretation using Gemini 2.5 Flash.
- **CRO Checklist Audit**: Scores websites against a 50+ criteria professional checklist across 10 categories.
- **Adaptive Learning System**: Gets smarter with every audit — detects recurring patterns across audits, extracts insights from chat feedback, and applies accumulated knowledge to future analysis.
- **Secure Backend Proxy**: All API calls are routed through Vercel Serverless Functions to protect sensitive API keys.
- **Enhanced Competitor Analysis**: Side-by-side comparison matrix with per-category scores and steal-worthy ideas from competitors.
- **Multi-Page Analysis**: Analyze up to 5 pages per site with individual scores, page type detection, and per-page top issues.
- **Target Keywords**: Specify SEO keywords for alignment verification across all AI analysis.
- **Priority-Based Strategy**: Generates prioritized recommendations mapped to checklist items.
- **Developer Handoff**: Each recommendation includes an AI-generated **Code Patch** (HTML/Tailwind) and **A/B Test Variations**.
- **Interactive Chat**: A real-time AI Strategist terminal that can update the live dashboard and extract reusable CRO insights.

---

## How to Use

### 1. Basic Scan
1. Open the app and enter a website URL (e.g., `nike.com`).
2. Click **Analyze**.
3. Watch the real-time loading dashboard as the agent scrapes code, checks PageSpeed, scores the CRO checklist, and synthesizes the strategy.

### 2. Advanced Global Audits
1. Click the **`+` icon** next to the Analyze button.
2. **Campaign Context**: Tell the AI *who* you are targeting (e.g., "We sell B2B SaaS to CFOs").
3. **Competitors**: Add up to 2 specific domains you want to beat.
4. **Custom Key**: If you have a high-traffic volume, add your own Google PageSpeed API key.

### 3. Understanding the Report
- **Growth Score**: Overall CRO score (0-100) based on checklist compliance.
- **CRO Checklist Audit**: 10 category scores with circular progress indicators. Red flags show critical failures.
- **Recommendations**: 6 prioritized action items, each linked to specific checklist criteria.
- **Click any card** to flip and see the solution, execution plan, and code generation tools.

### 4. The AI Chat Terminal
- Ask follow-up questions about any recommendation.
- Tell the AI to modify, add, or remove recommendations — the dashboard updates live.
- Provide feedback like "we already fixed this" — the AI extracts insights for future audits.

### 5. Implementing Fixes
1. Click any recommendation card to flip it.
2. Use the **"Code"** button to generate a specific Tailwind CSS component fix.
3. Use the **"A/B Copy"** button to get 3 new headlines or CTAs.

---

## The Learning System

GROWAGENT gets smarter with every audit — and **every user makes it smarter for everyone**:

1. **Shared Knowledge Base**: All audits and chat insights are saved to a server-side database (Upstash Redis). When anyone runs an audit, the AI draws on learnings from ALL past users — not just yours.
2. **Pattern Detection**: The system tracks recurring checklist weaknesses across ALL audits from all users. If "CTA Focus" fails across many sites, the AI will flag it as a systemic pattern and prioritize it.
3. **Chat Insights**: When you discuss recommendations in the AI chat, the system proactively extracts reusable CRO insights (e.g., "Sites without sticky CTA lose 20-30% mobile conversions"). These insights are applied to ALL future audits for everyone.
4. **Feedback Loop**: Tell the AI "we already fixed this" or "we're a B2B company" — it adapts future recommendations and stores the context for future audits.
5. **Future Injection**: Past learnings, recurring patterns, and accumulated insights from all users are automatically included in future AI prompts.
6. **Learning Indicator**: The header shows how many total audits the system has learned from (your audits + all other users).
7. **Graceful Fallback**: If the server is unavailable, the app seamlessly falls back to local-only storage — no functionality is lost.

---

## CRO Checklist

Every audit scores the website against the **GrowMe Basic Website Standards** checklist:

| Category | What It Checks |
|----------|---------------|
| SEO & Keywords | H1/H2 keywords, meta titles, descriptions |
| Above the Fold | Hero height, value proposition visibility, primary CTA placement |
| CTA & Conversion | CTA clarity, placement, contrast, single conversion goal |
| Content Structure | Scannable layout, FAQ presence, logical flow, heading quality |
| Visual Hierarchy | Sticky menu, whitespace, image quality, element emphasis |
| Mobile Optimization | Mobile-first design, button sizing, content collapsing |
| Trust & Social Proof | Reviews, testimonials, footer info, business consistency |
| Forms & Interaction | Field requirements, labels, error messages, clickable phone |
| Performance & QA | Page speed, broken elements, placeholder text, clean URLs |
| Content Standards | First-fold clarity, CTA placement after decision moments |

---

## For AI Agents & Developers

**See [VISION.md](./VISION.md)** for the product vision, ultimate goal, and full roadmap.

**See [CLAUDE.md](./CLAUDE.md)** for comprehensive AI context including architecture, schemas, decisions, and rules.

**See [DEVELOPER.md](./DEVELOPER.md)** for technical deep-dive on the intelligence pipeline.

Key rules:
1. Do not upgrade Vite to v6 (Node 18 compatibility)
2. Do not add external CSS files (Tailwind + inline only)
3. Do not use Framer Motion (CSS keyframes only)
4. API keys must stay server-side
5. Keep App.jsx as a single file

---

## Tech Stack

- **Framework**: React 18+ (Vite 5 for wide Node compatibility)
- **Styling**: Tailwind CSS (Custom components + Animations)
- **Icons**: Lucide-React
- **AI Backend**: Google Gemini 2.5 Flash API
- **Analytics**: Google PageSpeed Insights API
- **Deployment**: Vercel Serverless Functions

---

## Quick Start

1. **Clone & Install**
   ```bash
   git clone https://github.com/ammargrowme/cro-ai-agent.git
   cd cro-ai-agent
   npm install
   ```

2. **Setup Env**
   Create `.env`:
   ```env
   VITE_GEMINI_API_KEY=YOUR_KEY_HERE
   ```

3. **Launch**
   ```bash
   npm run dev
   ```

---

## Roadmap
- [x] Competitor analysis with comparison matrix (v1.6.0)
- [x] Multi-page batch analysis (v1.6.0)
- [x] Target keywords for SEO alignment (v1.6.0)
- [x] Server-side learning persistence (Upstash Redis — v1.4.0)
- [ ] Checklist drill-down (clickable category details)
- [ ] Auto-crawl mode (discover pages automatically)
- [ ] User authentication & Report history
- [ ] Deep-link integration with Shopify/WooCommerce

---
Built by [ammargrowme](https://github.com/ammargrowme) | Powered by Google Gemini
