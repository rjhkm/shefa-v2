from __future__ import annotations

import hashlib
import json
import math
from dataclasses import asdict, dataclass
from typing import Any

import numpy as np
import pandas as pd


ENGINE_VERSION = "1.0.0"


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
            stop_distance = pending_entry["atr"] * params["atr_stop_multiplier"]
            if np.isfinite(stop_distance) and stop_distance > 0:
                quantity = _quantity(equity, stop_distance, config)
                if quantity > 0:
                    direction = pending_entry["direction"]
                    entry = float(row.open)
                    stop = entry - stop_distance if direction == "long" else entry + stop_distance
                    target = entry + stop_distance * params["reward_risk"] if direction == "long" else entry - stop_distance * params["reward_risk"]
                    position = {
                        **pending_entry,
                        "entry_index": index,
                        "entry_time": row.timestamp,
                        "entry_price": entry,
                        "stop": stop,
                        "target": target,
                        "quantity": quantity,
                        "risk_cash": stop_distance * quantity * config["point_value"],
                    }
            pending_entry = None

        if position:
            if position["direction"] == "long":
                stop_hit = float(row.low) <= position["stop"]
                target_hit = float(row.high) >= position["target"]
            else:
                stop_hit = float(row.high) >= position["stop"]
                target_hit = float(row.low) <= position["target"]
            if stop_hit or target_hit:
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
                pending_entry = {"direction": "long", "signal_time": row.timestamp, "atr": float(row.atr), "signal_reason": row.signal_reason}
            elif bool(row.signal_short):
                pending_entry = {"direction": "short", "signal_time": row.timestamp, "atr": float(row.atr), "signal_reason": row.signal_reason}

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
    return {"trades": trade_dicts, "metrics": metrics, "equity": equity_points, "drawdown": drawdown, "fingerprint": fingerprint, "engine_version": ENGINE_VERSION}


def _close(position: dict[str, Any], exit_price: float, exit_time: Any, reason: str, exit_index: int, config: dict[str, Any], trades: list[Trade]) -> None:
    sign = 1 if position["direction"] == "long" else -1
    quantity = position["quantity"]
    gross = (exit_price - position["entry_price"]) * sign * quantity * config["point_value"]
    spread_cost = config["spread"] * quantity * config["point_value"]
    slippage_cost = config["slippage"] * 2 * quantity * config["point_value"]
    commission = config["commission_per_quantity_per_side"] * quantity * 2
    net = gross - spread_cost - slippage_cost - commission
    risk = position["risk_cash"]
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
