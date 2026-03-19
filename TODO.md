# GROWAGENT — Action Plan & Next Steps

**Last updated**: 2026-03-18 (v1.2.0)
**Live URL**: https://cro-ai-agent.vercel.app/
**Auto-deploy**: Every push to `main` goes live automatically

> **For new AI agents**: Read `CLAUDE.md` first for full project context, then this file for what to do next.

---

## YOUR FIRST TASK (Start Here)

Before building anything new, **test v1.2.0 on production**. Open https://cro-ai-agent.vercel.app/ and run through this checklist:

1. Enter a URL (e.g., `growme.ca`) and click Analyze
2. Verify the **CRO Checklist Audit** panel appears with 10 category scores (circular indicators)
3. Verify **Critical Checklist Failures** shows red flag cards
4. Verify each recommendation card (flip it) shows a **checklist reference** badge
5. Open the **AI Chat Terminal** — send a message — verify it responds coherently
6. Ask the chat to "remove recommendation #1 and replace it with something about mobile" — verify the dashboard updates live
7. Run a **2nd audit** on a different URL — verify the header shows "1 past audit learned"
8. Check the AI's recommendations on the 2nd audit — they should reference patterns from the 1st audit if similar issues exist

Report any failures as bugs in the "KNOWN BUGS" section below, then proceed to building new features.

---

## COMPLETED (v1.2.0 — March 18, 2026)

- [x] CRO checklist (50+ criteria, 10 categories) embedded in AI prompts
- [x] 3rd parallel AI call for checklist category scoring (0-100 per category)
- [x] Checklist scores UI panel with circular progress indicators
- [x] Critical checklist failures panel (top 5 red flags)
- [x] Client-side learning system (localStorage) — stores past audit summaries
- [x] Past learnings injected into AI prompts for smarter future audits
- [x] Chat feedback loop — AI extracts `learning_insight` from conversations
- [x] Chat system rewrite with proper response schema and JSON fallback parsing
- [x] Expanded categories from 4 to 9 (CTA, Trust, UX, Design, Performance, Copy, Mobile, SEO, Forms)
- [x] Recommendations increased from 5 to 6 with `checklist_ref` field
- [x] Learning indicator badge in header
- [x] CLAUDE.md, README, CHANGELOG, DEVELOPER.md, IMPLEMENTATION_RECAP.md, TODO.md all updated
- [x] Build verified (`npx vite build` passes)
- [x] Pushed to GitHub, auto-deployed to Vercel
- [x] All 4 API endpoints verified live (analyze, chat, generateCode, generateABTests)

---

## NEEDS TESTING / VERIFICATION

These features are implemented but need real-world testing with a Gemini API key on Vercel:

### Priority 1 — Core Functionality
- [ ] **Full audit end-to-end** with a real URL on https://cro-ai-agent.vercel.app/
- [ ] **Checklist scores** return valid 0-100 values for all 10 categories
- [ ] **Checklist flags** return meaningful failures (not generic)
- [ ] **Recommendations** include `checklist_ref` field correctly
- [ ] **AI chat** returns `{message, updated_report, learning_insight}` format
- [ ] **Chat report updates** — ask to modify a recommendation, dashboard updates live
- [ ] **Learning persistence** — run 2+ audits, header badge increments, 2nd audit references 1st

### Priority 2 — Edge Cases
- [ ] **No PageSpeed data** (rate-limited) — audit still completes in HTML-only mode
- [ ] **Very short pages** (minimal HTML) — AI doesn't crash on sparse input
- [ ] **Mobile layout** — checklist scores panel is responsive and readable
- [ ] **PDF print** — checklist scores panel renders properly in print mode

---

## NEXT FEATURES TO BUILD (Prioritized)

### Phase 1 — Critical (Do These First)

#### 1. Competitor Analysis (Currently Stubbed)
**Status**: The UI accepts competitor URLs and sends them to the backend, but `api/analyze.js` never actually scrapes or analyzes them. The `competitor_analysis` field is always empty.
**What to do**:
- In `api/analyze.js`, in Phase 1, add scraping of competitor URLs in parallel with the main site scrape
- In Phase 2, add a 4th AI call that compares the main site's HTML against competitor HTML
- Use the existing `competitor_analysis` schema: `{ overview: string, comparisons: [{ competitor, difference, advantage }] }`
- Populate the `competitor_analysis` field in the merged report
- The UI for displaying competitor analysis already exists in App.jsx (search for "COMPETITOR WIDGET")
- Test with 1-2 competitor URLs

#### 2. Print CSS for Checklist Panel
**Status**: The new checklist scores panel (`CRO CHECKLIST SCORES` section in App.jsx) has no `@media print` rules.
**What to do**:
- In the `@media print` `<style>` block in App.jsx (around line 414), add rules for:
  - Checklist SVG circles: force `print-color-adjust: exact`
  - Checklist category cards: light background, dark text
  - Checklist flags: ensure red borders/text print correctly
  - The whole panel: `page-break-inside: avoid`
