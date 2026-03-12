# 🚀 GROWAGENT: Advanced CRO AI Audit Agent

GROWAGENT is a high-performance, AI-driven Conversion Rate Optimization (CRO) audit tool. It scrapes live website data, analyzes visual hierarchies using multimodal AI, and generates comprehensive revenue-boosting strategies.

---

## 📖 Table of Contents
- [✨ Key Features](#-key-features)
- [🎮 How to Use](#-how-to-use)
- [🤖 For AI Agents & Developers](#-for-ai-agents--developers)
- [🛠 Tech Stack](#-tech-stack)
- [🚀 Quick Start](#-quick-start)
- [📈 Roadmap](#-roadmap)

---

## ✨ Key Features

- **Live Site Scraper**: Automatically extracts HTML, CSS structure, and DOM hierarchy from any public URL.
- **Multimodal Analysis**: Combines text-based code analysis with visual screenshot interpretation using Gemini 2.5 Flash.
- **Competitor Benchmarking**: High-speed parallel scraping of competitor sites to identify market gaps.
- **Priority-Based Strategy**: Generates High, Medium, and Low priority recommendations.
- **Developer Handoff**: Each recommendation includes an AI-generated **Code Patch** (HTML/Tailwind) and **A/B Test Variations**.
- **Interactive Chat**: A real-time AI Strategist terminal to pivot recommendations or dive deeper into specific issues.

---

## 🎮 How to Use

### 1. Basic Scan
1. Open the app and enter a website URL (e.g., `nike.com`).
2. Click **Analyze**.
3. Watch the real-time "System Console" as the agent extract code, checks PageSpeed, and synthesizes the strategy.

### 2. Advanced Global Audits
1. Click the **`+` icon** next to the Analyze button.
2. **Campaign Context**: Tell the AI *who* you are targeting (e.g., "We sell B2B SaaS to CFOs").
3. **Competitors**: Add up to 2 specific domains you want to beat.
4. **Custom Key**: If you have a high-traffic volume, add your own Google PageSpeed API key.

### 3. Implementing Fixes
1. Once the report is generated, hover over or click on any recommendation "Card".
2. Use the **"Code ✨"** button to generate a specific Tailwind CSS component fix.
3. Use the **"A/B Copy ✨"** button to get 3 new headlines or CTAs.

---

## 🤖 For AI Agents & Developers

This repository is optimized for AI-assisted development (Cursor, Windsurf, Antigravity).

### **System Architecture**
- **State Engine**: Managed via React `useState` and `useEffect` hooks for real-time loading phases.
- **Prompt Engineering**: Uses a sophisticated JSON-schema-enforced prompt located in `generateGeminiReport`.
- **API Fallback Logic**: The app features a resilient API handler that routes PageSpeed requests through the primary Gemini key if a specific PageSpeed key isn't present.
- **Rate Limit Handling**: Includes exponential backoff for Google's public endpoints.

---

## 🛠 Tech Stack

- **Framework**: React 18+ (Vite 5 for wide Node compatibility)
- **Styling**: Tailwind CSS (Custom components + Animations)
- **Icons**: Lucide-React
- **AI Backend**: Google Gemini 2.5 Flash API
- **Analytics**: Google PageSpeed Insights API

---

## 🚀 Quick Start

1. **Clone & Install**
   ```bash
   git clone https://github.com/ammargrowme/cro-ai-agent.git
   cd cro-ai-agent
   npm install
   ```

2. **Setup Env**
   Create `.env`:
   ```env
   VITE_GEMINI_API_KEY=YOUR_KEY_HERE
   ```

3. **Launch**
   ```bash
   npm run dev
   ```

---

## 📈 Roadmap
- [ ] PDF Export functionality
- [ ] Multi-page crawl (Scan entire funnel)
- [ ] User authentication & Report history
- [ ] Deep-link integration with Shopify/WooCommerce

---
Built by [ammargrowme](https://github.com/ammargrowme) | Powered by Google Gemini
