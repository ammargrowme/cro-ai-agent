
const apiKey = process.env.VITE_GEMINI_API_KEY || "";

// ─── UTILITIES ──────────────────────────────────────────────

const sanitizeHtml = (rawHtml) => {
  if (!rawHtml) return "";
  return rawHtml
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, '[ICON]')
    .replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<link\b[^>]*\/?>/gi, '')
    .replace(/class="[^"]*"/gi, '')
    .replace(/style="[^"]*"/gi, '')
    .replace(/data-[a-z-]+="[^"]*"/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 25000);
};

const callGemini = async (logId, promptText, imageParts, schema) => {
  const model = "gemini-2.5-flash";
  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const parts = [{ text: promptText }, ...imageParts];

  const body = {
    contents: [{ parts }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: schema,
      temperature: 0.2,
      maxOutputTokens: 4096
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
  const text = result.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!text) {
    console.error(`[${logId}] Gemini returned no text. Finish reason: ${result.candidates?.[0]?.finishReason}`);
    throw new Error("AI returned empty response");
  }

  console.log(`[${logId}] Gemini raw length: ${text.length} chars`);

  try {
    return JSON.parse(text);
  } catch (e) {
    // Try stripping markdown
    const cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim();
    try { return JSON.parse(cleaned); } catch (e2) {}
    console.error(`[${logId}] JSON parse failed. Preview: ${text.substring(0, 300)}`);
    throw new Error("AI returned unparseable response");
  }
};

// ─── SCHEMAS (split into two small, focused schemas) ──────

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
      description: "Exactly 5 high-impact CRO recommendations.",
      items: {
        type: "object",
        properties: {
          id: { type: "number" },
          priority: { type: "string", description: "High, Medium, or Low" },
          category: { type: "string", description: "UX, Design, Performance, or Copy" },
          issue: { type: "string", description: "What is broken. MAX 25 words." },
          recommendation: { type: "string", description: "How to fix it. MAX 30 words." },
          expected_impact: { type: "string", description: "Expected outcome. MAX 15 words." },
          implementation: { type: "string", description: "Technical hint. MAX 20 words." }
        },
        required: ["id", "priority", "category", "issue", "recommendation", "expected_impact", "implementation"]
      }
    }
  },
  required: ["recommendations"]
};

// ─── MAIN HANDLER ──────────────────────────────────────────

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const { url, context, competitors, customPageSpeedKey } = req.body;
  if (!url) return res.status(400).json({ error: 'URL is required' });

  const logId = Math.random().toString(36).substring(7);
  console.log(`[${logId}] ════════════════════════════════════════`);
  console.log(`[${logId}] [START] Audit for ${url}`);

  try {
    // ──── STEP 1: Scrape HTML ────
    let mainHtml = "";
    try {
      const t = Date.now();
      const pageRes = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        signal: AbortSignal.timeout(10000)
      });
      mainHtml = sanitizeHtml(await pageRes.text());
      console.log(`[${logId}] [STEP 1] HTML scraped: ${mainHtml.length} chars in ${Date.now() - t}ms`);
    } catch (err) {
      console.error(`[${logId}] [STEP 1 FAIL] ${err.message}`);
    }

    // ──── STEP 2: PageSpeed ────
    const psKey = customPageSpeedKey || apiKey;
    const psUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&category=performance${psKey ? `&key=${psKey}` : ''}`;
    let pageSpeedData = { scoreText: "Unavailable", screenshot: null, mimeType: "image/jpeg" };

    try {
      console.log(`[${logId}] [STEP 2] Calling PageSpeed...`);
      const t = Date.now();
      const psRes = await fetch(psUrl, { signal: AbortSignal.timeout(45000) });
      if (psRes.ok) {
        const psData = await psRes.json();
        const score = Math.round(psData.lighthouseResult?.categories?.performance?.score * 100);
        pageSpeedData.scoreText = score ? `Performance Score: ${score}/100` : "Unavailable";
        const ssData = psData.lighthouseResult?.audits?.['final-screenshot']?.details?.data;
        if (ssData) {
          const match = ssData.match(/^data:([^;]+);base64,/);
          if (match) pageSpeedData.mimeType = match[1];
          pageSpeedData.screenshot = ssData.replace(/^data:image\/\w+;base64,/, "");
        }
        console.log(`[${logId}] [STEP 2] PageSpeed OK: ${score}/100 in ${Date.now() - t}ms. Screenshot: ${pageSpeedData.screenshot ? 'Yes' : 'No'}`);
      } else {
        const errText = await psRes.text();
        console.warn(`[${logId}] [STEP 2 WARN] PageSpeed HTTP ${psRes.status}: ${errText.substring(0, 200)}`);
      }
    } catch (err) {
      console.error(`[${logId}] [STEP 2 FAIL] ${err.message}`);
    }

    // ──── Build Image Parts (shared between both calls) ────
    const imageParts = [];
    if (pageSpeedData.screenshot) {
      imageParts.push({ inlineData: { mimeType: pageSpeedData.mimeType, data: pageSpeedData.screenshot } });
    }

    // ──── Shared context string (compact) ────
    const siteContext = `URL: ${url}\nPageSpeed: ${pageSpeedData.scoreText}\nUser Goals: ${context || "N/A"}`;

    // ──── STEP 3: AI Call 1 — Overview (Score, Summary, Strengths, Quick Wins) ────
    console.log(`[${logId}] [STEP 3] AI Call 1: Overview...`);
    const overviewPrompt = `You are an Elite CRO Director. Analyze this website data and screenshot.

