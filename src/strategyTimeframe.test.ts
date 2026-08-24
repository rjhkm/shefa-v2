import { describe, expect, it } from "vitest";
import { compatibleTimeframes, preferredTimeframe } from "./strategyTimeframe";
import type { StrategySchema } from "./types";

const strategy = (required_timeframe: string | null): StrategySchema => ({
  id: "fixture@1.0.0",
  key: "fixture",
  name: "Fixture",
  version: "1.0.0",
  file_dir: "backend/app/strategies/Fixture [1.0.0].py",
  version_notes: "Fixture version",
  required_timeframe,
  parameters: [],
});

describe("strategy timeframe compatibility", () => {
  it("locks a multi-timeframe strategy to its M1 source", () => {
    const available = ["1m", "5m", "1h"];
    expect(compatibleTimeframes(strategy("1m"), available)).toEqual(["1m"]);
    expect(preferredTimeframe(strategy("1m"), available)).toBe("1m");
  });

  it("returns no selection when the required source is missing", () => {
    expect(preferredTimeframe(strategy("1m"), ["5m", "1h"])).toBe("");
  });

  it("keeps every dataset available for single-timeframe strategies", () => {
    expect(compatibleTimeframes(strategy(null), ["5m", "1h"])).toEqual(["5m", "1h"]);
  });
});
