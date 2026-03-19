# Changelog

All notable changes to the GROWAGENT project will be documented in this file.

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
