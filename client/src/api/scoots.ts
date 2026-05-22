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
  role: string;
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

export const scootsApi = {
  list: () => apiFetch<ScootConfig[]>("/scoots"),
  get: (id: number) => apiFetch<ScootConfig>(`/scoots/${id}`),
  listPages: (scootId: number) => apiFetch<ScootPageSummary[]>(`/scoots/${scootId}/pages`),
  getPage: (scootId: number, slug: string) => apiFetch<ScootPageFull>(`/scoots/${scootId}/pages/${slug}`),
};
