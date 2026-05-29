import { log } from "../log.js";

const PERPLEXITY_API_URL = "https://api.perplexity.ai/chat/completions";
const PERPLEXITY_MODEL = "sonar";

const TAVILY_API_URL = "https://api.tavily.com/search";

const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
// gemini-2.0-flash has a free-tier quota of 0 on some keys; 2.5-flash works on
// the free tier. Override with GEMINI_MODEL if needed.
const GEMINI_MODEL = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";

// Priority: Perplexity → Tavily → Gemini → null
export async function searchWeb(query: string): Promise<string | null> {
  if (process.env.PERPLEXITY_API_KEY) return searchWithPerplexity(query);
  if (process.env.TAVILY_API_KEY)     return searchWithTavily(query);
  if (process.env.GEMINI_API_KEY)     return searchWithGemini(query);
  log.warn("no search API key set (PERPLEXITY_API_KEY, TAVILY_API_KEY, or GEMINI_API_KEY)");
  return null;
}

async function searchWithPerplexity(query: string): Promise<string | null> {
  try {
    const res = await fetch(PERPLEXITY_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.PERPLEXITY_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: PERPLEXITY_MODEL,
        messages: [{ role: "user", content: query }],
        max_tokens: 300,
      }),
    });
    if (!res.ok) { log.error({ status: res.status, query }, "Perplexity search failed"); return null; }
    const data = await res.json() as { choices?: { message?: { content?: string } }[] };
    return data.choices?.[0]?.message?.content ?? null;
  } catch (err) {
    log.error({ err, query }, "Perplexity search threw");
    return null;
  }
}

async function searchWithTavily(query: string): Promise<string | null> {
  try {
    const res = await fetch(TAVILY_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.TAVILY_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query,
        search_depth: "basic",
        max_results: 3,
        include_answer: true,
      }),
    });
    if (!res.ok) { log.error({ status: res.status, query }, "Tavily search failed"); return null; }
    const data = await res.json() as { answer?: string; results?: { content: string }[] };
    // Prefer the synthesized answer; fall back to concatenating top results
    if (data.answer) return data.answer;
    return data.results?.map((r) => r.content).join("\n\n") ?? null;
  } catch (err) {
    log.error({ err, query }, "Tavily search threw");
    return null;
  }
}

async function searchWithGemini(query: string): Promise<string | null> {
  try {
    const url = `${GEMINI_API_BASE}/${GEMINI_MODEL}:generateContent?key=${process.env.GEMINI_API_KEY}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: query }], role: "user" }],
        tools: [{ googleSearch: {} }],
      }),
    });
    if (!res.ok) { log.error({ status: res.status, query }, "Gemini search failed"); return null; }
    const data = await res.json() as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    return data.candidates?.[0]?.content?.parts?.[0]?.text ?? null;
  } catch (err) {
    log.error({ err, query }, "Gemini search threw");
    return null;
  }
}
