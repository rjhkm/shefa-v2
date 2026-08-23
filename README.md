# Shefa Strategy Lab MVP

A local candle-charting and deterministic strategy backtesting workbench. The browser renders results; Python is the source of truth for indicators, signals, fills, costs, sizing, and metrics.

## First run

Requirements: Node.js 20+ and Python 3.12.

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
npm install
```

Start the backend:

```powershell
.\.venv\Scripts\python.exe -m uvicorn backend.app.main:app --reload --host 127.0.0.1 --port 8000
```

In a second terminal, start the frontend:

```powershell
npm run dev
```

Open `http://127.0.0.1:5173`.

## Candle files

Place files in `data/candles/` using `PAIR - TIMEFRAME.csv`, such as `XAUUSD - M15.csv` or `XAUUSD - 15m.csv`. MetaTrader labels (`M5`, `M15`, `H1`, `H4`) are normalized automatically. Every named file becomes an available chart selection; the MVP does not aggregate timeframes.

Required columns:

```csv
timestamp,open,high,low,close,volume
2026-01-01T00:00:00Z,2650.1,2651.4,2649.8,2650.9,120
```

The reader supports UTF-8 files with headers and UTF-16 MetaTrader-style exports without headers. It sorts timestamps and blocks invalid timestamps, duplicate timestamps, non-finite prices, and invalid OHLC relationships. Time discontinuities, including market closures, are surfaced as warnings and never filled silently. The full file is backtested while the chart renders at most the most recent 20,000 candles for responsiveness.

If timestamps do not contain an offset, set the broker export timezone in the Execution panel. Leave it blank only when intentionally assuming UTC. Likely daily and weekend market closures are classified separately; the UI warns only about remaining unexpected gaps.

The repository includes a deterministic demo file. Regenerate it with:

```powershell
.\.venv\Scripts\python.exe scripts\generate_demo_data.py
```

## Execution assumptions

- Indicators and signals use completed candles only.
- Market signals fill at the next candle open.
- Only one position can be open.
- Stop and target distances are frozen at entry.
- Stops and targets are active on the entry candle.
- When both are touched in one candle, the stop wins conservatively.
- Spread is charged once per round trip; slippage and commission are charged per side.
- Risk sizing rounds down and skips quantities below the configured minimum.
- An open position at the end of the dataset closes at the final candle close.
- Repeated inputs generate the same run fingerprint and output.

## Tests

```powershell
.\.venv\Scripts\python.exe -m pytest -q
npm run build
```

Validate every candle file and run a complete baseline backtest against each one:

```powershell
.\.venv\Scripts\python.exe scripts\validate_datasets.py
```

## Adding a converted Pine strategy

Create a folder under `backend/app/strategies/` with a strategy class derived from `Strategy`. Define its typed `parameter_schema`, calculate indicators without future-looking operations, and return the standard signal columns. Register the class in `backend/app/strategies/__init__.py` and add trusted reference-vector tests alongside the conversion.

## Saved runs

Every completed backtest is saved automatically under `data/runs/RUN_ID.json`. The record contains the dataset identity, timezone, strategy name and version, every strategy parameter, execution assumptions, metrics, trades, equity, and drawdown. Repeating identical inputs reuses the same deterministic run ID. Mention that 12-character run ID when asking for a review.
