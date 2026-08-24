import type { StrategySchema } from "./types";

export function compatibleTimeframes(strategy: StrategySchema | undefined, available: string[]): string[] {
  if (!strategy?.required_timeframe) return available;
  return available.filter((timeframe) => timeframe === strategy.required_timeframe);
}

export function preferredTimeframe(strategy: StrategySchema | undefined, available: string[]): string {
  return compatibleTimeframes(strategy, available)[0] || "";
}
