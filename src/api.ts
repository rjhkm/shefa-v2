import type { Analysis, ChartPayload, RunSummary, SavedRun, StrategySchema } from "./types";

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.detail || `Request failed (${response.status})`);
  return payload as T;
}

export const api = {
  catalog: () => request<{ datasets: Record<string, string[]> }>("/api/catalog"),
  strategies: () => request<{ strategies: StrategySchema[] }>("/api/strategies"),
  datasetRange: (pair: string, timeframe: string, sourceTimezone = "") => request<{ start_time: string; end_time: string }>(`/api/dataset-range?pair=${encodeURIComponent(pair)}&timeframe=${encodeURIComponent(timeframe)}&source_timezone=${encodeURIComponent(sourceTimezone)}`),
  runs: () => request<{ runs: RunSummary[] }>("/api/runs"),
  run: (runId: string) => request<SavedRun>(`/api/runs/${encodeURIComponent(runId)}`),
  runChart: (runId: string, startTime: string, endTime: string) => request<ChartPayload>(`/api/runs/${encodeURIComponent(runId)}/chart?start_time=${encodeURIComponent(startTime)}&end_time=${encodeURIComponent(endTime)}`),
  analyze: (body: Record<string, unknown>) =>
    request<Analysis>("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
};
