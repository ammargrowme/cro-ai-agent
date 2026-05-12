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

### Phase 1c. Additional Page Scraping (when batch pages provided)
Scrapes up to **25 additional pages** (`MAX_ADDITIONAL_PAGES`) from the same site in parallel alongside the main URL and competitors. Each scrape returns `{ sanitized, raw }` — sanitized for AI prompts, raw HTML preserved for static extraction in Phase 1.5. Cap raised from 4 → 25 in v1.8.0.

### Phase 1d. Auto Page Discovery (v1.8.0+)
The frontend can call `/api/discover` first to populate the additional-pages list automatically. Cascade: `/sitemap.xml` → `/sitemap_index.xml` → `Sitemap:` directive in `/robots.txt` → homepage link crawl → depth-1 BFS through priority probe paths (`/about`, `/services`, `/contact`, `/pricing`). Returns up to 25 same-origin URLs, prioritized homepage → contact → pricing → about → services → products → alphabetical. Helpers in `api/_extract.js`.

### Phase 1.5: Static Health Audit (v1.8.0+)
Runs after Phase 1 scrape, before Phase 2 AI calls. Pure-JS analysis of the raw HTML — no Gemini calls in this phase.

- **Link extraction** — every `<a href>` parsed with regex. Each link carries `{ href, text, isExternal, isInternal, isCta, isPhoneLabel, isTel, isMailto, isEmpty, isGenericCta, className }`. CTA detection uses text-regex (get/start/book/call/...) + class-regex (btn/cta/action/...). Phone-label detection (`call us`, `call now`, etc.) flags label-tel mismatch
- **Button extraction** — `<button>`, `<input type=submit|button|image>`, and `role="button"` elements with text/onclick/href/class metadata
- **Form extraction** — every `<form>` parsed into `{ action, method, fields[] }`. Each field captures kind/type/name/label/placeholder/required/hasInlineLabel/hasValidationPattern/hasAriaLabel. Inline-label detection: input has no preceding `<label>` AND only `placeholder` describes the field — CXL marks this as friction
- **URL health checking** — `checkUrls(urls, { concurrency: 10, timeoutMs: 5000 })` HEAD-checks every unique http(s) link found across all pages. Falls back to `GET` with `Range: bytes=0-1` when HEAD returns 405/403/501 (some servers disallow HEAD)
- **Static CTA-issue detection** — `detectCtaIssues(pageUrl, links, buttons)` flags empty/`#`/`javascript:` hrefs on visible CTAs (high severity), phone-labeled CTAs missing `tel:` (high), generic CTA copy (medium)
- **Static-findings appendix** — broken links, CTA issues, and form-friction flags are passed into the recommendations Gemini call as ground truth so recs cite concrete URLs and fields by name

### Phase 2: AI Analysis (4-6 Parallel Calls)
Four to six Gemini calls run simultaneously. All prompts inject `CXL_PRINCIPLES` from `api/_knowledge.js` alongside `CRO_CHECKLIST` so reasoning stays grounded in named CXL principles (persuasive design, friction taxonomy, awareness levels, Relevance/Trust/Stimulance heuristics, etc.):

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

#### 2d. Competitor Analysis Call (when competitors provided)
- Produces: `competitor_analysis` with `overview`, `comparisons[]` (each with `competitor_scores` for all 10 categories and `steal_worthy` ideas)
- Uses both main site HTML and competitor HTML for direct comparison
- Enhanced in v1.6.0 with comparison matrix data and actionable steal-worthy ideas

#### 2e. Per-Page Scoring Call (when additional pages provided)
- Produces: `page_scores[]` with `url`, `page_type`, `overall_score`, `top_issues[]` per page
- **Batched in v1.8.0**: splits the page list into groups of 5 (`PAGE_BATCH`) and runs the batches in parallel via Promise.all so a 25-page audit doesn't overflow Gemini's response budget. Each batch is wrapped in try/catch so one failure doesn't kill the whole call

#### 2f. Form Friction Call (v1.8.0+, when forms detected)
- Produces: `form_health.per_form[].ai_analysis` with `{ page_url, form_purpose, friction_score (0-100), top_friction_points[], recommendations[] }`
- Receives serialized per-field metadata (kind, type, name, label, required, inline-label flag, validation-pattern flag) for every detected form
- Applies CXL form-friction rules: inline labels = bad, no inline validation = friction, too many required fields = friction, no expectation-setting copy = friction
- Schema: `FORM_FRICTION_SCHEMA`

### Phase 3: Merge & Deliver
All results are merged into a single report object. v1.8.0 adds: `link_health` (total_links, total_checked, broken_links[], by_page[]), `cta_audit` (total_ctas, issues[]), `form_health` (total_forms, per_form[] with field-level metadata + AI analysis), `pages_audited[]`, and extended `audit_metadata` (pages_requested, pages_scraped, urls_health_checked).

## Export System

