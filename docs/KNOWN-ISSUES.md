# Known Issues & Lessons Learned

> Current issues, what worked, and what didn't. Referenced from CLAUDE.md.

## What Worked

- Parallel AI calls reduced audit time from ~45s to ~20s
- The CRO checklist integration produces much more specific, actionable recommendations than the old generic prompts
- Chat feedback loop successfully extracts reusable insights
- 3D flip cards with click-to-flip (not hover) fixed button interaction issues
- Learning indicator in header gives users confidence the system is improving

## Active Issues

1. **Chat `updated_report` can be partial** — Gemini sometimes returns incomplete report objects. The frontend checks JSON equality to avoid breaking state, but the update is silently lost.
2. **localStorage learning cap** — 20 audits / 50 insights. Heavy users could still bloat localStorage on older browsers.

## Resolved Issues

| Issue | Fixed In | Details |
|-------|----------|---------|
| Competitor analysis was a no-op | v1.3.0 | Competitor URLs now scraped and analyzed via 4th AI call |
| PDF export used `window.print()` | v1.6.1 | Now generated programmatically via jsPDF |
| No error state for chat | v1.2.1 | Retry button now appears on chat error messages |
| Stale `REPORT_SCHEMA_PROPERTIES` in App.jsx | v1.2.1 | Dead code removed |
| `additionalPagesArr` TDZ crash | v1.7.0 | Variable used before declaration caused ReferenceError on every Analyze click |
| `LOCAL_INSIGHTS_KEY` undefined in chat | v1.7.0 | Non-exported const referenced in App.jsx |
| Export dropdown hidden behind content | v1.7.0 | `backdrop-filter` stacking context trapped the dropdown z-index |
