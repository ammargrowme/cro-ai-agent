# Session history (moved from AGENTS.md 2026-06-12)

## Session History

### v1.9.2 (May 20, 2026) — Cloudflare Access OAuth decoupling: dedicated CRO IdP
- Finishes the OAuth-side of the consumer-isolation work. Before today, CRO's Cloudflare Access gate borrowed the **Dev Hub's** Google IdP (`e74686ab-…`, backed by OAuth client in GCP `growme-dev-hub`). That was incidental, not by design — should never have shared. Today CRO got its own dedicated IdP and OAuth client in its own project.
- **New OAuth client** in `growme-cro` GCP project: `869955258560-psdddm7svdplsd5u5adknu24psnidq8j.apps.googleusercontent.com`, consent screen User Type = Internal (Workspace-only), authorized redirect URI = `https://growme.cloudflareaccess.com/cdn-cgi/access/callback`.
- **New Cloudflare Access IdP**: `1b2d95fe-ac3a-405f-b9c4-7a5dd74b4a91` *Google (CRO AI Agent)*, type=google, created via `POST /accounts/d47686239be0b47a3cbf227c7a86d250/access/identity_providers`.
- **CRO Access app swap**: `PUT /access/apps/fedd9c2b-…` with `allowed_idps=[1b2d95fe-…]` (previously `[e74686ab-…]`). Every other field preserved bit-for-bit from snapshot (name, domain, session_duration 168h, auto_redirect_to_identity False, http_only_cookie_attribute True, custom_deny_message, policy bbae3fad-… `include:[{email_domain:{domain:"growme.ca"}}]`).
- **Dev Hub IdP `e74686ab-…` untouched** — Dev Hub app `11f33d8c-…` continues to use it. Re-verified via GET.
- **Incident**: during initial IdP POST, Cloudflare's response echoed the OAuth `client_secret` verbatim (unlike most providers — does NOT redact on create). I printed it via length-only-assumption code path, leaking it into the conversation transcript. Mitigation: Ammar rotated the secret in GCP Console; PUT-updated the IdP config with the new secret using strict length-only logging. Lesson saved to memory.
- **Cleanup**: both OAuth `client_secret_*.json` files shred-deleted from project root (CF holds the secret; re-download from GCP if ever needed). `.gitignore` already covers the pattern (commit `7aa4371`).
- **No code change**. Docs + Asana canonical updated. Browser test pending Ammar.

