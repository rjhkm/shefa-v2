---
type: "query"
date: "2026-08-24T04:51:03.428198+00:00"
question: "Develop H1 Trend + M5 Pullback Reclaim strategy in Shefa; tell me your plan first."
contributor: "graphify"
outcome: "useful"
source_nodes: ["Strategy", "CandleRepository", "run_backtest()", "test_strategy_supplied_swing_stop_is_frozen_at_the_next_open()", "Completed-Candle Execution"]
---

# Q: Develop H1 Trend + M5 Pullback Reclaim strategy in Shefa; tell me your plan first.

## Answer

Expanded from original query via graph vocabulary: strategy, backtest, candle, entry, ema, indicator, risk, stop, swing, timeframe, trade, semantics. The implementation should add M1-to-M5/H1 closed-candle aggregation, a strategy plug-in producing M5 reclaim signals and frozen structural stops, generic timed/session exits in run_backtest, API and chart exposure, and anti-lookahead plus execution tests. Existing reusable components are Strategy, CandleRepository, run_backtest, next-open pending entries, one-position enforcement, strategy-supplied signal_stop, risk sizing, fixed-R targets, diagnostics, and deterministic fingerprints. Current project has no M1 dataset and no aggregation/session-close semantics.

## Outcome

- Signal: useful

## Source Nodes

- Strategy
- CandleRepository
- run_backtest()
- test_strategy_supplied_swing_stop_is_frozen_at_the_next_open()
- Completed-Candle Execution