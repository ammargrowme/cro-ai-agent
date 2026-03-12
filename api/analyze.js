
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
        console.error(`Fetch error ${response.status}:`, errBody);
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

const sanitizeHtml = (rawHtml) => {
  return rawHtml
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, '[ICON]')
    .substring(0, 30000); // Increased limit as we are server-side
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
    console.log(`[PAGESPEED] Fetching metrics...`);
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
            // Detect mime type
            const match = screenshotData.match(/^data:([^;]+);base64,/);
            if (match) pageSpeedData.mimeType = match[1];
            pageSpeedData.screenshot = screenshotData.replace(/^data:image\/\w+;base64,/, "");
        }
        console.log(`[PAGESPEED] Success. Score: ${score || 'N/A'}`);
      } else {
        console.warn(`[PAGESPEED] API returned status ${psRes.status}`);
      }
    } catch (err) {
      console.error(`[PAGESPEED] Failed: ${err.message}`);
    }

    // 4. Gemini Synthesis
    console.log(`[GEMINI] Calling AI model...`);
    const model = "gemini-2.5-flash";
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    
    let promptText = `Act as an elite CRO analyst. Audit: ${url}.\n\n[HTML]:\n${mainHtml}\n\n[PAGESPEED]:\n${pageSpeedData.scoreText}\n`;
    if (competitorsHtmlStr) promptText += `\n[COMPETITORS]:\n${competitorsHtmlStr}\n`;
    if (context) promptText += `\n[USER GOALS]:\n${context}\n`;
    promptText += `\nOutput strictly valid JSON matching the schema.`;

    const parts = [{ text: promptText }];
    if (pageSpeedData.screenshot) {
      parts.push({
        inlineData: {
          mimeType: pageSpeedData.mimeType,
          data: pageSpeedData.screenshot
        }
      });
    }

    const geminiPayload = {
      contents: [{ parts }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: { type: "OBJECT", properties: REPORT_SCHEMA_PROPERTIES },
        temperature: 0.1
      }
    };

    const geminiResult = await fetchWithRetry(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(geminiPayload)
    });

    const reportText = geminiResult.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!reportText) throw new Error("Empty response from AI");

    const report = JSON.parse(reportText);
    console.log(`[SUCCESS] Report generated for ${url}`);
    
    return res.status(200).json(report);

  } catch (err) {
    console.error(`[FATAL ERROR]`, err);
    return res.status(500).json({ error: err.message });
  }
}
