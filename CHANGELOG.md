# Changelog

All notable changes to the GROWAGENT project will be documented in this file.

## [1.9.0a] - 2026-05-19 — set custom_deny_message on the Access app (later confirmed unreachable in practice; kept as harmless backstop pending future cleanup)

**What I did, what I misdiagnosed, and what we actually learned.** Logged
in full so the next session doesn't repeat the wasted iteration.

Initial trigger: Ammar shared a screenshot of an authorized `@growme.ca`
login landing on Cloudflare's generic
`/cdn-cgi/access/authorized?nonce=…&state=…` page reading *"Invalid login
session — Please try going to the URL of your application again"*. I read
that as a policy-denial UX issue and PUT'd a friendly `custom_deny_message`
on the Access app.

Then Ammar corrected the diagnosis with a second screenshot showing the
Google OAuth client's *"Access blocked — Developer Hub can only be used
within its organization • Error 403: org_internal"* page. That's Google's
Workspace-Internal consent enforcing the domain restriction **at the IdP
level, before Cloudflare ever sees the request**. So in production:
- A wrong-domain user is rejected by Google's consent screen — they never
  hit Cloudflare's policy, never see Cloudflare's deny page.
- Therefore `custom_deny_message` (which only renders on Cloudflare's deny
  pages, post-policy-evaluation) is **provably unreachable** with our
  current IdP configuration.

