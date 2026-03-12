
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

const repairJson = (text) => {
  let cleaned = text.trim();
  if (cleaned.startsWith('{') && !cleaned.endsWith('}')) {
    console.warn("[REPAIR] Detected truncated JSON. Attempting structural repair...");
    const quoteCount = (cleaned.match(/"/g) || []).length;
    if (quoteCount % 2 !== 0) cleaned += '"';
    const stack = [];
    for (let i = 0; i < cleaned.length; i++) {
        if (cleaned[i] === '{') stack.push('}');
        else if (cleaned[i] === '[') stack.push(']');
        else if (cleaned[i] === '}' || cleaned[i] === ']') stack.pop();
    }
    while (stack.length > 0) cleaned += stack.pop();
    return cleaned;
  }
  return cleaned;
};

const safeParseJSON = (text) => {
  if (!text) return null;
  let attempt = text.trim();
  try { return JSON.parse(attempt); } catch (e) {}
  attempt = attempt.replace(/```json/g, '').replace(/```/g, '').trim();
  try { return JSON.parse(attempt); } catch (e) {}
  const repaired = repairJson(attempt);
  try { 
    const parsed = JSON.parse(repaired); 
    console.log("[REPAIR] Success! Repaired truncated JSON object.");
    return parsed;
  } catch (e) {
    console.error("JSON Parse Critical Failure:", attempt.substring(0, 500));
    return null;
  }
};

const sanitizeHtml = (rawHtml) => {
  if (!rawHtml) return "";
  const cleaned = rawHtml
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, '[ICON]')
    .replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<link\b[^>]*\/?>/gi, '')
    .replace(/class="[^"]*"/gi, '') // Remove classes to save massive tokens
    .replace(/style="[^"]*"/gi, '') // Remove inline styles
    .replace(/\s+/g, ' ')
    .trim();
  
  const final = cleaned.substring(0, 35000);
  console.log(`[SCRAPE] Sanitized HTML size: ${(final.length / 1024).toFixed(2)} KB`);
  return final;
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const { url, context, competitors, customPageSpeedKey } = req.body;
  if (!url) return res.status(400).json({ error: 'URL is required' });

  const logId = Math.random().toString(36).substring(7);
  console.log(`[${logId}] [START] Audit requested: ${url}`);

  try {
    // 1. Scrape Main HTML
    console.log(`[${logId}] [STEP 1] Fetching live HTML...`);
    let mainHtml = "";
    try {
      const pageRes = await fetch(url, { 
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        signal: AbortSignal.timeout(10000)
      });
      mainHtml = sanitizeHtml(await pageRes.text());
    } catch (err) {
      console.error(`[${logId}] [STEP 1 ERROR] Scrape failed: ${err.message}`);
      mainHtml = `Failed to scrape ${url}. Proceeding with URL context only.`;
    }

    // 2. Scrape Competitors
    let competitorsHtmlStr = "";
    if (competitors && competitors.length > 0) {
      console.log(`[${logId}] [STEP 2] Processing ${competitors.length} competitors...`);
      for (const cUrl of competitors) {
        try {
          console.log(`[${logId}] [STEP 2] Scraping: ${cUrl}`);
          const cRes = await fetch(cUrl, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(6000) });
          const cHtml = sanitizeHtml(await cRes.text());
          competitorsHtmlStr += `--- COMPETITOR: ${cUrl} ---\n${cHtml.substring(0, 5000)}\n`;
        } catch (e) {
          console.warn(`[${logId}] [STEP 2 WARN] Failed ${cUrl}: ${e.message}`);
        }
      }
    }

    // 3. PageSpeed & Screenshot
    console.log(`[${logId}] [STEP 3] Running PageSpeed Insights...`);
    const psKey = customPageSpeedKey || apiKey;
    const psUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&category=performance${psKey ? `&key=${psKey}` : ''}`;
    
    let pageSpeedData = { scoreText: "Unavailable", screenshot: null, mimeType: "image/jpeg" };
    try {
      const psRes = await fetch(psUrl, { signal: AbortSignal.timeout(28000) });
      if (psRes.ok) {
        const psData = await psRes.json();
        const score = psData.lighthouseResult?.categories?.performance?.score * 100;
        pageSpeedData.scoreText = score ? `Performance Score: ${score}/100` : "Unavailable";
        const screenshotData = psData.lighthouseResult?.audits?.['final-screenshot']?.details?.data;
        if (screenshotData) {
            const match = screenshotData.match(/^data:([^;]+);base64,/);
            if (match) pageSpeedData.mimeType = match[1];
            pageSpeedData.screenshot = screenshotData.replace(/^data:image\/\w+;base64,/, "");
        }
        console.log(`[${logId}] [STEP 3] Success. Score: ${score}`);
      } else {
        console.warn(`[${logId}] [STEP 3 WARN] PageSpeed returned ${psRes.status}`);
      }
    } catch (err) {
      console.error(`[${logId}] [STEP 3 ERROR] PageSpeed failed: ${err.message}`);
    }

    // 4. Gemini Synthesis
    console.log(`[${logId}] [STEP 4] Preparing AI analysis...`);
    const model = "gemini-2.5-flash";
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    
    const promptText = `Act as an Elite CRO Director. Analyze ${url}.
[SOURCE]: 
${mainHtml}
[PAGESPEED]: ${pageSpeedData.scoreText}

[TASK]:
1. Executive Summary.
2. Strengths.
3. 5-8 Recommendations (id, category, issue, recommendation, expected_impact, implementation).
4. Competitor Gap Analysis.

[COMPETITORS]:
${competitorsHtmlStr || "N/A"}

[USER GOALS]:
${context || "N/A"}

OUTPUT: Valid JSON ONLY. No preamble.`;

    const parts = [{ text: promptText }];
    if (pageSpeedData.screenshot) {
      console.log(`[${logId}] [STEP 4] Attaching image (${(pageSpeedData.screenshot.length / 1024).toFixed(2)} KB)`);
      parts.push({ inlineData: { mimeType: pageSpeedData.mimeType, data: pageSpeedData.screenshot } });
    }

    console.log(`[${logId}] [STEP 4] Prompt: ${promptText.length} chars. Image: ${pageSpeedData.screenshot ? 'Yes' : 'No'}`);
    
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
    console.log(`[${logId}] [COMPLETE] Response in ${duration}ms. JSON length: ${geminiResult.candidates?.[0]?.content?.parts?.[0]?.text?.length || 0}`);

    const reportText = geminiResult.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!reportText) throw new Error("Empty response from AI engine.");

    let report = safeParseJSON(reportText);
    if (!report) {
      const isTruncated = reportText.length > 0 && !reportText.trim().endsWith("}");
      console.error(`[${logId}] [FATAL] Parse Failed. Truncated: ${isTruncated}. Raw Tail: ${reportText.slice(-100)}`);
      throw new Error(`Invalid data from AI (${reportText.length} chars). Try again.`);
    }

    console.log(`[${logId}] [SUCCESS] Report score: ${report.overall_score}. Recs: ${report.recommendations?.length}`);
    return res.status(200).json(report);

  } catch (err) {
    console.error(`[${logId}] [FATAL]`, err);
    return res.status(500).json({ error: err.message });
  }
}
