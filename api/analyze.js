
const apiKey = process.env.VITE_GEMINI_API_KEY || "";

// --- HELPERS FROM APP.JSX ---
const REPORT_SCHEMA_PROPERTIES = {
  overall_score: { type: "number", description: "CRITICAL: Must be first. Score from 1 to 100" },
  summary: { type: "string" },
  strengths: { type: "array", items: { type: "string" } },
  quick_wins: { type: "array", items: { type: "string" } },
  recommendations: {
    type: "array",
    description: "Maximum 5 high-impact recommendations",
    items: {
      type: "object",
      properties: {
        id: { type: "number" },
        priority: { type: "string" },
        category: { type: "string" },
        issue: { type: "string" },
        recommendation: { type: "string" },
        expected_impact: { type: "string" },
        implementation: { type: "string" }
      }
    }
  },
  competitor_analysis: {
    type: "object",
    properties: {
      overview: { type: "string" },
      comparisons: {
        type: "array",
        items: {
          type: "object",
          properties: {
            competitor: { type: "string" },
            difference: { type: "string" },
            advantage: { type: "string" }
          }
        }
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
    // If it's very truncated, we might need more aggressive repair, 
    // but usually closing the current path is enough.
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
    return JSON.parse(repaired); 
  } catch (e) {
    console.error("JSON Parse Critical Failure. Length:", text.length);
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
    .replace(/class="[^"]*"/gi, '')
    .replace(/style="[^"]*"/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  
  const final = cleaned.substring(0, 30000);
  return final;
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const { url, context, competitors, customPageSpeedKey } = req.body;
  if (!url) return res.status(400).json({ error: 'URL is required' });

  const logId = Math.random().toString(36).substring(7);
  console.log(`[${logId}] [START] Audit for ${url}`);

  try {
    // 1. Scrape
    let mainHtml = "";
    try {
      const pageRes = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(10000) });
      mainHtml = sanitizeHtml(await pageRes.text());
      console.log(`[${logId}] [STEP 1] Scraped ${mainHtml.length} chars`);
    } catch (err) {
      console.error(`[${logId}] [STEP 1 ERROR] ${err.message}`);
    }

    // 2. Competitors
    let competitorsHtmlStr = "";
    if (competitors && competitors.length > 0) {
      console.log(`[${logId}] [STEP 2] Processing ${competitors.length} competitors...`);
      for (const cUrl of competitors.slice(0, 2)) {
        try {
          const cRes = await fetch(cUrl, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(6000) });
          const cHtml = sanitizeHtml(await cRes.text());
          competitorsHtmlStr += `--- COMPETITOR: ${cUrl} ---\n${cHtml.substring(0, 3000)}\n`;
        } catch (e) {
          console.warn(`[${logId}] [STEP 2 WARN] Failed ${cUrl}: ${e.message}`);
        }
      }
    }

    // 3. PageSpeed
    const psKey = customPageSpeedKey || apiKey;
    const psUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&category=performance${psKey ? `&key=${psKey}` : ''}`;
    let pageSpeedData = { scoreText: "Unavailable", screenshot: null, mimeType: "image/jpeg" };
    
    try {
      console.log(`[${logId}] [STEP 3] Calling PageSpeed...`);
      const psRes = await fetch(psUrl, { signal: AbortSignal.timeout(45000) });
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
        console.log(`[${logId}] [STEP 2] PageSpeed Success: ${score}`);
      } else {
        const errText = await psRes.text();
        console.warn(`[${logId}] [STEP 2 WARN] PageSpeed ${psRes.status}: ${errText.substring(0, 200)}`);
      }
    } catch (err) {
      console.error(`[${logId}] [STEP 2 ERROR] ${err.message}`);
    }

    // 3. AI
    console.log(`[${logId}] [STEP 3] Preparing Gemini Flash...`);
    const model = "gemini-2.5-flash";
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    
    const promptText = `Act as an Elite CRO Director. Analyze the following and the screenshot.
[RULES]: 
1. BE CONCISE. Max 40 words per recommendation.
2. OVERALL_SCORE MUST BE THE FIRST KEY.
3. Max 5 recommendations.

[SOURCE]: 
${mainHtml}
[PAGESPEED]: ${pageSpeedData.scoreText}
[COMPETITORS]: 
${competitorsHtmlStr || "None"}
[USER GOALS]: ${context || "N/A"}

OUTPUT: Valid JSON ONLY. No preamble.`;

    const parts = [{ text: promptText }];
    if (pageSpeedData.screenshot) {
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
          responseSchema: { type: "object", properties: REPORT_SCHEMA_PROPERTIES },
          temperature: 0.1,
          maxOutputTokens: 8192
        }
      })
    });

    const duration = Date.now() - startTime;
    console.log(`[${logId}] AI Finish in ${duration}ms.`);

    const reportText = geminiResult.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!reportText) throw new Error("AI returned no text content.");

    console.log(`[${logId}] [DEBUG] Raw Response Length: ${reportText.length}`);
    
    let report = safeParseJSON(reportText);
    if (!report) {
       console.error(`[${logId}] [DEBUG] Raw Content: ${reportText.substring(0, 1000)}`);
       throw new Error("AI data failed to parse. Try again.");
    }

    console.log(`[${logId}] [DEBUG] Parsed Keys: ${Object.keys(report).join(', ')}`);
    console.log(`[${logId}] [DEBUG] Rec count: ${report.recommendations?.length || 0}`);

    if (report.recommendations?.length === 0) {
        console.warn(`[${logId}] [WARN] AI returned empty recommendations list.`);
    }

    console.log(`[${logId}] [SUCCESS] Delivery successful.`);
    return res.status(200).json(report);

  } catch (err) {
    console.error(`[${logId}] [FATAL]`, err);
    return res.status(500).json({ error: err.message });
  }
}
