import { describe, expect, it } from "vitest";
import { latestStrategyVersion, strategyKeys, versionsForStrategy } from "./strategyVersions";
import type { StrategySchema } from "./types";

const strategy = (key: string, version: string): StrategySchema => ({
  id: `${key}@${version}`,
  key,
  name: key,
  version,
  file_dir: `backend/app/strategies/${key} [${version}].py`,
  version_notes: `${version} notes`,
  required_timeframe: null,
  parameters: [],
});

describe("strategy versions", () => {
  const strategies = [strategy("reclaim", "1.0.0"), strategy("other", "2.0.0"), strategy("reclaim", "1.10.0"), strategy("reclaim", "1.1.0")];

  it("keeps each strategy family once", () => {
    expect(strategyKeys(strategies)).toEqual(["reclaim", "other"]);
  });

  it("orders versions semantically and selects the latest", () => {
    expect(versionsForStrategy(strategies, "reclaim").map((item) => item.version)).toEqual(["1.10.0", "1.1.0", "1.0.0"]);
    expect(latestStrategyVersion(strategies, "reclaim")?.id).toBe("reclaim@1.10.0");
  });
});
