from pathlib import Path

import pandas as pd
import pytest

from backend.app.data import CandleDataError, CandleRepository


def test_discovers_named_timeframes(tmp_path: Path):
    (tmp_path / "XAUUSD - 15m.csv").write_text("timestamp,open,high,low,close\n", encoding="utf-8")
    (tmp_path / "XAUUSD - 1h.csv").write_text("timestamp,open,high,low,close\n", encoding="utf-8")
    (tmp_path / "ignore.csv").write_text("", encoding="utf-8")
    assert CandleRepository(tmp_path).catalog() == {"XAUUSD": ["15m", "1h"]}


def test_invalid_ohlc_is_rejected(tmp_path: Path):
    pd.DataFrame([{"timestamp": "2026-01-01T00:00:00Z", "open": 10, "high": 9, "low": 8, "close": 10}]).to_csv(tmp_path / "XAUUSD - 1m.csv", index=False)
    with pytest.raises(CandleDataError, match="Invalid OHLC"):
        CandleRepository(tmp_path).load("XAUUSD", "1m")


def test_duplicate_timestamps_are_rejected(tmp_path: Path):
    pd.DataFrame([
        {"timestamp": "2026-01-01T00:00:00Z", "open": 10, "high": 11, "low": 9, "close": 10},
        {"timestamp": "2026-01-01T00:00:00Z", "open": 10, "high": 11, "low": 9, "close": 10},
    ]).to_csv(tmp_path / "XAUUSD - 1m.csv", index=False)
    with pytest.raises(CandleDataError, match="duplicate"):
        CandleRepository(tmp_path).load("XAUUSD", "1m")


def test_utf16_headerless_metatrader_export_and_alias_are_supported(tmp_path: Path):
    content = (
        "2026.01.01 00:00,2650.10,2651.40,2649.80,2650.90,120,0\n"
        "2026.01.01 00:15,2650.90,2652.00,2650.50,2651.70,135,0\n"
    )
    (tmp_path / "XAUUSD - M15.csv").write_text(content, encoding="utf-16")
    repository = CandleRepository(tmp_path)
    assert repository.catalog() == {"XAUUSD": ["15m"]}
    candles, metadata = repository.load("XAUUSD", "15m")
    assert len(candles) == 2
    assert metadata["source_format"] == "MetaTrader-style headerless"
    assert metadata["encoding"] == "utf-16"
