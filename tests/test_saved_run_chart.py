import pandas as pd

from backend.app.main import chart_payload


class PlotStrategy:
    def plot_schema(self):
        return [
            {
                "key": "average",
                "label": "Average",
                "type": "line",
                "color": "#ffffff",
                "line_width": 2,
                "pane": 0,
            }
        ]


class StepPlotStrategy:
    def plot_schema(self):
        return [
            {
                "key": "average",
                "label": "Average",
                "type": "line",
                "line_type": "step",
                "color": "#ffffff",
            }
        ]


def test_chart_payload_reuses_strategy_plot_schema_and_drops_missing_values():
    frame = pd.DataFrame(
        {
            "timestamp": pd.to_datetime(["2026-01-01T00:00:00Z", "2026-01-01T01:00:00Z"]),
            "open": [10, 11],
            "high": [12, 13],
            "low": [9, 10],
            "close": [11, 12],
            "average": [None, 11.5],
        }
    )

    payload = chart_payload(frame, PlotStrategy())

    assert len(payload["candles"]) == 2
    assert payload["plot_schema"][0]["key"] == "average"
    assert payload["plots"]["average"] == [
        {"time": "2026-01-01T01:00:00+00:00", "value": 11.5}
    ]
    assert payload["chart_warning"] is None


def test_chart_payload_compacts_step_series_but_keeps_coverage_endpoint():
    frame = pd.DataFrame(
        {
            "timestamp": pd.date_range("2026-01-01", periods=5, freq="min", tz="UTC"),
            "open": [10] * 5,
            "high": [11] * 5,
            "low": [9] * 5,
            "close": [10] * 5,
            "average": [10, 10, 11, 11, 11],
        }
    )

    payload = chart_payload(frame, StepPlotStrategy(), limit=None)

    assert len(payload["candles"]) == 5
    assert payload["plots"]["average"] == [
        {"time": "2026-01-01T00:00:00+00:00", "value": 10.0},
        {"time": "2026-01-01T00:02:00+00:00", "value": 11.0},
        {"time": "2026-01-01T00:04:00+00:00", "value": 11.0},
    ]
