# 📜 Changelog

All notable changes to the GROWAGENT project will be documented in this file.

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
