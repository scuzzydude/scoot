import type { NavItem } from "@shared/schema.js";

export interface ScootConfig {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  logoUrl: string | null;
  labelMap: Record<string, string>;
  featureFlags: Record<string, boolean>;
  navItems: NavItem[];
  userFlags: string;  // 64-bit per-scoot permission bitmask as text
}

export interface ScootPageSummary {
  id: number;
  slug: string;
  title: string;
  navLabel: string | null;
  navOrder: number;
}

export interface PageBlock {
  id: number;
  blockType: "markdown" | "image" | "link_list" | "component";
  blockOrder: number;
  content: Record<string, unknown>;
}

export interface ScootPageFull extends ScootPageSummary {
  blocks: PageBlock[];
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

// §8.7 LEADER oversight — one message across any room, author + room resolved.
export interface OversightMessage {
  id: number;
  roomId: number;
  roomName: string | null;
  userId: number;
  author: string;
  content: string;
  createdAt: string;
}

function pageQuery(opts?: { limit?: number; beforeId?: number }): string {
  const q = new URLSearchParams();
  if (opts?.limit) q.set("limit", String(opts.limit));
  if (opts?.beforeId) q.set("beforeId", String(opts.beforeId));
  const s = q.toString();
  return s ? `?${s}` : "";
}

export const scootsApi = {
  list: () => apiFetch<ScootConfig[]>("/scoots"),
  get: (id: number) => apiFetch<ScootConfig>(`/scoots/${id}`),
  listPages: (scootId: number) => apiFetch<ScootPageSummary[]>(`/scoots/${scootId}/pages`),
  getPage: (scootId: number, slug: string) => apiFetch<ScootPageFull>(`/scoots/${scootId}/pages/${slug}`),
  // LEADER-only (server 403s otherwise): all messages across all rooms.
  oversightMessages: (scootId: number, opts?: { limit?: number; beforeId?: number }) =>
    apiFetch<OversightMessage[]>(`/scoots/${scootId}/oversight/messages${pageQuery(opts)}`),
};

// Per-Scoot LEADER bit (ScootFlags.LEADER = 1<<3) test on the text bitmask.
export function hasLeader(userFlags: string | undefined | null): boolean {
  if (!userFlags) return false;
  try { return (BigInt(userFlags) & 8n) !== 0n; } catch { return false; }
}
