---
type: "query"
date: "2026-08-24T06:12:07.062403+00:00"
question: "What is the diagnosis of H1 Trend + M5 Pullback Reclaim and how can it improve?"
contributor: "graphify"
outcome: "useful"
source_nodes: ["calculate_strategy_diagnostics()", "_update_excursion()", "run_backtest()", "Adverse Cost Model", "Risk-Based Position Sizing"]
---

# Q: What is the diagnosis of H1 Trend + M5 Pullback Reclaim and how can it improve?

## Answer

Expanded from graph vocabulary: diagnostics, outcome, trade, context, exit, backtest, risk, strategy, metric, excursion, cost. On 100000 M1 rows, the baseline headline PF 1.197 and 30.28 percent return are not robust: chronological test PF is 1.027, shorts are negative overall and test PF 0.812, edge decays toward December, and modeled spread consumes 23.87 percent of gross profit. Long-only improves test PF to 1.156. Requiring absolute completed H1 EMA20-minus-EMA50 separation of at least 1.5 M5 ATR and disabling shorts improves train/test PF to 1.571/1.273 with test drawdown 3.63 percent and remains positive under 0.2 price-unit slippage per side. Reclaim-distance filtering fails the test split and should not be added. Keep fixed 2R and the 180-minute exit for now; validate timezone, realistic costs, more history, and untouched walk-forward data before adopting the exploratory long-plus-trend candidate. Existing graph health warnings remain unrelated AST reference noise.

## Outcome

- Signal: useful

## Source Nodes

- calculate_strategy_diagnostics()
- _update_excursion()
- run_backtest()
- Adverse Cost Model
- Risk-Based Position Sizing