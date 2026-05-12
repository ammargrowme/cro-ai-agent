
import { validateUrl, rateLimit } from './_utils.js';
import { CXL_PRINCIPLES } from './_knowledge.js';
import { extractLinks, extractButtons, extractForms, checkUrls, detectCtaIssues, shouldSkipHealthCheck } from './_extract.js';

// Server-side only — never reference VITE_ vars here, those would leak into client bundle.
const apiKey = process.env.GEMINI_API_KEY || "";

// Hard cap on additional pages per audit. Frontend can request fewer
// (or more — we silently truncate). Tuned so 1 + 25 = 26 parallel scrapes
// plus 6 Gemini calls plus ~100 HEAD checks finish well under the 300s
// Vercel function limit.
const MAX_ADDITIONAL_PAGES = 25;

// ─── CRO CHECKLIST (from GrowMe Basic Website Standards) ──────────
const CRO_CHECKLIST = `
## CRO CHECKLIST — Use this as your scoring framework:

### Keywords & SEO Alignment
- H1 includes the primary keyword for the page
- H2s include relevant keywords (natural, not spammy)
- SEO title written using best practices with target keyword(s)
- Meta description written using best practices with target keyword(s)

### Above-the-Fold & Hero
- Header does not take up full screen height on desktop
- Header does not take up excessive vertical space on mobile
- Hero section does not push critical content entirely below the fold
- Primary keyword (H1 topic) is clear within the first fold
- Main value proposition is clear within the first fold
- Primary CTA is visible above the fold
- Trust badges/awards/logos appear in hero section when applicable

### CTA & Conversion Focus
- Page has one primary conversion goal (Most Wanted Action)
- CTA text clearly states what the user gets when they click
- No vague CTA text (e.g., "Submit", "Click Here")
- CTA buttons match the outcome (e.g., "Call Us" does not link to a form)
- Primary CTA is repeated mid-page
- Only one primary CTA type per page (no competing actions)
- CTA buttons are filled and strongly contrast with the background

### Content Structure & Clarity
- Page avoids walls of text (short paragraphs, scannable layout)
- FAQ section included on home page and service pages
- Content written for scanning (bullet points, clear headings)
- Headings summarize meaning (not vague like "Our Services")
- Logical flow: What this is → Why it matters → Why us → How it works → Proof → CTA
- Every section logically connects to the conversion goal
- Grammar and writing quality are error-free

### Visual Hierarchy & Design
- Sticky menu present with CTA button
- Most important elements visually stand out (clear hierarchy)
- Whitespace used intentionally to guide attention
- Images are high resolution, not blurry or pixelated
- Images properly sized, not stretched disproportionately

### Mobile Optimization
- Page designed mobile-first
- Content collapsed/hidden where appropriate to reduce mobile scrolling
- Main CTA available in the mobile menu
- Buttons large enough for mobile tapping (minimum 44px height)
- Buttons not placed too close together on mobile
- Body text at least 16px on mobile

### Trust & Social Proof
- Google review scroller included when applicable
- Testimonials are specific and credible
- Footer properly formatted with business and legal information
- All contact information consistent with Google Business Profile

### Forms & Interaction
- Forms do not contain unnecessary required fields
- Form labels are visible (label above field, not placeholder-only)
- Error messages clear and visible when form validation fails
- Phone number clickable on all pages (tel: link)
- Contact page displays phone number above the fold
- Contact page displays main form above the fold or within one scroll on mobile

### Performance & QA
- Page speed tested and optimized
- No broken elements (bugs/layout issues)
- No placeholder texts (Lorem Ipsum, dummy testimonials)
- No auto-playing audio or disruptive pop-ups
- No irrelevant outbound links on lead-gen landing pages
- Logo links back to homepage
- Favicon present and displays correctly
- Page URL clean and readable

### Content Standards
- First 2 mobile screenfuls contain the clearest version of the page
- Every section must support user's ability to understand the offer and take next step
- CTAs appear after key decision-making moments (benefits, proof, pricing, FAQs)
- Content reinforces CTA, not competes with it
`;

// ─── UTILITIES ──────────────────────────────────────────────

const sanitizeHtml = (rawHtml) => {
  if (!rawHtml) return "";
  return rawHtml
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, '[ICON]')
    .replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, '')
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
    .replace(/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, '')
    .replace(/<embed\b[^>]*\/?>/gi, '')
    .replace(/<applet\b[^<]*(?:(?!<\/applet>)<[^<]*)*<\/applet>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<link\b[^>]*\/?>/gi, '')
    .replace(/class="[^"]*"/gi, '')
    .replace(/style="[^"]*"/gi, '')
    .replace(/data-[a-z-]+="[^"]*"/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 25000);
};

