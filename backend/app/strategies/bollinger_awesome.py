from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd

from .base import Strategy


def ema(series: pd.Series, length: int) -> pd.Series:
    return series.ewm(span=length, adjust=False, min_periods=length).mean()


def sma(series: pd.Series, length: int) -> pd.Series:
    return series.rolling(length, min_periods=length).mean()


class BollingerAwesomeStrategy(Strategy):
    key = "bollinger_awesome"
    name = "Bollinger Awesome"
    version = "1.0.0"
    parameter_schema = [
        {"key": "basis_type", "label": "Basis", "type": "choice", "default": "SMA", "options": ["SMA", "EMA"], "group": "Bollinger"},
        {"key": "bb_length", "label": "Length", "type": "int", "default": 20, "min": 2, "max": 500, "group": "Bollinger"},
        {"key": "bb_deviation", "label": "Deviation", "type": "float", "default": 2.0, "min": 0.1, "max": 10, "step": 0.1, "group": "Bollinger"},
        {"key": "fast_ema_length", "label": "Fast EMA", "type": "int", "default": 3, "min": 2, "max": 100, "group": "Signal"},
        {"key": "ao_fast", "label": "AO fast", "type": "int", "default": 5, "min": 2, "max": 100, "group": "Awesome oscillator"},
        {"key": "ao_slow", "label": "AO slow", "type": "int", "default": 34, "min": 3, "max": 500, "group": "Awesome oscillator"},
        {"key": "ao_confirmation", "label": "Confirmation", "type": "choice", "default": "direction", "options": ["off", "direction"], "group": "Awesome oscillator"},
        {"key": "close_inside_bb", "label": "Close inside bands", "type": "bool", "default": True, "group": "Filters"},
        {"key": "squeeze_filter", "label": "Squeeze filter", "type": "bool", "default": True, "group": "Filters"},
        {"key": "squeeze_length", "label": "Squeeze length", "type": "int", "default": 100, "min": 20, "max": 500, "group": "Filters"},
        {"key": "squeeze_threshold", "label": "Squeeze threshold", "type": "float", "default": 50.0, "min": 1, "max": 300, "step": 1, "group": "Filters"},
        {"key": "atr_length", "label": "ATR length", "type": "int", "default": 14, "min": 2, "max": 200, "group": "Risk"},
        {"key": "atr_stop_multiplier", "label": "ATR stop", "type": "float", "default": 1.0, "min": 0.1, "max": 20, "step": 0.1, "group": "Risk"},
        {"key": "reward_risk", "label": "Target R", "type": "float", "default": 1.5, "min": 0.1, "max": 20, "step": 0.1, "group": "Risk"},
    ]

    def parameters(self, supplied: dict[str, Any]) -> dict[str, Any]:
        values = super().parameters(supplied)
        if values["ao_fast"] >= values["ao_slow"]:
            raise ValueError("AO fast length must be lower than AO slow length")
        return values

    def calculate(self, candles: pd.DataFrame, params: dict[str, Any]) -> pd.DataFrame:
        p = self.parameters(params)
        frame = candles.copy()
        basis = sma(frame["close"], p["bb_length"]) if p["basis_type"] == "SMA" else ema(frame["close"], p["bb_length"])
        deviation = frame["close"].rolling(p["bb_length"], min_periods=p["bb_length"]).std(ddof=0)
        frame["bb_basis"] = basis
        frame["bb_upper"] = basis + p["bb_deviation"] * deviation
        frame["bb_lower"] = basis - p["bb_deviation"] * deviation
        frame["fast_ema"] = ema(frame["close"], p["fast_ema_length"])
        median = (frame["high"] + frame["low"]) / 2
        frame["ao"] = sma(median, p["ao_fast"]) - sma(median, p["ao_slow"])
        previous_close = frame["close"].shift(1)
        true_range = pd.concat(
            [
                frame["high"] - frame["low"],
                (frame["high"] - previous_close).abs(),
                (frame["low"] - previous_close).abs(),
            ],
            axis=1,
        ).max(axis=1)
        frame["atr"] = true_range.ewm(alpha=1 / p["atr_length"], adjust=False, min_periods=p["atr_length"]).mean()
        width = frame["bb_upper"] - frame["bb_lower"]
        frame["squeeze_score"] = width / sma(width, p["squeeze_length"]) * 100

        cross_up = (frame["fast_ema"] > frame["bb_basis"]) & (frame["fast_ema"].shift(1) <= frame["bb_basis"].shift(1))
        cross_down = (frame["fast_ema"] < frame["bb_basis"]) & (frame["fast_ema"].shift(1) >= frame["bb_basis"].shift(1))
        long_ok = frame["close"] > frame["bb_basis"]
        short_ok = frame["close"] < frame["bb_basis"]
        if p["ao_confirmation"] == "direction":
            long_ok &= frame["ao"] > frame["ao"].shift(1)
            short_ok &= frame["ao"] < frame["ao"].shift(1)
        if p["close_inside_bb"]:
            long_ok &= frame["close"] < frame["bb_upper"]
            short_ok &= frame["close"] > frame["bb_lower"]
        if p["squeeze_filter"]:
            long_ok &= frame["squeeze_score"] > p["squeeze_threshold"]
            short_ok &= frame["squeeze_score"] > p["squeeze_threshold"]

        frame["signal_long"] = (cross_up & long_ok).fillna(False)
        frame["signal_short"] = (cross_down & short_ok).fillna(False)
        frame["exit_long"] = ((frame["ao"] < frame["ao"].shift(1)) & (frame["ao"].shift(1) >= frame["ao"].shift(2))).fillna(False)
        frame["exit_short"] = ((frame["ao"] > frame["ao"].shift(1)) & (frame["ao"].shift(1) <= frame["ao"].shift(2))).fillna(False)
        frame["signal_reason"] = np.select(
            [frame["signal_long"], frame["signal_short"]],
            ["fast EMA crossed above basis", "fast EMA crossed below basis"],
            default="",
        )
        return frame
