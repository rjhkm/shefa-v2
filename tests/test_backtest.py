from copy import deepcopy

import pandas as pd

from backend.app.backtest import _next_session_close, calculate_metrics, run_backtest


PARAMS = {"atr_stop_multiplier": 1.0, "reward_risk": 1.5}
CONFIG = {
    "initial_capital": 10_000,
    "sizing_mode": "fixed",
    "risk_percent": 0.5,
    "fixed_quantity": 1.0,
    "point_value": 1.0,
    "quantity_step": 0.01,
    "minimum_quantity": 0.01,
    "spread": 0.2,
    "slippage": 0.1,
    "commission_per_quantity_per_side": 0.05,
    "dataset_hash": "fixture",
    "strategy_key": "fixture_strategy",
    "strategy_version": "1.0.0",
}


def frame(rows: list[dict]) -> pd.DataFrame:
    result = pd.DataFrame(rows)
    result["timestamp"] = pd.date_range("2026-01-01", periods=len(result), freq="15min", tz="UTC")
    defaults = {"signal_long": False, "signal_short": False, "exit_long": False, "exit_short": False, "atr": 2.0, "signal_reason": "fixture"}
    for key, value in defaults.items():
        if key not in result:
            result[key] = value
    return result


def test_signal_fills_at_next_open_and_target_is_deterministic():
    candles = frame([
        {"open": 99, "high": 101, "low": 98, "close": 100, "signal_long": True},
        {"open": 101, "high": 102, "low": 100, "close": 101},
        {"open": 101, "high": 105, "low": 100, "close": 104},
    ])
    result = run_backtest(candles, PARAMS, CONFIG)
    assert result["trades"][0]["entry_price"] == 101
    assert result["trades"][0]["exit_price"] == 104
    assert result["trades"][0]["exit_reason"] == "target"
    assert result == run_backtest(candles, PARAMS, CONFIG)


def test_same_bar_collision_is_conservative_stop_first():
    candles = frame([
        {"open": 100, "high": 101, "low": 99, "close": 100, "signal_long": True},
        {"open": 100, "high": 104, "low": 97, "close": 101},
    ])
    trade = run_backtest(candles, PARAMS, CONFIG)["trades"][0]
    assert trade["exit_reason"] == "stop"
    assert trade["exit_price"] == 98


def test_pip_target_is_used_when_the_strategy_supplies_one():
    candles = frame([
        {"open": 100, "high": 101, "low": 99, "close": 100, "signal_long": True},
        {"open": 100, "high": 100.003, "low": 99, "close": 100},
    ])
    params = {**PARAMS, "take_profit_pips": 20, "pip_size": 0.0001}

    trade = run_backtest(candles, params, CONFIG)["trades"][0]
    assert trade["exit_reason"] == "target"
    assert trade["exit_price"] == 100.002


def test_strategy_supplied_swing_stop_is_frozen_at_the_next_open():
    candles = frame([
        {"open": 100, "high": 101, "low": 99, "close": 100, "signal_long": True, "signal_stop": 97},
        {"open": 101, "high": 108, "low": 100, "close": 107},
    ])
    trade = run_backtest(candles, PARAMS, CONFIG)["trades"][0]
    assert trade["initial_stop"] == 97
    assert trade["initial_target"] == 107
    assert trade["initial_risk_cash"] == 4


def test_future_change_does_not_change_earlier_trade():
    candles = frame([
        {"open": 100, "high": 101, "low": 99, "close": 100, "signal_long": True},
        {"open": 100, "high": 101, "low": 99, "close": 100},
        {"open": 100, "high": 104, "low": 99, "close": 103},
        {"open": 103, "high": 104, "low": 102, "close": 103},
    ])
    changed = candles.copy()
    changed.loc[3, ["open", "high", "low", "close"]] = [500, 600, 400, 550]
    original_trade = run_backtest(candles, PARAMS, CONFIG)["trades"][0]
    changed_trade = run_backtest(changed, PARAMS, CONFIG)["trades"][0]
    assert original_trade == changed_trade


