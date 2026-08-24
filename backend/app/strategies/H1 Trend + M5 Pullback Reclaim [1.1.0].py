from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd

from .h1_m5_pullback_reclaim import H1M5PullbackReclaimStrategy


class H1M5PullbackReclaimV110Strategy(H1M5PullbackReclaimStrategy):
    """Long-only refinement with a minimum normalized H1 EMA spread."""

    version = "1.1.0"
    parameter_schema = [
        *H1M5PullbackReclaimStrategy.parameter_schema,
        {
            "key": "minimum_trend_strength_atr",
            "label": "Minimum trend strength · ATR",
            "type": "float",
            "default": 1.5,
            "min": 1.5,
            "max": 1.5,
            "step": 0.1,
            "group": "Trend filter",
        },
    ]

    def diagnostic_schema(self) -> list[dict[str, Any]]:
        return [
            *super().diagnostic_schema(),
            {
                "key": "trend_strength_atr",
                "column": "trend_strength_atr",
                "label": "H1 EMA spread / M5 ATR",
                "unit": "ATR",
                "analyze": True,
            },
        ]

    def calculate(self, candles: pd.DataFrame, params: dict[str, Any]) -> pd.DataFrame:
        p = self.parameters(params)
        frame = super().calculate(candles, p)
        frame["trend_strength_atr"] = (
            (frame["h1_ema20"] - frame["h1_ema50"]).abs()
            / frame["atr"].replace(0, np.nan)
        )
        eligible_long = (
            frame["signal_long"]
            & frame["trend_strength_atr"].ge(p["minimum_trend_strength_atr"])
        ).fillna(False)

        frame["signal_long"] = eligible_long
        frame["signal_short"] = False
        frame.loc[~eligible_long, ["signal_stop", "confirmed_swing"]] = np.nan
        frame["signal_reason"] = ""
        frame.loc[eligible_long, "signal_reason"] = (
            "H1 uptrend at least 1.5 ATR strong; M5 EMA20 pullback reclaimed "
            "above previous high"
        )
        return frame
