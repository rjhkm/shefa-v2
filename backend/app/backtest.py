from __future__ import annotations

import hashlib
import json
import math
from dataclasses import asdict, dataclass
from datetime import datetime, time, timedelta
from typing import Any
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

import numpy as np
import pandas as pd


ENGINE_VERSION = "1.4.0"


@dataclass
class Trade:
    trade_id: int
    direction: str
    quantity: float
    signal_time: str
    entry_time: str
    entry_price: float
    initial_stop: float
    initial_target: float
    initial_risk_cash: float
    exit_time: str
    exit_price: float
    exit_reason: str
    gross_pnl: float
    spread_cost: float
    slippage_cost: float
    commission_cost: float
    net_pnl: float
    result_r: float
    holding_bars: int
    signal_reason: str
    strategy_context: dict[str, float | None]
    entry_gap_price: float
    entry_gap_r: float
    max_favorable_r: float
    max_adverse_r: float
    reached_half_r: bool
    reached_one_r: bool
    target_stop_collision: bool


def floor_to_step(value: float, step: float) -> float:
    return math.floor((value + 1e-12) / step) * step


def _quantity(equity: float, stop_distance: float, config: dict[str, Any]) -> float:
    if config["sizing_mode"] == "fixed":
        return floor_to_step(config["fixed_quantity"], config["quantity_step"])
    requested_risk = equity * config["risk_percent"] / 100
    quantity = floor_to_step(requested_risk / (stop_distance * config["point_value"]), config["quantity_step"])
    return quantity if quantity >= config["minimum_quantity"] else 0.0


