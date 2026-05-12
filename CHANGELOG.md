# Changelog

All notable changes to the GROWAGENT project will be documented in this file.

## [1.8.1] - 2026-05-12

### Fixed
- **CTA Audit false-positive flood (3 root causes)** — initial v1.8.0 release flagged nav-menu dropdown triggers, Cloudflare email-protection URLs, and per-page repeats as "broken CTAs". Live audit on growmemarketing.ca went from 84 issues → 0 false positives.
  - **Dropdown nav triggers** — `<a href="#">` with `aria-haspopup` / `aria-expanded` / `aria-controls` / `role="menuitem|button"` / `data-toggle` / `data-bs-toggle` / dropdown class names are now treated as JS-handled, not broken.
  - **Structural nav-context detection** — any empty-href anchor inside `<nav>`, `<header>`, `<menu>`, or `role="navigation|menu|menubar"` is suppressed regardless of class name. Catches custom site-specific classes (e.g. growmemarketing.ca's `gm-nav-link`) that enumerated regexes never could.
  - **Interactive widget containers** — same structural treatment for Elementor flip-box / accordion / tabs / carousel / slider / swiper / splide / modal-trigger / reveal-card / service-card / feature-box / info-box. Uses depth-tracking close-tag matching to compute widget ranges.
  - **Broader dropdown class regex** — now also matches `nav-link` / `nav-item` / `menu-link` / `menu-item` / `nav-trigger` patterns as a fallback.
  - **Cloudflare URL exclusion** — `shouldSkipHealthCheck()` filters `/cdn-cgi/l/email-protection`, `/cdn-cgi/scrape-shield`, `/cdn-cgi/challenge-platform`, `/cdn-cgi/bm/cv/result`, `/cdn-cgi/trace`, `/cdn-cgi/rum` from the HEAD-check pass. These shims always return 4xx server-side; only resolve client-side via Cloudflare's JS.
  - **Cross-page CTA dedup** — identical `{severity, issue, evidence}` triples merged in `api/analyze.js` Phase 3 with `page_count` rollup. Frontend shows "× N pages" badge. Same nav dropdown that appeared on 25 pages no longer inflates the issue count 25×.
- **Negative-case verified** — genuine broken CTAs in `<main>`, body, and `<footer>` still flag correctly (separate test fixture).

### Security
- **Verified live production bundle is key-free** — `grep -E "AIza[0-9A-Za-z_-]{20,}"` against `cro.growmeapps.io`'s three loaded JS chunks returns zero matches. The v1.8.0 security fix (renaming `VITE_GEMINI_API_KEY` → `GEMINI_API_KEY`) successfully stopped the client-side leak.
- **Three Gemini keys neutralized today**: `AIzaSyAN…wbOM` (in initial-commit git history, rotated by user), `AIzaSyB1nx…` (GROWAGENTKEY in `gen-lang-client-0331746047`, project deleted by user), `AIzaSyDD…` (prior hub key already rotated). Only the current `AIzaSyDa…FKpbE` hub key remains active.

## [1.8.0] - 2026-05-12

### Added
- **Auto page discovery** — New `/api/discover` endpoint tries `sitemap.xml` → `sitemap_index.xml` → `Sitemap:` line in `robots.txt` → homepage link crawl with depth-1 BFS through priority paths (/about, /services, /contact, /pricing). Returns up to 25 same-origin URLs, prioritized homepage → contact → pricing → about → services → products → alphabetical
- **Auto/Manual toggle in the UI** — "Batch Pages" section now has an Auto/Manual switch. Auto mode hits `/api/discover` and shows discovered URLs as toggleable chips with select-all / select-none controls. Manual mode keeps the existing textarea (no longer capped at 4)
- **25-page audits** — Previous hard cap of 4 additional pages raised to 25. Server cap is `MAX_ADDITIONAL_PAGES = 25` in `api/analyze.js`; frontend matches
- **Link health audit** — `api/_extract.js` runs HEAD-checks (with GET-with-Range fallback for 405/403) on every discovered `<a href>`, concurrency-limited to 10. Broken links surface in a new `link_health` report section with status code, link text, and origin page
- **CTA audit** — Static detection of: empty/`#`/`javascript:` hrefs, phone-labeled CTAs that aren't `tel:` links, generic CTA copy (Submit/Click Here/Buy Now/Send). Renders as a `cta_audit` card in the report
- **Form friction analysis** — New 6th AI call. Extracts every `<form>` (fields, labels, validation patterns, required flags, inline-label detection) and asks Gemini to apply CXL form-friction principles. Output: friction score 0-100, top friction points, concrete recommendations per form
- **CXL knowledge base** — `api/_knowledge.js` distills the GrowMe CRO training docs into a `CXL_PRINCIPLES` constant (~3.5K chars) covering persuasive design, visual hierarchy, web forms, CTAs, awareness levels, friction taxonomy, Relevance/Trust/Stimulance heuristics, fast/slow thinking, and copywriting principles. Injected into the overview, recommendations, checklist, per-page, form-friction, and chat prompts
- **Static-findings appendix in recommendations prompt** — Broken links, CTA issues, and form-friction flags are passed to the recs Gemini call as ground truth, so concrete URLs and fields appear in the report instead of generic advice
- **Pages Audited list** — Compact footer card under the health cards listing every URL the audit covered

### Changed
- **Per-page AI scoring is now batched** — Splits pages into groups of 5 and runs the batches in parallel, so a 25-page audit doesn't overflow Gemini's response budget
- **Scrape pipeline preserves raw HTML** — `scrapePromise` and `additionalPagePromises` now return `{ sanitized, raw }`. Sanitized HTML still feeds the AI; raw HTML feeds `extractLinks` / `extractButtons` / `extractForms` (which need preserved `class`/`href`/`style` attrs)
- **Loading copy** — Added 5 new loading phrases for the discovery, link-health, form-friction, awareness-mapping, and CXL-friction phases. Step labels mention the new "Auditing Links, CTAs & Forms" phase

### Known limitations
- **SPA blindness** — JS-rendered forms and links are invisible to static analysis. The Form Health card explicitly notes this when no forms are detected. Resolving requires headless browser automation (deferred — see `docs/KNOWN-ISSUES.md`)
- **HEAD-check noise** — Some servers return 405/403 for HEAD; we retry with `GET` + `Range: bytes=0-1` before flagging broken. Some firewalls still produce false positives
- **Cost** — Per-audit Gemini token usage rises ~1.5–2× due to CXL injection across 6 calls and the form-friction pass

## [Security] - 2026-05-12

### Fixed
- **CRITICAL: Gemini key was being bundled into client JS** — `.env.development.local` declared `VITE_GEMINI_API_KEY=...`. Vite bundles every `VITE_*` env var into the client-side JS chunk, which meant the key was publicly extractable from `https://cro-ai-agent.vercel.app/` via DevTools → Network → main JS. Server-side calls in `/api/*.js` were the only real consumer, so the `VITE_` prefix was incorrect from day one. Renamed env var to `GEMINI_API_KEY` (no prefix), removed `|| process.env.VITE_GEMINI_API_KEY` fallback from `api/analyze.js`, `api/chat.js`, `api/generateCode.js`, `api/generateABTests.js`. Updated docs (CLAUDE.md, README.md, TODO.md, DEVELOPER.md, docs/ARCHITECTURE.md).

### Changed
- **Migrated to new hub-managed API key** — Gemini key is now sourced from `growme-217600` (the consolidation hub), label "CRO AI Agent Gemini (server-side)". Old key from `gen-lang-client-0331746047` (GROWAGENTKEY) remains live until Vercel env swap + rotation per `Code/Ops/GCP Audit/reports/migration-execution-2026-05-12.md`.

### USER ACTION REQUIRED (after this deploy)
1. Vercel dashboard → cro-ai-agent → Settings → Environment Variables → DELETE `VITE_GEMINI_API_KEY` from all 3 environments (Production / Preview / Development).
2. ADD `GEMINI_API_KEY` = new hub key value to all 3 environments.
3. Trigger redeploy.
4. Verify on `https://cro-ai-agent.vercel.app/`: open DevTools → Network → main JS bundle → grep for `AIzaSy` → no key visible.
5. Trigger an analyze + chat + code-gen + A/B test to confirm all 4 server endpoints work.
6. After deploy verified: Console-disable (do NOT delete) the old GROWAGENTKEY in project `gen-lang-client-0331746047` so leaked copies stop working.

## [Docs] - 2026-04-10

### Changed
- **CLAUDE.md trimmed from 407 to 210 lines** — Extracted reference data into 4 standalone docs/ files for token efficiency
- **Created docs/ARCHITECTURE.md** — Frontend, backend, learning system, CRO checklist, technical decisions
- **Created docs/SCHEMAS.md** — Report schema + Chat response schema with JSON examples
- **Created docs/FILE-MAP.md** — Complete directory structure with file descriptions
- **Created docs/KNOWN-ISSUES.md** — Active issues, resolved issues, lessons learned

## [1.7.0] - 2026-03-24

### Fixed
- **CRITICAL: App crash on Analyze** — Fixed Temporal Dead Zone (TDZ) bug where `additionalPagesArr` was used before its `const` declaration in `handleAnalyze()`, causing a ReferenceError that prevented all URL analysis
- **CRITICAL: Chat crash** — `LOCAL_INSIGHTS_KEY` was referenced in App.jsx but only defined as a non-exported const in `utils/learning.js`, causing ReferenceError on every chat message
- **Export dropdown hidden behind content** — `glass-card`'s `backdrop-filter` created an isolated stacking context that trapped the dropdown's z-index. Replaced with solid background + `relative z-40`
- **Export button closing immediately** — Added `stopPropagation` to prevent the click-outside listener from closing the menu on the same click that opens it
- **Useless revokeObjectURL on data URLs** — Removed no-op `revokeObjectURL` calls on `canvas.toDataURL()` results in PNG/JPEG exports
- **Silent API failures** — Added `!response.ok` error checks to `handleGenerateCodePatch` and `handleGenerateABTests` handlers
- **Serverless setInterval issue** — Replaced module-level `setInterval` in `api/_utils.js` with inline cleanup during rate limit checks (serverless-safe)

### Added
- **Multi-format export**: Excel (.xlsx), Word (.docx), Plain Text (.txt), and JPEG screenshot exports alongside existing PDF and Markdown
- **Modular architecture**: Extracted constants, utilities, and export logic from App.jsx monolith into focused modules (`src/constants/`, `src/utils/`, `src/utils/export/`)
- **API security hardening**: SSRF prevention (`validateUrl`), in-memory rate limiting, input length caps, control character stripping, chat history validation, admin-only DELETE endpoint
- **Shared security utilities**: New `api/_utils.js` with `validateUrl()` and `rateLimit()` functions

### Changed
- **App.jsx reduced by ~400 lines** — Extracted BRAND, CHECKLIST_LABELS, loading data, JSON parsing, localStorage helpers, clipboard, and entire learning system into separate modules
- **Export dropdown redesigned** — Reorganized 9 export formats into Documents/Data/Images sections with compact layout, max-height scroll, and solid opaque background
- **Vite config updated** — Added `@` path alias and `es2020` build target
- **Deleted unused `src/App.css`** (606 bytes, never imported)

## [1.6.1] - 2026-03-19
### Changed
- **Professional PDF Export**: Completely replaced the html2canvas screenshot-based PDF with a programmatic jsPDF document builder. New PDF features a branded cover page with score display, section headers with accent bars, executive summary, checklist score table with visual bars, critical failures callout block, competitor comparison matrix, page scores table, structured recommendation cards with two-column impact/implementation layout, and consistent page numbers/headers/footers across all pages. Light professional theme (white background) — no more dark screenshots.
- **Print CSS Overhaul**: Improved `@media print` styles for professional light-themed output. Glass cards, dark backgrounds, and tables now convert cleanly to light theme. Better page break handling, cleaned-up selectors, and proper SVG/gradient color preservation.

### Added
- **VISION.md**: New product vision document explaining what GROWAGENT is, the problem it solves, the ultimate goal, how it works today, the full roadmap, guiding principles, and target users. Updated alongside all other documentation.

## [1.6.0] - 2026-03-19
### Added
- **Enhanced Competitor Analysis**: Competitor comparison matrix table showing side-by-side checklist scores with color-coded differences. Steal-worthy ideas section per competitor with actionable recommendations to adopt.
- **Batch Multi-Page Analysis**: New "Batch Pages" field in Advanced panel allows analyzing up to 4 additional pages from the same site. Each page gets an individual score, page type classification, and top issues. Site-Wide Page Scores panel displays per-page results in a responsive grid.
- **Target Keywords Field**: New "Target Keywords" input in Advanced panel for SEO alignment verification. Keywords are injected into all AI prompts for keyword-aware scoring and recommendations.
- **5th Parallel AI Call**: Per-page scoring call added to Phase 2 when additional pages are provided. Runs in parallel with the other 3-4 AI calls.
- **Markdown Export Enhanced**: Export now includes steal-worthy ideas from competitor analysis and per-page scores from multi-page analysis.

## [1.5.0] - 2026-03-19
### Changed
- **Visual Refresh**: Complete UI overhaul with deeper, more refined dark theme
- **Glassmorphism Design System**: New `.glass-card` class with frosted-glass effects, subtle backdrop blur, and semi-transparent borders across all panels (dashboard, chat, checklist, competitor analysis)
- **Color Palette Refined**: Deeper base (`#08090D`), softer surfaces (`#12151B`), muted text (`#8B95A5`), refined green accent (`#34D399`) — less harsh, more professional
- **Hero Section Redesign**: Floating animated orb, gradient text animation, improved typography hierarchy, better spacing
- **Input Form Polish**: Thinner gradient border, refined button with gradient + inner shadow, smaller touch targets for cleaner look
- **Loading Screen Refined**: Cleaner progress indicators, subtle glow-pulse animation on spinner, tighter step layout
- **Header Upgraded**: Frosted glass navbar with `saturate(180%)`, gradient logo icon, responsive learning badge
- **Chat Terminal Glass Effect**: Message bubbles with semi-transparent backgrounds and blur, frosted input area
- **Score Circle Gradient**: SVG `<linearGradient>` stroke on the Growth Score circle for a polished look
- **Noise Texture Overlay**: Subtle SVG noise at 1.5% opacity for depth and tactile feel
- **New Animations**: `animate-float`, `animate-glow-pulse`, `animate-gradient` (gradient shift), `border-glow`
- **Accessibility**: Added `prefers-reduced-motion` media query — disables all animations for users who prefer reduced motion
- **Smooth Scroll**: Added `html { scroll-behavior: smooth }` globally
- **Custom Scrollbar Refined**: Thinner (5px), semi-transparent rgba colors

## [1.4.0] - 2026-03-19
### Added
- **Server-Side Learning System**: All audits and chat insights are now saved to a shared Upstash Redis database via the new `/api/learnings` endpoint. Every user's audit contributes to a global knowledge base that makes the AI smarter for everyone.
- **New API Endpoint (`api/learnings.js`)**: GET returns global learnings + insights with counts; POST saves new audit summaries or chat insights with input validation.
- **Graceful Degradation**: If the server is unavailable, the app falls back to localStorage-only learning (previous behavior). No functionality is lost.
- **Merged Learning Context**: AI prompts now receive merged local + server learnings, deduplicated by URL+timestamp, for richer pattern detection across all users.
- **Global Learning Count**: Header badge now shows total learnings from all users (server) plus local history.

### Changed
- **Learning System Architecture**: Moved from client-only (localStorage) to server-first (Vercel Redis) + local fallback. localStorage keys unchanged (backward compatible).
- **Dependencies**: Added `redis` (node-redis) for server-side Redis persistence.
- **`.env.example`**: Added `REDIS_URL` environment variable documentation.

## [1.3.0] - 2026-03-18
### Added
- **Competitor Analysis (Live)**: Competitor URLs are now scraped in parallel during Phase 1 and analyzed via a 4th AI call in Phase 2. The `competitor_analysis` field is now fully populated with CRO-focused comparisons.
- **React Error Boundary**: App-wide error boundary catches rendering crashes and displays a branded recovery screen instead of a white page.
- **Clipboard API**: Modern `navigator.clipboard.writeText()` replaces deprecated `document.execCommand('copy')` across all copy buttons, with graceful fallback.
- **Export Loading States**: PDF and PNG exports now show loading indicators and user-visible error messages on failure.
- **Elapsed Timer**: Loading screen now displays real elapsed time and reassurance messages after 30s and 60s.
- **Accessibility**: Added `aria-label`, `role="log"`, `role="alert"`, and `aria-live="polite"` to key interactive elements.
- **Meta Tags & OG Tags**: `index.html` now includes proper title, description, OG tags, and theme-color for SEO and social sharing.
- **Input Validation**: All 4 API endpoints now validate request bodies (type checks, length limits, URL format).

### Changed
- **Lazy-loaded Export Libraries**: `html2canvas` (~260KB) and `jsPDF` (~300KB) are now dynamically imported only when the user clicks Export, reducing initial bundle by ~560KB.
- **Font Loading Optimized**: Google Fonts moved from inline JSX to `index.html` `<head>` with `preconnect` for faster first paint.
- **Vite Build Optimized**: Added manual chunks for `react`/`react-dom` and `lucide-react` for better long-term caching. Disabled compressed size reporting for faster builds.
- **Chat Report Merging**: `updated_report` from chat is now merged with the existing report instead of replacing it, preventing data loss from partial AI responses.
- **Learning Count Cached**: Header learning badge now reads from a React state variable instead of calling `getLearnings()` (which parses localStorage) on every render.
- **Recommendations Memoized**: `filteredRecommendations` is now wrapped in `useMemo` to avoid recalculation on unrelated state changes.
- **API Key Env Var**: Renamed from `VITE_GEMINI_API_KEY` to `GEMINI_API_KEY` (with fallback) to prevent accidental client-side exposure via Vite's `VITE_` prefix convention.

### Fixed
- **Object URL Memory Leaks**: All export handlers now call `URL.revokeObjectURL()` after download to free memory.
- **generateABTests.js JSON Crash**: Uncaught `JSON.parse` on Gemini response now wrapped in try-catch with salvage logic matching the other endpoints.
- **generateCode.js Empty Response**: Added validation for empty AI responses instead of silently returning undefined.

## [1.2.1] - 2026-03-18
### Added
- **Aggregate Pattern Detection**: Learning system now detects recurring checklist weaknesses across all past audits and highlights systemic patterns (e.g., "CTA issues found in 4/5 audits") in AI prompts.
- **Richer Audit Memory**: Each saved audit now stores checklist strengths, critical flags, all checklist scores, and chat modification count — not just weaknesses.
- **Chat Retry Button**: When the AI chat fails, a red "Retry" button appears on the error message instead of just showing a generic error.
- **Chat Modification Tracking**: The learning system now tracks how many times the user modified the report via chat, informing future audit prompts.
- **Print CSS for Checklist Panel**: Added `@media print` rules for the CRO Checklist Scores section — SVG circles, category cards, and critical failure flags now render correctly when printing.
- **Proactive Insight Extraction**: Chat AI is now instructed to actively look for reusable CRO insights in every conversation, not just when obvious.
- **Truncated JSON Salvaging**: If Gemini returns truncated JSON (due to token limits), the parser now attempts to close brackets/braces and salvage the partial response.
- **Graceful AI Call Failures**: Uses `Promise.allSettled` instead of `Promise.all` — if one of the 3 AI calls fails, the other 2 still populate the report with fallback messages instead of crashing the entire audit.
- **Default Checklist Scores**: Missing checklist categories are filled with 0 instead of being absent, preventing UI rendering issues.

### Changed
- **Gemini Token Budget Increased**: Default `maxOutputTokens` raised from 4096 to 8192, checklist call raised from 2048 to 8192. Fixes truncation on Gemini 2.5 Flash where thinking tokens consume the output budget.
- **Thinking Budget Config**: Added `thinkingConfig.thinkingBudget` to cap Gemini's internal reasoning at 40% of max tokens, ensuring enough room for the actual JSON output.
- **Learning Prompts Overhauled**: Backend AI prompts now include individual audit history, recurring pattern analysis, and accumulated user insights — making the AI significantly smarter with each run.
- **Chat System Instruction Enriched**: Chat now receives full audit history summary, checklist strengths/weaknesses per past audit, and accumulated insights for deeper conversations.
- **Chat AI Rules Expanded**: 10 detailed rules (up from 6) including: replace removed recommendations with new ones targeting different checklist items, cite exact scores, adapt to user's industry/audience, and proactively suggest improvements.
- **`getPastLearningsForPrompt()`**: Now returns all learnings (not just last 5) so the backend can aggregate patterns across the full history.
- **Better Gemini Response Extraction**: Now checks all response parts for text (handles Gemini 2.5 thinking mode where text may be in a later part). Logs `finishReason` on every call for better debugging.

### Fixed
- **CRITICAL: Checklist JSON Truncation**: Gemini 2.5 Flash was truncating checklist responses at ~161 chars because `maxOutputTokens: 2048` didn't leave enough room after thinking tokens. Now uses 8192 with thinking budget cap.
- **Model Upgrade**: Analysis and chat calls upgraded from `gemini-2.5-flash` to `gemini-3-flash-preview` (frontier-class quality at Flash pricing). Code gen and A/B test endpoints remain on `gemini-2.5-flash` for speed.
- **Chat Raw JSON Display Fix**: Gemini 3 Flash returns thinking parts before JSON output; chat.js now scans all response parts to find the actual JSON instead of blindly taking `parts[0]`. Added truncated JSON salvaging and nested-JSON safety check.
- **Chat Token Budget**: Increased `maxOutputTokens` from 4096 to 16384 with `thinkingBudget: 4096` to prevent truncation on report updates.
- **Chat Summary Bloat Fix**: Added explicit rules preventing the AI from dumping scores, metadata, and recommendation lists into the `summary` field. Summary is now capped at 60 words.
- **Flexible Recommendation Count**: Recommendations are no longer hardcoded to exactly 6. The AI now provides as many as are genuinely valuable (typically 3-10), only including recommendations that address real issues found on the site.
- **Chat Error UX**: Error messages now show a retry button instead of a dead-end generic message.
- **Stale Schema Removed**: Removed unused `REPORT_SCHEMA_PROPERTIES` constant from App.jsx (was v1.0.0 schema, never used by backend).
- **Orphaned `fix.py` Deleted**: Removed leftover development script from project root.

### Removed
- `REPORT_SCHEMA_PROPERTIES` dead code from `src/App.jsx`
- `fix.py` orphaned script from project root

## [1.2.0] - 2026-03-18
### Added
- **CRO Checklist Integration**: All audits now score websites against the full GrowMe Basic Website Standards checklist (10 categories, 50+ criteria). Each recommendation references which checklist item(s) it addresses.
- **Checklist Scores UI**: New dashboard panel with circular progress indicators for each checklist category (SEO, Above-the-Fold, CTA, Content, Visual Hierarchy, Mobile, Trust, Forms, Performance, Content Standards).
- **Critical Failures Panel**: Top 5 most critical checklist failures are flagged with red indicators.
- **Learning System**: The app now learns from every audit run. Past audit summaries (scores, top issues, checklist weaknesses) are stored in localStorage and injected into future AI prompts.
- **Chat Feedback Loop**: The AI chat now extracts reusable CRO insights from conversations (via `learning_insight` field) and persists them for future audits.
- **Learning Indicator**: Header shows count of past audits the system has learned from.
- **CLAUDE.md**: Comprehensive AI context file for any AI assistant working on this codebase.
- **Expanded Categories**: Recommendations now use 9 categories (CTA, Trust, UX, Design, Performance, Copy, Mobile, SEO, Forms) instead of the previous 4.

### Changed
- **Recommendations Count**: Increased from 5 to 6 per audit for broader coverage.
- **Chat System Overhaul**: Complete rewrite of `api/chat.js` with proper response schema (`{message, updated_report, learning_insight}`), structured system instruction, and JSON parse fallback handling.
- **Chat System Instruction**: Now includes full report state, past audit insights, and CRO checklist context for smarter conversations.
- **Icon Mapping**: Updated `getIconForCategory` to handle all 9 recommendation categories with distinct icons.
- **Export Format**: Markdown export now includes checklist scores, critical failures, and checklist references per recommendation.

### Fixed
- **Chat Response Parsing**: Added robust fallback parsing for cases where Gemini returns non-JSON or partial JSON responses.
- **Chat Error Messages**: Improved error handling with user-friendly fallback messages instead of silent failures.

## [1.1.0] - 2026-03-12
### Added
- **Competitive Intelligence**: Users can now add competitor URLs for comparative AI analysis.
- **Advanced Context**: Added a campaign context field to allow the AI to specialize its strategy (e.g., B2B vs B2C).
- **GitHub & Deployment**: Initialized Git repository and configured for Vercel deployment.
- **Environment Security**: Moved hardcoded API keys to `.env` variables.
- **Professional Documentation**: Comprehensive README and Developer guides.

### Changed
- **Gemini Model Upgrade**: Migrated from `gemini-1.5-flash` to the production-ready `gemini-2.5-flash` for better reasoning.
- **Node Compatibility**: Downgraded Vite 6 to Vite 5 to ensure support for local Node.js v18 environments.

### Fixed
- **Rate Limit Loop**: Fixed a bug where hitting Google's 429 rate limit would stall the app for 60+ seconds. It now skips gracefully.
- **Escaping Syntax**: Resolved critical JS syntax errors caused by unescaped backticks in the initial AI-generated code.
- **Performance Timer**: Fixed `startTime is not defined` crash in the PageSpeed module.

## [1.0.0] - 2026-03-10
### Added
- **Initial MVP**: Core React dashboard with HTML scraping and Gemini 1.5 integration.
- **PageSpeed Plugin**: Basic performance metrics and screenshot extraction.
- **Strategy UI**: Priority cards with High, Medium, and Low sorting.

---
*Created and maintained by Antigravity AI.*
