import { log } from "../log.js";

const PERPLEXITY_API_URL = "https://api.perplexity.ai/chat/completions";
const PERPLEXITY_MODEL = "sonar";

const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";

// Tries Perplexity first, falls back to Gemini with Google Search grounding, returns null if neither key is set.
export async function searchWeb(query: string): Promise<string | null> {
  if (process.env.PERPLEXITY_API_KEY) {
    return searchWithPerplexity(query);
  }
  if (process.env.GEMINI_API_KEY) {
    return searchWithGemini(query);
  }
  log.warn("No search API key set (PERPLEXITY_API_KEY or GEMINI_API_KEY), skipping search");
  return null;
}

async function searchWithPerplexity(query: string): Promise<string | null> {
  try {
    const res = await fetch(PERPLEXITY_API_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.PERPLEXITY_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: PERPLEXITY_MODEL,
        messages: [{ role: "user", content: query }],
        max_tokens: 300,
      }),
    });
    if (!res.ok) {
      log.error({ status: res.status, query }, "Perplexity search failed");
      return null;
    }
    const data = await res.json() as { choices?: { message?: { content?: string } }[] };
    return data.choices?.[0]?.message?.content ?? null;
  } catch (err) {
    log.error({ err, query }, "Perplexity search threw");
    return null;
  }
}

async function searchWithGemini(query: string): Promise<string | null> {
  try {
    const url = `${GEMINI_API_URL}?key=${process.env.GEMINI_API_KEY}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: query }], role: "user" }],
        tools: [{ google_search: {} }],
      }),
    });
    if (!res.ok) {
      log.error({ status: res.status, query }, "Gemini search failed");
      return null;
    }
    const data = await res.json() as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    return data.candidates?.[0]?.content?.parts?.[0]?.text ?? null;
  } catch (err) {
    log.error({ err, query }, "Gemini search threw");
    return null;
  }
}
