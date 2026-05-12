# GROWAGENT — Action Plan & Next Steps

**Last updated**: 2026-05-12 (v1.8.1)
**Live URL**: https://cro-ai-agent.vercel.app/
**Auto-deploy**: Every push to `main` goes live automatically

> **For new AI agents**: Read `CLAUDE.md` first for full project context, then this file for what to do next.

---

## YOUR FIRST TASK (Start Here)

**v1.8.1 is shipped + UI cleanup landed (commit `f8e947f`).** Auto-discovery, link/CTA/form audit, CXL knowledge, false-positive fix sweep, and the hoisted Auto/Manual toggle are all live. Pick the next priority:

1. **Checklist Drill-Down** — Make the 10 checklist circles clickable to expand into per-item pass/fail (each category has 4-8 underlying checklist items already in `api/analyze.js`). Carry CXL principle references into the drill-down view
2. **Component Extraction** — Continue modularization. `App.jsx` is now 2400+ lines. Pull out: `<LinkHealthCard>`, `<CtaAuditCard>`, `<FormFrictionCard>`, `<PagesAuditedList>` (already self-contained sub-trees), plus the page-discovery toggle into a `<PageSourcePicker>` hook
3. **JS-rendered SPA support (deferred from v1.8.0)** — Static extraction can't see forms/links rendered by JS frameworks (Next.js after hydration, React SPAs). Investigate `@sparticuz/chromium` + `puppeteer-core` on Vercel for a Phase 2 "deep audit" mode. ~50MB unzipped budget is tight; may need a separate `/api/deep-audit` function

---

## DECISION PENDING — Unlimited / Deep audit mode

**Status**: parked 2026-05-12, awaiting Abas decision. Slack DM sent.

**Context**: User asked for an "unlimited" audit mode that scrapes more than the current 25-page cap on large sites. Vercel serverless functions have a hard 300s timeout; each additional page adds ~2-4s. Math:
- ~50 pages → 150-200s (fits)
- ~100 pages → ~250s (fits, tight)
- 200+ pages → blows the timeout, needs architectural change

**Three options to choose between**:

| Option | Cap | Architecture | Wait time | Cost / audit | Ship time |
|---|---|---|---|---|---|
| **1. Raise to 100** (recommended) | 100 pages | Same sync, just bump `MAX_ADDITIONAL_PAGES`. Add "Standard 25 / Deep 100" picker in UI | ~3-5 min | ~$0.07 | ~30 min |
| **2. Chunked sync orchestration** | Truly unlimited | Frontend splits sitemap into 25-page chunks, sequential `/api/analyze` calls, client-side result merge with progress UI. Browser tab must stay open. | ~15 min for 500 pages | ~$0.36 for 500 | ~2-3 hours |
| **3. Async job queue** | Truly unlimited, robust | New `/api/audit-job` POST returns jobId, background worker (Inngest / QStash / Trigger.dev — new dep + ~$20-100/mo). Polling + email/notification on completion. | Background | infra cost extra | Multi-day |

**Recommendation**: Option 1 covers ~95% of real-world client sites (most marketing sites are 30-100 pages). Layer Option 2 later only if 200+ page audits become a regular need. Option 3 only if running 50+ audits/day in parallel.

**Implementation sketch for Option 1** (when approved):
- Add `MAX_ADDITIONAL_PAGES_DEEP = 100` constant in `api/analyze.js`
- Add `auditDepth` ("standard"|"deep") param to `/api/analyze`
- New UI control in the hoisted toggle row: "Standard 25 / Deep 100" radio
- Update server cap to use `auditDepth === 'deep' ? 100 : 25`
- Update loading copy to reflect longer timing
- Update CHANGELOG / CLAUDE / docs

