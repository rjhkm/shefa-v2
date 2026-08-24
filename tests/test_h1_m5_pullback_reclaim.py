import numpy as np
import pandas as pd

from backend.app.strategies.h1_m5_pullback_reclaim import (
    H1M5PullbackReclaimStrategy,
    _completed_bars,
    _confirmed_swings,
)


def _expand_m5_bars(m5: pd.DataFrame) -> pd.DataFrame:
    rows = []
    for timestamp, bar in m5.iterrows():
        for minute in range(5):
            row_open = float(bar.open)
            row_close = float(bar.close) if minute == 4 else row_open
            rows.append(
                {
                    "timestamp": timestamp + pd.Timedelta(int(minute), unit="min"),
                    "open": row_open,
                    "high": float(bar.high) if minute == 0 else max(row_open, row_close),
                    "low": float(bar.low) if minute == 1 else min(row_open, row_close),
                    "close": row_close,
                }
            )
    return pd.DataFrame(rows)


def _trend_fixture(direction: str) -> pd.DataFrame:
    count = 660
    sign = 1 if direction == "long" else -1
    close = 100 + sign * np.arange(count) * 0.02
    m5 = pd.DataFrame(
        {
            "open": close - sign * 0.05,
            "high": close + 0.15,
            "low": close - 0.15,
            "close": close,
        },
        index=pd.date_range("2026-01-05", periods=count, freq="5min", tz="UTC"),
    )
    pivot_index = count - 4
    signal_index = count - 1
    if direction == "long":
        m5.iloc[pivot_index, m5.columns.get_loc("low")] = close[pivot_index] - 1.0
        signal_close = close[signal_index - 1] + 0.5
        m5.iloc[signal_index] = [
            signal_close - 0.1,
            signal_close + 0.15,
            signal_close - 0.8,
            signal_close,
        ]
    else:
        m5.iloc[pivot_index, m5.columns.get_loc("high")] = close[pivot_index] + 1.0
        signal_close = close[signal_index - 1] - 0.5
        m5.iloc[signal_index] = [
            signal_close + 0.1,
            signal_close + 0.8,
            signal_close - 0.15,
            signal_close,
        ]
    return _expand_m5_bars(m5)


def test_long_reclaim_uses_completed_h1_and_confirmed_m5_swing():
    candles = _trend_fixture("long")
    result = H1M5PullbackReclaimStrategy().calculate(candles, {})
    signals = result.loc[result["signal_long"]]

    assert len(signals) == 1
    signal = signals.iloc[0]
    assert signal.timestamp == candles.iloc[-1].timestamp
    assert signal.h1_close > signal.h1_ema50
    assert signal.h1_ema20 > signal.h1_ema50
    assert signal.m5_low <= signal.m5_ema20 < signal.m5_close
    assert signal.m5_close > signal.m5_previous_high
    assert signal.signal_stop == signal.confirmed_swing - signal.atr * 0.1
    assert not result["signal_short"].any()


def test_short_rules_are_the_exact_mirror():
    candles = _trend_fixture("short")
    result = H1M5PullbackReclaimStrategy().calculate(candles, {})
    signals = result.loc[result["signal_short"]]

    assert len(signals) == 1
    signal = signals.iloc[0]
    assert signal.h1_close < signal.h1_ema50
    assert signal.h1_ema20 < signal.h1_ema50
    assert signal.m5_high >= signal.m5_ema20 > signal.m5_close
    assert signal.m5_close < signal.m5_previous_low
    assert signal.signal_stop == signal.confirmed_swing + signal.atr * 0.1
    assert not result["signal_long"].any()


def test_incomplete_higher_timeframe_candles_are_not_exposed():
    timestamps = pd.date_range("2026-01-05", periods=60 * 50 + 30, freq="1min", tz="UTC")
    close = 100 + np.arange(len(timestamps)) * 0.01
    candles = pd.DataFrame(
        {
            "timestamp": timestamps,
            "open": close,
            "high": close + 0.1,
            "low": close - 0.1,
            "close": close,
        }
    )
    result = H1M5PullbackReclaimStrategy().calculate(candles, {})

    last_completed_h1_close = candles.iloc[60 * 50 - 1].close
    assert result.iloc[-1].h1_close == last_completed_h1_close
    assert result.iloc[-1].h1_close != candles.iloc[-1].close


def test_aggregation_discards_partial_m5_buckets():
    timestamps = pd.date_range("2026-01-05 00:02", periods=8, freq="1min", tz="UTC")
    candles = pd.DataFrame(
        {
            "timestamp": timestamps,
            "open": 100.0,
            "high": 101.0,
            "low": 99.0,
            "close": 100.0,
        }
    )
    bars = _completed_bars(candles, 5)

    assert list(bars.index) == [pd.Timestamp("2026-01-05 00:05", tz="UTC")]


def test_swing_is_unavailable_until_both_right_bars_complete():
    frame = pd.DataFrame(
        {
            "low": [5.0, 4.0, 1.0, 4.0, 5.0, 6.0],
            "high": [6.0, 7.0, 8.0, 7.0, 6.0, 5.0],
        }
    )

    confirmed_low, confirmed_high = _confirmed_swings(frame)

    assert confirmed_low.iloc[:4].isna().all()
    assert confirmed_low.iloc[4] == 1.0
    assert confirmed_high.iloc[:4].isna().all()
    assert confirmed_high.iloc[4] == 8.0