const callGemini = async (logId, promptText, imageParts, schema, maxTokens = 8192) => {
  const model = "gemini-3-flash-preview";
  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const parts = [{ text: promptText }, ...imageParts];

  const body = {
    contents: [{ parts }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: schema,
      temperature: 0.2,
      maxOutputTokens: maxTokens,
      // Gemini 2.5 Flash: thinking tokens count against maxOutputTokens.
      // Set a thinking budget to ensure enough tokens remain for the actual JSON output.
      thinkingConfig: {
        thinkingBudget: Math.min(2048, Math.floor(maxTokens * 0.4))
      }
    }
  };

  const response = await fetch(geminiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const errBody = await response.text();
    console.error(`[${logId}] Gemini HTTP ${response.status}:`, errBody.substring(0, 300));
    throw new Error(`AI HTTP error ${response.status}`);
  }

  const result = await response.json();
  const finishReason = result.candidates?.[0]?.finishReason;
  const text = result.candidates?.[0]?.content?.parts?.[0]?.text
    // Gemini 2.5 may return thinking text in earlier parts — grab the last text part
    || result.candidates?.[0]?.content?.parts?.filter(p => p.text)?.pop()?.text;

  if (!text) {
    console.error(`[${logId}] Gemini returned no text. Finish reason: ${finishReason}`);
    throw new Error("AI returned empty response");
  }

  console.log(`[${logId}] Gemini raw length: ${text.length} chars | Finish: ${finishReason}`);

  // Warn if truncated
  if (finishReason === 'MAX_TOKENS') {
    console.warn(`[${logId}] ⚠️ Response was TRUNCATED (MAX_TOKENS). Attempting partial parse...`);
  }

  try {
    return JSON.parse(text);
  } catch (e) {
    const cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim();
    try { return JSON.parse(cleaned); } catch (e2) {}

    // Attempt to salvage truncated JSON by closing brackets
    try {
      let salvaged = cleaned;
      // Count open vs close braces/brackets
      const openBraces = (salvaged.match(/\{/g) || []).length;
      const closeBraces = (salvaged.match(/\}/g) || []).length;
      const openBrackets = (salvaged.match(/\[/g) || []).length;
      const closeBrackets = (salvaged.match(/\]/g) || []).length;
      // Remove trailing comma if present
      salvaged = salvaged.replace(/,\s*$/, '');
      // Close any unclosed brackets/braces
      for (let i = 0; i < openBrackets - closeBrackets; i++) salvaged += ']';
      for (let i = 0; i < openBraces - closeBraces; i++) salvaged += '}';
      const parsed = JSON.parse(salvaged);
      console.log(`[${logId}] ✅ Salvaged truncated JSON successfully`);
      return parsed;
    } catch (e3) {}

    console.error(`[${logId}] JSON parse failed. Preview: ${text.substring(0, 300)}`);
    throw new Error("AI returned unparseable response");
  }
};

// ─── SCHEMAS ──────────────────────────────────────────────

const OVERVIEW_SCHEMA = {
  type: "object",
  properties: {
    overall_score: { type: "number", description: "CRO score 1-100. Be critical." },
    summary: { type: "string", description: "2-3 sentence executive summary. MAX 60 words." },
    strengths: {
      type: "array",
      description: "3-5 specific strengths. Each item MAX 20 words.",
      items: { type: "string" }
    },
    quick_wins: {
      type: "array",
      description: "3-5 quick wins under 1 hour to implement. Each MAX 20 words.",
      items: { type: "string" }
    }
  },
  required: ["overall_score", "summary", "strengths", "quick_wins"]
};

const RECOMMENDATIONS_SCHEMA = {
  type: "object",
  properties: {
    recommendations: {
      type: "array",
      description: "High-impact CRO recommendations based on the checklist. Include as many as are genuinely valuable (typically 3-10). Only include recommendations that address REAL issues found — never pad with generic advice.",
      items: {
        type: "object",
        properties: {
          id: { type: "number" },
          priority: { type: "string", description: "High, Medium, or Low" },
          category: { type: "string", description: "CTA, Trust, UX, Design, Performance, Copy, Mobile, SEO, or Forms" },
          issue: { type: "string", description: "What is broken. MAX 25 words." },
          recommendation: { type: "string", description: "How to fix it. MAX 30 words." },
          expected_impact: { type: "string", description: "Expected outcome. MAX 15 words." },
          implementation: { type: "string", description: "Technical hint. MAX 20 words." },
          checklist_ref: { type: "string", description: "Which checklist item(s) this addresses. MAX 15 words." }
        },
        required: ["id", "priority", "category", "issue", "recommendation", "expected_impact", "implementation", "checklist_ref"]
      }
    }
  },
  required: ["recommendations"]
};

const CHECKLIST_SCHEMA = {
  type: "object",
  properties: {
    checklist_scores: {
      type: "object",
      description: "Score each checklist category 0-100 based on observed compliance.",
      properties: {
        seo_alignment: { type: "number", description: "Keywords & SEO Alignment score 0-100" },
        above_the_fold: { type: "number", description: "Above-the-Fold & Hero score 0-100" },
        cta_focus: { type: "number", description: "CTA & Conversion Focus score 0-100" },
        content_structure: { type: "number", description: "Content Structure & Clarity score 0-100" },
        visual_hierarchy: { type: "number", description: "Visual Hierarchy & Design score 0-100" },
        mobile_optimization: { type: "number", description: "Mobile Optimization score 0-100" },
        trust_proof: { type: "number", description: "Trust & Social Proof score 0-100" },
        forms_interaction: { type: "number", description: "Forms & Interaction score 0-100" },
        performance_qa: { type: "number", description: "Performance & QA score 0-100" },
        content_standards: { type: "number", description: "Content Standards score 0-100" }
      },
      required: ["seo_alignment", "above_the_fold", "cta_focus", "content_structure", "visual_hierarchy", "mobile_optimization", "trust_proof", "forms_interaction", "performance_qa", "content_standards"]
    },
    checklist_flags: {
      type: "array",
      description: "Top 5 most critical checklist failures found. Each MAX 20 words.",
      items: { type: "string" }
    }
  },
  required: ["checklist_scores", "checklist_flags"]
};

const COMPETITOR_SCHEMA = {
  type: "object",
  properties: {
    overview: { type: "string", description: "2-3 sentence overview of competitive positioning. MAX 60 words." },
    comparisons: {
      type: "array",
      items: {
        type: "object",
        properties: {
          competitor: { type: "string", description: "Competitor domain name" },
          difference: { type: "string", description: "Key CRO difference vs the target site. MAX 30 words." },
          advantage: { type: "string", description: "Target site's strategic advantage over this competitor. MAX 25 words." },
          steal_worthy: {
            type: "array",
            description: "2-3 specific, actionable ideas to steal from this competitor. Each MAX 20 words.",
            items: { type: "string" }
          },
          competitor_scores: {
            type: "object",
            description: "Score this competitor on the same 10 checklist categories (0-100).",
            properties: {
              seo_alignment: { type: "number" },
              above_the_fold: { type: "number" },
              cta_focus: { type: "number" },
              content_structure: { type: "number" },
              visual_hierarchy: { type: "number" },
              mobile_optimization: { type: "number" },
              trust_proof: { type: "number" },
              forms_interaction: { type: "number" },
              performance_qa: { type: "number" },
              content_standards: { type: "number" }
            },
            required: ["seo_alignment", "above_the_fold", "cta_focus", "content_structure", "visual_hierarchy", "mobile_optimization", "trust_proof", "forms_interaction", "performance_qa", "content_standards"]
          }
        },
        required: ["competitor", "difference", "advantage", "steal_worthy", "competitor_scores"]
      }
    }
  },
  required: ["overview", "comparisons"]
};

