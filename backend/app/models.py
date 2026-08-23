from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


class AnalyzeRequest(BaseModel):
    pair: str
    timeframe: str
    strategy_key: str = "bollinger_awesome"
    parameters: dict[str, Any] = Field(default_factory=dict)
    initial_capital: float = Field(default=10_000, gt=0)
    sizing_mode: Literal["risk", "fixed"] = "risk"
    risk_percent: float = Field(default=0.5, gt=0, le=100)
    fixed_quantity: float = Field(default=1.0, gt=0)
    point_value: float = Field(default=1.0, gt=0)
    quantity_step: float = Field(default=0.01, gt=0)
    minimum_quantity: float = Field(default=0.01, gt=0)
    spread: float = Field(default=0.0, ge=0)
    slippage: float = Field(default=0.0, ge=0)
    commission_per_quantity_per_side: float = Field(default=0.0, ge=0)
    source_timezone: str | None = None
