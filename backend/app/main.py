from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from .backtest import add_market_regimes, calculate_metrics, run_backtest
from .data import CandleDataError, CandleRepository, normalize_timeframe
from .models import AnalyzeRequest
from .strategies import STRATEGY_VERSION_LIST, get_strategy
from .storage import RunStore


PROJECT_ROOT = Path(__file__).resolve().parents[2]
repository = CandleRepository(PROJECT_ROOT / "data" / "candles")
run_store = RunStore(PROJECT_ROOT / "data" / "runs")
app = FastAPI(title="Shefa Strategy Lab API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:5173", "http://localhost:5173"],
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok"}


@app.get("/api/catalog")
def catalog() -> dict:
    return {"datasets": repository.catalog()}


@app.get("/api/strategies")
def strategies() -> dict:
    return {
        "strategies": [
            {
                "id": strategy.id,
                "key": strategy.key,
                "name": strategy.name,
                "version": strategy.version,
                "file_dir": strategy.file_dir,
                "version_notes": strategy.version_notes,
                "required_timeframe": strategy.required_timeframe,
                "parameters": strategy.parameter_schema,
                "plots": strategy.plot_schema(),
            }
            for strategy in STRATEGY_VERSION_LIST
        ]
    }


@app.get("/api/runs")
def saved_runs() -> dict:
    return {"runs": run_store.list()}


@app.get("/api/runs/{run_id}")
def saved_run(run_id: str) -> dict:
    record = run_store.get(run_id)
    if not record:
        raise HTTPException(status_code=404, detail="Saved run not found")
    initial_capital = float(record.get("execution", {}).get("initial_capital", 10_000))
    metrics, drawdown = calculate_metrics(record.get("trades", []), initial_capital, record.get("equity", []))
    record = {**record, "metrics": metrics, "drawdown": drawdown}
    try:
        strategy, frame = _saved_frame(record)
        metric_equity = list(record.get("equity", []))
        if len(frame) and metric_equity:
            frame_end = frame.iloc[-1]["timestamp"].isoformat()
            if metric_equity[-1]["time"] != frame_end:
                metric_equity.append({"time": frame_end, "value": metric_equity[-1]["value"]})
            metrics, drawdown = calculate_metrics(
                record.get("trades", []), initial_capital, metric_equity
            )
            record = {**record, "metrics": metrics, "drawdown": drawdown, "equity": metric_equity}
        enriched_trades = [dict(trade) for trade in record.get("trades", [])]
        add_market_regimes(enriched_trades, frame)
        chart = chart_payload(frame, strategy)
        return {
            **record,
            "trades": enriched_trades,
            "dataset": {**record.get("dataset", {}), "rendered_row_count": len(chart["candles"])},
            **chart,
        }
    except (CandleDataError, KeyError, TypeError, ValueError) as error:
        return {
            **record,
            "candles": [],
            "plot_schema": [],
            "plots": {},
            "chart_warning": str(error),
        }


@app.get("/api/runs/{run_id}/chart")
def saved_run_chart(run_id: str, start_time: str | None = None, end_time: str | None = None) -> dict:
    record = run_store.get(run_id)
    if not record:
        raise HTTPException(status_code=404, detail="Saved run not found")
    try:
        strategy, frame = _saved_frame(record)
        return chart_payload(frame, strategy, limit=None)
    except (CandleDataError, KeyError, TypeError, ValueError) as error:
        raise HTTPException(status_code=422, detail=str(error)) from error


