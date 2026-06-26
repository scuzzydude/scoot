// BigMo long-term memory via Memory Vault (self-hosted Postgres + pgvector
// hybrid search, reached over its REST API). This is a semantic recall layer
// ON TOP of the room-scoped conversation history in `conversation.ts`: history
// gives BigMo the last few turns in one room; this gives it relevant facts a
// Brother mentioned weeks ago, in any room.
//
// HARD RULE: every call degrades gracefully. The vault is optional infra — if
// MEMORY_VAULT_URL is unset, or the service is down/slow, BigMo must reply
// exactly as it would without it. A memory lookup is never allowed to break or
// delay an SMS reply. See .claude/memory/infra_memory_vault.md.
import { log } from "../log.js";

const BASE_URL = process.env.MEMORY_VAULT_URL ?? "";
const TOKEN = process.env.MEMORY_VAULT_TOKEN ?? "";
const TIMEOUT_MS = Number(process.env.MEMORY_VAULT_TIMEOUT_MS ?? 2500);

export function memoryEnabled(): boolean {
  return BASE_URL.length > 0;
}

function authHeaders(): Record<string, string> {
  const h: Record<string, string> = { "content-type": "application/json" };
  if (TOKEN) h["authorization"] = `Bearer ${TOKEN}`;
  return h;
}

// One POST helper with a hard timeout; returns parsed JSON or null on any
// failure (disabled, timeout, non-2xx, parse error). Never throws.
async function post(path: string, body: unknown): Promise<unknown | null> {
  if (!memoryEnabled()) return null;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(body),
      signal: ctl.signal,
    });
    if (!res.ok) {
      log.warn({ path, status: res.status }, "memory-vault: non-OK response (degrading)");
      return null;
    }
    return await res.json();
  } catch (err) {
    log.warn({ err, path }, "memory-vault: call failed (degrading)");
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// Spaces must exist before ingest (the API rejects unknown spaces). Create once
// per process per space; a 4xx "already exists" is fine — we mark it ensured so
// we never retry, and ingest below proceeds regardless.
const ensured = new Set<string>();
async function ensureSpace(space: string): Promise<void> {
  if (!memoryEnabled() || ensured.has(space)) return;
  await post("/api/spaces", { name: space, description: "BigMo SMS memory" });
  ensured.add(space);
}

export interface RecalledMemory {
  content: string;
  similarity: number;
  speaker: string | null;
}

// Hybrid-search the given space for memories relevant to `query`. Returns at
// most `limit` hits at or above `floor` similarity, best first. [] on anything
// unexpected.
export async function recall(
  query: string,
  space: string,
  opts?: { limit?: number; floor?: number },
): Promise<RecalledMemory[]> {
  const limit = opts?.limit ?? 4;
  const floor = opts?.floor ?? 0.25;
  const data = (await post("/api/search", { query, spaces: [space], limit })) as
    | { results?: { content: string; similarity: number; speaker: string | null }[] }
    | null;
  if (!data?.results) return [];
  return data.results
    .filter((r) => typeof r.similarity === "number" && r.similarity >= floor)
    .map((r) => ({ content: r.content, similarity: r.similarity, speaker: r.speaker ?? null }));
}

// Store a member's message as a durable memory, attributed to `speaker`.
// Fire-and-forget at the call site; this resolves quietly on failure.
export async function remember(text: string, space: string, speaker: string | null): Promise<void> {
  if (!memoryEnabled()) return;
  await ensureSpace(space);
  await post("/api/ingest/text", {
    text,
    space,
    source: "bigmo-sms",
    ...(speaker ? { speaker } : {}),
  });
}
