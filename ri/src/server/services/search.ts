import { log } from "../log.js";

// Perplexity -> Tavily -> Gemini all confirmed dead (no working key, no path
// to get one). Replaced by scoot-pmp (self-hosted SearXNG + LLM synthesis),
// a sibling repo shared with the Steve project — see
// .claude/memory/bigmo_search_scoot_pmp.md. Set PMP_URL to enable; unset
// disables web search entirely (same "return null" degrade as before).
export async function searchWeb(query: string): Promise<string | null> {
  const base = process.env.PMP_URL;
  if (!base) {
    log.warn("PMP_URL not set, web search disabled");
    return null;
  }

  try {
    const res = await fetch(`${base}/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) {
      log.error({ status: res.status, query }, "scoot-pmp search failed");
      return null;
    }
    const data = (await res.json()) as { answer?: string; sources?: { title: string; url: string }[] };
    if (!data.answer) return null;

    const citations = (data.sources ?? []).map((s, i) => `[${i + 1}] ${s.title} — ${s.url}`).join("\n");
    return citations ? `${data.answer}\n\nSources:\n${citations}` : data.answer;
  } catch (err) {
    log.error({ err, query }, "scoot-pmp search threw");
    return null;
  }
}