CRITICAL RULES:
- summary: MAX 60 words. Be specific about what works and what doesn't.
- Each strength: MAX 20 words.
- Each quick_win: MAX 20 words.
- overall_score: Be critical. 90+ is exceptional. Most sites score 50-75.

${siteContext}

[HTML STRUCTURE]:
${mainHtml}`;

    const t3 = Date.now();
    const overview = await callGemini(logId, overviewPrompt, imageParts, OVERVIEW_SCHEMA);
    console.log(`[${logId}] [STEP 3] Overview done in ${Date.now() - t3}ms. Score: ${overview.overall_score}. Strengths: ${overview.strengths?.length}. Wins: ${overview.quick_wins?.length}`);

    // ──── STEP 4: AI Call 2 — Recommendations ────
    console.log(`[${logId}] [STEP 4] AI Call 2: Recommendations...`);
    const recsPrompt = `You are an Elite CRO Director. Based on your analysis of this website, provide exactly 5 actionable CRO recommendations.

CRITICAL RULES:
- Exactly 5 recommendations. No more, no less.
- Each field must be CONCISE: issue max 25 words, recommendation max 30 words, implementation max 20 words, expected_impact max 15 words.
- priority must be "High", "Medium", or "Low".
- category must be "UX", "Design", "Performance", or "Copy".

${siteContext}

[HTML STRUCTURE]:
${mainHtml.substring(0, 15000)}`;

    const t4 = Date.now();
    const recs = await callGemini(logId, recsPrompt, imageParts, RECOMMENDATIONS_SCHEMA);
    console.log(`[${logId}] [STEP 4] Recommendations done in ${Date.now() - t4}ms. Count: ${recs.recommendations?.length}`);

    // ──── STEP 5: Merge & Deliver ────
    const report = {
      overall_score: overview.overall_score,
      summary: overview.summary,
      strengths: overview.strengths || [],
      quick_wins: overview.quick_wins || [],
      recommendations: recs.recommendations || [],
      competitor_analysis: { overview: "", comparisons: [] }
    };

    console.log(`[${logId}] [DONE] Score: ${report.overall_score} | Strengths: ${report.strengths.length} | Wins: ${report.quick_wins.length} | Recs: ${report.recommendations.length}`);
    console.log(`[${logId}] ════════════════════════════════════════`);

    return res.status(200).json(report);

  } catch (err) {
    console.error(`[${logId}] [FATAL]`, err);
    return res.status(500).json({ error: err.message });
  }
}
