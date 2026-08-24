import { describe, expect, it } from "vitest";
import { analyzeTrades } from "./backtestAnalytics";
import type { Trade } from "./types";

function trade(id: number, exit: string, net: number, resultR: number, costs = 2): Trade {
  return {
    trade_id: id,
    direction: "long",
    quantity: 1,
    signal_time: exit,
    entry_time: new Date(Date.parse(exit) - 3_600_000).toISOString(),
    entry_price: 100,
    initial_stop: 99,
    initial_target: 102,
    initial_risk_cash: 50,
    exit_time: exit,
    exit_price: 101,
    exit_reason: "target",
    gross_pnl: net + costs,
    spread_cost: costs,
    slippage_cost: 0,
    commission_cost: 0,
    net_pnl: net,
    result_r: resultR,
    holding_bars: 4,
    signal_reason: "fixture",
    strategy_context: {},
    entry_gap_price: 0,
    entry_gap_r: 0,
    max_favorable_r: 1,
    max_adverse_r: 0.2,
    reached_half_r: true,
    reached_one_r: true,
    target_stop_collision: false,
  };
}

describe("analyzeTrades", () => {
  const trades = [
    trade(1, "2026-01-03T12:00:00Z", 100, 1),
    trade(2, "2026-01-03T15:00:00Z", -50, -0.5),
    trade(3, "2026-02-08T12:00:00Z", 0, 0),
  ];

  it("builds YYYY-MM daily cells and distinguishes a zero-result trade day", () => {
    const result = analyzeTrades(trades, 1000, "seed");
    expect(result.calendar.map((row) => row.key)).toEqual(["2026-01", "2026-02"]);
    expect(result.calendar[0].cells.get(3)).toMatchObject({ netR: 0.5, trades: 2, wins: 1, losses: 1 });
    expect(result.calendar[0].cells.has(4)).toBe(false);
    expect(result.calendar[1].cells.get(8)?.netR).toBe(0);
  });

  it("calculates monthly summaries, costs, and deterministic bootstrap ranges", () => {
    const first = analyzeTrades(trades, 1000, "stable-seed");
    const second = analyzeTrades(trades, 1000, "stable-seed");
    expect(first.calendar[0]).toMatchObject({ startingEquity: 1000, endingEquity: 1050, netProfit: 50, netR: 0.5, trades: 2 });
    expect(first.costSensitivity.find((row) => row.multiple === 1)?.netProfit).toBe(50);
    expect(first.monteCarlo).toEqual(second.monteCarlo);
  });
});