const PER_PAGE_SCHEMA = {
  type: "object",
  properties: {
    page_scores: {
      type: "array",
      items: {
        type: "object",
        properties: {
          url: { type: "string" },
          page_type: { type: "string", description: "E.g., Homepage, Pricing, About, Contact, Service, Blog" },
          overall_score: { type: "number", description: "CRO score 0-100 for this specific page" },
          top_issues: { type: "array", items: { type: "string" }, description: "Top 3 CRO issues for this page. Each MAX 15 words." }
        },
        required: ["url", "page_type", "overall_score", "top_issues"]
      }
    }
  },
  required: ["page_scores"]
};

const FORM_FRICTION_SCHEMA = {
  type: "object",
  properties: {
    forms: {
      type: "array",
      description: "One entry per form analyzed.",
      items: {
        type: "object",
        properties: {
          page_url: { type: "string" },
          form_purpose: { type: "string", description: "Inferred purpose (e.g., Contact, Newsletter, Quote Request, Lead Capture, Booking). MAX 5 words." },
          friction_score: { type: "number", description: "0-100. Lower = more friction. Apply CXL form-friction principles." },
          top_friction_points: {
            type: "array",
            description: "3-5 specific friction issues found in the form. Each MAX 20 words.",
            items: { type: "string" }
          },
          recommendations: {
            type: "array",
            description: "3-5 concrete fixes. Each MAX 20 words.",
            items: { type: "string" }
          }
        },
        required: ["page_url", "form_purpose", "friction_score", "top_friction_points", "recommendations"]
      }
    }
  },
  required: ["forms"]
};

