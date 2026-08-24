from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd

from .base import Strategy


M1_MINUTES = 1
M5_MINUTES = 5
H1_MINUTES = 60
SWING_LEFT_BARS = 2
SWING_RIGHT_BARS = 2


def _ema(series: pd.Series, length: int) -> pd.Series:
    return series.ewm(span=length, adjust=False, min_periods=length).mean()


def _wilder_atr(frame: pd.DataFrame, length: int) -> pd.Series:
    previous_close = frame["close"].shift(1)
    true_range = pd.concat(
        [
            frame["high"] - frame["low"],
            (frame["high"] - previous_close).abs(),
            (frame["low"] - previous_close).abs(),
        ],
        axis=1,
    ).max(axis=1)
    return true_range.ewm(alpha=1 / length, adjust=False, min_periods=length).mean()


def _completed_bars(candles: pd.DataFrame, minutes: int) -> pd.DataFrame:
    """Aggregate only complete, UTC-aligned bars from M1 candles."""
    indexed = candles.set_index("timestamp")
    rule = f"{minutes}min"
    bars = indexed.resample(rule, label="left", closed="left", origin="start_day").agg(
        {"open": "first", "high": "max", "low": "min", "close": "last"}
    )
    counts = indexed["close"].resample(
        rule, label="left", closed="left", origin="start_day"
    ).count()
    return bars.loc[counts.eq(minutes)].copy()


def _confirmed_swings(frame: pd.DataFrame) -> tuple[pd.Series, pd.Series]:
    """Return the latest 2x2 pivot only when its right bars have completed."""
    low = frame["low"]
    high = frame["high"]
    pivot_low = (
        (low < low.shift(1))
        & (low < low.shift(2))
        & (low <= low.shift(-1))
        & (low <= low.shift(-2))
    )
    pivot_high = (
        (high > high.shift(1))
        & (high > high.shift(2))
        & (high >= high.shift(-1))
        & (high >= high.shift(-2))
    )
    confirmed_low = low.where(pivot_low).shift(SWING_RIGHT_BARS).ffill()
    confirmed_high = high.where(pivot_high).shift(SWING_RIGHT_BARS).ffill()
    return confirmed_low, confirmed_high


def _align_completed_feature(
    target_timestamps: pd.Series, values: pd.Series, minutes: int
) -> np.ndarray:
    # A bar stamped 10:00 becomes usable on the M1 candle stamped 10:04 for M5,
    # or 10:59 for H1. The engine can then fill at the following M1 open.
    available_on = values.index + pd.to_timedelta(minutes - M1_MINUTES, unit="min")
    completed = pd.Series(values.to_numpy(), index=available_on)
    return completed.reindex(pd.DatetimeIndex(target_timestamps)).ffill().to_numpy()


