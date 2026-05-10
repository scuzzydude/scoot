import type { RegisterInput, LoginInput } from "@shared/schema.js";

interface UserData {
  id: number;
  username: string;
  email: string;
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
    apiFetch<UserData>("/auth/register", { method: "POST", body: JSON.stringify(data) }),

  login: (data: LoginInput) =>
    apiFetch<UserData>("/auth/login", { method: "POST", body: JSON.stringify(data) }),

  logout: () =>
    apiFetch<null>("/auth/logout", { method: "POST" }),
};
