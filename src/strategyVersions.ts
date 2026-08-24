import type { StrategySchema } from "./types";

function versionParts(version: string): number[] {
  return version.split(".").map((part) => Number(part));
}

export function compareVersions(left: string, right: string): number {
  const a = versionParts(left);
  const b = versionParts(right);
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    const difference = (a[index] || 0) - (b[index] || 0);
    if (difference) return difference;
  }
  return 0;
}

export function strategyKeys(strategies: StrategySchema[]): string[] {
  return Array.from(new Set(strategies.map((strategy) => strategy.key)));
}

export function versionsForStrategy(strategies: StrategySchema[], key: string): StrategySchema[] {
  return strategies
    .filter((strategy) => strategy.key === key)
    .sort((left, right) => compareVersions(right.version, left.version));
}

export function latestStrategyVersion(strategies: StrategySchema[], key: string): StrategySchema | undefined {
  return versionsForStrategy(strategies, key)[0];
}
