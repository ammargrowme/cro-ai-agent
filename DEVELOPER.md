# 🛠 Developer & AI Technical Documentation

This document provides a deep dive into the internal architecture, logic patterns, and design decisions of the GROWAGENT CRO Auditor.

## 🧠 Core Logic: The "Intelligence Pipeline"

The audit process follows a linear, asynchronous pipeline to maximize data richness before hitting the LLM.

### 1. Scraping Layer (`fetchLiveHTML`)
Uses a CORS proxy (`https://api.allorigins.win/`) combined with a robust fetch retry wrapper.
- **Sanitization**: To prevent context window bloat, the scraper removes `<script>`, `<style>`, and `<svg>` tags before passing the HTML to Gemini.
- **Truncation**: If the HTML exceeds 40,000 characters, it is safely truncated to ensure the model remains performant.

### 2. Performance Layer (`fetchLivePageSpeedAndScreenshot`)
Queries the Google PageSpeed Insights V5 API.
- **Multi-Modal Data**: This step fetches both the Performance Score AND a base64 encoded screenshot of the site's visual state.
- **Rate-Limit Resilience**: Includes a custom 429-aware handler. If the public rate limit is hit, the application falls back to an "HTML-only" audit mode to avoid stalling the user.

### 3. Synthesis Layer (`generateGeminiReport`)
The "brain" of the app.
- **Schema Enforcement**: The prompt uses a strict JSON schema (`REPORT_SCHEMA_PROPERTIES`) to ensure the React UI never breaks during parsing.
- **Negative Prompting**: Explicitly instructed NOT to provide generic advice, but to reference specific classes or text found in the scraped HTML.

## 🌉 React Architecture

### Component Structure
- **Global Theme Object**: All colors and branding are centralized in the `BRAND` constant at the top of `App.jsx`.
- **View Modes**: A dual-view engine (Grid/List) allows users to toggle between "Executive High-Level" (Grid Cards) and "Developer Detail" (List Rows).
- **Safe Storage**: Uses a `getSafeLocalStorage` wrapper to prevent server-side rendering (SSR) hydration errors if the app is ported to Next.js.

## 🤖 Instructions for AI Support Agents

If you are an AI assistant (like Claude, GPT, or Antigravity) working on this codebase:

1. **API Keys**: All API interactions happen via the `apiKey` variable which reads from `import.meta.env.VITE_GEMINI_API_KEY`.
2. **Styling**: Do not add external CSS files. Use the existing Tailwind configuration or the `<style>` block at the top of the `return` statement in `App.jsx`.
3. **Animations**: Framer Motion is NOT used. All animations are native CSS Keyframes (blobs, shimmers, flips) or Tailwind's `animate-in` utilities.
4. **Node Compatibility**: The project is pinned to **Vite 5**. Do not upgrade to Vite 6 unless the environment's Node version is confirmed to be 20.19+.

## 🚀 Future Integrations
- **WebSockets**: For real-time "typing" effects during report generation.
- **Vector DB**: Storing global CRO winners to provide "benchmarked" scores against industry leaders.