// ─── MAIN HANDLER ──────────────────────────────────────────

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  // ── Rate limiting (best-effort, resets on cold start) ──
  if (!rateLimit(req, 5)) {
    return res.status(429).json({ error: 'Too many requests. Please wait a minute and try again.' });
  }

  const { url, context, competitors, customPageSpeedKey, pastLearnings, targetKeywords, additionalPages } = req.body;
  if (!url) return res.status(400).json({ error: 'URL is required' });

  // ── Validate primary URL (scheme + SSRF check) ──
  const urlCheck = validateUrl(url);
  if (!urlCheck.valid) {
    return res.status(400).json({ error: urlCheck.error });
  }

  // ── Validate competitor URLs ──
  if (competitors && Array.isArray(competitors)) {
    for (const compUrl of competitors) {
      const compCheck = validateUrl(compUrl);
      if (!compCheck.valid) {
        return res.status(400).json({ error: `Invalid competitor URL (${compUrl}): ${compCheck.error}` });
      }
    }
  }

  // ── Validate additional page URLs ──
  if (additionalPages && Array.isArray(additionalPages)) {
    for (const pageUrl of additionalPages) {
      const pageCheck = validateUrl(pageUrl);
      if (!pageCheck.valid) {
        return res.status(400).json({ error: `Invalid additional page URL (${pageUrl}): ${pageCheck.error}` });
      }
    }
  }

  // ── Input length caps ──
  if (context && context.length > 2000) {
    return res.status(400).json({ error: 'Context too long (max 2000 chars)' });
  }
  if (targetKeywords && targetKeywords.length > 500) {
    return res.status(400).json({ error: 'Target keywords too long (max 500 chars)' });
  }

  const logId = Math.random().toString(36).substring(7);
  const globalStart = Date.now();
  console.log(`[${logId}] ════════════════════════════════════════`);
  console.log(`[${logId}] [START] Audit for ${url}`);

  try {
    // ══════════════════════════════════════════════════
    // PHASE 1: Scrape + PageSpeed IN PARALLEL
    // ══════════════════════════════════════════════════
    // Each scrape returns { sanitized, raw } — sanitized for AI prompts,
    // raw HTML preserved for static link/button/form extraction (which
    // needs the original class/style/href attributes the sanitizer strips).
    const scrapePromise = (async () => {
      try {
        const t = Date.now();
        const pageRes = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
          signal: AbortSignal.timeout(15000)
        });
        const rawHtml = await pageRes.text();
        const sanitized = sanitizeHtml(rawHtml);
        console.log(`[${logId}] [PHASE 1] Scrape OK: ${sanitized.length} chars in ${Date.now() - t}ms`);
        return { sanitized, raw: rawHtml };
      } catch (err) {
        console.error(`[${logId}] [PHASE 1] Scrape FAIL: ${err.message}`);
        return { sanitized: "", raw: "" };
      }
    })();

    const psKey = customPageSpeedKey || apiKey;
    const psUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&category=performance${psKey ? `&key=${psKey}` : ''}`;

    const pageSpeedPromise = (async () => {
      let data = { scoreText: "Unavailable", screenshot: null, mimeType: "image/jpeg" };
      try {
        const t = Date.now();
        console.log(`[${logId}] [PHASE 1] PageSpeed starting...`);
        const psRes = await fetch(psUrl, { signal: AbortSignal.timeout(90000) });
        if (psRes.ok) {
          const psData = await psRes.json();
          const score = Math.round(psData.lighthouseResult?.categories?.performance?.score * 100);
          data.scoreText = score ? `Performance Score: ${score}/100` : "Unavailable";
          const ssData = psData.lighthouseResult?.audits?.['final-screenshot']?.details?.data;
          if (ssData) {
            const match = ssData.match(/^data:([^;]+);base64,/);
            if (match) data.mimeType = match[1];
            data.screenshot = ssData.replace(/^data:image\/\w+;base64,/, "");
          }
          console.log(`[${logId}] [PHASE 1] PageSpeed OK: ${score}/100 in ${Date.now() - t}ms`);
        } else {
          const errText = await psRes.text();
          console.warn(`[${logId}] [PHASE 1] PageSpeed HTTP ${psRes.status}: ${errText.substring(0, 150)}`);
        }
      } catch (err) {
        console.error(`[${logId}] [PHASE 1] PageSpeed FAIL: ${err.message}`);
      }
      return data;
    })();

    // Scrape additional site pages in parallel (cap MAX_ADDITIONAL_PAGES).
    const cappedAdditionalPages = (additionalPages || []).slice(0, MAX_ADDITIONAL_PAGES);
    const additionalPagePromises = cappedAdditionalPages.map(async (pageUrl) => {
      try {
        const t = Date.now();
        const pageRes = await fetch(pageUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
          signal: AbortSignal.timeout(15000)
        });
        const rawHtml = await pageRes.text();
        const sanitized = sanitizeHtml(rawHtml);
        console.log(`[${logId}] [PHASE 1] Page scrape OK (${pageUrl}): ${sanitized.length} chars in ${Date.now() - t}ms`);
        return { url: pageUrl, html: sanitized, raw: rawHtml };
      } catch (err) {
        console.warn(`[${logId}] [PHASE 1] Page scrape FAIL (${pageUrl}): ${err.message}`);
        return { url: pageUrl, html: "", raw: "" };
      }
    });

    // Scrape competitors in parallel with main site
    const cappedCompetitors = (competitors || []).slice(0, 2);
    const competitorPromises = cappedCompetitors.map(async (compUrl) => {
      try {
        const t = Date.now();
        const compRes = await fetch(compUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
          signal: AbortSignal.timeout(15000)
        });
        const html = sanitizeHtml(await compRes.text());
        console.log(`[${logId}] [PHASE 1] Competitor scrape OK (${compUrl}): ${html.length} chars in ${Date.now() - t}ms`);
        return { url: compUrl, html };
      } catch (err) {
        console.warn(`[${logId}] [PHASE 1] Competitor scrape FAIL (${compUrl}): ${err.message}`);
        return { url: compUrl, html: "" };
      }
    });

    const allPhase1 = await Promise.all([scrapePromise, pageSpeedPromise, ...additionalPagePromises, ...competitorPromises]);
    const mainScrape = allPhase1[0];
    const mainHtml = mainScrape.sanitized;
    const mainRaw = mainScrape.raw;
    const pageSpeedData = allPhase1[1];
    const additionalPageData = allPhase1.slice(2, 2 + cappedAdditionalPages.length);
    const competitorData = allPhase1.slice(2 + cappedAdditionalPages.length);
    const validPages = additionalPageData.filter(p => p.html.length > 0);
    const validCompetitors = competitorData.filter(c => c.html.length > 0);
    console.log(`[${logId}] [PHASE 1 DONE] ${Date.now() - globalStart}ms elapsed | Pages: ${validPages.length}/${additionalPageData.length} | Competitors: ${validCompetitors.length}/${competitorData.length}`);

    // ══════════════════════════════════════════════════
    // PHASE 1.5: Static analysis — links, buttons, forms, URL health
    // ══════════════════════════════════════════════════
    // Operates on the RAW (unsanitized) HTML so we keep class/href/style
    // for accurate CTA detection. AI calls keep using `sanitized` HTML.
    const allScrapedPages = [
      { url, html: mainHtml, raw: mainRaw },
      ...validPages.map(p => ({ url: p.url, html: p.html, raw: p.raw || p.html }))
    ];

    const extractedPerPage = allScrapedPages.map(p => {
      const links = extractLinks(p.raw, p.url);
      const buttons = extractButtons(p.raw);
      const forms = extractForms(p.raw, p.url);
      return {
        url: p.url,
        links,
        buttons,
        forms,
        cta_issues: detectCtaIssues(p.url, links, buttons)
      };
    });

    // Build the unique URL set for HEAD checks — internal + external links
    // that point at real http(s) URLs. Skip tel:/mailto:/empty AND known
    // JS-hydrated shims (Cloudflare email-protection etc.) that always 404
    // when fetched server-side and would generate false "broken link"
    // reports.
    const allUrlsToCheck = [...new Set(
      extractedPerPage
        .flatMap(p => p.links)
        .filter(l => l.href && /^https?:/i.test(l.href) && !l.isEmpty)
        .filter(l => !shouldSkipHealthCheck(l.href))
        .map(l => l.href)
    )];

    let urlHealth = [];
    if (allUrlsToCheck.length > 0) {
      const t = Date.now();
      urlHealth = await checkUrls(allUrlsToCheck, { concurrency: 10, timeoutMs: 5000 });
      console.log(`[${logId}] [PHASE 1.5] URL health checked ${urlHealth.length} URLs in ${Date.now() - t}ms`);
    }
    const urlHealthMap = new Map(urlHealth.map(h => [h.url, h]));

    // Surface broken links + assemble per-page summary.
    const brokenLinks = urlHealth
      .filter(h => !h.ok)
      .map(h => {
        // Where did this URL appear?
        const onPages = extractedPerPage
          .filter(p => p.links.some(l => l.href === h.url))
          .map(p => p.url);
        const sampleText = (() => {
          for (const p of extractedPerPage) {
            const hit = p.links.find(l => l.href === h.url);
            if (hit) return hit.text;
          }
          return "";
        })();
        return {
          url: h.url,
          status: h.status,
          on_pages: onPages,
          link_text: sampleText,
          error: h.error
        };
      });

    const rawCtaIssues = extractedPerPage.flatMap(p => p.cta_issues);

    // Dedupe identical CTA issues across pages. The same dropdown / broken
    // link appears on every page that shares the nav, which previously
    // inflated "84 issues" when there were really ~5 unique problems. Roll
    // them up with a page_count so the operator sees the actual signal.
    const allCtaIssues = (() => {
      const grouped = new Map();
      for (const i of rawCtaIssues) {
        const key = `${i.severity}|${i.issue}|${i.evidence}`;
        const existing = grouped.get(key);
        if (existing) {
          existing.page_count += 1;
          if (existing.pages.length < 5) existing.pages.push(i.page);
        } else {
          grouped.set(key, {
            issue: i.issue,
            severity: i.severity,
            evidence: i.evidence,
            page: i.page,           // first page for backward compat
            pages: [i.page],
            page_count: 1
          });
        }
      }
      // Order by severity (high first) then descending page count.
      const sevRank = { high: 0, medium: 1, low: 2 };
      return [...grouped.values()].sort((a, b) =>
        (sevRank[a.severity] ?? 3) - (sevRank[b.severity] ?? 3) ||
        b.page_count - a.page_count
      );
    })();
    const totalForms = extractedPerPage.flatMap(p =>
      p.forms.map(f => ({ ...f, pageUrl: p.url }))
    );
    console.log(`[${logId}] [PHASE 1.5 DONE] Links: ${allUrlsToCheck.length} (${brokenLinks.length} broken) | CTA issues: ${allCtaIssues.length} unique (${rawCtaIssues.length} raw) | Forms: ${totalForms.length}`);

    // ══════════════════════════════════════════════════
    // PHASE 2: Three AI calls IN PARALLEL
    //   Overview + Recommendations + Checklist Scoring
    // ══════════════════════════════════════════════════
    const imageParts = [];
    if (pageSpeedData.screenshot) {
      imageParts.push({ inlineData: { mimeType: pageSpeedData.mimeType, data: pageSpeedData.screenshot } });
    }

    // Build learning context from past audits — with aggregate pattern detection
    let learningContext = "";
    if (pastLearnings && pastLearnings.length > 0) {
      const recentLearnings = pastLearnings.slice(-5);

      // Aggregate pattern detection: find recurring checklist weaknesses
      const weaknessCounts = {};
      const allInsights = [];
      const allIssues = [];
      for (const l of pastLearnings) {
        for (const w of (l.checklistWeaknesses || [])) {
          weaknessCounts[w] = (weaknessCounts[w] || 0) + 1;
        }
        allInsights.push(...(l.feedbackInsights || []));
        allIssues.push(...(l.topIssues || []));
      }
      const recurringWeaknesses = Object.entries(weaknessCounts)
        .filter(([, count]) => count >= 2)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([name, count]) => `"${name}" (failed in ${count}/${pastLearnings.length} audits)`);

      // Deduplicate insights
      const uniqueInsights = [...new Set(allInsights)].slice(-10);

      learningContext = `\n\n[LEARNING FROM PAST AUDITS — Use these patterns to give SMARTER, MORE TARGETED advice]:

