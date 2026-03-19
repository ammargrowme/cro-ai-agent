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

### Storage Architecture
```
localStorage
├── growagent_learnings     # Array of past audit summaries (max 20)
│   └── { url, score, timestamp, topIssues[], checklistWeaknesses[], feedbackInsights[] }
├── growagent_insights      # Array of chat-extracted CRO insights (max 50)
│   └── { text, timestamp }
└── growagent_pagespeed_key # User's custom PageSpeed API key
```

### Data Flow
1. **After each audit**: `saveLearning()` extracts key data from the report and stores it.
2. **During chat**: If the AI returns a `learning_insight`, `addFeedbackInsight()` stores it and attaches it to the most recent learning entry.
3. **Before each audit**: `getPastLearningsForPrompt()` retrieves the last 5 audits with their attached insights and sends them in the API request body.
4. **In the AI prompt**: Past learnings are formatted as a "LEARNING FROM PAST AUDITS" section that instructs the AI to spot patterns and give more targeted advice.

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
- If `updated_report` is non-null and different from current report, the dashboard updates live with a flash animation.
- If `learning_insight` is non-null, it's stored via `addFeedbackInsight()` for future audits.
- JSON parse failures fall back to treating raw text as the message.

## Instructions for AI Support Agents

If you are an AI assistant working on this codebase:

1. **See CLAUDE.md** for the full context file with rules, schemas, and decisions.
2. **API Keys**: Server-side only via `process.env.VITE_GEMINI_API_KEY`.
3. **Styling**: Tailwind + inline styles only. No external CSS files.
4. **Animations**: CSS keyframes only. No Framer Motion.
5. **Node Compatibility**: Pinned to Vite 5 for Node 18 support.
6. **Test builds**: Always run `npx vite build` before committing.
7. **Learning system**: Client-side localStorage only. No server persistence yet.

## Future Integrations
- **Server-side Learning**: Vercel KV or Supabase for cross-device learning persistence.
- **WebSockets**: Real-time streaming for report generation progress.
- **Vector DB**: Storing CRO best practices for benchmarked industry scores.
- **Competitor Scraping**: Actually scrape and analyze competitor URLs (currently accepted but not used).
