# Graph Report - shefa-v2  (2026-08-24)

## Corpus Check
- Large corpus: 49 files · ~1,025,404 words. Semantic extraction will be expensive (many Claude tokens). Consider running on a subfolder.

## Summary
- 251 nodes · 370 edges · 21 communities (18 shown, 3 thin omitted)
- Extraction: 95% EXTRACTED · 5% INFERRED · 0% AMBIGUOUS · INFERRED: 18 edges (avg confidence: 0.92)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Strategy Indicators
- Frontend Data Models
- Backtest Product Contract
- Backtest Execution Engine
- Frontend TypeScript Config
- API and Run Storage
- Frontend Package Scripts
- Candle Data Pipeline
- Frontend Dependencies
- Build Tool Configuration
- Development Server
- TypeScript Project Config
- Product Vision

## God Nodes (most connected - your core abstractions)
1. `run_backtest()` - 19 edges
2. `compilerOptions` - 16 edges
3. `CandleRepository` - 12 edges
4. `Contractual Backtesting Semantics` - 10 edges
5. `CandleDataError` - 9 edges
6. `Strategy` - 9 edges
7. `BollingerAwesomeStrategy` - 9 edges
8. `calculate_strategy_diagnostics()` - 8 edges
9. `BollingerThreeTouchStrategy` - 8 edges
10. `frame()` - 8 edges

## Surprising Connections (you probably didn't know these)
- `Conservative Intrabar Collision Policy` --semantically_similar_to--> `Contractual Backtesting Semantics`  [INFERRED] [semantically similar]
  README.md → XAUUSD-Strategy-Lab-PRD-v1.0.pdf
- `Python Trading Logic Source of Truth` --semantically_similar_to--> `Python-Authoritative Technical Architecture`  [INFERRED] [semantically similar]
  README.md → XAUUSD-Strategy-Lab-PRD-v1.0.pdf
- `Candle File Contract` --semantically_similar_to--> `Canonical Candle Contract`  [INFERRED] [semantically similar]
  README.md → XAUUSD-Strategy-Lab-PRD-v1.0.pdf
- `Completed-Candle Execution` --semantically_similar_to--> `Contractual Backtesting Semantics`  [INFERRED] [semantically similar]
  README.md → XAUUSD-Strategy-Lab-PRD-v1.0.pdf
- `Strategy Plug-in Framework` --semantically_similar_to--> `Required Strategy Interface`  [INFERRED] [semantically similar]
  README.md → XAUUSD-Strategy-Lab-PRD-v1.0.pdf

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Deterministic Execution Contract** — readme_completed_candle_execution, readme_conservative_intrabar_collision, readme_deterministic_saved_runs, xauusd_strategy_lab_prd_v1_0_backtesting_semantics, xauusd_strategy_lab_prd_v1_0_run_fingerprint_versioning [INFERRED 0.95]
- **Shared Strategy Lab Architecture** — index_shefa_strategy_lab_shell, requirements_fastapi, readme_strategy_plugin_framework, xauusd_strategy_lab_prd_v1_0_reusable_local_strategy_lab, xauusd_strategy_lab_prd_v1_0_python_authoritative_architecture [INFERRED 0.85]
- **Candle Data Contract Flow** — data_candles_readme_candle_files, readme_candle_file_contract, xauusd_strategy_lab_prd_v1_0_dataset_validation, xauusd_strategy_lab_prd_v1_0_canonical_candle_contract, xauusd_strategy_lab_prd_v1_0_timeframe_aggregation [INFERRED 0.95]

## Communities (21 total, 3 thin omitted)

### Community 0 - "Strategy Indicators"
Cohesion: 0.11
Nodes (22): ABC, Any, DataFrame, Describe decision-time values the engine should freeze on each trade.…, Strategy, BollingerAwesomeStrategy, ema(), price_source() (+14 more)

### Community 1 - "Frontend Data Models"
Cohesion: 0.09
Nodes (18): api, App(), StrategyChart(), time(), money, Results(), Props, StrategyControls() (+10 more)

### Community 2 - "Backtest Product Contract"
Cohesion: 0.07
Nodes (33): Candle Files, Filename and Timeframe Convention, UTC Timestamp Assumption, React Root Mount Point, Shefa Strategy Lab HTML Shell, Candle File Contract, Completed-Candle Execution, Conservative Intrabar Collision Policy (+25 more)

### Community 3 - "Backtest Execution Engine"
Cohesion: 0.17
Nodes (27): calculate_metrics(), calculate_strategy_diagnostics(), _close(), _context_buckets(), _finite_or_none(), floor_to_step(), _mean(), _outcome_summary() (+19 more)

### Community 4 - "Frontend TypeScript Config"
Cohesion: 0.09
Nodes (21): DOM, DOM.Iterable, ES2022, src, compilerOptions, allowJs, allowSyntheticDefaultImports, esModuleInterop (+13 more)

### Community 5 - "API and Run Storage"
Cohesion: 0.15
Nodes (13): analyze(), catalog(), health(), saved_run(), saved_runs(), strategies(), AnalyzeRequest, Any (+5 more)

### Community 6 - "Frontend Package Scripts"
Cohesion: 0.11
Nodes (18): devDependencies, @types/react, @types/react-dom, typescript, vitest, name, private, scripts (+10 more)

### Community 7 - "Candle Data Pipeline"
Cohesion: 0.24
Nodes (11): CandleDataError, CandleRepository, DatasetRef, normalize_timeframe(), DataFrame, Path, Path, test_discovers_named_timeframes() (+3 more)

### Community 8 - "Frontend Dependencies"
Cohesion: 0.15
Nodes (13): lightweight-charts, lucide-react, dependencies, lightweight-charts, lucide-react, react, react-dom, vite (+5 more)

### Community 9 - "Build Tool Configuration"
Cohesion: 0.20
Nodes (9): vite.config.ts, compilerOptions, allowImportingTsExtensions, composite, module, moduleResolution, noEmit, skipLibCheck (+1 more)

## Knowledge Gaps
- **68 isolated node(s):** `name`, `private`, `version`, `type`, `dev` (+63 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **3 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `run_backtest()` connect `Backtest Execution Engine` to `API and Run Storage`, `Candle Data Pipeline`?**
  _High betweenness centrality (0.041) - this node is a cross-community bridge._
- **Why does `CandleDataError` connect `Candle Data Pipeline` to `Strategy Indicators`, `API and Run Storage`?**
  _High betweenness centrality (0.023) - this node is a cross-community bridge._
- **Why does `CandleRepository` connect `Candle Data Pipeline` to `API and Run Storage`?**
  _High betweenness centrality (0.023) - this node is a cross-community bridge._
- **Are the 3 inferred relationships involving `Contractual Backtesting Semantics` (e.g. with `Completed-Candle Execution` and `Conservative Intrabar Collision Policy`) actually correct?**
  _`Contractual Backtesting Semantics` has 3 INFERRED edges - model-reasoned connections that need verification._
- **What connects `name`, `private`, `version` to the rest of the system?**
  _68 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Strategy Indicators` be split into smaller, more focused modules?**
  _Cohesion score 0.10793650793650794 - nodes in this community are weakly interconnected._
- **Should `Frontend Data Models` be split into smaller, more focused modules?**
  _Cohesion score 0.0944741532976827 - nodes in this community are weakly interconnected._