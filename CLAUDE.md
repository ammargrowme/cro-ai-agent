# CLAUDE.md — GROWAGENT CRO AI Agent

**READ THIS FIRST.** This file provides full project context for any AI assistant (Claude, GPT, Cursor, Windsurf, etc.) working on this codebase. Then read `TODO.md` for the exact action plan.

## Quick Status

- **Version**: 1.2.0 (March 18, 2026)
- **Live URL**: https://cro-ai-agent.vercel.app/
- **Repo**: https://github.com/ammargrowme/cro-ai-agent
- **Deployment**: Auto-deploys to Vercel on every push to `main`
- **Build status**: Passing (`npx vite build` verified)
- **All 4 API endpoints**: Confirmed live and responding on Vercel

## What This Project Is

GROWAGENT is an AI-powered Conversion Rate Optimization (CRO) audit tool built for the [GrowMe](https://growme.ca) agency. It scrapes live websites, analyzes them with Google's Gemini 2.5 Flash API, scores them against a professional CRO checklist (the GrowMe Basic Website Standards), and generates actionable recommendations with code patches and A/B test copy.

**Key differentiator**: The app has a **learning system** — it remembers past audits and chat feedback in localStorage, and feeds that knowledge into future AI prompts so recommendations get smarter over time.

## Session History

### v1.0.0 (March 10, 2026) — Initial MVP
- Core React dashboard with HTML scraping and Gemini 1.5 integration
- PageSpeed metrics and screenshot extraction
- Priority cards with High/Medium/Low sorting

### v1.1.0 (March 12, 2026) — Backend Rewrite
- Parallel pipeline (scrape + PageSpeed parallel, then 2 AI calls parallel)
- Vercel timeout increased to 300s, PageSpeed timeout to 90s
- Interactive flip cards (click, not hover), click-outside reset
- PDF print layout with 3D flattening and light theme
- AI Strategy Terminal with independent scrolling
- Competitor URL input fields added (UI only, not wired to backend)
- See `IMPLEMENTATION_RECAP.md` for full details of this session

### v1.2.0 (March 18, 2026) — Checklist + Learning System
- Full GrowMe CRO checklist (50+ criteria, 10 categories) embedded in AI prompts
- 3rd parallel AI call added for checklist category scoring (0-100 per category)
- Checklist Scores UI panel with circular progress indicators + critical failures
- Client-side learning system (localStorage) — stores past audit summaries and chat insights
- Past learnings injected into AI prompts for smarter future audits
- Chat system fully rewritten: proper response schema `{message, updated_report, learning_insight}`
- Chat extracts reusable CRO insights and persists them for future audits
- Categories expanded from 4 to 9 (CTA, Trust, UX, Design, Performance, Copy, Mobile, SEO, Forms)
- Recommendations increased from 5 to 6 with `checklist_ref` field
- Learning badge in header shows count of past audits learned
- All docs updated (CLAUDE.md, README, CHANGELOG, DEVELOPER.md, TODO.md)

## What To Do Next (Immediate Priority)

**See `TODO.md` for the full prioritized action plan.** The top 3 items are:

1. **Test v1.2.0 on production** — Run a real audit at https://cro-ai-agent.vercel.app/ and verify checklist scores, recommendations with `checklist_ref`, chat with `learning_insight`, and learning persistence across multiple audits.
2. **Wire up competitor analysis** — The UI accepts competitor URLs but `api/analyze.js` never scrapes or analyzes them. The display UI already exists.
3. **Add print CSS for checklist panel** — The new checklist scores section needs `@media print` rules in App.jsx.

## Architecture

### Frontend (React 18 + Vite 5)
- **Single file**: `src/App.jsx` (~1630 lines) — all UI, state management, and client logic
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
- Helper functions in App.jsx: `getLearnings()`, `saveLearning()`, `addFeedbackInsight()`, `getPastLearningsForPrompt()`

## CRO Checklist

The app scores websites against the **GrowMe Basic Website Standards** checklist (sourced from Google Doc ID: `1kRqHJ7vshj6-55S7cd9tq-M-xyf4LiCCuBikeBB3pS0`). The checklist is embedded as a string constant (`CRO_CHECKLIST`) in `api/analyze.js` and covers 10 categories:

1. Keywords & SEO Alignment
2. Above-the-Fold & Hero
3. CTA & Conversion Focus
4. Content Structure & Clarity
5. Visual Hierarchy & Design
6. Mobile Optimization
7. Trust & Social Proof
8. Forms & Interaction
9. Performance & QA
10. Content Standards

Each category is scored 0-100 by the AI, and the top 5 critical failures are flagged. The checklist label mapping for the UI is in the `CHECKLIST_LABELS` constant in `App.jsx`.

## Key Technical Decisions

- **Vite 5** (not 6) — pinned for Node.js 18 compatibility
- **No external CSS** — use Tailwind or `<style>` blocks in App.jsx
- **API keys** — `VITE_GEMINI_API_KEY` env var, read server-side only via `process.env`
- **CORS proxy** — not currently used (direct fetch in serverless functions)
- **Vercel timeout** — 300s max for API functions (`vercel.json`)
- **3 parallel AI calls** — overview + recommendations + checklist scoring happen simultaneously in Phase 2
- **Recommendations count** — 6 per audit (was 5 before v1.2.0)
- **Categories** — CTA, Trust, UX, Design, Performance, Copy, Mobile, SEO, Forms (expanded from 4 in v1.1.0)
- **Gemini model** — `gemini-2.5-flash` (hardcoded in all API files)
- **Temperature** — 0.2 for analysis calls, 0.3 for chat

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

## Chat Response Schema

```json
{
  "message": "The AI's conversational response",
  "updated_report": null,
  "learning_insight": "Sites without sticky CTA lose 20-30% mobile conversions"
}
```

- `updated_report` is the full report object if changes were made, `null` otherwise
- `learning_insight` is a reusable CRO insight string if the conversation reveals one, `null` otherwise

## How to Run

```bash
npm install
cp .env.example .env  # Add your VITE_GEMINI_API_KEY
npm run dev            # Local dev at http://localhost:5173
```

For production: Push to `main` — Vercel auto-deploys at https://cro-ai-agent.vercel.app/

## What Worked

- Parallel AI calls reduced audit time from ~45s to ~20s
- The CRO checklist integration produces much more specific, actionable recommendations than the old generic prompts
- Chat feedback loop successfully extracts reusable insights
- 3D flip cards with click-to-flip (not hover) fixed button interaction issues
- Learning indicator in header gives users confidence the system is improving

## What Didn't Work / Known Issues

1. **Competitor analysis is a no-op** — URLs are accepted in the UI and sent to the backend, but `api/analyze.js` never scrapes or analyzes them. The `competitor_analysis` field in the report is always empty.
2. **Chat `updated_report` can be partial** — Gemini sometimes returns incomplete report objects. The frontend checks JSON equality to avoid breaking state, but the update is silently lost.
3. **PDF export uses `window.print()`** — Works but 3D layouts sometimes misrender. The new checklist panel has no print CSS rules yet.
4. **localStorage learning cap** — 20 audits / 50 insights. Heavy users could still bloat localStorage on older browsers.
5. **No error state for chat** — If the chat API returns a 500, the user sees a generic message but no retry button.
6. **`REPORT_SCHEMA_PROPERTIES` in App.jsx is stale** — It's the old schema from v1.0.0 (lines ~68-106). It's not used by the backend anymore (backend has its own schemas) but is still sitting in the frontend code. Can be removed or updated.

## File Map

```
├── api/
│   ├── analyze.js          # Main audit pipeline (scrape + PageSpeed + 3 AI calls)
│   ├── chat.js             # Interactive chat endpoint (message + report updates + learning)
│   ├── generateCode.js     # Code patch generator (Tailwind CSS)
│   └── generateABTests.js  # A/B copy variation generator
├── src/
│   ├── App.jsx             # Entire frontend (~1630 lines, single file)
│   └── main.jsx            # React entry point
├── public/                 # Static assets
├── CLAUDE.md               # THIS FILE — read first
├── TODO.md                 # Action plan — read second
├── CHANGELOG.md            # Version history
├── DEVELOPER.md            # Technical deep-dive (pipeline, learning, chat protocol)
├── IMPLEMENTATION_RECAP.md # Session recaps (v1.1.0 + v1.2.0)
├── README.md               # User-facing docs
├── vercel.json             # Vercel config (300s timeout)
├── vite.config.js          # Vite 5 config
├── tailwind.config.js      # Tailwind config
├── .env.example            # Env template
└── package.json            # Dependencies (React 18, Vite 5, Tailwind, Lucide)
```

## Rules for AI Agents

1. **Do not upgrade Vite** to v6 unless Node 20.19+ is confirmed
2. **Do not add external CSS files** — use Tailwind or inline styles
3. **Do not use Framer Motion** — use CSS keyframes
4. **API keys must stay server-side** — never expose in frontend code
5. **Keep App.jsx as a single file** — do not split into components (project convention)
6. **Test builds with `npx vite build`** before committing
7. **The learning system is client-side only** — no server persistence yet
8. **Always read TODO.md** before starting new work — it has the prioritized plan
9. **Auto-deploy is on** — every push to `main` goes live at https://cro-ai-agent.vercel.app/
10. **The CRO checklist source doc** is at Google Doc ID `1kRqHJ7vshj6-55S7cd9tq-M-xyf4LiCCuBikeBB3pS0` — if the checklist needs updating, fetch this doc
