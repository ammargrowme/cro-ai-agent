# CLAUDE.md — GROWAGENT CRO AI Agent

This file provides full project context for any AI assistant (Claude, GPT, Cursor, Windsurf, etc.) working on this codebase.

## What This Project Is

GROWAGENT is an AI-powered Conversion Rate Optimization (CRO) audit tool. It scrapes live websites, analyzes them with Google's Gemini 2.5 Flash API, scores them against a professional CRO checklist, and generates actionable recommendations with code patches and A/B test copy.

**Key differentiator**: The app has a **learning system** — it remembers past audits and chat feedback in localStorage, and feeds that knowledge into future AI prompts so recommendations get smarter over time.

## Architecture

### Frontend (React 18 + Vite 5)
- **Single file**: `src/App.jsx` (~1600 lines) — all UI, state management, and client logic
- **Styling**: Tailwind CSS + inline styles via `BRAND` constant (no external CSS files)
- **Animations**: Native CSS keyframes only (no Framer Motion)
- **State**: React `useState`/`useEffect` hooks (no Redux/Zustand)

### Backend (Vercel Serverless Functions)
- `api/analyze.js` — Main audit pipeline: scrape → PageSpeed → 3 parallel AI calls (overview, recommendations, checklist scoring)
- `api/chat.js` — Interactive chat with report-aware context, returns `{message, updated_report, learning_insight}`
- `api/generateCode.js` — Generates Tailwind CSS code patches for specific recommendations
- `api/generateABTests.js` — Generates A/B test copy variations

### Learning System (Client-Side)
- **localStorage keys**: `growagent_learnings` (past audit summaries), `growagent_insights` (chat-extracted CRO insights)
- Past learnings are sent to `api/analyze.js` as `pastLearnings` in the request body
- Chat insights are extracted via the `learning_insight` field in chat responses
- The system caps at 20 stored audits and 50 insights to prevent bloat

## CRO Checklist Integration

The app scores websites against the **GrowMe Basic Website Standards** checklist (sourced from the Google Doc). The checklist is embedded as a constant (`CRO_CHECKLIST`) in `api/analyze.js` and covers 10 categories:

1. SEO & Keywords
2. Above the Fold
3. CTA & Conversion
4. Content Structure
5. Visual Hierarchy
6. Mobile Optimization
7. Trust & Social Proof
8. Forms & Interaction
9. Performance & QA
10. Content Standards

Each category is scored 0-100 by the AI, and the top 5 critical failures are flagged.

## Key Technical Decisions

- **Vite 5** (not 6) — pinned for Node.js 18 compatibility
- **No external CSS** — use Tailwind or `<style>` blocks in App.jsx
- **API keys** — `VITE_GEMINI_API_KEY` env var, read server-side only
- **CORS proxy** — not currently used (direct fetch in serverless)
- **Vercel timeout** — 300s max for API functions (vercel.json)
- **3 parallel AI calls** — overview + recommendations + checklist scoring happen simultaneously
- **Recommendations count** — 6 per audit (was 5 before v1.2.0)
- **Categories expanded** — now includes CTA, Trust, UX, Design, Performance, Copy, Mobile, SEO, Forms (was only 4 before)

## Report Schema

```json
{
  "overall_score": 72,
  "summary": "...",
  "strengths": ["...", "..."],
  "quick_wins": ["...", "..."],
  "recommendations": [{
    "id": 1,
    "priority": "High",
    "category": "CTA",
    "issue": "...",
    "recommendation": "...",
    "expected_impact": "...",
    "implementation": "...",
    "checklist_ref": "CTA visible above the fold"
  }],
  "competitor_analysis": { "overview": "", "comparisons": [] },
  "checklist_scores": {
    "seo_alignment": 65,
    "above_the_fold": 80,
    "cta_focus": 45,
    "content_structure": 70,
    "visual_hierarchy": 55,
    "mobile_optimization": 60,
    "trust_proof": 40,
    "forms_interaction": 75,
    "performance_qa": 85,
    "content_standards": 50
  },
  "checklist_flags": ["No FAQ section present", "CTA text is vague 'Submit'"],
  "audit_metadata": {
    "url": "https://example.com",
    "timestamp": "2026-03-18T...",
    "had_screenshot": true,
    "had_learnings": true,
    "duration_ms": 15234
  }
}
```

## How to Run

```bash
npm install
cp .env.example .env  # Add your VITE_GEMINI_API_KEY
npm run dev            # Local dev at http://localhost:5173
```

For production: Deploy to Vercel. The `api/` directory auto-deploys as serverless functions.

## What Worked

- Parallel AI calls reduced audit time from ~45s to ~20s
- The CRO checklist integration produces much more specific, actionable recommendations than the old generic prompts
- Chat feedback loop successfully extracts reusable insights
- 3D flip cards with click-to-flip (not hover) fixed button interaction issues

## What Didn't Work / Known Issues

- Competitor analysis is defined in the schema but the backend doesn't actually scrape competitors yet (the `competitors` array is accepted but not used in v1.2.0)
- The chat `updated_report` feature works but sometimes Gemini returns partial report objects — the frontend checks JSON equality to avoid breaking state
- PDF export via `window.print()` works but complex 3D layouts sometimes misrender
- localStorage learning can grow large on heavily-used instances — capped at 20 audits

## Roadmap / Next Steps

- [ ] Actually scrape and analyze competitor URLs (currently stubbed)
- [ ] PDF export with proper library (html2pdf or puppeteer)
- [ ] Multi-page crawl (audit entire funnel, not just landing page)
- [ ] Server-side learning persistence (Vercel KV or similar)
- [ ] User authentication and report history
- [ ] Webhook/Slack notifications for completed audits
- [ ] Deep-link Shopify/WooCommerce integration

## File Map

```
├── api/
│   ├── analyze.js          # Main audit pipeline (scrape + AI)
│   ├── chat.js             # Interactive chat endpoint
│   ├── generateCode.js     # Code patch generator
│   └── generateABTests.js  # A/B copy generator
├── src/
│   ├── App.jsx             # Entire frontend (single file)
│   └── main.jsx            # React entry point
├── public/                 # Static assets
├── CLAUDE.md               # THIS FILE — AI context
├── CHANGELOG.md            # Version history
├── DEVELOPER.md            # Technical deep-dive
├── IMPLEMENTATION_RECAP.md # March 12 session recap
├── README.md               # User-facing docs
├── vercel.json             # Vercel config (300s timeout)
├── vite.config.js          # Vite 5 config
├── tailwind.config.js      # Tailwind config
└── package.json            # Dependencies
```

## Rules for AI Agents

1. **Do not upgrade Vite** to v6 unless Node 20.19+ is confirmed
2. **Do not add external CSS files** — use Tailwind or inline styles
3. **Do not use Framer Motion** — use CSS keyframes
4. **API keys must stay server-side** — never expose in frontend code
5. **Keep App.jsx as a single file** — do not split into components (project convention)
6. **Test builds with `npx vite build`** before committing
7. **The learning system is client-side only** — no server persistence yet
