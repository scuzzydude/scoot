async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/v1${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error ?? "Request failed");
  return json.data as T;
}

export interface BalanceData {
  balance: number;
  address: string;
}

export interface Transaction {
  id: number;
  type: "send" | "receive";
  amount: number;
  from: string;
  to: string;
  createdAt: string;
}

export const scootApi = {
  getBalance: () => apiFetch<BalanceData>("/scoot/balance"),
  getTransactions: () => apiFetch<Transaction[]>("/scoot/transactions"),
  getAddress: () => apiFetch<{ address: string }>("/scoot/address"),
  send: (toUsername: string, amount: number) =>
    apiFetch<null>("/scoot/send", { method: "POST", body: JSON.stringify({ toUsername, amount }) }),
};