INDIVIDUAL AUDIT HISTORY (most recent ${recentLearnings.length}):
${recentLearnings.map((l, i) => `${i + 1}. "${l.url}" (Score: ${l.score}/100) — Issues: ${l.topIssues?.join('; ') || 'N/A'} | Checklist weaknesses: ${l.checklistWeaknesses?.join(', ') || 'N/A'}`).join('\n')}

${recurringWeaknesses.length > 0 ? `RECURRING PATTERNS ACROSS ${pastLearnings.length} AUDITS (pay extra attention to these):
${recurringWeaknesses.map(w => `- ${w}`).join('\n')}
→ These are systemic issues the user keeps encountering. Flag them prominently if they appear on THIS site too.` : ''}

${uniqueInsights.length > 0 ? `CRO INSIGHTS FROM USER FEEDBACK (proven learnings):
${uniqueInsights.map(i => `- ${i}`).join('\n')}
→ Apply these insights proactively to THIS audit where relevant.` : ''}

INSTRUCTIONS: Compare this site against past patterns. If you see the SAME weaknesses recurring, call it out explicitly ("This is a pattern we've seen across multiple sites — prioritize fixing X"). Give more specific, nuanced advice based on accumulated knowledge.`;
    }

    // Build keyword context
    const keywordContext = targetKeywords ? `\nTARGET KEYWORDS: ${targetKeywords}\nCheck if these keywords appear in: H1, H2s, meta title, meta description, hero text, alt tags. Score keyword alignment based on actual presence vs absence.` : "";

    // Build multi-page context
    const multiPageContext = validPages.length > 0 ? `\n\n[MULTI-PAGE SITE AUDIT — Analyzing ${1 + validPages.length} pages from the same site]:
PRIMARY PAGE: ${url}
${validPages.map(p => {
      const hostname = (() => { try { return new URL(p.url).pathname; } catch { return p.url; } })();
      return `ADDITIONAL PAGE (${hostname}):\n${p.html.substring(0, 6000)}`;
    }).join('\n\n')}
→ Provide a SITE-WIDE assessment. Note patterns across pages (e.g., missing CTAs site-wide, inconsistent trust signals).` : "";

    const siteContext = `URL: ${url}\nPageSpeed: ${pageSpeedData.scoreText}\nUser Goals: ${context || "N/A"}${keywordContext}`;
    console.log(`[${logId}] [PHASE 2] Launching AI calls in parallel... Image: ${imageParts.length > 0 ? 'Yes' : 'No'} | Learnings: ${pastLearnings?.length || 0} | Keywords: ${targetKeywords ? 'Yes' : 'No'} | Extra pages: ${validPages.length}`);

    const overviewPromise = (async () => {
      const prompt = `You are an Elite CRO Director with deep expertise in conversion optimization. Analyze this website data and screenshot.

