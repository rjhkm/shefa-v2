export type InputSchema = {
  key: string;
  label: string;
  type: "int" | "float" | "bool" | "choice";
  default: number | boolean | string;
  min?: number;
  max?: number;
  step?: number;
  options?: string[];
  group: string;
};

export type StrategySchema = {
  id: string;
  key: string;
  name: string;
  version: string;
  file_dir: string;
  version_notes: string;
  required_timeframe: string | null;
  parameters: InputSchema[];
  plots?: PlotSchema[];
};

export type PlotSchema = {
  key: string;
  label: string;
  type: "line" | "histogram";
  line_type?: "straight" | "step";
  color: string;
  negative_color?: string;
  line_width?: number;
  pane?: number;
};

export type Candle = {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
};

export type ValuePoint = { time: string; value: number };
export type TradeLabelMode = "cash" | "percent" | "pips";
export type ChartPayload = { candles: Candle[]; plot_schema: PlotSchema[]; plots: Record<string, ValuePoint[]>; chart_warning?: string | null };

export type Trade = {
  trade_id: number;
  direction: "long" | "short";
  quantity: number;
  signal_time: string;
  entry_time: string;
  entry_price: number;
  initial_stop: number;
  initial_target: number;
  initial_risk_cash: number;
  exit_time: string;
  exit_price: number;
  exit_reason: string;
  gross_pnl: number;
  spread_cost: number;
  slippage_cost: number;
  commission_cost: number;
  net_pnl: number;
  result_r: number;
  holding_bars: number;
  signal_reason: string;
  strategy_context: Record<string, number | null>;
  entry_gap_price: number;
  entry_gap_r: number;
  max_favorable_r: number;
  max_adverse_r: number;
  reached_half_r: boolean;
  reached_one_r: boolean;
  target_stop_collision: boolean;
  market_regime?: string;
};

export type OutcomeSummary = {
  label: string;
  trade_count: number;
  net_profit: number;
  win_rate: number;
  average_result_r: number;
};

export type ContextBucket = OutcomeSummary & { low: number; high: number };

export type StrategyDiagnostics = {
  schema_version: string;
  entry_context_fields: { key: string; label: string; unit: string }[];
  exit_reasons: OutcomeSummary[];
  excursion: {
    average_max_favorable_r: number;
    average_max_adverse_r: number;
    reached_half_r_percent: number;
    reached_one_r_percent: number;
    target_stop_collision_count: number;
  };
  context_outcomes: Record<string, { label: string; unit: string; buckets: ContextBucket[] }>;
};

export type BacktestMetrics = {
    closed_trades: number;
    net_profit: number;
    return_percent: number;
    win_rate: number;
    profit_factor: number | null;
    expectancy_r: number;
    max_drawdown: number;
    max_drawdown_percent: number;
    consecutive_wins: number;
    consecutive_losses: number;
    recovery_factor: number | null;
    expectancy_per_trade: number;
    payoff_ratio: number | null;
    max_drawdown_duration_seconds: number;
    longest_recovery_seconds: number;
    average_holding_seconds: number;
    time_in_market_percent: number;
    gross_result: number;
    net_result: number;
    total_costs: number;
};

export type BacktestResult = {
  strategy: { name: string; version: string };
  trades: Trade[];
  metrics: BacktestMetrics;
  strategy_diagnostics: StrategyDiagnostics;
  equity: ValuePoint[];
  drawdown: ValuePoint[];
  fingerprint: string;
  saved_run_id: string;
  candles?: Candle[];
};

export type Analysis = BacktestResult & {
  dataset: { file_name: string; dataset_hash: string; row_count: number; rendered_row_count: number; gap_count: number; market_closure_count: number; source_timezone: string; warnings: string[]; encoding: string; source_format: string };
  strategy: { id: string; key: string; name: string; version: string; version_notes: string; parameters: Record<string, unknown> };
  candles: Candle[];
  plot_schema: PlotSchema[];
  plots: Record<string, ValuePoint[]>;
  engine_version: string;
};

export type RunSummary = {
  run_id: string;
  created_at: string;
  pair: string;
  timeframe: string;
  strategy_name: string;
  strategy_version: string;
  run_start_time: string | null;
  run_end_time: string | null;
  run_days: number | null;
  equity_change: number;
  equity_change_percent: number;
  metrics: BacktestMetrics;
};

export type SavedRun = Omit<BacktestResult, "saved_run_id"> & {
  run_id: string;
  created_at: string;
  pair: string;
  timeframe: string;
  run_start_time?: string | null;
  run_end_time?: string | null;
  dataset: Analysis["dataset"];
  strategy: { id?: string; key: string; name: string; version: string; version_notes?: string; parameters: Record<string, unknown> };
  execution: Record<string, unknown>;
  engine_version: string;
  candles: Candle[];
  plot_schema: PlotSchema[];
  plots: Record<string, ValuePoint[]>;
  chart_warning?: string | null;
};

export type IndicatorAppearance = {
  visible: boolean;
  color: string;
  negativeColor?: string;
  lineWidth: number;
  opacity: number;
};

export type ChartAppearance = {
  indicators: Record<string, IndicatorAppearance>;
  trades: { visible: boolean; buyColor: string; sellColor: string; opacity: number };
};
