async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/v1${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error ?? "Request failed");
  return json.data as T;
}

export type BotMode = "full" | "cotb";

export interface BotHistoryEntry {
  role: string;
  content: string;
}

export const botApi = {
  sendMessage: (content: string, mode: BotMode = "full") =>
    apiFetch<{ reply: string; mode: BotMode }>("/bot/message", {
      method: "POST",
      body: JSON.stringify({ content, mode }),
    }),

  getHistory: (mode: BotMode = "full") =>
    apiFetch<BotHistoryEntry[]>(`/bot/history?mode=${mode}`),

  reset: () => apiFetch<null>("/bot/reset", { method: "POST" }),
};