A subsequent clean-flow retest by Ammar showed the gate works correctly
for authorized users — the original "Invalid login session" screenshot
was a stale-tab artifact (browser back-button / refresh of a consumed
callback URL with one-shot nonce + state; CF's replay protection rendered
that page while the CF_Authorization cookie from the prior successful
auth remained valid — which is exactly why the page's "URL of your
application" link took him straight in).

What stays in place (the actual repo/edge change of this entry):
- App `fedd9c2b-…` has `custom_deny_message = "GrowME team only Sign in
  with your GrowME work email account"`. Harmless dead config — a
  defence-in-depth backstop if the OAuth client's consent screen is ever
  flipped from Internal to External (the only realistic path for a
  wrong-domain user to reach Cloudflare's deny page).

What can be cleaned up next session if the new owner prefers a clean
config: PUT the app with `custom_deny_message` omitted from the writable
fields → field reverts to null. One PUT, re-GET to confirm policies
survived, done.

Cloudflare validation rules learned along the way (not in the OpenAPI;
worth banking for the next agent that tries this):
- `custom_deny_message` rejects any string containing `,.!:@?-` →
  HTTP 400.
- `custom_deny_message` capped at **75 chars** → HTTP 400 over.
- A failing PUT is **atomic** — the previously-set fields AND the inline
  policies sub-resource are untouched on validation failure. Verified by
  re-GET after each 400.
- For an app with single-IdP + Google Internal-consent enforcing the
  same domain restriction the Cloudflare policy enforces, **prefer
  iterating only after a clean-flow incognito retest** — Cloudflare's
  `/cdn-cgi/access/authorized` replay-protection page is easy to
  mis-attribute to a configuration bug when it's actually a stale-tab
  artifact.

Verified post-PUT (and re-verified after the diagnosis correction):
gate still 302s unauth traffic, policy `bbae3fad-…` allow +
`email_domain:growme.ca` intact, auto_redirect false, allowed_idps
= [Google], session 168h, app config otherwise unchanged.

## [1.9.0] - 2026-05-19 — Cloudflare Access gate (Google SSO, @growme.ca only) + in-app Sign out

CRO AI Agent is now gated behind Cloudflare Access at the edge: every request
to `https://cro.growmeapps.io/` (including all `/api/*` endpoints) requires a
signed-in `@growme.ca` Google account before any Vercel function or static
asset is served. Same recipe just landed on the GrowME Developer Hub.

### Added
- **Cloudflare Access app** `fedd9c2b-9fcb-4977-8fc1-bab4a78f7a83`
  ("GrowME CRO AI Agent") on `cro.growmeapps.io`, session 168h, single Google
  IdP (`e74686ab-…` *Google (GrowME Workspace)*),
  `auto_redirect_to_identity=false` so visitors land on a branded GrowME
  sign-in screen with a "Sign in with Google" button instead of being
  instant-bounced to Google.
- **Allow policy** `bbae3fad-a570-4ad9-b758-4d7fac7dd10a` (allow,
  precedence 1) — `include: [{email_domain: {domain: "growme.ca"}}]`. Any
  `@growme.ca` Workspace identity is admitted; everyone else is denied at the
  edge. Defence-in-depth on top of the Google Internal-consent restriction.
- **In-app Sign out** — header anchor next to the GROWAGENT logo, links to
  `/cdn-cgi/access/logout`. Cloudflare serves that endpoint on any
  Access-protected host and clears the `CF_Authorization` session cookie. No
  serverless code, no secret. Uses the lucide `LogOut` icon.

### Changed
- **Org `login_design.header_text`** neutralized: `"GrowME Developer Hub"` →
  `"GrowME"`; footer → `"GrowME team access only — questions? ammar@growme.ca"`.
  Org-wide setting; the Dev Hub login screen now also reads correctly. Brand
  colors (navy `#1a1f2e` bg / white text) preserved.

### Verified live (post-cutover)
- API round-trip: GET app → `auto_redirect_to_identity=false`,
  `allowed_idps=[Google]`, policy `include` has the `email_domain` rule.
- Unauth `GET https://cro.growmeapps.io/` → **HTTP 302** with `Location` host
  `growme.cloudflareaccess.com` (the gate enforces — not a public 200, not a
  Vercel 401).
- Unauth `POST /api/chat` → also 302 to the gate (no API bypass).
- `GET /cdn-cgi/access/logout` → HTTP 200 (logout endpoint live).
- Build: `npx vite build` exit 0; `cdn-cgi/access/logout` + "Sign out" strings
  present in the produced `dist/assets/index-*.js` bundle.

### Rollback (instant) if Google ever breaks for CRO
PUT app `allowed_idps: []` → built-in one-time-PIN IdP returns automatically
(account-level break-glass, already provisioned).

### Reference data captured
- Cloudflare account: `d47686239be0b47a3cbf227c7a86d250`; zone
  `growmeapps.io` `f9f0e86fd0193428764e009bb1c9bac9`; ZT org
  `growme.cloudflareaccess.com`.
- Dev Hub Access app (sibling reference, do **not** modify):
  `11f33d8c-d9cf-474d-8a55-9ae9eae5e2df` (uses a 5-email allowlist instead of
  the domain rule).

## [1.8.3] - 2026-05-19 — Exhaustive key-leak + abuse-vector hardening

Follow-up deep audit after the 1.8.2 verification: reviewed EVERY key-exposure
path and EVERY abuse vector across all 6 API endpoints. Commit `0498b4d`.

### Fixed (SECURITY — key leak)
- **PageSpeed no longer falls back to the Gemini key.** `api/analyze.js` had
  `psKey = customPageSpeedKey || apiKey` — sending the Gemini key to
  `www.googleapis.com/pagespeedonline` (a DIFFERENT Google API). With the new
  `generativelanguage`-restricted key this 403'd every keyless audit AND placed
  the key in a non-Gemini googleapis URL (leak-adjacent). Now: operator's
  PageSpeed key if supplied, else keyless PageSpeed (audit already degrades
  gracefully to HTML-only).
- **Catch-all 500s no longer echo `err.message`.** `analyze`/`chat`/
  `generateCode`/`generateABTests` returned `err.message` to the client in the
  outer catch. A `fetch()` failure to the key-bearing Gemini URL can surface
  that URL (with the key) in the message. Now logged server-side, generic
  message to client. (`cca4b87` closed the `!response.ok` path; this closes the
  catch-all path — the invariant is now airtight.)

### Fixed (SECURITY — abuse)
- **Rate limiting on ALL endpoints.** Was only on `analyze` (5/min) and
  `discover` (10/min). `chat`/`generateCode`/`generateABTests` called Gemini on
  our key with NO limit — the exact unbounded-credential-abuse that got the
  shared hub suspended. Added: `chat` 15/min, `generateCode` 10/min,
  `generateABTests` 10/min, `learnings` 30/min.
- **SSRF closed.** `analyze.js` Phase 1.5 fetched every extracted `<a href>`
  via `checkUrls()` with only a scheme filter — a user's own valid site could
  link to `169.254.169.254` / `10.x` / `localhost` and our server would fetch
  them (blind SSRF). Every extracted link now passes `validateUrl()` before the
  health check.
- **chat.js token-bomb cap.** Added a 200 000-char total-history limit (50
  messages × unbounded text was a cost-amplification vector).
- **learnings DELETE fail-closed.** Was `req.headers['x-admin-token'] !==
  process.env.ADMIN_TOKEN` — if `ADMIN_TOKEN` is unset, `undefined !==
  undefined` is false → auth BYPASSED. Now requires `ADMIN_TOKEN` configured
  AND a non-empty exact-match token.

### Verified clean (no change needed)
- Key-bearing fetch URLs (`geminiUrl`/`endpoint`) never logged or returned.
- No sourcemaps in the production build.
- `learnings`/`discover` error responses already generic (no key, no Redis URL).
- `discover` crawl SSRF bounded (same-origin `isCrawlableUrl` + validated seed).

## [1.8.2] - 2026-05-19 — Post-incident security hardening + key migration

### Context
Shared GCP project `growme-217600` ("GrowME Central Hub") was suspended by Google
on 2026-05-19 for credential-hijack abuse (a leaked client-side key was harvested).
CRO's Gemini key lived on that hub. Incident report (local-only):
`Code/Ops/GCP Audit/reports/incident-growme-217600-suspension-2026-05-19.md`.

### Changed
- **Gemini key migrated off the shared hub** to a new decoupled GCP project
  `growme-internal-ai` (#919776932441, GrowME Internal folder). The new key
  "CRO AI Agent Gemini" is API-target-RESTRICTED to
  `generativelanguage.googleapis.com` only (resource
  `projects/919776932441/locations/global/keys/6933c74b-6f4f-424a-8ec4-f2c115f98e68`).
  Vercel env `GEMINI_API_KEY` updated by Ammar; production redeployed
  (`cca4b87`, deployment `dpl_2Ky9biSUXbxp9Jv5nGapxWXmFSYx`) so the new value
  binds. The key value itself is never stored in the repo.

### Fixed (SECURITY)
- **API error handlers leaked the Gemini key to the browser.** `api/chat.js`,
  `api/generateCode.js`, and `api/generateABTests.js` returned the raw upstream
  Gemini error body to the client on a non-ok response
  (`return res.status(s).json({ error: errorText })`). Google's error JSON
  embeds the key verbatim (`"Consumer 'api_key:AIza...' has been suspended"`),
  so any Gemini 403/429/5xx echoed the live key into the browser. Confirmed
  live on production before the fix. Now all three log the upstream error
  server-side only and return a generic `AI service error (HTTP <status>)` —
  matching the pattern `api/analyze.js` already used. Commit `cca4b87`.

### Verified
- **Client-side bundle clean (the project's known failure mode).** Every served
  asset on `https://cro.growmeapps.io` (HTML + 3 main chunks + 4 lazy chunks +
  CSS) scanned for `AIza[0-9A-Za-z_-]{10,}` → **zero matches**, pre and post
  redeploy. Bundle hash identical pre/post (`index-Cf_fH5Wz.js`) confirming the
  fix touched only server-side `api/*.js`.
- **No direct browser→Google API call.** No `generativelanguage` reference in
  any client file. Only `googleapis.com` hit is `fonts.googleapis.com` (Google
  Fonts CSS — benign).
- **No VITE_ regression.** All 4 Gemini handlers read only
  `process.env.GEMINI_API_KEY` (no VITE_ fallback). No active
  `VITE_GEMINI_API_KEY` assignment anywhere (only incident-history comments).
- **End-to-end on new key.** `POST /api/chat` on production → HTTP 200 with real
  Gemini output. Old-key `CONSUMER_SUSPENDED` 403 gone.

### Invariant (do not regress)
> The Gemini key is **server-side only**. Never `VITE_GEMINI_API_KEY`, never in
> the client JS bundle, never a direct browser→`generativelanguage` call, and
> **never echo a raw upstream Google error to the client** (it embeds the key).
> Keys live only in `api/*.js` via `process.env.GEMINI_API_KEY`.

### Known follow-up (non-blocking, local-dev only)
- `.env.development.local` comments still describe `growme-217600` as the
  "current" project and its `GEMINI_API_KEY` value is the now-dead suspended
  key. Production is unaffected (Vercel has the new env). Local dev / `vercel
  dev` will 403 until the local file is refreshed with the new
  `growme-internal-ai` key string (retrieve via `gcloud services api-keys
  get-key-string projects/919776932441/locations/global/keys/6933c74b-6f4f-424a-8ec4-f2c115f98e68 --configuration=growme-ammar`).
  Not done here — never print/commit key values.

## [1.8.1] - 2026-05-12

### Changed
- **UI cleanup — Auto/Manual toggle hoisted out of Advanced** (commit `f8e947f`). The page-source toggle, page-preview chips, and Manual textarea now live in a slim accessible row directly under the URL input. Advanced panel kept only for the less-frequent fields (Campaign Context, Competitor Domains, Target Keywords, Custom PageSpeed Key).
- **One-click audit in Auto mode** — `handleAnalyze` now runs `/api/discover` inline when the operator hasn't previewed pages first. Click Analyze → discovery + audit completes in one flow with a "Discovering pages on X..." loading step. Discovery failure is non-fatal (falls through to single-page audit).
- **Auto-audit is the visible default** — the toggle pill shows Auto highlighted in orange on page load. Reflects what was already in state (`useState("auto")`) but now visually obvious instead of buried.

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
