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

// Global sequential SMS log row (TEXT_AUDIT gated) — carries whose text it is.
export interface AllSmsLogItem {
  id: number;
  direction: "in" | "out";
  body: string;
  roomId: number | null;
  roomName: string | null;
  twilioSid: string | null;
  createdAt: string;
  userId: number;
  who: string;
}

// Staking catalog (Phase 4 continued) — "Brotherhood public info, but
// restricted": staked-members-only. See arch/staking.md.
export type Tier = "member" | "senior" | "og";

export interface CatalogEdge {
  pledgeId: number;
  stakerId: number;
  stakerName: string;
  stakeeId: number;
  stakeeName: string;
  selfieUrl: string;
  tier: Tier;
  createdAt: string;
}
export interface CatalogLegacyMember {
  userId: number;
  name: string;
  tier: Tier;
}
export interface TrustCatalog {
  root: { userId: number; name: string; selfieUrl: string | null };
  edges: CatalogEdge[];
  legacyMembers: CatalogLegacyMember[];
  viewerCanSelfStake: boolean;
}

export const scootsApi = {
  list: () => apiFetch<ScootConfig[]>("/scoots"),
  get: (id: number) => apiFetch<ScootConfig>(`/scoots/${id}`),
  listPages: (scootId: number) => apiFetch<ScootPageSummary[]>(`/scoots/${scootId}/pages`),
  getPage: (scootId: number, slug: string) => apiFetch<ScootPageFull>(`/scoots/${scootId}/pages/${slug}`),
  // LEADER-only (server 403s otherwise): all messages across all rooms.
  oversightMessages: (scootId: number, opts?: { limit?: number; beforeId?: number }) =>
    apiFetch<OversightMessage[]>(`/scoots/${scootId}/oversight/messages${pageQuery(opts)}`),
  // TEXT_AUDIT-only: the global sequential SMS log (every user's texts).
  allTexts: (scootId: number, opts?: { limit?: number; beforeId?: number }) =>
    apiFetch<AllSmsLogItem[]>(`/scoots/${scootId}/oversight/all-texts${pageQuery(opts)}`),
  // Staked-members-only: the trust graph catalog.
  stakingCatalog: (scootId: number) => apiFetch<TrustCatalog>(`/scoots/${scootId}/staking-catalog`),
  // Hard-gated server-side (ROOT_USER_ID + ScootFlags.ENGINEER) — selfieUrl from
  // an already-uploaded file (chatApi.uploadMedia).
  selfStake: (scootId: number, selfieUrl: string) =>
    apiFetch<void>(`/scoots/${scootId}/self-stake`, { method: "POST", body: JSON.stringify({ selfieUrl }) }),
};

function hasBit(userFlags: string | undefined | null, bit: bigint): boolean {
  if (!userFlags) return false;
  try { return (BigInt(userFlags) & bit) !== 0n; } catch { return false; }
}
// Per-Scoot LEADER bit (ScootFlags.LEADER = 1<<3).
export const hasLeader = (userFlags: string | undefined | null) => hasBit(userFlags, 8n);
// Per-Scoot TEXT_AUDIT bit (ScootFlags.TEXT_AUDIT = 1<<7) — may see all texts.
export const hasTextAudit = (userFlags: string | undefined | null) => hasBit(userFlags, 128n);
// Per-Scoot STAKED bit (ScootFlags.STAKED = 1<<2) — gates the staking catalog.
export const hasStaked = (userFlags: string | undefined | null) => hasBit(userFlags, 4n);
