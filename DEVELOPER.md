# Developer & AI Technical Documentation

This document provides a deep dive into the internal architecture, logic patterns, and design decisions of the GROWAGENT CRO Auditor.

## Core Logic: The "Intelligence Pipeline"

The audit process follows a parallel, asynchronous pipeline to maximize speed and data richness.

### Phase 1: Data Collection (Parallel)
Two operations run simultaneously:

#### 1a. Scraping Layer
Direct fetch from the target URL with a 15-second timeout.
- **Sanitization**: Removes `<script>`, `<style>`, `<svg>`, `<noscript>`, comments, `<link>` tags, and all `class`, `style`, `data-*` attributes to reduce noise.
- **Truncation**: HTML is capped at 25,000 characters to keep within Gemini's optimal context window.

#### 1b. Performance Layer
Queries the Google PageSpeed Insights V5 API with a 90-second timeout.
- **Multi-Modal Data**: Fetches both the Performance Score AND a base64 encoded screenshot.
- **Key Fallback**: Uses custom PageSpeed key if provided, otherwise falls back to the Gemini API key.
- **Graceful Degradation**: If PageSpeed fails (rate limit, timeout), the audit continues in "HTML-only" mode.

### Phase 2: AI Analysis (3 Parallel Calls)
Three Gemini 2.5 Flash calls run simultaneously, all using the same scraped HTML and screenshot:

#### 2a. Overview Call
- Produces: `overall_score`, `summary`, `strengths`, `quick_wins`
- Schema-enforced with strict word limits
- Uses full 25K HTML context

#### 2b. Recommendations Call
- Produces: 6 `recommendations` with `checklist_ref` fields
- Schema-enforced with expanded categories (CTA, Trust, UX, Design, Performance, Copy, Mobile, SEO, Forms)
- Uses 15K HTML context (trimmed for token efficiency)

#### 2c. Checklist Scoring Call
- Produces: `checklist_scores` (10 categories, 0-100 each) and `checklist_flags` (top 5 failures)
- Uses 12K HTML context
- Lower token limit (2048) since output is compact

### Phase 3: Merge & Deliver
All three results are merged into a single report object with `audit_metadata` attached.

## The Learning System

### Storage Architecture (Server-Side + Local Fallback)
```
Upstash Redis (via api/learnings.js)
├── global:learnings        # Redis List of audit summaries from ALL users (max 100)
│   └── { url, score, timestamp, topIssues[], topCategories[], checklistWeaknesses[],
│          checklistStrengths[], allChecklistScores{}, criticalFlags[] }
└── global:insights         # Redis List of chat-extracted CRO insights from ALL users (max 200)
    └── { text, timestamp, sourceUrl }

localStorage (local fallback)
├── growagent_learnings     # Array of THIS user's past audit summaries (max 20)
│   └── { ...same shape as server, plus feedbackInsights[], chatModifications: number }
├── growagent_insights      # Array of THIS user's chat-extracted CRO insights (max 50)
│   └── { text, timestamp }
└── growagent_pagespeed_key # User's custom PageSpeed API key
```

### Data Flow
1. **On app load**: `fetchServerLearnings()` retrieves the shared global knowledge base from Upstash Redis.
2. **After each audit**: `saveLocalLearning()` saves to localStorage AND `saveServerLearning()` saves to Redis (fire-and-forget). This means every user's audit contributes to the shared knowledge.
3. **During chat**: If the AI returns a `learning_insight`, it's saved to BOTH `addLocalInsight()` and `saveServerInsight()`.
4. **Before each audit**: `mergeLearnings()` combines local + server learnings (deduplicated by URL+timestamp) and sends them as `pastLearnings` in the API request body.
5. **In the AI prompt**: The backend builds a 3-part learning context:
   - **Individual audit history** (most recent 5 from merged data)
   - **Aggregate pattern detection** — counts recurring checklist weaknesses across ALL past audits from all users
   - **Accumulated insights** — deduplicated CRO insights from all users' chat conversations