### PDF Export (Programmatic jsPDF — v1.6.1)
The PDF is generated entirely via jsPDF's programmatic API — no html2canvas screenshots. This produces a professional, light-themed document with proper pagination.

**Document structure:**
1. Cover page: Brand header, URL, date, score card with color-coded background, summary
2. Executive Summary: Strengths (green bullets) + Quick Wins (orange bullets)
3. CRO Checklist Scores: Two-column table with labels, numeric scores, and colored progress bars
4. Critical Failures: Red accent block with danger markers
5. Competitor Analysis (conditional): Comparison matrix table + steal-worthy ideas
6. Page Scores (conditional): Table with URL, type, score, top issues
7. Recommendations: Numbered cards with priority badges, two-column impact/implementation layout
8. All pages: Orange accent header bar, report title, page numbers in footer

**Page break strategy:** Every content block calls `ensureSpace(needed)` before rendering. If the remaining space on the current page is insufficient, a new page is added automatically. This completely prevents section cutting.

### Other Export Formats (v1.7.0)
- **Word (.docx)**: Professional document with title page, checklist table, recommendations (via `docx` library, lazy-loaded)
- **Excel (.xlsx)**: Multi-sheet workbook — Executive Summary, Checklist Scores, Recommendations, Competitors, Page Scores (via `xlsx` library, lazy-loaded)
- **Plain Text (.txt)**: ASCII-formatted report with score bars, zero dependencies
- **PNG**: html2canvas screenshot of dashboard (dark theme preserved)
- **JPEG**: html2canvas screenshot at 92% quality (via `src/utils/export/jpeg.js`)
- **Markdown**: Structured text with all report sections
- **CSV**: Recommendations table with all fields
- **JSON**: Raw report object

Export dropdown is organized into Documents/Data/Images sections with compact layout and max-height scroll.

### Print (window.print)
Extensive `@media print` CSS converts the dark glassmorphism UI to a clean light theme. Glass cards, dark backgrounds, tables, SVG circles, and flip cards all transform to printer-friendly layouts.

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
- **Main UI**: `src/App.jsx` (~1800 lines). Constants, utilities, learning system, and export logic extracted to `src/constants/`, `src/utils/`, `src/utils/export/`. Future: extract hooks and components.
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
2. **API Keys**: Server-side only via `process.env.GEMINI_API_KEY`. Do NOT use the `VITE_GEMINI_API_KEY` name — Vite bundles `VITE_*` env vars into the client JS, exposing the key. (The `VITE_GEMINI_API_KEY` fallback was removed 2026-05-12 after the original `GROWAGENTKEY` was found to be leaking via the client bundle.)
3. **Styling**: Tailwind + inline styles only. No external CSS files.
4. **Animations**: CSS keyframes only. No Framer Motion.
5. **Node Compatibility**: Pinned to Vite 5 for Node 18 support.
6. **Test builds**: Always run `npx vite build` before committing.
7. **Learning system**: Server-side (Vercel Redis) + localStorage fallback. Requires `REDIS_URL` env var (auto-injected by Vercel).
8. **CXL knowledge (v1.8.0+)**: `api/_knowledge.js` exports `CXL_PRINCIPLES`. Every Gemini prompt in `api/analyze.js` and `api/chat.js` injects this constant. When editing prompts, keep the injection — removing it strips the agent of its grounded reasoning. To update the principles, edit the constant; no other change needed.
9. **Static extraction (v1.8.0+)**: `api/_extract.js` extracts links/buttons/forms via regex. Do NOT swap in cheerio/jsdom without checking the Vercel 50MB slug limit — the project intentionally has zero browser-parsing deps. SPAs are a known limitation.
10. **HEAD-check etiquette**: `checkUrls()` already retries 405/403/501 with GET+Range. If you see false-positive broken links, audit the retry path rather than turning off the check.

## Future Integrations
- **JS-rendered SPA support (Phase 2 deep audit)**: `@sparticuz/chromium` + `puppeteer-core` on Vercel. ~50MB slug budget is tight; likely needs a dedicated `/api/deep-audit` function. Would resolve the "form_health: 0 forms" false negative on Next.js/React SPAs.
- **WebSockets**: Real-time streaming for report generation progress.
- **Vector DB**: Storing CRO best practices for benchmarked industry scores.
- ~~**Competitor Scraping**~~: Done in v1.3.0 — competitors are scraped and analyzed via a 4th AI call.
- ~~**Auto page discovery**~~: Done in v1.8.0 — `/api/discover` cascades sitemap → robots → homepage crawl.
- ~~**Link/CTA/Form health audit**~~: Done in v1.8.0 — static analysis pass in Phase 1.5, surfaces in `link_health`/`cta_audit`/`form_health`.
- ~~**CXL knowledge integration**~~: Done in v1.8.0 — `CXL_PRINCIPLES` injected into every Gemini prompt.
- **Learning Analytics**: Dashboard showing how the system has improved over time (avg score trends, most common issues, insight count).