class H1M5PullbackReclaimStrategy(Strategy):
    key = "h1_m5_pullback_reclaim"
    name = "H1 Trend + M5 Pullback Reclaim"
    version = "1.0.0"
    required_timeframe = "1m"
    parameter_schema = [
        {
            "key": "stop_buffer_atr",
            "label": "Stop buffer · M5 ATR",
            "type": "float",
            "default": 0.1,
            "min": 0.1,
            "max": 0.1,
            "step": 0.1,
            "group": "Risk",
        },
        {
            "key": "reward_risk",
            "label": "Target R",
            "type": "float",
            "default": 2.0,
            "min": 2.0,
            "max": 2.0,
            "step": 0.1,
            "group": "Risk",
        },
        {
            "key": "max_holding_minutes",
            "label": "Maximum holding · minutes",
            "type": "int",
            "default": 180,
            "min": 180,
            "max": 180,
            "group": "Time exit",
        },
        {
            "key": "session_timezone",
            "label": "Session timezone",
            "type": "choice",
            "default": "America/New_York",
            "options": ["America/New_York", "UTC"],
            "group": "Time exit",
        },
        {
            "key": "session_close_hour",
            "label": "Session close hour",
            "type": "int",
            "default": 17,
            "min": 0,
            "max": 23,
            "group": "Time exit",
        },
        {
            "key": "session_close_minute",
            "label": "Session close minute",
            "type": "int",
            "default": 0,
            "min": 0,
            "max": 59,
            "group": "Time exit",
        },
    ]

    def plot_schema(self) -> list[dict[str, Any]]:
        return [
            {"key": "m5_ema20", "label": "M5 EMA20", "type": "line", "line_type": "step", "color": "#f0b84e", "line_width": 3},
            {"key": "h1_ema20", "label": "H1 EMA20", "type": "line", "line_type": "step", "color": "#32b98a", "line_width": 2},
            {"key": "h1_ema50", "label": "H1 EMA50", "type": "line", "line_type": "step", "color": "#8b78d7", "line_width": 2},
        ]

    def diagnostic_schema(self) -> list[dict[str, Any]]:
        return [
            {"key": "m5_atr", "column": "atr", "label": "M5 ATR", "unit": "price", "analyze": True},
            {"key": "m5_ema20", "column": "m5_ema20", "label": "M5 EMA20", "unit": "price", "analyze": False},
            {"key": "m5_close", "column": "m5_close", "label": "Completed M5 close", "unit": "price", "analyze": False},
            {"key": "h1_close", "column": "h1_close", "label": "Completed H1 close", "unit": "price", "analyze": False},
            {"key": "h1_ema20", "column": "h1_ema20", "label": "H1 EMA20", "unit": "price", "analyze": False},
            {"key": "h1_ema50", "column": "h1_ema50", "label": "H1 EMA50", "unit": "price", "analyze": False},
            {"key": "confirmed_swing", "column": "confirmed_swing", "label": "Confirmed M5 swing", "unit": "price", "analyze": False},
        ]

    def calculate(self, candles: pd.DataFrame, params: dict[str, Any]) -> pd.DataFrame:
        p = self.parameters(params)
        frame = candles.copy()
        if len(frame) < H1_MINUTES:
            raise ValueError("H1 Trend + M5 Pullback Reclaim requires M1 candle history")
        positive_deltas = frame["timestamp"].diff().dropna()
        if positive_deltas.empty or positive_deltas.mode().iloc[0] != pd.Timedelta(1, unit="min"):
            raise ValueError("H1 Trend + M5 Pullback Reclaim must run on the 1m dataset")

        m5 = _completed_bars(frame, M5_MINUTES)
        h1 = _completed_bars(frame, H1_MINUTES)
        m5["m5_ema20"] = _ema(m5["close"], 20)
        m5["atr"] = _wilder_atr(m5, 14)
        m5["confirmed_swing_low"], m5["confirmed_swing_high"] = _confirmed_swings(m5)
        h1["h1_close"] = h1["close"]
        h1["h1_ema20"] = _ema(h1["close"], 20)
        h1["h1_ema50"] = _ema(h1["close"], 50)

        m5_features = m5.reset_index()
        m5_features["available_at"] = m5_features["timestamp"] + pd.Timedelta(M5_MINUTES, unit="min")
        h1_features = h1.reset_index()[["timestamp", "h1_close", "h1_ema20", "h1_ema50"]]
        h1_features["available_at"] = h1_features["timestamp"] + pd.Timedelta(H1_MINUTES, unit="min")
        m5_features = pd.merge_asof(
            m5_features.sort_values("available_at"),
            h1_features.drop(columns="timestamp").sort_values("available_at"),
            on="available_at",
            direction="backward",
        ).set_index("timestamp")
        m5_features["m5_open"] = m5_features["open"]
        m5_features["m5_high"] = m5_features["high"]
        m5_features["m5_low"] = m5_features["low"]
        m5_features["m5_close"] = m5_features["close"]
        m5_features["m5_previous_high"] = m5_features["high"].shift(1)
        m5_features["m5_previous_low"] = m5_features["low"].shift(1)

        long_trend = (
            (m5_features["h1_close"] > m5_features["h1_ema50"])
            & (m5_features["h1_ema20"] > m5_features["h1_ema50"])
        )
        short_trend = (
            (m5_features["h1_close"] < m5_features["h1_ema50"])
            & (m5_features["h1_ema20"] < m5_features["h1_ema50"])
        )
        long_reclaim = (
            (m5_features["low"] <= m5_features["m5_ema20"])
            & (m5_features["close"] > m5_features["m5_ema20"])
            & (m5_features["close"] > m5_features["high"].shift(1))
        )
        short_reclaim = (
            (m5_features["high"] >= m5_features["m5_ema20"])
            & (m5_features["close"] < m5_features["m5_ema20"])
            & (m5_features["close"] < m5_features["low"].shift(1))
        )
        m5_features["signal_long"] = (
            long_trend & long_reclaim & m5_features["confirmed_swing_low"].notna()
        ).fillna(False)
        m5_features["signal_short"] = (
            short_trend & short_reclaim & m5_features["confirmed_swing_high"].notna()
        ).fillna(False)
        m5_features["signal_stop"] = np.select(
            [m5_features["signal_long"], m5_features["signal_short"]],
            [
                m5_features["confirmed_swing_low"] - m5_features["atr"] * p["stop_buffer_atr"],
                m5_features["confirmed_swing_high"] + m5_features["atr"] * p["stop_buffer_atr"],
            ],
            default=np.nan,
        )
        m5_features["confirmed_swing"] = np.select(
            [m5_features["signal_long"], m5_features["signal_short"]],
            [m5_features["confirmed_swing_low"], m5_features["confirmed_swing_high"]],
            default=np.nan,
        )

        for column in [
            "m5_open",
            "m5_high",
            "m5_low",
            "m5_close",
            "m5_previous_high",
            "m5_previous_low",
            "m5_ema20",
            "atr",
            "h1_close",
            "h1_ema20",
            "h1_ema50",
        ]:
            frame[column] = _align_completed_feature(
                frame["timestamp"], m5_features[column], M5_MINUTES
            )
        frame["signal_long"] = False
        frame["signal_short"] = False
        frame["exit_long"] = False
        frame["exit_short"] = False
        frame["signal_stop"] = np.nan
        frame["confirmed_swing"] = np.nan
        frame["signal_reason"] = ""

        signal_rows = m5_features.index + pd.Timedelta(M5_MINUTES - M1_MINUTES, unit="min")
        source_by_signal_row = m5_features.copy()
        source_by_signal_row.index = signal_rows
        indexed = frame.set_index("timestamp")
        available_rows = indexed.index.intersection(source_by_signal_row.index)
        source = source_by_signal_row.loc[available_rows]
        indexed.loc[available_rows, "signal_long"] = source["signal_long"].to_numpy(dtype=bool)
        indexed.loc[available_rows, "signal_short"] = source["signal_short"].to_numpy(dtype=bool)
        indexed.loc[available_rows, "signal_stop"] = source["signal_stop"].to_numpy()
        indexed.loc[available_rows, "confirmed_swing"] = source["confirmed_swing"].to_numpy()
        long_rows = source.index[source["signal_long"]]
        short_rows = source.index[source["signal_short"]]
        indexed.loc[long_rows, "signal_reason"] = "H1 uptrend; M5 EMA20 pullback reclaimed above previous high"
        indexed.loc[short_rows, "signal_reason"] = "H1 downtrend; M5 EMA20 pullback reclaimed below previous low"
        return indexed.reset_index()
