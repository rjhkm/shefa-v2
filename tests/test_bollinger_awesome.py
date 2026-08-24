import pandas as pd

from backend.app.strategies.bollinger_awesome import BollingerAwesomeStrategy


def candles() -> pd.DataFrame:
    close = [100, 99, 98, 99, 100, 101, 102, 103, 102, 101, 100, 99, 98, 97, 96, 95]
    return pd.DataFrame(
        {
            "timestamp": pd.date_range("2026-01-01", periods=len(close), freq="15min", tz="UTC"),
            "open": close,
            "high": [value + 0.5 for value in close],
            "low": [value - 0.5 for value in close],
            "close": close,
        }
    )


def test_defaults_match_the_published_indicator_inputs():
    strategy = BollingerAwesomeStrategy()
    params = strategy.parameters({})

    assert {key: params[key] for key in (
        "bb_use_ema", "bb_filter", "sqz_filter", "bb_length", "bb_source", "bb_mult",
        "fast_ma_len", "nLengthSlow", "nLengthFast", "sqz_length", "sqz_threshold",
    )} == {
        "bb_use_ema": False,
        "bb_filter": False,
        "sqz_filter": False,
        "bb_length": 20,
        "bb_source": "close",
        "bb_mult": 2.0,
        "fast_ma_len": 3,
        "nLengthSlow": 34,
        "nLengthFast": 5,
        "sqz_length": 100,
        "sqz_threshold": 50.0,
    }


def test_ao_colour_change_drives_the_published_exit_rule():
    strategy = BollingerAwesomeStrategy()
    frame = strategy.calculate(candles(), {"nLengthFast": 2, "nLengthSlow": 3})

    expected_long_exits = (frame["ao_state"].shift(1).abs() == 1) & (frame["ao_state"].abs() == 2)
    expected_short_exits = (frame["ao_state"].shift(1).abs() == 2) & (frame["ao_state"].abs() == 1)
    pd.testing.assert_series_equal(frame["exit_long"], expected_long_exits.fillna(False), check_names=False)
    pd.testing.assert_series_equal(frame["exit_short"], expected_short_exits.fillna(False), check_names=False)
