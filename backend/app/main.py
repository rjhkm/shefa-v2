from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from .backtest import run_backtest
from .data import CandleDataError, CandleRepository
from .models import AnalyzeRequest
from .strategies import STRATEGIES
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
                "key": strategy.key,
                "name": strategy.name,
                "version": strategy.version,
                "parameters": strategy.parameter_schema,
            }
            for strategy in STRATEGIES.values()
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
    return record


@app.post("/api/analyze")
def analyze(request: AnalyzeRequest) -> dict:
    strategy = STRATEGIES.get(request.strategy_key)
    if not strategy:
        raise HTTPException(status_code=404, detail="Strategy not found")
    try:
        candles, metadata = repository.load(
            request.pair, request.timeframe, request.source_timezone
        )
        params = strategy.parameters(request.parameters)
        frame = strategy.calculate(candles, params)
        config = {
            **request.model_dump(),
            "dataset_hash": metadata["dataset_hash"],
            "strategy_version": strategy.version,
            "strategy_diagnostic_schema": strategy.diagnostic_schema(),
        }
        result = run_backtest(frame, params, config)
    except (CandleDataError, ValueError) as error:
        raise HTTPException(status_code=422, detail=str(error)) from error

    chart_frame = frame.tail(20_000)

    def points(column: str) -> list[dict]:
        if column not in chart_frame:
            return []
        clean = chart_frame[["timestamp", column]].dropna()
        return [{"time": row.timestamp.isoformat(), "value": float(getattr(row, column))} for row in clean.itertuples()]

    candle_rows = [
        {
            "time": row.timestamp.isoformat(),
            "open": float(row.open),
            "high": float(row.high),
            "low": float(row.low),
            "close": float(row.close),
        }
        for row in chart_frame.itertuples()
    ]
    metadata["rendered_row_count"] = len(chart_frame)
    response = {
        "dataset": metadata,
        "strategy": {"key": strategy.key, "name": strategy.name, "version": strategy.version, "parameters": params},
        "candles": candle_rows,
        "plots": {
            "bb_basis": points("bb_basis"),
            "bb_upper": points("bb_upper"),
            "bb_lower": points("bb_lower"),
            "fast_ema": points("fast_ema"),
            "ao": points("ao"),
        },
        **result,
    }
    response["saved_run_id"] = run_store.save(
        {
            "fingerprint": result["fingerprint"],
            "engine_version": result["engine_version"],
            "pair": request.pair,
            "timeframe": request.timeframe,
            "dataset": metadata,
            "strategy": response["strategy"],
            "execution": {
                key: value
                for key, value in request.model_dump().items()
                if key not in {"pair", "timeframe", "strategy_key", "parameters"}
            },
            "metrics": result["metrics"],
            "strategy_diagnostics": result["strategy_diagnostics"],
            "trades": result["trades"],
            "equity": result["equity"],
            "drawdown": result["drawdown"],
        }
    )
    return response
