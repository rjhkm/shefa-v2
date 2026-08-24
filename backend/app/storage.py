from __future__ import annotations

import json
import re
from datetime import UTC, datetime
from pathlib import Path
from typing import Any


RUN_ID_PATTERN = re.compile(r"^[a-f0-9]{12}$")


class RunStore:
    def __init__(self, root: Path):
        self.root = root
        self.root.mkdir(parents=True, exist_ok=True)

    def save(self, record: dict[str, Any]) -> str:
        run_id = record["fingerprint"][:12]
        path = self.root / f"{run_id}.json"
        if not path.exists():
            payload = {"run_id": run_id, "created_at": datetime.now(UTC).isoformat(), **record}
            path.write_text(json.dumps(payload, indent=2, allow_nan=False), encoding="utf-8")
        return run_id

    def list(self) -> list[dict[str, Any]]:
        summaries = []
        for path in self.root.glob("*.json"):
            try:
                record = json.loads(path.read_text(encoding="utf-8"))
                equity = record.get("equity", [])
                run_start = record.get("run_start_time") or (equity[0]["time"] if equity else None)
                run_end = record.get("run_end_time") or (equity[-1]["time"] if equity else None)
                run_days = None
                if run_start and run_end:
                    run_days = max(
                        0.0,
                        (datetime.fromisoformat(run_end) - datetime.fromisoformat(run_start)).total_seconds()
                        / 86_400,
                    )
                summaries.append(
                    {
                        "run_id": record["run_id"],
                        "created_at": record["created_at"],
                        "pair": record["pair"],
                        "timeframe": record["timeframe"],
                        "strategy_name": record["strategy"]["name"],
                        "strategy_version": record["strategy"]["version"],
                        "run_start_time": run_start,
                        "run_end_time": run_end,
                        "run_days": run_days,
                        "equity_change": record["metrics"]["net_profit"],
                        "equity_change_percent": record["metrics"]["return_percent"],
                        "metrics": record["metrics"],
                    }
                )
            except (KeyError, json.JSONDecodeError):
                continue
        return sorted(summaries, key=lambda item: item["created_at"], reverse=True)

    def get(self, run_id: str) -> dict[str, Any] | None:
        if not RUN_ID_PATTERN.fullmatch(run_id):
            return None
        path = self.root / f"{run_id}.json"
        return json.loads(path.read_text(encoding="utf-8")) if path.exists() else None
