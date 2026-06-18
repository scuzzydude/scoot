import type { RegisterInput, LoginRequestInput, LoginVerifyInput } from "@shared/schema.js";

interface UserData {
  id: number;
  username: string;
  email: string;
  displayName: string | null;
  isBot: boolean;
  isStaked: boolean;
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
};
