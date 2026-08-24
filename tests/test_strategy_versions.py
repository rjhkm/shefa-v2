import json
from pathlib import Path

from backend.app.main import strategies as strategy_catalog
from backend.app.strategies import (
    PROJECT_ROOT,
    REGISTRY_PATH,
    STRATEGIES,
    STRATEGY_VERSIONS,
    get_strategy,
)

from test_h1_m5_pullback_reclaim import _trend_fixture


def test_registry_contains_valid_unique_version_entries():
    entries = json.loads(REGISTRY_PATH.read_text(encoding="utf-8"))
    required = {"id", "strategy_name", "version", "file_dir", "version_notes"}

    assert all(set(entry) == required for entry in entries)
    assert len({entry["id"] for entry in entries}) == len(entries)
    assert all((PROJECT_ROOT / Path(entry["file_dir"])).is_file() for entry in entries)
    assert set(STRATEGY_VERSIONS) == {entry["id"] for entry in entries}


def test_latest_family_version_and_exact_version_lookup():
    assert STRATEGIES["h1_m5_pullback_reclaim"].id == "h1_m5_pullback_reclaim@1.2.0"
    assert get_strategy("h1_m5_pullback_reclaim@1.0.0", "ignored").version == "1.0.0"
    assert get_strategy(None, "h1_m5_pullback_reclaim").version == "1.2.0"


def test_api_catalog_exposes_all_versions_and_notes():
    versions = [
        item
        for item in strategy_catalog()["strategies"]
        if item["key"] == "h1_m5_pullback_reclaim"
    ]

    assert [item["version"] for item in versions] == ["1.0.0", "1.1.0", "1.2.0"]
    assert all(item["version_notes"] and item["file_dir"] for item in versions)
    assert all(
        [plot["key"] for plot in item["plots"]]
        == ["m5_ema20", "h1_ema20", "h1_ema50"]
        for item in versions
    )


def test_v11_is_long_only_and_enforces_normalized_trend_strength():
    strategy = STRATEGY_VERSIONS["h1_m5_pullback_reclaim@1.1.0"]
    long_result = strategy.calculate(_trend_fixture("long"), {})
    short_result = strategy.calculate(_trend_fixture("short"), {})
    long_signals = long_result.loc[long_result["signal_long"]]

    assert len(long_signals) == 1
    assert long_signals.iloc[0].trend_strength_atr >= 1.5
    assert not long_result["signal_short"].any()
    assert not short_result["signal_short"].any()
    assert not short_result["signal_long"].any()


def test_v12_exposes_customizable_session_limits_and_retains_v11_signals():
    strategy = STRATEGY_VERSIONS["h1_m5_pullback_reclaim@1.2.0"]
    params = strategy.parameters({})
    result = strategy.calculate(_trend_fixture("long"), params)

    assert params["max_session_entries"] == 4
    assert params["max_session_losses"] == 2
    assert len(result.loc[result["signal_long"]]) == 1
    assert not result["signal_short"].any()