6. **Pattern flagging**: If "cta focus" failed in 4/6 past audits across any user, the AI is told to prioritize CTA issues.
7. **Graceful degradation**: If Redis is unavailable, the app silently falls back to localStorage-only (previous behavior).

## CRO Checklist

The full GrowMe Basic Website Standards checklist is embedded as a string constant (`CRO_CHECKLIST`) in `api/analyze.js`. It covers:

1. **Keywords & SEO Alignment** — H1/H2 keywords, meta tags
2. **Above-the-Fold & Hero** — Header height, value prop, CTA visibility
3. **CTA & Conversion Focus** — Single MWA, clear CTAs, no competing actions
4. **Content Structure & Clarity** — Scannable layout, FAQs, logical flow
5. **Visual Hierarchy & Design** — Sticky menu, whitespace, image quality
6. **Mobile Optimization** — Mobile-first, button sizing, content collapsing
7. **Trust & Social Proof** — Reviews, testimonials, footer, business info
8. **Forms & Interaction** — Field requirements, labels, errors, tel links
9. **Performance & QA** — Speed, broken elements, placeholders, URLs
10. **Content Standards** — First-fold clarity, CTA timing

## React Architecture

### Component Structure
- **Single File**: All UI lives in `src/App.jsx` (~1600 lines). This is a project convention — do not split into components.
- **Global Theme Object**: All colors in the `BRAND` constant.
- **View Modes**: Grid (flip cards) / List (detailed rows).
- **Safe Storage**: `getSafeLocalStorage` wrapper for SSR compatibility.

### State Management
- `status`: `idle` → `analyzing` → `wrapped_countdown` → `wrapped_story` → `complete`
- `report`: The full report object (set after analyze, can be updated by chat)
- `chatHistory`: Array of `{role, parts}` messages for the AI chat
- Learning state is read directly from localStorage (not React state)

## Chat System

### Request Format
```json
{
  "history": [{ "role": "user|model", "parts": [{ "text": "..." }] }],
  "systemInstruction": "Full system prompt with report state and past learnings"
}
```

### Response Format
```json
{
  "message": "The AI's conversational response",
  "updated_report": null | { full report object },
  "learning_insight": null | "Reusable CRO insight string"
}
```

### Key Behaviors
- If `updated_report` is non-null and different from current report, the dashboard updates live with a flash animation. `trackChatModification()` is called.
- If `learning_insight` is non-null, it's stored via `addLocalInsight()` + `saveServerInsight()` for future audits.
- JSON parse failures fall back to treating raw text as the message.
- On error, the message gets `_error: true` flag and a "Retry" button is rendered.
- The chat AI has 10 detailed rules including: proactive insight extraction, citing exact scores, adapting to industry/audience, and explaining reasoning before replacing recommendations.

## Instructions for AI Support Agents

If you are an AI assistant working on this codebase:

1. **See CLAUDE.md** for the full context file with rules, schemas, and decisions.
2. **API Keys**: Server-side only via `process.env.VITE_GEMINI_API_KEY`.
3. **Styling**: Tailwind + inline styles only. No external CSS files.
4. **Animations**: CSS keyframes only. No Framer Motion.
5. **Node Compatibility**: Pinned to Vite 5 for Node 18 support.
6. **Test builds**: Always run `npx vite build` before committing.
7. **Learning system**: Server-side (Upstash Redis) + localStorage fallback. Requires `KV_REST_API_URL` and `KV_REST_API_TOKEN` env vars.

## Future Integrations
- **WebSockets**: Real-time streaming for report generation progress.
- **Vector DB**: Storing CRO best practices for benchmarked industry scores.
- **Competitor Scraping**: Actually scrape and analyze competitor URLs (currently accepted but not used).
- **Learning Analytics**: Dashboard showing how the system has improved over time (avg score trends, most common issues, insight count).