You MUST evaluate the site against this professional CRO checklist:
${CRO_CHECKLIST}

Ground your reasoning in this research-backed CRO framework:
${CXL_PRINCIPLES}

CRITICAL RULES:
- summary: MAX 60 words. Be specific about what works and what doesn't. Reference specific checklist failures.
- Each strength: MAX 20 words. Must reference what the site does RIGHT from the checklist.
- Each quick_win: MAX 20 words. Must be directly tied to a checklist item.
- overall_score: Be critical. 90+ is exceptional. Most sites score 50-75. Score based on checklist compliance.
${learningContext}

${siteContext}

[HTML STRUCTURE]:
${mainHtml}${multiPageContext}`;

      const t = Date.now();
      const result = await callGemini(logId, prompt, imageParts, OVERVIEW_SCHEMA);
      console.log(`[${logId}] [PHASE 2] Overview done in ${Date.now() - t}ms. Score: ${result.overall_score}`);
      return result;
    })();

    // Build a static-findings appendix so recommendations can call out
    // concrete broken links / CTA issues / form friction without re-deriving them.
    const staticFindings = (() => {
      const lines = [];
      if (brokenLinks.length > 0) {
        lines.push(`BROKEN / UNREACHABLE LINKS (${brokenLinks.length}):`);
        brokenLinks.slice(0, 15).forEach(b => {
          lines.push(`- "${b.link_text || '(no text)'}" → ${b.url} (status ${b.status}) on ${b.on_pages[0] || 'unknown'}`);
        });
      }
      if (allCtaIssues.length > 0) {
        lines.push(`\nCTA / BUTTON ISSUES (${allCtaIssues.length} unique, deduped across pages):`);
        allCtaIssues.slice(0, 15).forEach(i => {
          const scope = i.page_count > 1 ? `on ${i.page_count} pages` : `on ${i.page}`;
          lines.push(`- [${i.severity}] ${i.issue} — ${i.evidence} (${scope})`);
        });
      }
      if (totalForms.length > 0) {
        const formsWithInlineLabels = totalForms.filter(f => f.hasInlineLabels);
        const longForms = totalForms.filter(f => f.fieldCount > 6);
        if (formsWithInlineLabels.length > 0) {
          lines.push(`\nFORMS USING INLINE LABELS (CXL: bad practice) — ${formsWithInlineLabels.length} forms.`);
        }
        if (longForms.length > 0) {
          lines.push(`FORMS WITH >6 FIELDS (consider splitting / minimizing): ${longForms.length} forms.`);
        }
      }
      return lines.length > 0
        ? `\n\n[STATIC AUDIT FINDINGS — incorporate these as concrete recommendations]:\n${lines.join('\n')}`
        : "";
    })();

    const recsPromise = (async () => {
      const prompt = `You are an Elite CRO Director. Based on your analysis of this website, provide actionable CRO recommendations.

You MUST base your recommendations on this professional CRO checklist:
${CRO_CHECKLIST}

Ground your recommendations in this research-backed CRO framework:
${CXL_PRINCIPLES}

CRITICAL RULES:
- Include ONLY recommendations that address REAL, specific issues found on THIS site. Do NOT pad with generic advice.
- If the site has 3 real issues, give 3 recommendations. If it has 10, give 10. Typical range: 3-10 recommendations.
- Each recommendation MUST reference which checklist item(s) it addresses in the "checklist_ref" field.
- Each field must be CONCISE: issue max 25 words, recommendation max 30 words, implementation max 20 words, expected_impact max 15 words.
- priority must be "High", "Medium", or "Low".
- category must be one of: "CTA", "Trust", "UX", "Design", "Performance", "Copy", "Mobile", "SEO", or "Forms".
- Focus on the HIGHEST-IMPACT checklist failures first. Order by priority (High first).
- If STATIC AUDIT FINDINGS are listed below, treat them as ground truth and surface the most important ones as recommendations.
${learningContext}

${siteContext}

[HTML STRUCTURE]:
${mainHtml.substring(0, 15000)}${multiPageContext}${staticFindings}`;

      const t = Date.now();
      const result = await callGemini(logId, prompt, imageParts, RECOMMENDATIONS_SCHEMA);
      console.log(`[${logId}] [PHASE 2] Recs done in ${Date.now() - t}ms. Count: ${result.recommendations?.length}`);
      return result;
    })();

    const checklistPromise = (async () => {
      const prompt = `You are a CRO Auditor. Score this website against each category in the CRO checklist below.

${CRO_CHECKLIST}

Ground your scoring in this research-backed framework:
${CXL_PRINCIPLES}

For each category, score 0-100 based on how many items in that category the site passes.
- 0 = fails every item
- 50 = passes about half
- 100 = passes every item
Be honest and critical. Base scores on evidence from the HTML and screenshot.
${targetKeywords ? `\nFor "Keywords & SEO Alignment": check specifically for these target keywords: ${targetKeywords}. Score based on actual keyword presence in H1, H2s, meta tags, hero text.` : ''}

Also provide the top 5 most critical checklist failures as "checklist_flags".

${siteContext}

[HTML STRUCTURE]:
${mainHtml.substring(0, 12000)}${multiPageContext}${staticFindings}`;

      const t = Date.now();
      const result = await callGemini(logId, prompt, imageParts, CHECKLIST_SCHEMA, 8192);
      console.log(`[${logId}] [PHASE 2] Checklist done in ${Date.now() - t}ms.`);
      return result;
    })();

    // 4th AI call: Competitor Analysis (only if competitors were scraped)
    const competitorPromise = validCompetitors.length > 0 ? (async () => {
      const competitorContext = validCompetitors.map(c => {
        const hostname = (() => { try { return new URL(c.url).hostname; } catch { return c.url; } })();
        return `[COMPETITOR: ${hostname}]\n${c.html.substring(0, 8000)}`;
      }).join('\n\n');

      const prompt = `You are an Elite CRO Director. Compare this website against its competitors using the CRO checklist framework.