def run_backtest(frame: pd.DataFrame, params: dict[str, Any], config: dict[str, Any]) -> dict[str, Any]:
    equity = float(config["initial_capital"])
    equity_points = [{"time": frame.iloc[0]["timestamp"].isoformat(), "value": equity}] if len(frame) else []
    trades: list[Trade] = []
    position: dict[str, Any] | None = None
    pending_entry: dict[str, Any] | None = None
    pending_exit = False
    session_activity: dict[str, dict[str, int]] = {}

    for index, row in frame.iterrows():
        if pending_exit and position:
            _close(position, float(row.open), row.timestamp, "ao_reversal", index, config, trades)
            _record_session_loss(session_activity, position, trades[-1])
            equity += trades[-1].net_pnl
            equity_points.append({"time": row.timestamp.isoformat(), "value": equity})
            position = None
            pending_exit = False

        if position:
            deadline_reason = _deadline_reason_at_open(position, row.timestamp)
            if deadline_reason:
                _close(position, float(row.open), row.timestamp, deadline_reason, index, config, trades)
                _record_session_loss(session_activity, position, trades[-1])
                equity += trades[-1].net_pnl
                equity_points.append({"time": row.timestamp.isoformat(), "value": equity})
                position = None

        if pending_entry and position is None:
            session_key = _session_key(row.timestamp, params)
            if _session_entry_limit_reached(session_activity, session_key, params):
                pending_entry = None
                continue
            proposed_stop = pending_entry.get("stop_price")
            if proposed_stop is not None:
                stop_distance = abs(float(row.open) - proposed_stop)
            else:
                stop_distance = pending_entry["atr"] * params["atr_stop_multiplier"]
            if np.isfinite(stop_distance) and stop_distance > 0:
                quantity = _quantity(equity, stop_distance, config)
                if quantity > 0:
                    direction = pending_entry["direction"]
                    entry = float(row.open)
                    stop = proposed_stop if proposed_stop is not None else (
                        entry - stop_distance if direction == "long" else entry + stop_distance
                    )
                    # A gap through a structural stop invalidates the setup; a
                    # fill beyond the stop would otherwise create an impossible
                    # trade with the stop on the wrong side of the entry.
                    valid_stop = stop < entry if direction == "long" else stop > entry
                    if not valid_stop:
                        pending_entry = None
                        continue
                    if "take_profit_pips" in params and "pip_size" in params:
                        target_distance = params["take_profit_pips"] * params["pip_size"]
                    else:
                        target_distance = stop_distance * params["reward_risk"]
                    target = entry + target_distance if direction == "long" else entry - target_distance
                    position = {
                        **pending_entry,
                        "entry_index": index,
                        "entry_time": row.timestamp,
                        "entry_price": entry,
                        "stop": stop,
                        "target": target,
                        "quantity": quantity,
                        "risk_cash": stop_distance * quantity * config["point_value"],
                        "signal_close": pending_entry["signal_close"],
                        "strategy_context": pending_entry["strategy_context"],
                        "max_favorable_r": 0.0,
                        "max_adverse_r": 0.0,
                        "target_stop_collision": False,
                        "time_exit_at": _time_exit_at(row.timestamp, params),
                        "session_close_at": _next_session_close(row.timestamp, params),
                        "session_key": session_key,
                    }
                    _record_session_entry(session_activity, session_key)
            pending_entry = None

        if position:
            _update_excursion(position, row)
            if position["direction"] == "long":
                stop_hit = float(row.low) <= position["stop"]
                target_hit = float(row.high) >= position["target"]
            else:
                stop_hit = float(row.high) >= position["stop"]
                target_hit = float(row.low) <= position["target"]
            if stop_hit or target_hit:
                position["target_stop_collision"] = stop_hit and target_hit
                reason = "stop" if stop_hit else "target"
                price = position["stop"] if stop_hit else position["target"]
                _close(position, price, row.timestamp, reason, index, config, trades)
                _record_session_loss(session_activity, position, trades[-1])
                equity += trades[-1].net_pnl
                equity_points.append({"time": row.timestamp.isoformat(), "value": equity})
                position = None

        if position and _session_closes_on_bar(position, row.timestamp):
            _close(
                position,
                float(row.close),
                position["session_close_at"],
                "session_close",
                index,
                config,
                trades,
            )
            _record_session_loss(session_activity, position, trades[-1])
            equity += trades[-1].net_pnl
            equity_points.append({"time": row.timestamp.isoformat(), "value": equity})
            position = None

        if position:
            pending_exit = bool(row.exit_long if position["direction"] == "long" else row.exit_short)
        elif index < len(frame) - 1:
            if bool(row.signal_long):
                pending_entry = _pending_entry("long", row, config)
            elif bool(row.signal_short):
                pending_entry = _pending_entry("short", row, config)

    if position:
        last = frame.iloc[-1]
        _close(position, float(last.close), last.timestamp, "end_of_data", len(frame) - 1, config, trades)
        _record_session_loss(session_activity, position, trades[-1])
        equity += trades[-1].net_pnl
        equity_points.append({"time": last.timestamp.isoformat(), "value": equity})

    if len(frame):
        final_time = frame.iloc[-1]["timestamp"].isoformat()
        if not equity_points or equity_points[-1]["time"] != final_time:
            equity_points.append({"time": final_time, "value": equity})

    trade_dicts = [asdict(trade) for trade in trades]
    add_market_regimes(trade_dicts, frame)
    metrics, drawdown = calculate_metrics(trade_dicts, config["initial_capital"], equity_points)
    fingerprint_payload = {
        "dataset_hash": config["dataset_hash"],
        "strategy_key": config["strategy_key"],
        "strategy_id": config.get("strategy_id"),
        "strategy_version": config["strategy_version"],
        "engine_version": ENGINE_VERSION,
        "parameters": params,
        "execution": {key: value for key, value in config.items() if key != "dataset_hash"},
    }
    fingerprint = hashlib.sha256(json.dumps(fingerprint_payload, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
    return {
        "trades": trade_dicts,
        "metrics": metrics,
        "strategy_diagnostics": calculate_strategy_diagnostics(
            trade_dicts, config.get("strategy_diagnostic_schema", [])
        ),
        "equity": equity_points,
        "drawdown": drawdown,
        "fingerprint": fingerprint,
        "engine_version": ENGINE_VERSION,
    }


def add_market_regimes(trades: list[dict[str, Any]], frame: pd.DataFrame) -> None:
    """Attach a signal-time, backward-looking 20-bar price regime to each trade."""
    if frame.empty or not trades:
        return
    returns = frame["close"].pct_change()
    momentum = frame["close"] / frame["close"].shift(20) - 1
    noise = np.sqrt(returns.pow(2).rolling(20).sum())
    timestamps = frame["timestamp"].reset_index(drop=True)
    for trade in trades:
        position = int(timestamps.searchsorted(pd.Timestamp(trade["entry_time"]), side="right")) - 1
        if position < 20 or not np.isfinite(momentum.iloc[position]) or not np.isfinite(noise.iloc[position]):
            trade["market_regime"] = "Insufficient lookback"
        elif abs(momentum.iloc[position]) <= noise.iloc[position] * 1.25:
            trade["market_regime"] = "Range / mixed"
        elif momentum.iloc[position] > 0:
            trade["market_regime"] = "Uptrend"
        else:
            trade["market_regime"] = "Downtrend"


def _pending_entry(direction: str, row: pd.Series, config: dict[str, Any]) -> dict[str, Any]:
    schema = config.get("strategy_diagnostic_schema", [])
    return {
        "direction": direction,
        "signal_time": row.timestamp,
        "atr": float(row.atr),
        "stop_price": _finite_or_none(row.get("signal_stop")),
        "signal_close": float(row.close),
        "signal_reason": row.signal_reason,
        "strategy_context": {
            field["key"]: _finite_or_none(row.get(field["column"]))
            for field in schema
        },
    }


def _time_exit_at(entry_time: pd.Timestamp, params: dict[str, Any]) -> pd.Timestamp | None:
    minutes = params.get("max_holding_minutes")
    if minutes is None:
        return None
    return entry_time + pd.Timedelta(float(minutes), unit="min")


def _next_session_close(entry_time: pd.Timestamp, params: dict[str, Any]) -> pd.Timestamp | None:
    timezone_name = params.get("session_timezone")
    hour = params.get("session_close_hour")
    minute = params.get("session_close_minute")
    if timezone_name is None or hour is None or minute is None:
        return None
    try:
        timezone = ZoneInfo(str(timezone_name))
    except ZoneInfoNotFoundError as error:
        raise ValueError(f"Unknown session timezone: {timezone_name}") from error
    local_entry = entry_time.tz_convert(timezone)
    close_date = local_entry.date()
    local_close = pd.Timestamp(
        datetime.combine(close_date, time(hour=int(hour), minute=int(minute))),
        tz=timezone,
    )
    if local_close <= local_entry:
        close_date += timedelta(days=1)
        local_close = pd.Timestamp(
            datetime.combine(close_date, time(hour=int(hour), minute=int(minute))),
            tz=timezone,
        )
    return local_close.tz_convert("UTC")


def _session_key(timestamp: pd.Timestamp, params: dict[str, Any]) -> str | None:
    session_close = _next_session_close(timestamp, params)
    return session_close.isoformat() if session_close is not None else None


def _session_entry_limit_reached(
    activity: dict[str, dict[str, int]],
    session_key: str | None,
    params: dict[str, Any],
) -> bool:
    if session_key is None:
        return False
    counters = activity.get(session_key, {"entries": 0, "losses": 0})
    max_entries = params.get("max_session_entries")
    max_losses = params.get("max_session_losses")
    return bool(
        (max_entries is not None and counters["entries"] >= int(max_entries))
        or (max_losses is not None and counters["losses"] >= int(max_losses))
    )


def _record_session_entry(
    activity: dict[str, dict[str, int]], session_key: str | None
) -> None:
    if session_key is None:
        return
    counters = activity.setdefault(session_key, {"entries": 0, "losses": 0})
    counters["entries"] += 1


def _record_session_loss(
    activity: dict[str, dict[str, int]],
    position: dict[str, Any],
    trade: Trade,
) -> None:
    session_key = position.get("session_key")
    if session_key is None or trade.net_pnl >= 0:
        return
    counters = activity.setdefault(session_key, {"entries": 0, "losses": 0})
    counters["losses"] += 1


def _deadline_reason_at_open(position: dict[str, Any], timestamp: pd.Timestamp) -> str | None:
    reached = [
        (position.get("time_exit_at"), "time_exit"),
        (position.get("session_close_at"), "session_close"),
    ]
    reached = [(deadline, reason) for deadline, reason in reached if deadline is not None and timestamp >= deadline]
    return min(reached, key=lambda item: item[0])[1] if reached else None


def _session_closes_on_bar(position: dict[str, Any], timestamp: pd.Timestamp) -> bool:
    deadline = position.get("session_close_at")
    return bool(
        deadline is not None
        and timestamp < deadline <= timestamp + pd.Timedelta(1, unit="min")
    )


def _finite_or_none(value: Any) -> float | None:
    return float(value) if value is not None and np.isfinite(value) else None


def _update_excursion(position: dict[str, Any], row: pd.Series) -> None:
    stop_distance = abs(position["entry_price"] - position["stop"])
    if not stop_distance:
        return
    if position["direction"] == "long":
        favorable = (float(row.high) - position["entry_price"]) / stop_distance
        adverse = (position["entry_price"] - float(row.low)) / stop_distance
    else:
        favorable = (position["entry_price"] - float(row.low)) / stop_distance
        adverse = (float(row.high) - position["entry_price"]) / stop_distance
    position["max_favorable_r"] = max(position["max_favorable_r"], favorable)
    position["max_adverse_r"] = max(position["max_adverse_r"], adverse)


def _close(position: dict[str, Any], exit_price: float, exit_time: Any, reason: str, exit_index: int, config: dict[str, Any], trades: list[Trade]) -> None:
    sign = 1 if position["direction"] == "long" else -1
    quantity = position["quantity"]
    gross = (exit_price - position["entry_price"]) * sign * quantity * config["point_value"]
    spread_cost = config["spread"] * quantity * config["point_value"]
    slippage_cost = config["slippage"] * 2 * quantity * config["point_value"]
    commission = config["commission_per_quantity_per_side"] * quantity * 2
    net = gross - spread_cost - slippage_cost - commission
    risk = position["risk_cash"]
    stop_distance = abs(position["entry_price"] - position["stop"])
    entry_gap_price = position["entry_price"] - position["signal_close"]
    entry_gap_r = sign * entry_gap_price / stop_distance if stop_distance else 0.0
    trades.append(Trade(
        trade_id=len(trades) + 1,
        direction=position["direction"],
        quantity=round(quantity, 8),
        signal_time=position["signal_time"].isoformat(),
        entry_time=position["entry_time"].isoformat(),
        entry_price=position["entry_price"],
        initial_stop=position["stop"],
        initial_target=position["target"],
        initial_risk_cash=risk,
        exit_time=exit_time.isoformat(),
        exit_price=exit_price,
        exit_reason=reason,
        gross_pnl=gross,
        spread_cost=spread_cost,
        slippage_cost=slippage_cost,
        commission_cost=commission,
        net_pnl=net,
        result_r=net / risk if risk else 0,
        holding_bars=exit_index - position["entry_index"] + 1,
        signal_reason=position["signal_reason"],
        strategy_context=position["strategy_context"],
        entry_gap_price=entry_gap_price,
        entry_gap_r=entry_gap_r,
        max_favorable_r=position["max_favorable_r"],
        max_adverse_r=position["max_adverse_r"],
        reached_half_r=position["max_favorable_r"] >= 0.5,
        reached_one_r=position["max_favorable_r"] >= 1.0,
        target_stop_collision=position["target_stop_collision"],
    ))


def calculate_metrics(trades: list[dict[str, Any]], initial_capital: float, equity: list[dict[str, Any]]) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    winners = [trade for trade in trades if trade["net_pnl"] > 0]
    losers = [trade for trade in trades if trade["net_pnl"] < 0]
    gross_wins = sum(trade["net_pnl"] for trade in winners)
    gross_losses = abs(sum(trade["net_pnl"] for trade in losers))
    peak = initial_capital
    max_drawdown = 0.0
    drawdown: list[dict[str, Any]] = []
    for point in equity:
        peak = max(peak, point["value"])
        dd = peak - point["value"]
        max_drawdown = max(max_drawdown, dd)
        drawdown.append({"time": point["time"], "value": -dd})
    net = sum(trade["net_pnl"] for trade in trades)
    gross_result = sum(trade.get("gross_pnl", trade["net_pnl"]) for trade in trades)
    total_costs = sum(
        trade.get("spread_cost", 0)
        + trade.get("slippage_cost", 0)
        + trade.get("commission_cost", 0)
        for trade in trades
    )
    average_win = gross_wins / len(winners) if winners else 0.0
    average_loss = gross_losses / len(losers) if losers else 0.0
    max_wins, max_losses = _consecutive_streaks(trades)
    max_drawdown_duration, longest_recovery = _drawdown_durations(equity)
    holding_seconds = [
        (pd.Timestamp(trade["exit_time"]) - pd.Timestamp(trade["entry_time"])).total_seconds()
        for trade in trades
        if trade.get("entry_time") and trade.get("exit_time")
    ]
    return {
        "closed_trades": len(trades),
        "net_profit": net,
        "return_percent": net / initial_capital * 100,
        "win_rate": len(winners) / len(trades) * 100 if trades else 0,
        "profit_factor": gross_wins / gross_losses if gross_losses else None,
        "expectancy_r": float(np.mean([trade["result_r"] for trade in trades])) if trades else 0,
        "max_drawdown": max_drawdown,
        "max_drawdown_percent": max_drawdown / initial_capital * 100,
        "consecutive_wins": max_wins,
        "consecutive_losses": max_losses,
        "recovery_factor": net / max_drawdown if max_drawdown else None,
        "expectancy_per_trade": net / len(trades) if trades else 0.0,
        "payoff_ratio": average_win / average_loss if average_loss else None,
        "max_drawdown_duration_seconds": max_drawdown_duration,
        "longest_recovery_seconds": longest_recovery,
        "average_holding_seconds": float(np.mean(holding_seconds)) if holding_seconds else 0.0,
        "time_in_market_percent": _time_in_market_percent(trades, equity),
        "gross_result": gross_result,
        "net_result": net,
        "total_costs": total_costs,
    }, drawdown


def _consecutive_streaks(trades: list[dict[str, Any]]) -> tuple[int, int]:
    max_wins = max_losses = wins = losses = 0
    for trade in trades:
        result = trade["net_pnl"]
        wins = wins + 1 if result > 0 else 0
        losses = losses + 1 if result < 0 else 0
        max_wins = max(max_wins, wins)
        max_losses = max(max_losses, losses)
    return max_wins, max_losses


def _drawdown_durations(equity: list[dict[str, Any]]) -> tuple[float, float]:
    if not equity:
        return 0.0, 0.0
    peak_value = equity[0]["value"]
    peak_time = pd.Timestamp(equity[0]["time"])
    trough_time = peak_time
    trough_value = peak_value
    max_duration = longest_recovery = 0.0
    underwater = False
    for point in equity[1:]:
        timestamp = pd.Timestamp(point["time"])
        value = point["value"]
        if value >= peak_value:
            if underwater:
                max_duration = max(max_duration, (timestamp - peak_time).total_seconds())
                longest_recovery = max(longest_recovery, (timestamp - trough_time).total_seconds())
            peak_value, peak_time = value, timestamp
            trough_value, trough_time = value, timestamp
            underwater = False
        else:
            underwater = True
            if value < trough_value:
                trough_value, trough_time = value, timestamp
    if underwater:
        final_time = pd.Timestamp(equity[-1]["time"])
        max_duration = max(max_duration, (final_time - peak_time).total_seconds())
        longest_recovery = max(longest_recovery, (final_time - trough_time).total_seconds())
    return max_duration, longest_recovery


def _time_in_market_percent(trades: list[dict[str, Any]], equity: list[dict[str, Any]]) -> float:
    if len(equity) < 2:
        return 0.0
    run_seconds = (pd.Timestamp(equity[-1]["time"]) - pd.Timestamp(equity[0]["time"])).total_seconds()
    if run_seconds <= 0:
        return 0.0
    intervals = sorted(
        (pd.Timestamp(trade["entry_time"]), pd.Timestamp(trade["exit_time"]))
        for trade in trades
        if trade.get("entry_time") and trade.get("exit_time")
    )
    occupied = 0.0
    current_start = current_end = None
    for start, end in intervals:
        if current_end is None or start > current_end:
            if current_start is not None:
                occupied += (current_end - current_start).total_seconds()
            current_start, current_end = start, end
        else:
            current_end = max(current_end, end)
    if current_start is not None:
        occupied += (current_end - current_start).total_seconds()
    return min(100.0, occupied / run_seconds * 100)


def calculate_strategy_diagnostics(trades: list[dict[str, Any]], schema: list[dict[str, Any]]) -> dict[str, Any]:
    """Summarize strategy context without using future information in entries.

    The per-trade context is captured on the completed signal candle.  Excursion
    values are intentionally separate post-trade observations.
    """
    exit_reasons = []
    for reason in sorted({trade["exit_reason"] for trade in trades}):
        group = [trade for trade in trades if trade["exit_reason"] == reason]
        exit_reasons.append(_outcome_summary(reason, group))

    count = len(trades)
    excursion = {
        "average_max_favorable_r": _mean(trades, "max_favorable_r"),
        "average_max_adverse_r": _mean(trades, "max_adverse_r"),
        "reached_half_r_percent": _percent(sum(trade["reached_half_r"] for trade in trades), count),
        "reached_one_r_percent": _percent(sum(trade["reached_one_r"] for trade in trades), count),
        "target_stop_collision_count": sum(trade["target_stop_collision"] for trade in trades),
    }
    context_outcomes = {}
    for field in schema:
        if field.get("analyze"):
            buckets = _context_buckets(trades, field["key"])
            context_outcomes[field["key"]] = {
                "label": field.get("label", field["key"]),
                "unit": field.get("unit", ""),
                "buckets": buckets,
            }
    return {
        "schema_version": "1.0",
        "entry_context_fields": [
            {key: field[key] for key in ("key", "label", "unit") if key in field}
            for field in schema
        ],
        "exit_reasons": exit_reasons,
        "excursion": excursion,
        "context_outcomes": context_outcomes,
    }


def _context_buckets(trades: list[dict[str, Any]], key: str) -> list[dict[str, Any]]:
    values = np.array([
        trade.get("strategy_context", {}).get(key)
        for trade in trades
        if trade.get("strategy_context", {}).get(key) is not None
    ], dtype=float)
    if not len(values):
        return []
    edges = np.unique(np.quantile(values, [0, 0.25, 0.5, 0.75, 1]))
    buckets = []
    for index in range(len(edges) - 1):
        low, high = float(edges[index]), float(edges[index + 1])
        group = [
            trade for trade in trades
            if trade.get("strategy_context", {}).get(key) is not None
            and (low <= trade["strategy_context"][key] <= high if index == len(edges) - 2 else low <= trade["strategy_context"][key] < high)
        ]
        buckets.append({"low": low, "high": high, **_outcome_summary(f"Q{index + 1}", group)})
    if not buckets:
        buckets.append({"low": float(edges[0]), "high": float(edges[0]), **_outcome_summary("All", trades)})
    return buckets


def _outcome_summary(label: str, trades: list[dict[str, Any]]) -> dict[str, Any]:
    count = len(trades)
    winners = sum(trade["net_pnl"] > 0 for trade in trades)
    return {
        "label": label,
        "trade_count": count,
        "net_profit": sum(trade["net_pnl"] for trade in trades),
        "win_rate": _percent(winners, count),
        "average_result_r": _mean(trades, "result_r"),
    }


def _mean(trades: list[dict[str, Any]], key: str) -> float:
    return float(np.mean([trade[key] for trade in trades])) if trades else 0.0


def _percent(numerator: int, denominator: int) -> float:
    return numerator / denominator * 100 if denominator else 0.0
