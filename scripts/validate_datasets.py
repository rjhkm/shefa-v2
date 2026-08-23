from __future__ import annotations

import time
from pathlib import Path
import sys

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))

from backend.app.backtest import run_backtest
from backend.app.data import CandleDataError, CandleRepository
from backend.app.strategies import STRATEGIES


repository = CandleRepository(PROJECT_ROOT / "data" / "candles")
strategy = STRATEGIES["bollinger_awesome"]
parameters = strategy.parameters({})

for pair, timeframes in repository.catalog().items():
    for timeframe in timeframes:
        started = time.perf_counter()
        try:
            candles, metadata = repository.load(pair, timeframe)
            calculated = strategy.calculate(candles, parameters)
            result = run_backtest(
                calculated,
                parameters,
                {
                    "initial_capital": 10_000,
                    "sizing_mode": "risk",
                    "risk_percent": 0.5,
                    "fixed_quantity": 1,
                    "point_value": 1,
                    "quantity_step": 0.01,
                    "minimum_quantity": 0.01,
                    "spread": 0.2,
                    "slippage": 0,
                    "commission_per_quantity_per_side": 0,
                    "dataset_hash": metadata["dataset_hash"],
                    "strategy_key": strategy.key,
                    "strategy_version": strategy.version,
                },
            )
            print(
                f"PASS {pair} {timeframe}: {len(candles):,} rows, "
                f"{len(result['trades']):,} trades, "
                f"{time.perf_counter() - started:.2f}s"
            )
            for warning in metadata["warnings"]:
                print(f"  WARN {warning}")
        except CandleDataError as error:
            print(f"FAIL {pair} {timeframe}: {error}")
