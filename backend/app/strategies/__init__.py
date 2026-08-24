from __future__ import annotations

import importlib.util
import inspect
import json
import re
from pathlib import Path
from typing import Any

from .base import Strategy


PROJECT_ROOT = Path(__file__).resolve().parents[3]
REGISTRY_PATH = Path(__file__).with_name("strategy_versions.json")
REQUIRED_FIELDS = {"id", "strategy_name", "version", "file_dir", "version_notes"}


def _version_tuple(version: str) -> tuple[int, ...]:
    if not re.fullmatch(r"\d+(?:\.\d+)*", version):
        raise ValueError(f"Strategy version must be numeric: {version}")
    return tuple(int(part) for part in version.split("."))


def _load_strategy(entry: dict[str, Any], index: int) -> Strategy:
    missing = REQUIRED_FIELDS - set(entry)
    if missing:
        raise ValueError(f"Strategy registry entry is missing: {', '.join(sorted(missing))}")

    file_path = (PROJECT_ROOT / Path(entry["file_dir"])).resolve()
    strategies_dir = Path(__file__).resolve().parent
    if file_path.suffix != ".py" or not file_path.is_relative_to(strategies_dir):
        raise ValueError(f"Strategy file must be a Python file inside {strategies_dir}")
    if not file_path.is_file():
        raise ValueError(f"Strategy file not found: {entry['file_dir']}")

    module_name = f"{__name__}._registered_{index}"
    spec = importlib.util.spec_from_file_location(module_name, file_path)
    if spec is None or spec.loader is None:
        raise ValueError(f"Could not load strategy file: {entry['file_dir']}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    classes = [
        candidate
        for _, candidate in inspect.getmembers(module, inspect.isclass)
        if candidate.__module__ == module_name
        and issubclass(candidate, Strategy)
        and candidate is not Strategy
        and not inspect.isabstract(candidate)
    ]
    if len(classes) != 1:
        raise ValueError(
            f"Strategy file must define exactly one concrete Strategy class: {entry['file_dir']}"
        )
    strategy = classes[0]()
    if strategy.name != entry["strategy_name"] or strategy.version != entry["version"]:
        raise ValueError(f"Strategy metadata mismatch in {entry['file_dir']}")
    _version_tuple(strategy.version)
    strategy.id = entry["id"]
    strategy.version_notes = entry["version_notes"]
    strategy.file_dir = entry["file_dir"]
    return strategy


def _load_registry() -> tuple[list[Strategy], dict[str, Strategy], dict[str, Strategy]]:
    entries = json.loads(REGISTRY_PATH.read_text(encoding="utf-8"))
    if not isinstance(entries, list):
        raise ValueError("Strategy registry must be a JSON list")
    versions: list[Strategy] = []
    by_id: dict[str, Strategy] = {}
    latest: dict[str, Strategy] = {}
    for index, entry in enumerate(entries):
        strategy = _load_strategy(entry, index)
        if strategy.id in by_id:
            raise ValueError(f"Duplicate strategy version id: {strategy.id}")
        by_id[strategy.id] = strategy
        versions.append(strategy)
        current = latest.get(strategy.key)
        if current is None or _version_tuple(strategy.version) > _version_tuple(current.version):
            latest[strategy.key] = strategy
    return versions, by_id, latest


STRATEGY_VERSION_LIST, STRATEGY_VERSIONS, STRATEGIES = _load_registry()


def get_strategy(strategy_id: str | None, strategy_key: str) -> Strategy | None:
    return STRATEGY_VERSIONS.get(strategy_id) if strategy_id else STRATEGIES.get(strategy_key)