@app.post("/api/analyze")
def analyze(request: AnalyzeRequest) -> dict:
    strategy = get_strategy(request.strategy_id, request.strategy_key)
    if not strategy:
        raise HTTPException(status_code=404, detail="Strategy not found")
    try:
        if (
            strategy.required_timeframe
            and normalize_timeframe(request.timeframe) != strategy.required_timeframe
        ):
            raise ValueError(
                f"{strategy.name} requires the {strategy.required_timeframe} dataset"
            )
        candles, metadata = repository.load(
            request.pair, request.timeframe, request.source_timezone
        )
        params = strategy.parameters(request.parameters)
        frame = strategy.calculate(candles, params)
        config = {
            **request.model_dump(),
            "strategy_id": strategy.id,
            "strategy_key": strategy.key,
            "dataset_hash": metadata["dataset_hash"],
            "strategy_version": strategy.version,
            "strategy_diagnostic_schema": strategy.diagnostic_schema(),
        }
        result = run_backtest(frame, params, config)
    except (CandleDataError, ValueError) as error:
        raise HTTPException(status_code=422, detail=str(error)) from error

    chart = chart_payload(frame, strategy)
    metadata["rendered_row_count"] = len(chart["candles"])
    response = {
        "dataset": metadata,
        "strategy": {
            "id": strategy.id,
            "key": strategy.key,
            "name": strategy.name,
            "version": strategy.version,
            "version_notes": strategy.version_notes,
            "parameters": params,
        },
        **chart,
        **result,
    }
    response["saved_run_id"] = run_store.save(
        {
            "fingerprint": result["fingerprint"],
            "engine_version": result["engine_version"],
            "pair": request.pair,
            "timeframe": request.timeframe,
            "run_start_time": frame.iloc[0]["timestamp"].isoformat() if len(frame) else None,
            "run_end_time": frame.iloc[-1]["timestamp"].isoformat() if len(frame) else None,
            "dataset": metadata,
            "strategy": response["strategy"],
            "execution": {
                key: value
                for key, value in request.model_dump().items()
                if key not in {"pair", "timeframe", "strategy_key", "strategy_id", "parameters"}
            },
            "metrics": result["metrics"],
            "strategy_diagnostics": result["strategy_diagnostics"],
            "trades": result["trades"],
            "equity": result["equity"],
            "drawdown": result["drawdown"],
        }
    )
    return response


def chart_payload(frame, strategy, limit: int | None = 20_000) -> dict:
    """Build the chart response shared by live and saved runs."""
    chart_frame = frame.tail(limit) if limit else frame

    def points(plot: dict) -> list[dict]:
        column = plot["key"]
        if column not in chart_frame:
            return []
        clean = chart_frame[["timestamp", column]].dropna()
        if plot.get("line_type") == "step" and len(clean):
            changed = clean[column].ne(clean[column].shift())
            changed.iloc[-1] = True
            clean = clean.loc[changed]
        return [
            {"time": row.timestamp.isoformat(), "value": float(getattr(row, column))}
            for row in clean.itertuples()
        ]

    plots = strategy.plot_schema()
    return {
        "plot_schema": plots,
        "candles": candle_rows(chart_frame),
        "plots": {plot["key"]: points(plot) for plot in plots},
        "chart_warning": None,
    }


def candle_rows(frame) -> list[dict]:
    return [
        {
            "time": row.timestamp.isoformat(),
            "open": float(row.open),
            "high": float(row.high),
            "low": float(row.low),
            "close": float(row.close),
        }
        for row in frame.itertuples()
    ]


def _saved_frame(record: dict):
    strategy_record = record["strategy"]
    strategy = get_strategy(
        f'{strategy_record["key"]}@{strategy_record["version"]}',
        strategy_record["key"],
    )
    if not strategy:
        raise ValueError(
            f'Strategy {strategy_record["key"]} v{strategy_record["version"]} is no longer available'
        )
    candles, metadata = repository.load(
        record["pair"],
        record["timeframe"],
        record.get("execution", {}).get("source_timezone"),
    )
    saved_hash = record.get("dataset", {}).get("dataset_hash")
    if saved_hash and metadata["dataset_hash"] != saved_hash:
        raise ValueError("The source candle file has changed since this backtest was saved")
    return strategy, strategy.calculate(candles, strategy_record["parameters"])
