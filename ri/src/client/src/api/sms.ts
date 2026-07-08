// §8.8 — the member's SMS transcript (sms_deliveries rendered as a conversation).

export interface SmsLogItem {
  id: number;
  direction: "in" | "out";
  body: string;
  roomId: number | null;
  roomName: string | null;
  twilioSid: string | null;
  createdAt: string;
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/v1${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error ?? "Request failed");
  return json.data as T;
}

export const smsApi = {
  // The caller's own transcript, newest-first.
  log: (opts?: { limit?: number; beforeId?: number }) => {
    const q = new URLSearchParams();
    if (opts?.limit) q.set("limit", String(opts.limit));
    if (opts?.beforeId) q.set("beforeId", String(opts.beforeId));
    const qs = q.toString();
    return apiFetch<SmsLogItem[]>(`/sms/log${qs ? `?${qs}` : ""}`);
  },
};
