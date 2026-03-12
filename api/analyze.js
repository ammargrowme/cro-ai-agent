
const apiKey = process.env.VITE_GEMINI_API_KEY || "";

// --- HELPERS FROM APP.JSX ---
const REPORT_SCHEMA_PROPERTIES = {
  overall_score: { type: "INTEGER", description: "Score from 1 to 100" },
  summary: { type: "STRING" },
  strengths: { type: "ARRAY", items: { type: "STRING" } },
  quick_wins: { type: "ARRAY", items: { type: "STRING" } },
  competitor_analysis: {
    type: "OBJECT",
    description: "Only fill this if competitor URLs were analyzed",
    properties: {
      overview: { type: "STRING" },
      comparisons: {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          properties: {
            competitor: { type: "STRING" },
            difference: { type: "STRING" },
            advantage: { type: "STRING" }
          }
        }
      }
    }
  },
  recommendations: {
    type: "ARRAY",
    items: {
      type: "OBJECT",
      properties: {
        id: { type: "INTEGER" },
        priority: { type: "STRING" },
        category: { type: "STRING" },
        issue: { type: "STRING" },
        recommendation: { type: "STRING" },
        expected_impact: { type: "STRING" },
        implementation: { type: "STRING" }
      }
    }
  }
};

const fetchWithRetry = async (url, options, retries = 3) => {
  const delays = [2000, 4000, 8000];
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, options);
      if (!response.ok) {
        const errBody = await response.text();
        console.error(`Fetch error ${response.status} for ${url.substring(0, 50)}:`, errBody);
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return await response.json();
    } catch (e) {
      console.error(`Attempt ${i + 1} failed: ${e.message}`);
      if (i === retries - 1) throw e;
      await new Promise(res => setTimeout(res, delays[i]));
    }
  }
};

const safeParseJSON = (text) => {
  if (!text) return null;
  try {
    // Try clean parse
    return JSON.parse(text);
  } catch (e) {
    // Try stripping markdown blocks
    const cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim();
    try {
      return JSON.parse(cleaned);
    } catch (e2) {
      console.error("JSON Parse Critical Failure:", text.substring(0, 500));
      return null;
    }
  }
};

