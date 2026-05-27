import { log } from "../log.js";

const PERPLEXITY_API_URL = "https://api.perplexity.ai/chat/completions";
const PERPLEXITY_MODEL = "sonar";  // online search model

export async function searchWeb(query: string): Promise<string | null> {
  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) {
    log.warn("PERPLEXITY_API_KEY not set, skipping search");
    return null;
  }

  try {
    const res = await fetch(PERPLEXITY_API_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
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
