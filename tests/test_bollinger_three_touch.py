import pandas as pd

from backend.app.strategies.bollinger_three_touch import BollingerThreeTouchStrategy


def test_three_consecutive_lower_band_touches_generate_one_long_signal():
    # The early rally reaches the upper band.  The final three candles each
    # pierce the lower band.  Confirmation is disabled to isolate the touch
    # sequence itself in this test.
    close = [100, 101, 102, 103, 102, 100, 98, 97, 96.5, 97]
    frame = pd.DataFrame({
        "timestamp": pd.date_range("2026-01-01", periods=len(close), freq="15min", tz="UTC"),
        "open": [100, 100, 101, 102, 103, 102, 100, 98, 97, 96],
        "high": [101, 102, 103, 104, 103, 101, 99, 98, 97.5, 98],
        "low": [99, 100, 101, 102, 101, 99, 97, 96, 95.5, 96],
        "close": close,
    })
    strategy = BollingerThreeTouchStrategy()
    result = strategy.calculate(frame, {
        "bb_length": 3,
        "bb_mult": 1.0,
        "upper_touch_lookback": 6,
        "atr_length": 2,
        "stop_buffer_atr": 0,
        "require_bullish_confirmation": False,
    })

    signals = result.index[result["signal_long"]].tolist()
    assert signals == [6]
    assert result.loc[6, "signal_stop"] == 97
    assert not result["signal_short"].any()
