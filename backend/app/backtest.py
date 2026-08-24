from __future__ import annotations

import hashlib
import json
import math
from dataclasses import asdict, dataclass
from typing import Any

import numpy as np
import pandas as pd


ENGINE_VERSION = "1.1.0"


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

    for index, row in frame.iterrows():
        if pending_exit and position:
            _close(position, float(row.open), row.timestamp, "ao_reversal", index, config, trades)
            equity += trades[-1].net_pnl
            equity_points.append({"time": row.timestamp.isoformat(), "value": equity})
            position = None
            pending_exit = False

        if pending_entry and position is None:
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
                    }
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
        equity += trades[-1].net_pnl
        equity_points.append({"time": last.timestamp.isoformat(), "value": equity})

    trade_dicts = [asdict(trade) for trade in trades]
    metrics, drawdown = calculate_metrics(trade_dicts, config["initial_capital"], equity_points)
    fingerprint_payload = {
        "dataset_hash": config["dataset_hash"],
        "strategy_key": config["strategy_key"],
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
    return {
        "closed_trades": len(trades),
        "net_profit": net,
        "return_percent": net / initial_capital * 100,
        "win_rate": len(winners) / len(trades) * 100 if trades else 0,
        "profit_factor": gross_wins / gross_losses if gross_losses else None,
        "expectancy_r": float(np.mean([trade["result_r"] for trade in trades])) if trades else 0,
        "max_drawdown": max_drawdown,
        "max_drawdown_percent": max_drawdown / initial_capital * 100,
    }, drawdown


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
