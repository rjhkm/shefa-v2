from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any

import pandas as pd


class Strategy(ABC):
    key: str
    name: str
    version: str
    parameter_schema: list[dict[str, Any]]

    def parameters(self, supplied: dict[str, Any]) -> dict[str, Any]:
        values = {item["key"]: item["default"] for item in self.parameter_schema}
        unknown = set(supplied) - set(values)
        if unknown:
            raise ValueError(f"Unknown strategy parameters: {', '.join(sorted(unknown))}")
        values.update(supplied)
        for item in self.parameter_schema:
            value = values[item["key"]]
            if item["type"] in {"int", "float"}:
                if "min" in item and value < item["min"]:
                    raise ValueError(f"{item['label']} must be at least {item['min']}")
                if "max" in item and value > item["max"]:
                    raise ValueError(f"{item['label']} must be at most {item['max']}")
            if item["type"] == "choice" and value not in item["options"]:
                raise ValueError(f"Invalid value for {item['label']}")
        return values

    @abstractmethod
    def calculate(self, candles: pd.DataFrame, params: dict[str, Any]) -> pd.DataFrame:
        raise NotImplementedError
