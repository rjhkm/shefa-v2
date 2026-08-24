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
  key: string;
  name: string;
  version: string;
  parameters: InputSchema[];
};

export type Candle = {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
};

export type ValuePoint = { time: string; value: number };

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

export type Analysis = {
  dataset: { file_name: string; dataset_hash: string; row_count: number; rendered_row_count: number; gap_count: number; market_closure_count: number; source_timezone: string; warnings: string[]; encoding: string; source_format: string };
  strategy: { key: string; name: string; version: string; parameters: Record<string, unknown> };
  candles: Candle[];
  plots: Record<string, ValuePoint[]>;
  trades: Trade[];
  metrics: {
    closed_trades: number;
    net_profit: number;
    return_percent: number;
    win_rate: number;
    profit_factor: number | null;
    expectancy_r: number;
    max_drawdown: number;
    max_drawdown_percent: number;
  };
  strategy_diagnostics: StrategyDiagnostics;
  equity: ValuePoint[];
  drawdown: ValuePoint[];
  fingerprint: string;
  engine_version: string;
  saved_run_id: string;
};

export type ChartAppearance = {
  basis: { visible: boolean; color: string };
  bands: { visible: boolean; color: string };
  fastEma: { visible: boolean; color: string };
  ao: { visible: boolean; upColor: string; downColor: string };
  trades: { visible: boolean; buyColor: string; sellColor: string };
};
