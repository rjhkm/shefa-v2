from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd

from .base import Strategy
from .bollinger_awesome import price_source, sma


class BollingerThreeTouchStrategy(Strategy):
    """Long mean-reversion setup following three consecutive lower-band tests."""

    key = "bollinger_three_touch"
    name = "Bollinger Three-Touch Reversal"
    version = "1.0.0"
    parameter_schema = [
        {"key": "bb_length", "label": "Bollinger length", "type": "int", "default": 20, "min": 2, "max": 500, "group": "Bollinger Bands"},
        {"key": "bb_source", "label": "Bollinger source", "type": "choice", "default": "close", "options": ["open", "high", "low", "close", "hl2", "hlc3", "ohlc4"], "group": "Bollinger Bands"},
        {"key": "bb_mult", "label": "Band multiplier", "type": "float", "default": 2.0, "min": 0.5, "max": 10, "step": 0.1, "group": "Bollinger Bands"},
        {"key": "upper_touch_lookback", "label": "Prior upper-touch lookback · bars", "type": "int", "default": 30, "min": 3, "max": 500, "group": "Setup"},
        {"key": "touch_count", "label": "Consecutive lower touches", "type": "int", "default": 3, "min": 2, "max": 10, "group": "Setup"},
        {"key": "require_bullish_confirmation", "label": "Third touch closes bullish", "type": "bool", "default": True, "group": "Setup"},
        {"key": "stop_buffer_atr", "label": "Stop buffer · ATR", "type": "float", "default": 0.1, "min": 0, "max": 5, "step": 0.05, "group": "Risk"},
        {"key": "atr_length", "label": "ATR length", "type": "int", "default": 14, "min": 2, "max": 200, "group": "Risk"},
        {"key": "reward_risk", "label": "Target R", "type": "float", "default": 1.5, "min": 0.1, "max": 20, "step": 0.1, "group": "Risk"},
    ]

    def plot_schema(self) -> list[dict[str, Any]]:
        return [
            {"key": "bb_basis", "label": "BB basis", "type": "line", "color": "#b8c0c8", "line_width": 2},
            {"key": "bb_upper", "label": "BB upper", "type": "line", "color": "#7387c4", "line_width": 2},
            {"key": "bb_lower", "label": "BB lower", "type": "line", "color": "#7387c4", "line_width": 2},
        ]

    def diagnostic_schema(self) -> list[dict[str, Any]]:
        return [
            {"key": "bb_width_atr", "column": "bb_width_atr", "label": "Bollinger width", "unit": "ATR", "analyze": True},
            {"key": "touch_sequence_low", "column": "touch_sequence_low", "label": "Three-touch swing low", "unit": "price", "analyze": False},
        ]

    def calculate(self, candles: pd.DataFrame, params: dict[str, Any]) -> pd.DataFrame:
        p = self.parameters(params)
        frame = candles.copy()
        source = price_source(frame, p["bb_source"])
        basis = sma(source, p["bb_length"])
        deviation = source.rolling(p["bb_length"], min_periods=p["bb_length"]).std(ddof=0)
        frame["bb_basis"] = basis
        frame["bb_upper"] = basis + p["bb_mult"] * deviation
        frame["bb_lower"] = basis - p["bb_mult"] * deviation

        previous_close = frame["close"].shift(1)
        true_range = pd.concat([
            frame["high"] - frame["low"],
            (frame["high"] - previous_close).abs(),
            (frame["low"] - previous_close).abs(),
        ], axis=1).max(axis=1)
        frame["atr"] = true_range.ewm(alpha=1 / p["atr_length"], adjust=False, min_periods=p["atr_length"]).mean()
        frame["bb_width_atr"] = (frame["bb_upper"] - frame["bb_lower"]) / frame["atr"]

        upper_touch = frame["high"] >= frame["bb_upper"]
        lower_touch = frame["low"] <= frame["bb_lower"]
        prior_upper_touch = upper_touch.shift(1).rolling(p["upper_touch_lookback"], min_periods=1).max().fillna(False).astype(bool)
        touch_run = lower_touch.astype(int).rolling(p["touch_count"], min_periods=p["touch_count"]).sum().eq(p["touch_count"])
        # Trigger once at the completed final touch, not repeatedly while price
        # continues riding the lower band.
        exact_final_touch = touch_run & ~touch_run.shift(1, fill_value=False)
        frame["touch_sequence_low"] = frame["low"].rolling(p["touch_count"], min_periods=p["touch_count"]).min()
        confirmation = frame["close"] > frame["open"] if p["require_bullish_confirmation"] else pd.Series(True, index=frame.index)
        frame["signal_long"] = (exact_final_touch & prior_upper_touch & confirmation).fillna(False)
        frame["signal_short"] = False
        frame["exit_long"] = False
        frame["exit_short"] = False
        frame["signal_stop"] = frame["touch_sequence_low"] - frame["atr"] * p["stop_buffer_atr"]
        frame.loc[~frame["signal_long"], "signal_stop"] = np.nan
        frame["signal_reason"] = np.where(
            frame["signal_long"],
            "three consecutive lower-band touches after an upper-band touch",
            "",
        )
        return frame
