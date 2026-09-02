import type { RegisterInput, LoginRequestInput, LoginVerifyInput } from "@shared/schema.js";

export interface UserData {
  id: number;
  username: string;
  email: string;
  displayName: string | null;
  isBot: boolean;
  isStaked: boolean;
  /** Set while Root is viewing the app as this user (read-only). */
  impersonating: { actorId: number; actorUsername: string; actorDisplayName: string | null } | null;
  /** True for the real Root user, whether or not a view-as is active. */
  canImpersonate: boolean;
}

export interface ImpersonationTarget {
  id: number;
  username: string;
  displayName: string | null;
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

export const authApi = {
  me: () => apiFetch<UserData | null>("/auth/me").catch(() => null),

  register: (data: RegisterInput) =>
    apiFetch<{ id: number; username: string }>("/auth/register", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  loginRequest: (data: LoginRequestInput) =>
    apiFetch<null>("/auth/login/request", { method: "POST", body: JSON.stringify(data) }),

  loginVerify: (data: LoginVerifyInput) =>
    apiFetch<UserData>("/auth/login/verify", { method: "POST", body: JSON.stringify(data) }),

  logout: () => apiFetch<null>("/auth/logout", { method: "POST" }),

  impersonationTargets: () => apiFetch<ImpersonationTarget[]>("/auth/impersonate/targets"),

  impersonate: (userId: number) =>
    apiFetch<ImpersonationTarget>("/auth/impersonate", { method: "POST", body: JSON.stringify({ userId }) }),

  stopImpersonation: () => apiFetch<null>("/auth/impersonate/stop", { method: "POST" }),
};