def test_trade_keeps_signal_context_and_excursion_diagnostics():
    candles = frame([
        {"open": 99, "high": 101, "low": 98, "close": 100, "signal_long": True, "signal_score": 0.25},
        {"open": 101, "high": 102, "low": 100, "close": 101, "signal_score": 999, "exit_long": False},
        {"open": 101, "high": 103, "low": 100, "close": 102, "exit_long": True},
        {"open": 102, "high": 103, "low": 101, "close": 102},
    ])
    config = {
        **CONFIG,
        "strategy_diagnostic_schema": [
            {"key": "signal_score", "column": "signal_score", "label": "Signal score", "unit": "index", "analyze": True}
        ],
    }
    result = run_backtest(candles, PARAMS, config)
    trade = result["trades"][0]

    assert trade["strategy_context"] == {"signal_score": 0.25}
    assert trade["entry_gap_price"] == 1
    assert trade["entry_gap_r"] == 0.5
    assert trade["max_favorable_r"] == 1
    assert trade["max_adverse_r"] == 0.5
    assert trade["reached_one_r"] is True
    assert result["strategy_diagnostics"]["context_outcomes"]["signal_score"]["buckets"][0]["trade_count"] == 1


def test_metric_fixture():
    trades = [
        {"net_pnl": 100, "gross_pnl": 105, "spread_cost": 2, "slippage_cost": 2, "commission_cost": 1, "result_r": 1.0, "entry_time": "2026-01-01T01:00:00Z", "exit_time": "2026-01-01T02:00:00Z"},
        {"net_pnl": -50, "gross_pnl": -45, "spread_cost": 2, "slippage_cost": 2, "commission_cost": 1, "result_r": -0.5, "entry_time": "2026-01-01T03:00:00Z", "exit_time": "2026-01-01T04:00:00Z"},
    ]
    metrics, _ = calculate_metrics(trades, 1000, [{"time": "2026-01-01T00:00:00Z", "value": 1000}, {"time": "2026-01-01T02:00:00Z", "value": 1100}, {"time": "2026-01-01T05:00:00Z", "value": 1050}])
    assert metrics["net_profit"] == 50
    assert metrics["win_rate"] == 50
    assert metrics["profit_factor"] == 2
    assert metrics["max_drawdown"] == 50
    assert metrics["consecutive_wins"] == 1
    assert metrics["consecutive_losses"] == 1
    assert metrics["recovery_factor"] == 1
    assert metrics["expectancy_per_trade"] == 25
    assert metrics["payoff_ratio"] == 2
    assert metrics["average_holding_seconds"] == 3600
    assert metrics["time_in_market_percent"] == 40
    assert metrics["gross_result"] == 60
    assert metrics["total_costs"] == 10


def test_position_closes_at_three_hour_deadline_on_m1_open():
    candles = pd.DataFrame(
        {
            "timestamp": pd.date_range("2026-01-05 12:00", periods=182, freq="1min", tz="UTC"),
            "open": 100.0,
            "high": 101.0,
            "low": 99.0,
            "close": 100.0,
            "signal_long": [True, *([False] * 181)],
            "signal_short": False,
            "exit_long": False,
            "exit_short": False,
            "atr": 2.0,
            "signal_stop": [90.0, *([float("nan")] * 181)],
            "signal_reason": "fixture",
        }
    )
    params = {"reward_risk": 2.0, "max_holding_minutes": 180}

    trade = run_backtest(candles, params, CONFIG)["trades"][0]

    assert trade["entry_time"] == "2026-01-05T12:01:00+00:00"
    assert trade["exit_time"] == "2026-01-05T15:01:00+00:00"
    assert trade["exit_reason"] == "time_exit"
    assert trade["initial_target"] == 120.0


