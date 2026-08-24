from backend.app.storage import RunStore


def test_run_list_exposes_history_table_summary(tmp_path):
    store = RunStore(tmp_path)
    store.save(
        {
            "fingerprint": "a" * 64,
            "pair": "XAUUSD",
            "timeframe": "1h",
            "run_start_time": "2026-01-01T00:00:00+00:00",
            "run_end_time": "2026-01-11T12:00:00+00:00",
            "strategy": {"name": "Trend", "version": "2.1.0"},
            "metrics": {
                "net_profit": 450.0,
                "return_percent": 4.5,
                "max_drawdown": 120.0,
                "max_drawdown_percent": 1.2,
            },
            "equity": [],
        }
    )

    summary = store.list()[0]

    assert summary["strategy_version"] == "2.1.0"
    assert summary["run_days"] == 10.5
    assert summary["equity_change"] == 450.0
    assert summary["equity_change_percent"] == 4.5


def test_run_list_falls_back_to_equity_range_for_older_records(tmp_path):
    store = RunStore(tmp_path)
    store.save(
        {
            "fingerprint": "b" * 64,
            "pair": "XAUUSD",
            "timeframe": "1h",
            "strategy": {"name": "Legacy", "version": "1.0.0"},
            "metrics": {
                "net_profit": -50.0,
                "return_percent": -0.5,
                "max_drawdown": 80.0,
                "max_drawdown_percent": 0.8,
            },
            "equity": [
                {"time": "2026-02-01T00:00:00+00:00", "value": 10_000},
                {"time": "2026-02-03T00:00:00+00:00", "value": 9_950},
            ],
        }
    )

    assert store.list()[0]["run_days"] == 2.0
