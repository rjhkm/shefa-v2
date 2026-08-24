from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd

from .base import Strategy


def ema(series: pd.Series, length: int) -> pd.Series:
    return series.ewm(span=length, adjust=False, min_periods=length).mean()


def sma(series: pd.Series, length: int) -> pd.Series:
    return series.rolling(length, min_periods=length).mean()


def price_source(frame: pd.DataFrame, source: str) -> pd.Series:
    if source in {"open", "high", "low", "close"}:
        return frame[source]
    if source == "hl2":
        return (frame["high"] + frame["low"]) / 2
    if source == "hlc3":
        return (frame["high"] + frame["low"] + frame["close"]) / 3
    if source == "ohlc4":
        return (frame["open"] + frame["high"] + frame["low"] + frame["close"]) / 4
    raise ValueError(f"Unsupported Bollinger source: {source}")


class BollingerAwesomeStrategy(Strategy):
    key = "bollinger_awesome"
    name = "Bollinger Awesome Alert R1.1"
    version = "1.3.0"
    parameter_schema = [
        {"key": "bb_use_ema", "label": "Use EMA for Bollinger Band", "type": "bool", "default": False, "group": "Bollinger Bands"},
        {"key": "bb_filter", "label": "Filter Buy/Sell with Bollinger Bands", "type": "bool", "default": False, "group": "Bollinger Bands"},
        {"key": "sqz_filter", "label": "Filter Buy/Sell with BB squeeze", "type": "bool", "default": False, "group": "Bollinger Bands"},
        {"key": "bb_length", "label": "Bollinger Length", "type": "int", "default": 20, "min": 1, "max": 500, "group": "Bollinger Bands"},
        {"key": "bb_source", "label": "Bollinger Source", "type": "choice", "default": "close", "options": ["open", "high", "low", "close", "hl2", "hlc3", "ohlc4"], "group": "Bollinger Bands"},
        {"key": "bb_mult", "label": "Base Multiplier", "type": "float", "default": 2.0, "min": 0.5, "max": 10, "step": 0.1, "group": "Bollinger Bands"},
        {"key": "fast_ma_len", "label": "Fast EMA length", "type": "int", "default": 3, "min": 2, "max": 100, "group": "EMA"},
        {"key": "nLengthSlow", "label": "Awesome Length Slow", "type": "int", "default": 34, "min": 1, "max": 500, "group": "Awesome Oscillator"},
        {"key": "nLengthFast", "label": "Awesome Length Fast", "type": "int", "default": 5, "min": 1, "max": 100, "group": "Awesome Oscillator"},
        {"key": "sqz_length", "label": "BB Relative Squeeze Length", "type": "int", "default": 100, "min": 5, "max": 500, "group": "BB Squeeze"},
        {"key": "sqz_threshold", "label": "BB Squeeze Threshold %", "type": "float", "default": 50.0, "min": 0, "max": 99, "step": 5, "group": "BB Squeeze"},
        {"key": "take_profit_pips", "label": "Take profit (pips)", "type": "float", "default": 20.0, "min": 10, "max": 20, "step": 1, "group": "Suggested exits"},
        {"key": "pip_size", "label": "Pip size (price units)", "type": "float", "default": 0.0001, "min": 0.000001, "max": 1000, "step": 0.0001, "group": "Suggested exits"},
        # These two fields are required by Shefa's position-sizing engine. They
        # are protective execution safeguards, not inputs from the original indicator.
        {"key": "atr_length", "label": "ATR length", "type": "int", "default": 14, "min": 2, "max": 200, "group": "Risk"},
        {"key": "atr_stop_multiplier", "label": "ATR stop", "type": "float", "default": 1.0, "min": 0.1, "max": 20, "step": 0.1, "group": "Risk"},
        {"key": "reward_risk", "label": "Target R", "type": "float", "default": 1.5, "min": 0.1, "max": 20, "step": 0.1, "group": "Risk"},
    ]

    def plot_schema(self) -> list[dict[str, Any]]:
        return [
            {"key": "bb_basis", "label": "BB basis", "type": "line", "color": "#b8c0c8", "line_width": 2},
            {"key": "bb_upper", "label": "BB upper", "type": "line", "color": "#7387c4", "line_width": 2},
            {"key": "bb_lower", "label": "BB lower", "type": "line", "color": "#7387c4", "line_width": 2},
            {"key": "fast_ema", "label": "Fast EMA", "type": "line", "color": "#f0b84e", "line_width": 3},
            {"key": "ao", "label": "Awesome oscillator", "type": "histogram", "color": "#32b98a", "negative_color": "#ee625d", "pane": 1},
        ]

    def parameters(self, supplied: dict[str, Any]) -> dict[str, Any]:
        values = super().parameters(supplied)
        if values["nLengthFast"] >= values["nLengthSlow"]:
            raise ValueError("AO fast length must be lower than AO slow length")
        return values

    def diagnostic_schema(self) -> list[dict[str, Any]]:
        return [
            {"key": "bb_width", "column": "bb_width", "label": "Bollinger width", "unit": "price", "analyze": True},
            {"key": "bb_percent_b", "column": "bb_percent_b", "label": "Band position (%B)", "unit": "ratio", "analyze": True},
            {"key": "ema_basis_distance_atr", "column": "ema_basis_distance_atr", "label": "EMA distance from basis", "unit": "ATR", "analyze": True},
            {"key": "ao", "column": "ao", "label": "Awesome oscillator", "unit": "price", "analyze": True},
            {"key": "ao_slope", "column": "ao_slope", "label": "AO slope", "unit": "price", "analyze": True},
            {"key": "atr", "column": "atr", "label": "ATR", "unit": "price", "analyze": True},
            {"key": "squeeze_score", "column": "squeeze_score", "label": "Squeeze score", "unit": "index", "analyze": True},
            {"key": "squeeze_score_change", "column": "squeeze_score_change", "label": "Squeeze score change", "unit": "index", "analyze": True},
        ]

    def calculate(self, candles: pd.DataFrame, params: dict[str, Any]) -> pd.DataFrame:
        p = self.parameters(params)
        frame = candles.copy()
        bb_source = price_source(frame, p["bb_source"])
        basis = ema(bb_source, p["bb_length"]) if p["bb_use_ema"] else sma(bb_source, p["bb_length"])
        deviation = bb_source.rolling(p["bb_length"], min_periods=p["bb_length"]).std(ddof=0)
        frame["bb_basis"] = basis
        frame["bb_upper"] = basis + p["bb_mult"] * deviation
        frame["bb_lower"] = basis - p["bb_mult"] * deviation
        frame["fast_ema"] = ema(bb_source, p["fast_ma_len"])
        median = (frame["high"] + frame["low"]) / 2
        frame["ao"] = sma(median, p["nLengthFast"]) - sma(median, p["nLengthSlow"])
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
        frame["bb_width"] = width
        frame["bb_percent_b"] = (frame["close"] - frame["bb_lower"]) / width
        frame["ema_basis_distance_atr"] = (frame["fast_ema"] - frame["bb_basis"]) / frame["atr"]
        frame["ao_slope"] = frame["ao"] - frame["ao"].shift(1)
        frame["squeeze_score"] = width / sma(width, p["sqz_length"]) * 100
        frame["squeeze_score_change"] = frame["squeeze_score"] - frame["squeeze_score"].shift(1)

        cross_up = (frame["fast_ema"] > frame["bb_basis"]) & (frame["fast_ema"].shift(1) <= frame["bb_basis"].shift(1))
        cross_down = (frame["fast_ema"] < frame["bb_basis"]) & (frame["fast_ema"].shift(1) >= frame["bb_basis"].shift(1))
        # Exact Pine conditions: AO values 1/-1 are rising; 2/-2 are falling.
        ao_rising = frame["ao"] > frame["ao"].shift(1)
        ao_state = np.where(
            frame["ao"] >= 0,
            np.where(ao_rising, 1, 2),
            np.where(ao_rising, -1, -2),
        )
        frame["ao_state"] = ao_state
        long_ok = (frame["close"] > frame["bb_basis"]) & (frame["ao_state"].abs() == 1)
        short_ok = (frame["close"] < frame["bb_basis"]) & (frame["ao_state"].abs() == 2)
        if p["bb_filter"]:
            long_ok &= frame["close"] < frame["bb_upper"]
            short_ok &= frame["close"] > frame["bb_lower"]
        if p["sqz_filter"]:
            long_ok &= frame["squeeze_score"] > p["squeeze_threshold"]
            short_ok &= frame["squeeze_score"] > p["squeeze_threshold"]

        frame["signal_long"] = (cross_up & long_ok).fillna(False)
        frame["signal_short"] = (cross_down & short_ok).fillna(False)
        # The stated discretionary exit is when AO changes colour: green
        # (rising) to red (falling) for longs, and red to green for shorts.
        frame["exit_long"] = ((frame["ao_state"].shift(1).abs() == 1) & (frame["ao_state"].abs() == 2)).fillna(False)
        frame["exit_short"] = ((frame["ao_state"].shift(1).abs() == 2) & (frame["ao_state"].abs() == 1)).fillna(False)
        frame["signal_reason"] = np.select(
            [frame["signal_long"], frame["signal_short"]],
            ["fast EMA crossed above basis", "fast EMA crossed below basis"],
            default="",
        )
        return frame