const sanitizeHtml = (rawHtml) => {
  if (!rawHtml) return "";
  return rawHtml
    .replace(/<!--[\s\S]*?-->/g, '') // Remove comments
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, '[ICON]')
    .replace(/<link\b[^>]*\/?>/gi, '') // Remove links
    .replace(/\s+/g, ' ') // Collapse whitespace
    .trim()
    .substring(0, 40000); // 40k chars is plenty for structure
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const { url, context, competitors, customPageSpeedKey } = req.body;
  if (!url) return res.status(400).json({ error: 'URL is required' });

  console.log(`[ANALYSIS] Starting for: ${url}`);

  try {
    // 1. Scrape Main HTML
    console.log(`[SCRAPE] Fetching HTML...`);
    let mainHtml = "";
    try {
      const pageRes = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36' } });
      mainHtml = sanitizeHtml(await pageRes.text());
      console.log(`[SCRAPE] Success. Size: ${(mainHtml.length / 1024).toFixed(2)} KB`);
    } catch (err) {
      console.error(`[SCRAPE] Failed: ${err.message}`);
      mainHtml = `Failed to scrape ${url} directly.`;
    }

    // 2. Scrape Competitors
    let competitorsHtmlStr = "";
    if (competitors && competitors.length > 0) {
      console.log(`[COMPETITORS] Scraping ${competitors.length} competitors...`);
      const compPromises = competitors.map(async (cUrl) => {
        try {
          const cRes = await fetch(cUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
          const cHtml = sanitizeHtml(await cRes.text());
          return `--- URL: ${cUrl} ---\n${cHtml}\n`;
        } catch (e) {
          return `--- URL: ${cUrl} ---\nFailed to scrape.\n`;
        }
      });
      competitorsHtmlStr = (await Promise.all(compPromises)).join('\n');
    }

    // 3. PageSpeed & Screenshot
    console.log(`[PAGESPEED] Fetching metrics via Google API...`);
    const psKey = customPageSpeedKey || apiKey;
    const psUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&category=performance${psKey ? `&key=${psKey}` : ''}`;
    
    let pageSpeedData = { scoreText: "Unavailable", screenshot: null, mimeType: "image/jpeg" };
    try {
      const psRes = await fetch(psUrl);
      if (psRes.ok) {
        const psData = await psRes.json();
        const score = psData.lighthouseResult?.categories?.performance?.score * 100;
        pageSpeedData.scoreText = score ? `Score: ${score}/100` : "Unavailable";
        const screenshotData = psData.lighthouseResult?.audits?.['final-screenshot']?.details?.data;
        if (screenshotData) {
            const match = screenshotData.match(/^data:([^;]+);base64,/);
            if (match) pageSpeedData.mimeType = match[1];
            pageSpeedData.screenshot = screenshotData.replace(/^data:image\/\w+;base64,/, "");
        }
        console.log(`[PAGESPEED] Success. Score: ${score || 'N/A'}`);
      } else {
        const errTxt = await psRes.text();
        console.warn(`[PAGESPEED] API returned status ${psRes.status}:`, errTxt);
      }
    } catch (err) {
      console.error(`[PAGESPEED] Failed: ${err.message}`);
    }

    // 4. Gemini Synthesis
    console.log(`[GEMINI] Preparing multi-modal payload...`);
    const model = "gemini-2.5-flash";
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    
    let promptText = `Act as an Elite Conversion Rate Optimization (CRO) Lead at a world-class digital agency. 
Your mission is to perform a deep-dive audit of the following website: ${url}.

[DATA SOURCES]
1. LIVE HTML STRUCTURE:
${mainHtml}

2. PERFORMANCE METRICS (PageSpeed Insights):
${pageSpeedData.scoreText}

[AUDIT GUIDELINES]
- Analyze the Visual Hierarchy: How is the "Above the Fold" content structured?
- Evaluate the Value Proposition: Is it clear what the site offers within 3 seconds?
- Trust & Authority: Are there testimonials, logos, or security badges?
- Friction Points: Where might a user get confused or leave?
- Comparison: If competitor data is provided, identify 2-3 specific "Gaps" where they are outperforming this site.

[DETAILED OUTPUT INSTRUCTIONS]
- OVERALL_SCORE: Be critical. 90+ is rare. 
- SUMMARY: Provide a 3-4 sentence high-level executive summary of current performance.
- STRENGTHS: List 3-5 specific technical or design elements that ARE working.
- QUICK_WINS: List absolute "no-brainer" fixes that take < 1 hour to implement.
- RECOMMENDATIONS: Provide 5-8 depth-focused recommendations. For each, specify:
    - category: (UX, Design, Performance, or Copy)
    - issue: What exactly is broken?
    - recommendation: How exactly to fix it?
    - implementation: Give a brief technical hint (e.g., "Change the z-index" or "Add a sticky header").

[COMPETITORS]:
${competitorsHtmlStr || "No competitor data provided."}

[USER CONTEXT]:
${context || "No specific business goals provided."}

FINAL RULE: Return ONLY a valid JSON object matching the requested schema. No conversational filler.`;

    const parts = [{ text: promptText }];
    if (pageSpeedData.screenshot) {
      console.log(`[GEMINI] Attaching screenshot (${(pageSpeedData.screenshot.length / 1024).toFixed(2)} KB)...`);
      parts.push({
        inlineData: {
          mimeType: pageSpeedData.mimeType,
          data: pageSpeedData.screenshot
        }
      });
    }

    console.log(`[GEMINI] Payload ready. Prompt: ${promptText.length} chars. Image: ${pageSpeedData.screenshot ? 'Yes' : 'No'}`);
    console.log(`[GEMINI] Sending request to Google (Model: ${model})...`);
    
    const startTime = Date.now();
    const geminiResult = await fetchWithRetry(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: { type: "OBJECT", properties: REPORT_SCHEMA_PROPERTIES },
          temperature: 0.1,
          maxOutputTokens: 8192
        }
      })
    });

    const duration = Date.now() - startTime;
    console.log(`[GEMINI] Response received in ${duration}ms`);

    const reportText = geminiResult.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!reportText) {
      console.error("[GEMINI] Fatal: No text in candidates array.");
      throw new Error("Empty response from AI engine.");
    }

    console.log(`[GEMINI] Raw text length: ${reportText.length} chars.`);
    
    let report = safeParseJSON(reportText);
    if (!report) {
      const isTruncated = reportText.length > 0 && !reportText.trim().endsWith("}");
      console.error(`[GEMINI] JSON Parse Failure. ${isTruncated ? 'RESPONSE DETECTED AS TRUNCATED.' : ''}`);
      console.error(`[GEMINI] Raw Head: ${reportText.substring(0, 100)}...`);
      console.error(`[GEMINI] Raw Tail: ...${reportText.slice(-100)}`);
      throw new Error(`AI generated invalid or truncated data (${reportText.length} chars).`);
    }

    console.log(`[SUCCESS] Analysis complete for ${url}. Recommendations: ${report.recommendations?.length || 0}`);
    
    return res.status(200).json(report);

  } catch (err) {
    console.error(`[FATAL ERROR]`, err);
    return res.status(500).json({ error: err.message });
  }
}
