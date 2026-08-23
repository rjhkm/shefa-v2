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
