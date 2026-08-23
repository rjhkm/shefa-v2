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
                summaries.append(
                    {
                        "run_id": record["run_id"],
                        "created_at": record["created_at"],
                        "pair": record["pair"],
                        "timeframe": record["timeframe"],
                        "strategy_name": record["strategy"]["name"],
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
