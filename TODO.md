# GROWAGENT — Action Plan & Next Steps

**Last updated**: 2026-03-18 (v1.2.1)
**Live URL**: https://cro-ai-agent.vercel.app/
**Auto-deploy**: Every push to `main` goes live automatically

> **For new AI agents**: Read `CLAUDE.md` first for full project context, then this file for what to do next.

---

## YOUR FIRST TASK (Start Here)

**Test v1.2.1 on production.** Open https://cro-ai-agent.vercel.app/ and run through this checklist:

1. Enter a URL (e.g., `growme.ca`) and click Analyze
2. Verify the **CRO Checklist Audit** panel appears with 10 category scores (circular indicators)
3. Verify **Critical Checklist Failures** shows red flag cards
4. Verify each recommendation card (flip it) shows a **checklist reference** badge
5. Open the **AI Chat Terminal** — send a message — verify it responds coherently
6. Ask the chat to "remove recommendation #1 and replace it with something about mobile" — verify the dashboard updates live
7. **Test chat retry**: Force an error (e.g., send an extremely long message) — verify the red "Retry" button appears
8. Run a **2nd audit** on a different URL — verify the header shows "1 past audit learned"
9. Check the AI's recommendations on the 2nd audit — **they should reference patterns from the 1st audit** and mention recurring weaknesses if similar issues exist
10. **Test print**: Click PDF button — verify the checklist scores panel renders with colored circles and critical failures show red badges
11. After chatting, check that the learning badge count increments appropriately

Report any failures as bugs in the "KNOWN BUGS" section below, then proceed to building new features.

---

## COMPLETED (v1.2.1 — March 18, 2026)

- [x] Aggregate pattern detection across all past audits (recurring weakness flagging)
- [x] Richer audit memory (strengths, critical flags, all scores, chat modifications)
- [x] Chat retry button on error messages
- [x] Chat modification tracking in learning system
- [x] Print CSS for checklist scores panel (SVG circles, category cards, critical flags)
- [x] Proactive insight extraction in chat AI
- [x] Enhanced learning prompts with individual + aggregate + insight sections
- [x] Chat system instruction enriched with full audit history context
- [x] Chat AI rules expanded to 10 (from 6)
- [x] Removed stale `REPORT_SCHEMA_PROPERTIES` dead code from App.jsx
- [x] Deleted orphaned `fix.py` from project root
- [x] All 6 documentation files updated

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

#### 2. ~~Print CSS for Checklist Panel~~ ✅ DONE (v1.2.1)
**Status**: Completed. Print CSS rules added for checklist SVG circles, category cards, and critical failure flags.

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
4. ~~**Print CSS missing for checklist panel**~~ ✅ Fixed in v1.2.1
5. ~~**No retry for chat errors**~~ ✅ Fixed in v1.2.1 — Retry button now appears on error messages.
6. ~~**Stale schema in App.jsx**~~ ✅ Fixed in v1.2.1 — Dead code removed.
7. ~~**`fix.py` is orphaned**~~ ✅ Fixed in v1.2.1 — File deleted.

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
*Last updated by Claude Opus 4.6 — March 18, 2026 (v1.2.1)*
