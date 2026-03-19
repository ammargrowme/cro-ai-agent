const apiKey = process.env.VITE_GEMINI_API_KEY || "";

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const { history, systemInstruction } = req.body;

  try {
    const model = "gemini-2.5-flash";
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const fullSystemInstruction = `${systemInstruction}

RESPONSE FORMAT — You MUST return valid JSON with this exact structure:
{
  "message": "Your conversational response to the user.",
  "updated_report": null,
  "learning_insight": null
}

RULES:
1. "message" is REQUIRED. Write like an expert CRO strategist. Be concise but insightful. Reference specific data from the report — scores, checklist categories, and recommendation IDs.
2. "updated_report" — If the user asks you to change, add, or remove recommendations, return the FULL updated report object (with all existing fields: overall_score, summary, strengths, quick_wins, recommendations, competitor_analysis, checklist_scores, checklist_flags). If no changes requested, set to null.
3. "learning_insight" — ACTIVELY look for reusable CRO insights in EVERY conversation. Extract whenever:
   - The user says something worked or didn't work on their site
   - The user corrects a recommendation with real-world data
   - The user shares business context that changes CRO priorities
   - A pattern emerges about their industry, audience, or conversion goals
   - The user confirms or denies an AI assumption
   Format: Short, actionable string (MAX 30 words). Examples: "B2B SaaS sites need demo CTA over free trial for enterprise buyers", "E-commerce sites with sticky add-to-cart see 15% higher mobile conversion".
   If truly nothing notable, set to null — but err on the side of extracting insights.
4. When updating the report, NEVER remove existing data — only modify or add.
5. Reference recommendations by their ID and category.
6. If user says a recommendation doesn't apply or is already done, acknowledge it and replace it in the updated_report with a NEW recommendation that addresses a DIFFERENT checklist weakness.
7. When the user provides feedback about their specific business (industry, audience, goals), use it to re-prioritize and sharpen ALL recommendations, not just the one discussed.
8. Proactively suggest next steps: "Would you like me to update recommendation #X based on this?" or "Should I adjust the report to reflect this?"
9. When referencing checklist scores, mention specific numbers: "Your CTA score is 45/100 — here's why..."
10. If the user's feedback contradicts a recommendation, explain WHY the original recommendation was made (what checklist item it addressed) before replacing it.`;

    const payload = {
      systemInstruction: {
        parts: [{ text: fullSystemInstruction }]
      },
      contents: history.map(msg => ({
        role: msg.role === 'user' ? 'user' : 'model',
        parts: msg.parts
      })),
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "object",
          properties: {
            message: { type: "string", description: "Your conversational response" },
            updated_report: {
              type: "object",
              description: "Full updated report if changes were made. Omit or set null if no changes.",
              nullable: true,
              properties: {
                overall_score: { type: "number" },
                summary: { type: "string" },
                strengths: { type: "array", items: { type: "string" } },
                quick_wins: { type: "array", items: { type: "string" } },
                recommendations: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      id: { type: "number" },
                      priority: { type: "string" },
                      category: { type: "string" },
                      issue: { type: "string" },
                      recommendation: { type: "string" },
                      expected_impact: { type: "string" },
                      implementation: { type: "string" },
                      checklist_ref: { type: "string" }
                    }
                  }
                },
                checklist_scores: { type: "object" },
                checklist_flags: { type: "array", items: { type: "string" } }
              }
            },
            learning_insight: {
              type: "string",
              description: "Reusable CRO insight from this conversation, or null",
              nullable: true
            }
          },
          required: ["message"]
        },
        temperature: 0.3,
        maxOutputTokens: 4096
      }
    };

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[CHAT ERROR] HTTP", response.status, errorText.substring(0, 300));
      return res.status(response.status).json({ error: errorText });
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) throw new Error("Empty response from AI");

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      const cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim();
      try {
        parsed = JSON.parse(cleaned);
      } catch (e2) {
        // Fallback: treat raw text as the message
        parsed = { message: text, updated_report: null, learning_insight: null };
      }
    }

    if (!parsed.message) {
      parsed.message = "I processed your request but couldn't generate a proper response. Please try again.";
    }

    return res.status(200).json(parsed);
  } catch (err) {
    console.error("[CHAT ERROR]", err);
    return res.status(500).json({ error: err.message });
  }
}