### v1.9.1 (May 20, 2026) — GCP project migration: `growme-internal-ai` → dedicated `growme-cro`
- Finishes the post-incident decoupling that started 2026-05-19. After the shared `growme-217600` hub was suspended, CRO's key was temporarily parked on `growme-internal-ai` alongside Workload Dashboard. Today Workload split off to its own `growme-workload` project, and CRO splits off to its own `growme-cro`. **Each consumer now owns exactly one GCP project.**
- **New project**: `growme-cro` (#869955258560), folder `GrowME Internal` (387614648962), billing `01A67F-17D7E9-CFA36D` (GrowME Marketing Billing, CAD). APIs enabled: `generativelanguage.googleapis.com` ONLY. Hardened with CA$15/mo budget + 50/90/100% alerts via `scripts/harden-project.sh`.
- **New key**: "CRO AI Agent Gemini", resource `projects/869955258560/locations/global/keys/4542a38d-e166-47ff-8fc5-c39e1e9ab536`, API-target restricted to `generativelanguage.googleapis.com`.
- **Vercel env**: `GEMINI_API_KEY` swapped on Production (Preview deferred — CRO is production-only). `VITE_GEMINI_API_KEY` confirmed absent (already cleaned up 2026-05-12). New deploy bound the new value; old prod key path closed.
- **Retired**: the entire `growme-internal-ai` project (#919776932441) was deleted by Ammar after both consumers' migrations completed (CRO → growme-cro this session, Workload Dashboard → growme-workload earlier today). Old CRO Gemini key `6933c74b-6f4f-424a-8ec4-f2c115f98e68` removed as part of that project deletion. `growme-internal-ai` no longer exists in any lifecycle state — verified via `gcloud projects list`.
- **No code change**. Only Vercel env value + docs. Cross-ref: `Code/ops/gcp-audit/reports/post-recovery-growme-217600-2026-05-20.md`.

### v1.9.0 (May 19, 2026) — Cloudflare Access gate (Google SSO, @growme.ca only) + in-app Sign out
- CRO is now behind Cloudflare Access at the edge. App `fedd9c2b-9fcb-4977-8fc1-bab4a78f7a83` on `cro.growmeapps.io`, single Google IdP (`e74686ab-…` *Google (GrowME Workspace)*), session 168h, `auto_redirect_to_identity=false` so the branded GrowME login screen shows ("Sign in with Google" button) instead of an instant Google jump.
- Allow policy `bbae3fad-…` (decision=allow, precedence=1) — `include:[{email_domain:{domain:"growme.ca"}}]`. Any `@growme.ca` Workspace identity is admitted; everyone else denied at edge. One rule difference from the Dev Hub (which uses a per-email allowlist).
- Org `login_design.header_text` neutralized "GrowME Developer Hub" → "GrowME"; footer → "GrowME team access only — questions? ammar@growme.ca". Org-wide (also affects Dev Hub login screen), navy/white brand preserved.
- In-app Sign out: header anchor next to GROWAGENT logo → `/cdn-cgi/access/logout`. Pure same-origin anchor, no serverless code, no secret. Uses lucide `LogOut` icon.
- Verified live: unauth GET / → 302 to `growme.cloudflareaccess.com`; unauth POST /api/chat → also 302 to gate (no API bypass); /cdn-cgi/access/logout → 200; API round-trip confirms config values stuck.
- Rollback path: PUT app `allowed_idps:[]` → OTP IdP returns (account-level break-glass).

### v1.8.3 (May 19, 2026) — Exhaustive key-leak + abuse-vector hardening (`0498b4d`)
- Deep follow-up audit after v1.8.2. Every key-exposure path + every abuse vector across all 6 endpoints.
- Key-leak fixes: (1) `analyze.js` PageSpeed no longer falls back to the Gemini key (was sending it to a different, now-403ing Google API + leak-adjacent); (2) catch-all 500s in analyze/chat/generateCode/generateABTests no longer echo `err.message` (could surface the key-bearing fetch URL). The "never leak the key" invariant is now airtight across both error paths.
- Abuse fixes: (1) rate limiting added to chat/generateCode/generateABTests/learnings — previously ONLY analyze+discover were limited, leaving 3 Gemini endpoints wide open to the exact credential-abuse that suspended the hub; (2) SSRF closed — extracted links now pass `validateUrl()` before `checkUrls()` fetches them; (3) chat 200k-char token-bomb cap; (4) learnings DELETE now fails closed (was auth-bypassed when `ADMIN_TOKEN` unset).
- Verified clean: key-bearing URLs never logged/returned, no prod sourcemaps, discover crawl SSRF bounded by same-origin filter.

### v1.8.2 (May 19, 2026) — Post-incident security verification + key migration
- **Trigger**: shared GCP project `growme-217600` suspended by Google for credential-hijack abuse; CRO's key lived there. Incident report: `Code/ops/gcp-audit/reports/incident-growme-217600-suspension-2026-05-19.md`.
- **5-point security check run**:
  - ✅ Live client-side bundle scan (CRO's known failure mode): zero `AIza*` across all served HTML/JS/CSS, pre + post redeploy. No `generativelanguage` in client. Only `googleapis.com` ref is Google Fonts.
  - ✅ No VITE_ regression: 4 handlers read only `process.env.GEMINI_API_KEY`; no active `VITE_GEMINI` assignment (comments only).
  - ✅ Vercel env hygiene: env change had **not** been redeployed (latest prod deploy was 2026-05-12, 6.8 days stale) → fixed by the security-fix push which triggered the redeploy (`cca4b87` → `dpl_2Ky9biSUXbxp9Jv5nGapxWXmFSYx`, READY).
  - ✅ E2E on new key: `POST /api/chat` prod → HTTP 200 + real Gemini output. Old-key 403/CONSUMER_SUSPENDED gone.
- **NEW DEFECT FOUND + FIXED** (`cca4b87`): `chat.js`/`generateCode.js`/`generateABTests.js` returned the raw upstream Gemini error to the browser, which embeds `api_key:AIza...`. Confirmed leaking the suspended key live before the fix. Sanitized to generic `AI service error (HTTP <status>)`, log server-side only. `analyze.js` was already safe.
- **Key migrated** off the hub to `growme-internal-ai` (#919776932441), restricted to `generativelanguage.googleapis.com`. Ammar updated Vercel env; redeploy bound the new value.
- **Non-blocking follow-up**: local `.env.development.local` still points at the dead growme-217600 key + has stale "current project" comments — local dev will 403 until refreshed (production unaffected).

### v1.8.1 (May 12, 2026) — UI Cleanup + CTA Audit False-Positive Fixes
- UI cleanup (commit `f8e947f`): Auto/Manual toggle, page-preview chips, and Manual textarea hoisted out of Advanced into a slim accessible row directly under the URL input. Auto-audit is the visible default (orange pill highlighted on load).
- One-click audit in Auto mode: `handleAnalyze` now runs `/api/discover` inline before the audit, with a "Discovering pages on X..." loading step. Eliminates the previous "click +, click Discover, wait, click Analyze" three-step flow.
- Advanced panel slimmed — kept only Campaign Context, Competitor Domains, Target Keywords, Custom PageSpeed Key.

### v1.8.1 (May 12, 2026) — CTA Audit False-Positive Fixes
- Live tested v1.8.0 against growmemarketing.ca → 84 CTA "issues" reported, almost all false positives. Three root causes:
  - Dropdown nav triggers with `<a href="#">` (Elementor, Webflow, WordPress nav menus)
  - Cloudflare email-protection URLs (`/cdn-cgi/l/email-protection`) flagged as 404
  - Same nav repeated on 25 pages → same issue counted 25×
- Three fixes (commits `e045018`, `a35be4e`):
  - Aria/data-toggle/role detection + structural nav-context scan (`<nav>`, `<header>`, `<menu>`, `role="navigation|menu|menubar"`) + Elementor/widget container scan (flip-box, accordion, tabs, carousel, slider, swiper, modal-trigger, etc.)
  - `shouldSkipHealthCheck()` excludes `/cdn-cgi/*` from HEAD checks
  - CTA issues deduped by `{severity, issue, evidence}` across pages with `page_count` rollup; UI shows "× N pages" badge
- Verified: 11/11 empty-href anchors on growmemarketing.ca correctly suppressed; genuine broken CTAs in `<main>`, body, footer still flag (negative-case test)
- Security verification: live production JS bundle scanned, zero `AIzaSy*` matches
- Three old Gemini keys neutralized today (user actions): initial-commit git-history key rotated; GROWAGENTKEY project (`gen-lang-client-0331746047`) deleted; prior hub key already rotated

### v1.8.0 (May 12, 2026) — Full-Site Audit, Link/CTA/Form Health, CXL Knowledge
- Auto page discovery: `/api/discover` endpoint with sitemap.xml + robots.txt + homepage crawl. Up to 25 pages prioritized homepage → contact → pricing → about → services
- 25-page audits (was 4). Auto/Manual toggle in the UI with discovered-URL chip preview
- Link health: HEAD-checks every link (concurrency 10, GET-with-Range fallback), surfaces broken URLs per page
- CTA audit: static rules for empty hrefs, phone CTAs missing `tel:`, generic copy (Submit/Click Here)
- Form friction analysis: 6th Gemini call applies CXL form-friction rules to extracted form fields
- CXL knowledge base: `api/_knowledge.js` distills the GrowMe training docs into a 3.5K-char constant, injected into all prompts
- Per-page AI scoring batched (5 pages/call, parallel) so 25-page audits don't overflow Gemini's response budget
- Static-findings appendix in recs prompt — concrete broken URLs / CTA mismatches / form flags passed as ground truth
- New files: `api/_knowledge.js`, `api/_extract.js`, `api/discover.js`. Modified: `api/analyze.js`, `api/chat.js`, `src/App.jsx`, `src/constants/loadingData.js`

### v1.7.0 (March 24, 2026) — Modularization, Security, Multi-Format Export, Critical Bug Fixes
- CRITICAL FIX: `additionalPagesArr` TDZ bug crashed the app on every Analyze click
- CRITICAL FIX: `LOCAL_INSIGHTS_KEY` undefined in chat handler caused ReferenceError
- FIX: Export dropdown trapped behind content due to `backdrop-filter` stacking context
- Modularized App.jsx: extracted constants, utilities, learning system, and export logic
- Multi-format export: Excel (.xlsx), Word (.docx), Plain Text (.txt), JPEG screenshot
- API security hardening: SSRF prevention, rate limiting, input validation

> Full version history (v1.0 through v1.6): see `CHANGELOG.md`

## What To Do Next (Immediate Priority)

**See `TODO.md` for the full prioritized action plan.** The top 3 items are:

1. **Checklist drill-down** — Make checklist category circles clickable to show individual item pass/fail (each category has 4-8 underlying checklist items embedded in `api/analyze.js`).
2. **Component extraction** — Continue modularization. App.jsx is now 2400+ lines after v1.8.0. Extract the new Link Health / CTA Audit / Form Friction cards into `src/components/` and the page-discovery toggle into a hook.
3. **JS-rendered SPA support** — Static extraction can't see JS-hydrated forms/links. Investigate `@sparticuz/chromium` + `puppeteer-core` for a Phase 2 deep-audit mode (~50MB Vercel slug budget is tight).

## MANDATORY: Updating Documentation With Every Change (full per-file checklist, moved from AGENTS.md)

**This is a hard rule. The user should NEVER have to ask you to update docs — do it automatically with every commit.**

After making ANY code change, you MUST update the following files before committing:

### 1. `CHANGELOG.md`
- Add entries under the current version's `### Added`, `### Changed`, or `### Fixed` sections
- If this is a new version bump, create a new `## [x.x.x] - YYYY-MM-DD` header
- Keep entries concise: one line per change, bold the feature name

### 2. `TODO.md`
- Move completed items from "NEXT FEATURES" to "COMPLETED" (check them off)
- If you discovered new bugs, add them to "KNOWN BUGS / ISSUES"
- If you completed testing items, check them off in "NEEDS TESTING"
- If the immediate priority changed, update "YOUR FIRST TASK"
- Update the "Last updated" date at the top

### 3. `AGENTS.md` (this file)
- Update "Quick Status" version if bumped
- Add a new entry to "Session History" if this is a new session/major change
- Update "What To Do Next" if priorities shifted
- Update "Known Issues" if bugs were fixed or new ones found
- Update "Schemas" summary if schemas changed
- Update "File Map" summary if files were added or removed

### 4. `IMPLEMENTATION_RECAP.md`
- Add a new session section if this is a new conversation/session
- Document what was built, why, what changed in which files, and deployment status
- Include verification results (build pass/fail, endpoint tests)

### 5. `DEVELOPER.md`
- Update if architecture, data flow, storage, or protocols changed
- Update the "Instructions for AI Support Agents" section if new rules emerged

### 6. `README.md`
- Update if user-facing features changed (new UI sections, new workflows)
- Update the features list, checklist table, or roadmap as needed

### 7. `VISION.md`
- Update if new features change the product's capabilities or direction
- Update the "How It Works Today" section when the pipeline changes
- Update the "Roadmap" section when items are completed or new ones emerge
- Update "Guiding Principles" if the product philosophy evolves

### Commit message convention
- Use conventional commits: `feat:`, `fix:`, `docs:`, `refactor:`, `chore:`
- Always end with `Co-Authored-By: [model name] <noreply@anthropic.com>`

### When to bump versions
- **Patch** (1.2.x): Bug fixes, print CSS, small UI tweaks
- **Minor** (1.x.0): New features (competitor analysis, PDF export, multi-page crawl)
- **Major** (x.0.0): Breaking changes (new auth system, database migration)

**The goal**: Any AI or human picking up this repo at any point in time can read these files and know EXACTLY what the project state is, what was done, what works, what's broken, and what to do next — without needing any conversation history.