def test_position_closes_on_last_m1_close_before_new_york_session_boundary():
    candles = pd.DataFrame(
        {
            "timestamp": pd.date_range("2026-01-05 21:58", periods=2, freq="1min", tz="UTC"),
            "open": [100.0, 100.0],
            "high": [101.0, 101.0],
            "low": [99.0, 99.0],
            "close": [100.0, 100.5],
            "signal_long": [True, False],
            "signal_short": False,
            "exit_long": False,
            "exit_short": False,
            "atr": 2.0,
            "signal_stop": [90.0, float("nan")],
            "signal_reason": "fixture",
        }
    )
    params = {
        "reward_risk": 2.0,
        "max_holding_minutes": 180,
        "session_timezone": "America/New_York",
        "session_close_hour": 17,
        "session_close_minute": 0,
    }

    trade = run_backtest(candles, params, CONFIG)["trades"][0]

    assert trade["exit_time"] == "2026-01-05T22:00:00+00:00"
    assert trade["exit_price"] == 100.5
    assert trade["exit_reason"] == "session_close"


def test_new_york_session_close_tracks_daylight_saving_time():
    params = {
        "session_timezone": "America/New_York",
        "session_close_hour": 17,
        "session_close_minute": 0,
    }

    winter = _next_session_close(pd.Timestamp("2026-01-05 20:00", tz="UTC"), params)
    summer = _next_session_close(pd.Timestamp("2026-07-06 20:00", tz="UTC"), params)

    assert winter == pd.Timestamp("2026-01-05 22:00", tz="UTC")
    assert summer == pd.Timestamp("2026-07-06 21:00", tz="UTC")


def test_session_entry_limit_suppresses_additional_fills():
    candles = frame([
        {"open": 100, "high": 101, "low": 99, "close": 100, "signal_long": True},
        {"open": 100, "high": 101, "low": 97, "close": 100, "signal_long": False},
        {"open": 100, "high": 101, "low": 99, "close": 100, "signal_long": True},
        {"open": 100, "high": 101, "low": 97, "close": 100, "signal_long": False},
        {"open": 100, "high": 101, "low": 99, "close": 100, "signal_long": True},
        {"open": 100, "high": 101, "low": 97, "close": 100, "signal_long": False},
    ])
    params = {
        **PARAMS,
        "session_timezone": "America/New_York",
        "session_close_hour": 17,
        "session_close_minute": 0,
        "max_session_entries": 2,
        "max_session_losses": 10,
    }

    result = run_backtest(candles, params, CONFIG)

    assert len(result["trades"]) == 2


def test_session_loss_limit_counts_realized_net_losses():
    candles = frame([
        {"open": 100, "high": 101, "low": 99, "close": 100, "signal_long": True},
        {"open": 100, "high": 101, "low": 97, "close": 100, "signal_long": False},
        {"open": 100, "high": 101, "low": 99, "close": 100, "signal_long": True},
        {"open": 100, "high": 101, "low": 97, "close": 100, "signal_long": False},
        {"open": 100, "high": 101, "low": 99, "close": 100, "signal_long": True},
        {"open": 100, "high": 101, "low": 97, "close": 100, "signal_long": False},
    ])
    params = {
        **PARAMS,
        "session_timezone": "America/New_York",
        "session_close_hour": 17,
        "session_close_minute": 0,
        "max_session_entries": 10,
        "max_session_losses": 2,
    }

    result = run_backtest(candles, params, CONFIG)

    assert len(result["trades"]) == 2
    assert all(trade["net_pnl"] < 0 for trade in result["trades"])


def test_session_limits_reset_at_the_new_york_session_boundary():
    candles = frame([
        {"open": 100, "high": 101, "low": 99, "close": 100, "signal_long": True},
        {"open": 100, "high": 101, "low": 97, "close": 100, "signal_long": False},
        {"open": 100, "high": 101, "low": 99, "close": 100, "signal_long": True},
        {"open": 100, "high": 101, "low": 97, "close": 100, "signal_long": False},
    ])
    candles["timestamp"] = pd.date_range(
        "2026-01-05 21:58", periods=len(candles), freq="1min", tz="UTC"
    )
    params = {
        **PARAMS,
        "session_timezone": "America/New_York",
        "session_close_hour": 17,
        "session_close_minute": 0,
        "max_session_entries": 1,
        "max_session_losses": 1,
    }

    result = run_backtest(candles, params, CONFIG)

    assert len(result["trades"]) == 2
    assert [trade["entry_time"] for trade in result["trades"]] == [
        "2026-01-05T21:59:00+00:00",
        "2026-01-05T22:01:00+00:00",
    ]
