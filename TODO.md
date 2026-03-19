# GROWAGENT — Action Plan & Next Steps

Last updated: 2026-03-18 (v1.2.0)

This is the exact plan of what has been done, what works, what needs fixing, and what to build next. Any AI agent or developer picking this up should read this first, then CLAUDE.md.

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
- [x] CLAUDE.md, README, CHANGELOG, DEVELOPER.md all updated
- [x] Build verified (`npx vite build` passes)
- [x] Pushed to GitHub

---

## NEEDS TESTING / VERIFICATION

These features are implemented but need real-world testing with a Gemini API key on Vercel:

### Priority 1 — Core Functionality
- [ ] **Deploy to Vercel** and test a full audit end-to-end with a real URL
- [ ] **Verify checklist scores** return valid 0-100 values for all 10 categories
- [ ] **Verify checklist_flags** return meaningful failures (not generic)
- [ ] **Verify recommendations** include `checklist_ref` field correctly
- [ ] **Test the AI chat** — send a message, verify it returns `{message, updated_report, learning_insight}`
- [ ] **Test chat report updates** — ask the chat to modify a recommendation and verify the dashboard updates live
- [ ] **Test learning persistence** — run 2+ audits, verify the header badge increments and the 2nd audit's AI prompt references the 1st audit's results

### Priority 2 — Edge Cases
- [ ] **Test with no PageSpeed data** (rate-limited) — verify audit still completes in HTML-only mode
- [ ] **Test with very short pages** (minimal HTML) — verify AI doesn't crash on sparse input
- [ ] **Test mobile layout** — verify checklist scores panel is responsive and readable
- [ ] **Test PDF print** — verify checklist scores panel renders properly in print mode

---

## NEXT FEATURES TO BUILD (Prioritized)

### Phase 1 — Critical (Do These First)

#### 1. Competitor Analysis (Currently Stubbed)
**Status**: The UI accepts competitor URLs and sends them to the backend, but `api/analyze.js` never actually scrapes or analyzes them.
**What to do**:
- In `api/analyze.js`, add a Phase 1b that scrapes competitor URLs in parallel with the main site
- Add a Phase 2d AI call that compares the main site's HTML/screenshot against competitors
- Populate the `competitor_analysis` field in the report with real data
- The UI for displaying competitor analysis already exists and works

#### 2. PDF Export with Proper Library
**Status**: Currently uses `window.print()` which has 3D rendering issues.
**What to do**:
- Install `html2canvas` + `jspdf` or use `@react-pdf/renderer`
- Create a flattened, light-theme version of the report for PDF
- Include checklist scores, recommendations, and metadata
- Add a proper "Download PDF" button alongside the existing print button

#### 3. Print CSS for Checklist Panel
**Status**: The new checklist scores panel needs print CSS rules added.
**What to do**:
- Add rules in the `@media print` block in App.jsx for the checklist SVG circles
- Ensure `print-color-adjust: exact` is applied to the circular score indicators
- Test that checklist flags render properly in print

### Phase 2 — High Value

#### 4. Server-Side Learning Persistence
**Status**: Learning is localStorage only — lost when user clears browser data or switches devices.
**What to do**:
- Option A: Use Vercel KV (simple key-value store)
- Option B: Use Supabase (if auth is planned later)
- Create `api/learnings.js` endpoint for GET/POST
- Add a simple user identifier (could be a random UUID stored in localStorage)
- Sync learnings on app load and after each audit

#### 5. Multi-Page Crawl
**Status**: Only analyzes a single URL.
**What to do**:
- Add a "Crawl Depth" option (1, 3, 5 pages)
- Scrape the main URL, then extract internal links and scrape those too
- Run checklist scoring on each page
- Aggregate scores into a site-wide report
- Show per-page breakdowns in the UI

#### 6. Checklist Drill-Down
**Status**: Checklist scores show category-level scores but not individual item pass/fail.
**What to do**:
- Add a clickable detail view for each checklist category
- Show which specific items passed/failed within each category
- Add the individual items to the AI's checklist scoring schema

### Phase 3 — Nice to Have

#### 7. User Authentication & Report History
- Add Supabase Auth or NextAuth
- Store completed reports in a database
- Show a "Past Reports" dashboard
- Allow re-running audits and comparing scores over time

#### 8. Real-Time Streaming
- Replace the fake step-by-step animation with real progress
- Use Server-Sent Events (SSE) or WebSockets
- Stream each phase's completion status to the frontend

#### 9. Shopify/WooCommerce Integration
- Detect if a URL is a Shopify/Woo store
- Apply e-commerce-specific CRO checklist items (cart, checkout, product pages)
- Generate platform-specific code patches (Liquid for Shopify, PHP for Woo)

#### 10. Industry Benchmarking
- Store anonymized audit scores in a database
- Show how a site compares to industry averages
- "Your CTA score is 45/100 — the average for SaaS sites is 72/100"

---

## KNOWN BUGS / ISSUES

1. **Competitor analysis is a no-op** — URLs are accepted but never scraped or analyzed
2. **Chat `updated_report` can be partial** — Gemini sometimes returns incomplete report objects. The frontend equality check prevents breaking, but the update is lost.
3. **localStorage cap** — 20 audits / 50 insights is a soft cap. Heavy users could still bloat localStorage on older browsers.
4. **Print CSS missing for checklist panel** — The new checklist scores section needs `@media print` rules.
5. **No error state for chat** — If the chat API returns a 500, the user sees a generic message but no retry option.

---

## HOW TO RESUME WORK

1. Read `CLAUDE.md` for full project context
2. Read this file (`TODO.md`) for what's done and what's next
3. Run `npm install && npm run dev` to start locally
4. Set `VITE_GEMINI_API_KEY` in `.env` for local testing
5. Deploy to Vercel for production testing
6. Pick the next item from "NEXT FEATURES TO BUILD" above

---
*Last updated by Claude Opus 4.6 — March 18, 2026*
