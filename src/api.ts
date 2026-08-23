import type { Analysis, StrategySchema } from "./types";

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.detail || `Request failed (${response.status})`);
  return payload as T;
}

export const api = {
  catalog: () => request<{ datasets: Record<string, string[]> }>("/api/catalog"),
  strategies: () => request<{ strategies: StrategySchema[] }>("/api/strategies"),
  analyze: (body: Record<string, unknown>) =>
    request<Analysis>("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
};