${CRO_CHECKLIST}

TARGET SITE (${url}):
${mainHtml.substring(0, 10000)}

COMPETITORS:
${competitorContext}

For EACH competitor, provide:
1. The KEY CRO difference (where the competitor does something better or worse)
2. The target site's strategic advantage
3. 2-3 SPECIFIC steal-worthy ideas (e.g., "They have a sticky CTA bar with phone number — add one", "Their hero has a video testimonial — consider adding one")
4. Score the competitor on ALL 10 checklist categories (0-100) so we can do a direct comparison matrix

Focus on actionable, specific CRO differences. Reference exact elements you observe in the HTML (not generic advice).
Be honest — if the competitor is better at something, say so clearly.`;

      const t = Date.now();
      const result = await callGemini(logId, prompt, imageParts, COMPETITOR_SCHEMA, 6144);
      console.log(`[${logId}] [PHASE 2] Competitor analysis done in ${Date.now() - t}ms. Comparisons: ${result.comparisons?.length}`);
      return result;
    })() : Promise.resolve({ overview: "", comparisons: [] });

    // 5th AI call: Per-page scoring — BATCHED so a 25-page audit doesn't
    // overflow Gemini's response budget. We split the page list into
    // chunks of PAGE_BATCH and run the chunks in parallel.
    const PAGE_BATCH = 5;
    const allPagesForScoring = [
      { url, html: mainHtml.substring(0, 5000) },
      ...validPages.map(p => ({ url: p.url, html: p.html.substring(0, 5000) }))
    ];
    const pageBatches = [];
    for (let i = 0; i < allPagesForScoring.length; i += PAGE_BATCH) {
      pageBatches.push(allPagesForScoring.slice(i, i + PAGE_BATCH));
    }
    // Only run per-page AI when we have >1 page total (otherwise overview
    // already covers the main URL).
    const perPagePromise = allPagesForScoring.length > 1 ? (async () => {
      const t = Date.now();
      const batchPromises = pageBatches.map((batch, idx) => {
        const prompt = `You are a CRO Auditor. Score each page individually on overall CRO quality (0-100). Identify the top 3 issues per page.

${CRO_CHECKLIST}

${CXL_PRINCIPLES}

PAGES TO SCORE:
${batch.map(p => `[PAGE: ${p.url}]\n${p.html}`).join('\n\n---\n\n')}

