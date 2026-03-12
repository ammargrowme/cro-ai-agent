
const apiKey = process.env.VITE_GEMINI_API_KEY || "";

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const { history, systemInstruction, report } = req.body;
  
  try {
    const model = "gemini-2.5-flash";
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const payload = {
      systemInstruction: {
        parts: [{ text: systemInstruction }]
      },
      contents: history.map(msg => ({ 
        role: msg.role === 'user' ? 'user' : 'model', 
        parts: msg.parts 
      })),
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.1
      }
    };

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      return res.status(response.status).json({ error: errorText });
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    
    if (!text) throw new Error("Empty response from AI");

    return res.status(200).json(JSON.parse(text));
  } catch (err) {
    console.error("[CHAT ERROR]", err);
    return res.status(500).json({ error: err.message });
  }
}
