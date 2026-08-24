---
type: "query"
date: "2026-08-24T05:13:09.499121+00:00"
question: "Create the H1 Trend + M5 Pullback Reclaim strategy after M1 candles were added."
contributor: "graphify"
outcome: "useful"
source_nodes: ["Strategy", "CandleRepository", "run_backtest()", "Completed-Candle Execution", "test_strategy_supplied_swing_stop_is_frozen_at_the_next_open()"]
---

# Q: Create the H1 Trend + M5 Pullback Reclaim strategy after M1 candles were added.

## Answer

Expanded from graph vocabulary: strategy, backtest, candle, entry, ema, indicator, risk, stop, swing, timeframe, trade, semantics. Implemented an M1-only registered strategy that aggregates only complete UTC-aligned M5 and H1 bars, applies H1 EMA20/EMA50 trend alignment, M5 EMA20 reclaim and previous-bar break rules, freezes a 2x2 confirmed M5 swing stop with 0.10 Wilder ATR14 buffer, fills at the next M1 open, targets fixed 2R, and uses three-hour or DST-aware 17:00 America/New_York exits. Extended API plots, timeframe compatibility, frontend charting, and tests. Verification: 22 Python tests, 3 Vitest tests, TypeScript production build, API catalog smoke, and a deterministic 100000-row M1 execution smoke all completed successfully.

## Outcome

- Signal: useful

## Source Nodes

- Strategy
- CandleRepository
- run_backtest()
- Completed-Candle Execution
- test_strategy_supplied_swing_stop_is_frozen_at_the_next_open()