**Where this thread lives in Slack**: DM with Abas, channel `D09PFS0M3AR`, parent ts `1777334772.765899` (Slack URL: https://growmemarketing.slack.com/archives/D09PFS0M3AR/p1777334772765899).

---

## COMPLETED (v1.8.1 — May 12, 2026)

- [x] **CTA Audit false-positive fixes** — live testing on growmemarketing.ca revealed 84 issues, almost all false positives. Three root causes addressed in commits `e045018` + `a35be4e`:
  - Dropdown nav triggers (`<a href="#">` inside `<nav>`/`<header>`/`<menu>`/`role="navigation"` or with aria-haspopup/expanded/controls/data-toggle/dropdown class names) now suppressed
  - Structural widget-container detection for Elementor flip-box, accordion, tabs, carousel, slider, swiper, splide, modal-trigger, reveal-card, service-card, feature-box, info-box
  - Cloudflare `/cdn-cgi/*` URLs excluded from HEAD-check pass via new `shouldSkipHealthCheck()`
  - Cross-page CTA-issue dedup with `× N pages` rollup badge in the UI
  - Verified: 11/11 false positives suppressed on growmemarketing.ca, negative-case test confirms genuine broken CTAs in `<main>`/body/`<footer>` still flag
- [x] **Three Gemini keys neutralized** — initial-commit git-history key (`AIzaSyAN…wbOM`) rotated; GROWAGENTKEY in `gen-lang-client-0331746047` revoked by deleting the entire GCP project; prior hub key (`AIzaSyDD…`) already rotated. Live JS bundle verified key-free.

## COMPLETED (v1.8.0 — May 12, 2026)

- [x] **Auto page discovery** — New `/api/discover` endpoint: sitemap.xml + robots.txt + homepage crawl with depth-1 BFS, prioritizes homepage/contact/pricing/about/services
- [x] **25-page audits** — Removed 4-page hard cap. `MAX_ADDITIONAL_PAGES = 25` server-side, frontend matches
- [x] **Auto/Manual toggle** — UI lets operators choose auto-discovery or the legacy manual textarea; discovered URLs render as toggleable chips with select-all/none controls
- [x] **Link health audit** — `checkUrls()` HEAD-checks every link (concurrency 10, GET-with-Range fallback for 405/403). Broken links surface in `report.link_health.broken_links`
- [x] **CTA audit** — Static rules flag empty hrefs, "Call Us" CTAs without `tel:`, generic CTA copy. Rendered as `report.cta_audit.issues`
- [x] **Form friction analysis** — Extracts every `<form>` (fields, labels, validation, required, inline-label flag) and runs a 6th Gemini call applying CXL form-friction rules. Output: per-form friction score + recommendations
- [x] **CXL knowledge injection** — `api/_knowledge.js` ships `CXL_PRINCIPLES` (~3.5K chars distilled from the GrowMe training docs). Injected into overview, recs, checklist, per-page, form-friction, and chat prompts
- [x] **Per-page AI batching** — Pages split into groups of 5 and scored in parallel so 25-page audits don't overflow Gemini's response budget
- [x] **Pages Audited list** — Compact card under the health row showing every URL covered

## COMPLETED (v1.7.0 — March 24, 2026)

- [x] CRITICAL FIX: `additionalPagesArr` TDZ bug crashed app on every Analyze click
- [x] CRITICAL FIX: `LOCAL_INSIGHTS_KEY` undefined in chat handler caused ReferenceError
- [x] FIX: Export dropdown hidden behind content (backdrop-filter stacking context)
- [x] FIX: Export button toggle closing immediately (missing stopPropagation)
- [x] FIX: Useless revokeObjectURL on data: URLs (PNG/JPEG)
- [x] FIX: Missing !response.ok checks on code gen and A/B test API calls
- [x] Modularized App.jsx — extracted constants, utils, learning, exports to separate modules
- [x] Multi-format export: Excel (.xlsx), Word (.docx), Plain Text (.txt), JPEG screenshot
- [x] Export dropdown reorganized into Documents/Data/Images sections
- [x] API security: SSRF prevention, rate limiting, input validation, control character stripping
- [x] New api/_utils.js with shared validateUrl() and rateLimit()
- [x] Protected DELETE endpoint in api/learnings.js with admin token
- [x] Deleted unused src/App.css
- [x] Added xlsx and docx npm dependencies
- [x] Updated vite.config.js with @ path alias and es2020 build target
- [x] Build verified, deployed to Vercel, all endpoints confirmed

## COMPLETED (v1.3.0 — March 18, 2026)

- [x] Competitor analysis fully wired (scrape + 4th AI call + UI auto-populates)
- [x] Lazy-loaded html2canvas + jsPDF (~560KB bundle reduction)
- [x] React Error Boundary (prevents white-screen crashes)
- [x] Input validation on all 4 API endpoints
- [x] Modern clipboard API (replaces deprecated execCommand)
- [x] Chat updated_report merging (handles partial AI responses)
- [x] Elapsed timer + reassurance messages in loading UX
- [x] Export loading states + user-visible error feedback
- [x] Accessibility improvements (aria-labels, roles, keyboard nav)
- [x] Meta tags, OG tags, font preloading in index.html
- [x] Vite manual chunks for better caching
- [x] API key renamed to GEMINI_API_KEY (with VITE_ fallback)
- [x] Fixed Object URL memory leaks in export handlers
- [x] Fixed JSON parsing crash in generateABTests.js
- [x] Fixed getLearnings() re-render issue (cached in state)
- [x] Memoized filteredRecommendations with useMemo

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

#### 1. ~~Competitor Analysis~~ ✅ DONE (v1.3.0)
**Status**: Completed. Competitor URLs are scraped in parallel during Phase 1, analyzed via a 4th AI call in Phase 2, and displayed in the existing Competitive Intelligence UI panel.

#### 2. ~~Print CSS for Checklist Panel~~ ✅ DONE (v1.2.1)
**Status**: Completed. Print CSS rules added for checklist SVG circles, category cards, and critical failure flags.

#### 3. ~~PDF Export with Proper Library~~ ✅ DONE (v1.6.1)
**Status**: Completed. PDF now generated programmatically via jsPDF with branded cover page, executive summary, checklist scores with bars, competitor comparison matrix, page scores table, structured recommendation cards, and consistent headers/footers. Light professional theme.

### Phase 2 — High Value

#### 4. ~~Server-Side Learning Persistence~~ ✅ DONE (v1.4.0)
**Status**: Completed. Learnings are now saved to Upstash Redis via `/api/learnings` endpoint. All users contribute to a shared knowledge base. localStorage kept as fallback.

#### 5. ~~Multi-Page Analysis~~ ✅ DONE (v1.6.0)
**Status**: Completed. Users can add up to 4 additional pages in the Advanced panel. Each page is scraped in parallel and scored via a 5th AI call. Per-page scores display in a Site-Wide Page Scores panel.

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

1. ~~**Competitor analysis is a no-op**~~ ✅ Fixed in v1.3.0
2. **Chat `updated_report` can be partial** — Gemini sometimes returns incomplete report objects. The frontend JSON equality check prevents dashboard breakage, but the update is silently lost.
3. **localStorage cap** — 20 audits / 50 insights is a soft cap. Heavy users could still bloat localStorage on older browsers.
4. ~~**Print CSS missing for checklist panel**~~ ✅ Fixed in v1.2.1
5. ~~**No retry for chat errors**~~ ✅ Fixed in v1.2.1
6. ~~**Stale schema in App.jsx**~~ ✅ Fixed in v1.2.1
7. ~~**`fix.py` is orphaned**~~ ✅ Fixed in v1.2.1
8. ~~**`additionalPagesArr` TDZ crash**~~ ✅ Fixed in v1.7.0
9. ~~**`LOCAL_INSIGHTS_KEY` undefined in chat**~~ ✅ Fixed in v1.7.0
10. ~~**Export dropdown hidden behind content**~~ ✅ Fixed in v1.7.0
11. ~~**Export button closing immediately**~~ ✅ Fixed in v1.7.0
12. ~~**Missing error checks on code gen/A/B test APIs**~~ ✅ Fixed in v1.7.0

---

## HOW TO RESUME WORK

1. Read `CLAUDE.md` for full project context (architecture, schemas, rules, session history)
2. Read this file (`TODO.md`) for what's done and what's next
3. Run `npm install && npm run dev` to start locally
4. Set `GEMINI_API_KEY` in `.env` for local testing (copy from `.env.example`) — do NOT use the `VITE_` prefix, that bundles into client JS
5. The app auto-deploys to https://cro-ai-agent.vercel.app/ on every push to `main`
6. Start with "YOUR FIRST TASK" at the top of this file
7. After testing, pick the next item from "NEXT FEATURES TO BUILD"

---
*Last updated by Claude Opus 4.7 — May 12, 2026 (v1.8.0)*