- Test with `Ctrl+P` in Chrome

#### 3. PDF Export with Proper Library
**Status**: Currently uses `window.print()` which has 3D rendering issues.
**What to do**:
- Install `html2canvas` + `jspdf` (or `@react-pdf/renderer`)
- Create a flattened, light-theme version of the report for PDF
- Include: score, summary, checklist scores, checklist flags, recommendations with checklist refs
- Add a proper "Download PDF" button alongside the existing print button
- The existing "Export" button downloads Markdown — keep that, add PDF as separate button

### Phase 2 — High Value

#### 4. Server-Side Learning Persistence
**Status**: Learning is localStorage only — lost when user clears browser data or switches devices.
**What to do**:
- Option A: Use Vercel KV (simple key-value store, free tier available)
- Option B: Use Supabase (better if auth is planned later)
- Create `api/learnings.js` endpoint with GET (load) and POST (save)
- Add a simple user identifier (random UUID stored in localStorage, sent with requests)
- On app load, fetch learnings from server and merge with local
- After each audit, POST the new learning to the server

#### 5. Multi-Page Crawl
**Status**: Only analyzes a single URL per audit.
**What to do**:
- Add a "Crawl Depth" dropdown option (1, 3, 5 pages) in the Advanced panel
- After scraping the main URL, extract internal `<a href>` links
- Scrape and score each additional page
- Aggregate scores into a site-wide report with per-page breakdowns
- Show a page selector or tab system in the dashboard

#### 6. Checklist Drill-Down
**Status**: Checklist scores show category-level scores but not individual item pass/fail.
**What to do**:
- Make each checklist category circle clickable
- Show a modal/expandable panel listing every item in that category with pass/fail
- Update the `CHECKLIST_SCHEMA` in `api/analyze.js` to return individual item results
- This will require expanding the checklist AI call's `maxOutputTokens`

### Phase 3 — Nice to Have

#### 7. User Authentication & Report History
- Add Supabase Auth or Clerk
- Store completed reports in a database
- Show a "Past Reports" dashboard with score trends over time
- Allow re-running audits and comparing before/after scores

#### 8. Real-Time Streaming
- Replace the fake step-by-step loading animation with real progress events
- Use Server-Sent Events (SSE) from the Vercel function
- Stream each phase's completion status to the frontend

#### 9. Shopify/WooCommerce Integration
- Detect if a URL is a Shopify/Woo store (check for `Shopify.` in HTML or `/cart` endpoints)
- Apply e-commerce-specific CRO checklist items (cart, checkout, product pages)
- Generate platform-specific code patches (Liquid for Shopify, PHP for Woo)

#### 10. Industry Benchmarking
- Store anonymized audit scores in a database
- Show how a site compares to industry averages
- e.g., "Your CTA score is 45/100 — the average for SaaS sites is 72/100"

---

## KNOWN BUGS / ISSUES

1. **Competitor analysis is a no-op** — URLs are accepted but never scraped or analyzed. The `competitor_analysis` field in the report is always `{ overview: "", comparisons: [] }`.
2. **Chat `updated_report` can be partial** — Gemini sometimes returns incomplete report objects. The frontend JSON equality check prevents dashboard breakage, but the update is silently lost.
3. **localStorage cap** — 20 audits / 50 insights is a soft cap. Heavy users could still bloat localStorage on older browsers.
4. **Print CSS missing for checklist panel** — The new CRO Checklist Scores section has no `@media print` rules. SVG circles won't print colors correctly.
5. **No retry for chat errors** — If the chat API returns a 500, the user sees "Sorry, I had trouble processing that request" but has no retry button.
6. **Stale schema in App.jsx** — `REPORT_SCHEMA_PROPERTIES` (lines ~68-106) is the old v1.0.0 schema. It's never used by the backend (which has its own schemas) but is dead code in the frontend. Can be safely removed.
7. **`fix.py` is orphaned** — There's a `fix.py` file in the root that appears to be from an early development session. It can likely be deleted.

---

## HOW TO RESUME WORK

1. Read `CLAUDE.md` for full project context (architecture, schemas, rules, session history)
2. Read this file (`TODO.md`) for what's done and what's next
3. Run `npm install && npm run dev` to start locally
4. Set `VITE_GEMINI_API_KEY` in `.env` for local testing (copy from `.env.example`)
5. The app auto-deploys to https://cro-ai-agent.vercel.app/ on every push to `main`
6. Start with "YOUR FIRST TASK" at the top of this file
7. After testing, pick the next item from "NEXT FEATURES TO BUILD"

---
*Last updated by Claude Opus 4.6 — March 18, 2026*
