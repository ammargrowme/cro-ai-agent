# Architecture Reference

> Full architecture details for the CRO AI Agent. Referenced from CLAUDE.md.

## Frontend (React 18 + Vite 5)

- **Single file**: `src/App.jsx` (~1800 lines) — all UI, state management, and client logic (constants, utils, exports extracted to modules)
- **Styling**: Tailwind CSS + inline styles via `BRAND` constant (no external CSS files)
- **Animations**: Native CSS keyframes only (no Framer Motion)
- **State**: React `useState`/`useEffect` hooks (no Redux/Zustand)

## Backend (Vercel Serverless Functions)

- `api/analyze.js` — Main audit pipeline: scrape -> PageSpeed -> 3-5 parallel AI calls (overview, recommendations, checklist scoring, competitor analysis, per-page scoring)
- `api/chat.js` — Interactive chat with report-aware context, returns `{message, updated_report, learning_insight}`
- `api/generateCode.js` — Generates Tailwind CSS code patches for specific recommendations
- `api/generateABTests.js` — Generates A/B test copy variations

## Learning System (Server-Side + Local Fallback)

### Server (Vercel Redis)

- Endpoint: `api/learnings.js` — shared knowledge base across ALL users
- `global:learnings` Redis list (max 100 entries) — condensed audit summaries
- `global:insights` Redis list (max 200 entries) — chat-extracted CRO insights
- Env var: `REDIS_URL` (auto-injected when Redis store is linked in Vercel dashboard)

### Local Fallback (localStorage)

- Keys: `growagent_learnings` (max 20) and `growagent_insights` (max 50)
- On app load, server learnings are fetched and merged with local data (deduplicated by URL+timestamp)
- After each audit, data is saved to BOTH server and localStorage
- Chat insights are saved to BOTH server and localStorage
- If server is unavailable, app gracefully degrades to localStorage-only

### Helper Functions

Located in `src/utils/learning.js`:
- `getLocalLearnings()`, `saveLocalLearning()`, `saveServerLearning()`
- `saveServerInsight()`, `fetchServerLearnings()`, `mergeLearnings()`
- `trackChatModification()`

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
- **API keys** — `GEMINI_API_KEY` env var (with `VITE_GEMINI_API_KEY` fallback), read server-side only via `process.env`
- **CORS proxy** — not currently used (direct fetch in serverless functions)
- **Vercel timeout** — 300s max for API functions (`vercel.json`)
- **3-4 parallel AI calls** — overview + recommendations + checklist scoring + competitor analysis (when competitors provided) happen simultaneously in Phase 2
- **Recommendations count** — Flexible (3-10 based on real issues found, was hardcoded to 6 before v1.2.1)
- **Categories** — CTA, Trust, UX, Design, Performance, Copy, Mobile, SEO, Forms (expanded from 4 in v1.1.0)
- **Gemini model** — `gemini-3-flash-preview` for analysis + chat (frontier-class quality), `gemini-2.5-flash` for code gen + A/B tests (speed-optimized)
- **Temperature** — 0.2 for analysis calls, 0.3 for chat