For each page, determine:
- page_type: What kind of page is it (Homepage, Pricing, About, Contact, Service, Blog, etc.)
- overall_score: 0-100 CRO score for THIS specific page
- top_issues: The 3 most critical CRO issues on THIS page (each max 15 words)`;
        return callGemini(`${logId}:p${idx}`, prompt, [], PER_PAGE_SCHEMA, 4096)
          .catch(err => {
            console.warn(`[${logId}] [PHASE 2] Per-page batch ${idx} FAILED: ${err.message}`);
            return { page_scores: [] };
          });
      });
      const batchResults = await Promise.all(batchPromises);
      const merged = batchResults.flatMap(r => r.page_scores || []);
      console.log(`[${logId}] [PHASE 2] Per-page scoring done in ${Date.now() - t}ms (${pageBatches.length} batches). Pages: ${merged.length}`);
      return { page_scores: merged };
    })() : Promise.resolve({ page_scores: [] });

    // 6th AI call: Form friction analysis — only if any forms were detected.
    const formFrictionPromise = totalForms.length > 0 ? (async () => {
      const t = Date.now();
      // Serialize forms with field-level detail so the AI can apply CXL rules.
      const formContext = totalForms.slice(0, 15).map((f, i) => {
        const fieldList = f.fields.map(fld => {
          const flags = [];
          if (fld.required) flags.push('required');
          if (fld.hasInlineLabel) flags.push('inline-label');
          if (fld.hasValidationPattern) flags.push('has-pattern');
          if (!fld.label && !fld.hasAriaLabel) flags.push('no-label');
          return `  ${fld.kind}[type=${fld.type}, name=${fld.name || '(none)'}, label="${fld.label || '(none)'}"${flags.length ? ', flags=' + flags.join('+') : ''}]`;
        }).join('\n');
        return `[FORM #${i + 1} — page: ${f.pageUrl}]
action: ${f.action || '(none)'}
method: ${f.method}
fields: ${f.fieldCount} total, ${f.requiredCount} required
${fieldList}`;
      }).join('\n\n');

      const prompt = `You are a CRO Auditor specializing in web form friction. Apply CXL form-friction principles to score and improve each form.

${CXL_PRINCIPLES}

FORMS DETECTED ON THIS SITE:
${formContext}

For EACH form, return:
- page_url: the URL of the page hosting the form
- form_purpose: inferred purpose (Contact, Quote, Newsletter, Lead Capture, Booking, etc.) — max 5 words
- friction_score: 0-100. LOWER = MORE FRICTION. Apply CXL rules: inline labels = bad, no inline validation = friction, too many fields = friction, no expectation-setting copy = friction.
- top_friction_points: 3-5 SPECIFIC friction issues found in THIS form (e.g., "Inline label on email field — user loses context after typing", "8 required fields with no progress indicator"). Each max 20 words.
- recommendations: 3-5 concrete fixes (e.g., "Replace inline label with above-field label on Phone", "Split into 2-step form: contact info → details"). Each max 20 words.

Be concrete — reference the actual fields by name. Avoid generic advice.`;
      try {
        const result = await callGemini(logId, prompt, [], FORM_FRICTION_SCHEMA, 4096);
        console.log(`[${logId}] [PHASE 2] Form friction done in ${Date.now() - t}ms. Forms: ${result.forms?.length}`);
        return result;
      } catch (err) {
        console.warn(`[${logId}] [PHASE 2] Form friction FAILED: ${err.message}`);
        return { forms: [] };
      }
    })() : Promise.resolve({ forms: [] });

    // Use Promise.allSettled so one failing call doesn't crash the entire audit
    const [overviewResult, recsResult, checklistResult, competitorResult, perPageResult, formFrictionResult] = await Promise.allSettled([overviewPromise, recsPromise, checklistPromise, competitorPromise, perPagePromise, formFrictionPromise]);

    const overview = overviewResult.status === 'fulfilled' ? overviewResult.value : { overall_score: 0, summary: "Overview generation failed — please retry.", strengths: [], quick_wins: [] };
    const recs = recsResult.status === 'fulfilled' ? recsResult.value : { recommendations: [] };
    const checklist = checklistResult.status === 'fulfilled' ? checklistResult.value : { checklist_scores: {}, checklist_flags: ["Checklist scoring failed — please retry the audit."] };
    const competitorAnalysis = competitorResult.status === 'fulfilled' ? competitorResult.value : { overview: "", comparisons: [] };
    const perPageScores = perPageResult.status === 'fulfilled' ? perPageResult.value : { page_scores: [] };
    const formFriction = formFrictionResult.status === 'fulfilled' ? formFrictionResult.value : { forms: [] };

    if (overviewResult.status === 'rejected') console.error(`[${logId}] Overview FAILED: ${overviewResult.reason?.message}`);
    if (recsResult.status === 'rejected') console.error(`[${logId}] Recommendations FAILED: ${recsResult.reason?.message}`);
    if (checklistResult.status === 'rejected') console.error(`[${logId}] Checklist FAILED: ${checklistResult.reason?.message}`);
    if (competitorResult.status === 'rejected') console.error(`[${logId}] Competitor FAILED: ${competitorResult.reason?.message}`);
    if (perPageResult.status === 'rejected') console.error(`[${logId}] Per-page FAILED: ${perPageResult.reason?.message}`);
    if (formFrictionResult.status === 'rejected') console.error(`[${logId}] Form friction FAILED: ${formFrictionResult.reason?.message}`);

    // ══════════════════════════════════════════════════
    // PHASE 3: Merge & Deliver
    // ══════════════════════════════════════════════════

    // Ensure all 10 checklist categories have a value (fill missing with 0)
    const defaultScores = { seo_alignment: 0, above_the_fold: 0, cta_focus: 0, content_structure: 0, visual_hierarchy: 0, mobile_optimization: 0, trust_proof: 0, forms_interaction: 0, performance_qa: 0, content_standards: 0 };
    const mergedChecklistScores = { ...defaultScores, ...(checklist.checklist_scores || {}) };

    // Build the static-analysis report sections so the frontend can render
    // Link Health / CTA Audit / Form Health cards without round-tripping.
    const totalLinks = extractedPerPage.reduce((sum, p) => sum + p.links.length, 0);
    const linkHealthByPage = extractedPerPage.map(p => {
      const broken = p.links.filter(l => {
        if (!l.href || !/^https?:/i.test(l.href)) return false;
        const h = urlHealthMap.get(l.href);
        return h && !h.ok;
      });
      return {
        url: p.url,
        total_links: p.links.length,
        external_links: p.links.filter(l => l.isExternal).length,
        broken_count: broken.length
      };
    });

    const totalCtas = extractedPerPage.reduce(
      (sum, p) => sum + p.buttons.filter(b => b.isCta).length + p.links.filter(l => l.isCta).length,
      0
    );

    const perFormPayload = totalForms.map((f, idx) => {
      const aiMatch = (formFriction.forms || []).find(af => af.page_url === f.pageUrl) ||
        // Fall back to ordered match if URLs don't line up
        (formFriction.forms || [])[idx];
      return {
        page_url: f.pageUrl,
        action: f.action,
        method: f.method,
        field_count: f.fieldCount,
        required_count: f.requiredCount,
        has_inline_labels: f.hasInlineLabels,
        has_any_validation: f.hasAnyValidation,
        fields: f.fields,
        ai_analysis: aiMatch || null
      };
    });

    const report = {
      overall_score: overview.overall_score,
      summary: overview.summary,
      strengths: overview.strengths || [],
      quick_wins: overview.quick_wins || [],
      recommendations: recs.recommendations || [],
      competitor_analysis: competitorAnalysis || { overview: "", comparisons: [] },
      checklist_scores: mergedChecklistScores,
      checklist_flags: checklist.checklist_flags || [],
      page_scores: perPageScores.page_scores || [],
      link_health: {
        total_links: totalLinks,
        total_checked: urlHealth.length,
        broken_links: brokenLinks,
        by_page: linkHealthByPage
      },
      cta_audit: {
        total_ctas: totalCtas,
        issues: allCtaIssues
      },
      form_health: {
        total_forms: totalForms.length,
        per_form: perFormPayload
      },
      pages_audited: allScrapedPages.map(p => p.url),
      audit_metadata: {
        url: url,
        timestamp: new Date().toISOString(),
        had_screenshot: imageParts.length > 0,
        had_learnings: (pastLearnings?.length || 0) > 0,
        duration_ms: Date.now() - globalStart,
        pages_requested: cappedAdditionalPages.length + 1,
        pages_scraped: allScrapedPages.length,
        urls_health_checked: urlHealth.length
      }
    };

    const totalTime = Date.now() - globalStart;
    console.log(`[${logId}] [DONE] Score: ${report.overall_score} | Pages: ${report.pages_audited.length} | Recs: ${report.recommendations.length} | Broken: ${brokenLinks.length} | Forms: ${totalForms.length} | Total: ${totalTime}ms`);
    console.log(`[${logId}] ════════════════════════════════════════`);

    return res.status(200).json(report);

  } catch (err) {
    console.error(`[${logId}] [FATAL] ${err.message} (${Date.now() - globalStart}ms elapsed)`);
    return res.status(500).json({ error: err.message });
  }
}
