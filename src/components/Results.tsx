import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { analyzeTrades, type HistogramBin, type PeriodSummary } from "../backtestAnalytics";
import { formatDateTime, formatInteger, formatNumber, money } from "../format";
import type { BacktestResult, OutcomeSummary, Trade } from "../types";
import EquityChart from "./EquityChart";
import MonthlySummary from "./MonthlySummary";

const tabs = [["metrics", "Key metrics"], ["types", "Trades by type"], ["calendar", "Calendar"], ["strategy", "Strategy metrics"], ["equity", "Equity chart"], ["trades", "Trades list"], ["risk", "Risk & robustness"]] as const;
type Tab = typeof tabs[number][0];

export default function Results({ analysis, initialCapital = 10_000, onSelectTrade }: { analysis: BacktestResult; initialCapital?: number; onSelectTrade?: (trade: Trade) => void }) {
  const [activeTab, setActiveTab] = useState<Tab>("metrics");
  const analytics = useMemo(() => analyzeTrades(analysis.trades, initialCapital, analysis.fingerprint, analysis.candles), [analysis, initialCapital]);
  useEffect(() => { setActiveTab("metrics"); }, [analysis.fingerprint]);
  return <section className="results">
    <div className="result-tabs" role="tablist" aria-label="Backtest results">
      {tabs.map(([key, label]) => <button key={key} role="tab" aria-selected={activeTab === key} className={activeTab === key ? "active" : ""} onClick={() => setActiveTab(key)}>{label}</button>)}
      <span className="fingerprint">RUN {analysis.saved_run_id.toUpperCase()}</span>
    </div>
    <div className="result-panel" role="tabpanel">
      {activeTab === "metrics" && <KeyMetrics analysis={analysis} />}
      {activeTab === "types" && <TradesByType trades={analysis.trades} />}
      {activeTab === "calendar" && <CalendarMatrix analytics={analytics} />}
      {activeTab === "strategy" && <StrategyMetrics analysis={analysis} />}
      {activeTab === "equity" && <EquityView analysis={analysis} analytics={analytics} />}
      {activeTab === "trades" && <TradeList analysis={analysis} onSelectTrade={onSelectTrade} />}
      {activeTab === "risk" && <RiskRobustness analysis={analysis} analytics={analytics} />}
    </div>
  </section>;
}

function KeyMetrics({ analysis }: { analysis: BacktestResult }) {
  const { metrics } = analysis;
  return <><SectionHeading eyebrow="Performance overview" title="Key metrics" detail={`${analysis.strategy.name} · v${analysis.strategy.version}`} /><div className="metric-grid">
    <Metric label="Net profit" value={money.format(metrics.net_profit)} tone={metrics.net_profit >= 0 ? "positive" : "negative"} detail={`${formatNumber(metrics.return_percent, 2)}% return`} />
    <Metric label="Closed trades" value={formatInteger(metrics.closed_trades)} detail={`${formatNumber(metrics.win_rate, 1)}% win rate`} />
    <Metric label="Profit factor" value={formatRatio(metrics.profit_factor)} detail={`${formatNumber(metrics.expectancy_r, 2)}R expectancy`} />
    <Metric label="Max drawdown" value={money.format(metrics.max_drawdown)} tone="negative" detail={`${formatNumber(metrics.max_drawdown_percent, 2)}% of capital`} />
    <Metric label="Consecutive wins" value={formatInteger(metrics.consecutive_wins)} detail="longest winning streak" />
    <Metric label="Consecutive losses" value={formatInteger(metrics.consecutive_losses)} tone="negative" detail="longest losing streak" />
    <Metric label="Recovery factor" value={formatRatio(metrics.recovery_factor)} detail="net profit ÷ max drawdown" />
    <Metric label="Expectancy / trade" value={money.format(metrics.expectancy_per_trade)} detail={`${formatNumber(metrics.expectancy_r, 2)}R per trade`} />
    <Metric label="Payoff ratio" value={formatRatio(metrics.payoff_ratio)} detail="average win ÷ average loss" />
    <Metric label="Max DD duration" value={formatDuration(metrics.max_drawdown_duration_seconds)} detail="peak to recovery or run end" />
    <Metric label="Longest recovery" value={formatDuration(metrics.longest_recovery_seconds)} detail="trough to prior equity peak" />
    <Metric label="Average holding" value={formatDuration(metrics.average_holding_seconds)} detail="entry to exit" />
    <Metric label="Time in market" value={`${formatNumber(metrics.time_in_market_percent, 2)}%`} detail="open-position exposure" />
    <Metric label="Gross result" value={money.format(metrics.gross_result)} tone={metrics.gross_result >= 0 ? "positive" : "negative"} detail={`before ${money.format(metrics.total_costs)} costs`} />
    <Metric label="Net result" value={money.format(metrics.net_result)} tone={metrics.net_result >= 0 ? "positive" : "negative"} detail="after trading costs" />
    <Metric label="Total costs paid" value={money.format(metrics.total_costs)} tone="negative" detail="spread, slippage, commission" />
  </div></>;
}

function TradesByType({ trades }: { trades: Trade[] }) {
  const direction = useMemo(() => summarizeGroups(trades, [["Buys", (trade) => trade.direction === "long"], ["Sells", (trade) => trade.direction === "short"]]), [trades]);
  const outcome = useMemo(() => summarizeGroups(trades, [["Winners", (trade) => trade.net_pnl > 0], ["Losers", (trade) => trade.net_pnl < 0], ["Breakeven", (trade) => trade.net_pnl === 0]]), [trades]);
  const exits = useMemo(() => summarizeGroups(trades, [...new Set(trades.map((trade) => trade.exit_reason))].map((reason) => [humanize(reason), (trade: Trade) => trade.exit_reason === reason])), [trades]);
  const weekdays = useMemo(() => summarizeGroups(trades, ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].map((day, index) => [day, (trade: Trade) => ((new Date(trade.exit_time).getUTCDay() + 6) % 7) === index])), [trades]);
  return <><SectionHeading eyebrow="Comparison" title="Trades by type" detail="Direction, outcome, exit behavior, and close day" /><div className="comparison-grid"><ComparisonTable title="Direction" rows={direction} /><ComparisonTable title="Outcome" rows={outcome} /><ComparisonTable title="Day of week · UTC" rows={weekdays} /><ComparisonTable title="Exit reason" rows={exits} /></div></>;
}

function CalendarMatrix({ analytics }: { analytics: ReturnType<typeof analyzeTrades> }) {
  const [tooltip, setTooltip] = useState<{ text: string; left: number; top: number } | null>(null);
  const magnitude = Math.max(...analytics.calendar.flatMap((month) => [...month.cells.values()].map((cell) => Math.abs(cell.netR))), 0.01);
  return <><SectionHeading eyebrow="Daily realized performance" title="Calendar matrix" detail="Rows are YYYY-MM · columns are UTC exit day" /><div className="calendar-legend"><span><i className="calendar-sample gain" /> Positive Net R</span><span><i className="calendar-sample loss" /> Negative Net R</span><span><i className="calendar-sample zero" /> Zero</span><span><i className="calendar-sample blank" /> No trade</span></div><div className="calendar-wrap"><table className="calendar-table"><thead><tr><th>Month</th>{Array.from({ length: 31 }, (_, index) => <th key={index + 1}>{index + 1}</th>)}<th>Monthly Net R</th><th>Trades</th><th>Win rate</th><th>Profit factor</th><th>Max monthly DD</th></tr></thead><tbody>{analytics.calendar.map((month) => <tr key={month.key}><td><strong>{month.key}</strong></td>{Array.from({ length: 31 }, (_, index) => {
    const cell = month.cells.get(index + 1);
    if (!cell) return <td className="calendar-cell blank" key={index + 1} aria-label={`${month.key}-${String(index + 1).padStart(2, "0")}: no trades`} />;
    const tooltip = `${cell.date}\nNet R: ${signed(cell.netR)}R\nNet profit: ${money.format(cell.netProfit)}\nTrades: ${formatInteger(cell.trades)}\nWins/losses: ${formatInteger(cell.wins)}/${formatInteger(cell.losses)}\nLargest trade: ${money.format(cell.largestTrade.net_pnl)} (${signed(cell.largestTrade.result_r)}R)`;
    return <td className={`calendar-cell ${cell.netR > 0 ? "gain" : cell.netR < 0 ? "loss" : "zero"}`} key={index + 1}><button style={{ "--cell-alpha": .16 + Math.abs(cell.netR) / magnitude * .76 } as React.CSSProperties} aria-label={tooltip.replaceAll("\n", ", ")} onPointerMove={(event) => setTooltip(tooltipAtCursor(tooltip, event.clientX, event.clientY))} onPointerLeave={() => setTooltip(null)} onBlur={() => setTooltip(null)} onFocus={(event) => { const bounds = event.currentTarget.getBoundingClientRect(); setTooltip(tooltipAtCursor(tooltip, bounds.right, bounds.top)); }}>{signed(cell.netR)}</button></td>;
  })}<td className={month.netR >= 0 ? "positive" : "negative"}><strong>{signed(month.netR)}R</strong><small>{money.format(month.netProfit)}</small></td><td>{formatInteger(month.trades)}</td><td>{formatNumber(month.winRate, 1)}%</td><td>{formatRatio(month.profitFactor)}</td><td className="negative">{money.format(month.maxDrawdown)}</td></tr>)}</tbody></table></div>{tooltip && createPortal(<div className="calendar-tooltip" role="tooltip" style={{ left: tooltip.left, top: tooltip.top }}>{tooltip.text}</div>, document.body)}</>;
}

function StrategyMetrics({ analysis }: { analysis: BacktestResult }) {
  const diagnostics = analysis.strategy_diagnostics;
  const contexts = Object.entries(diagnostics.context_outcomes);
  return <><SectionHeading eyebrow="Strategy-specific" title="Diagnostic metrics" detail="Signal-time context and post-trade behavior" /><section className="diagnostic-section"><h3>Trade excursion</h3><div className="diagnostic-overview"><Diagnostic label="Avg. favourable excursion" value={`${formatNumber(diagnostics.excursion.average_max_favorable_r, 2)}R`} detail={`${formatNumber(diagnostics.excursion.reached_one_r_percent, 1)}% reached +1R`} /><Diagnostic label="Avg. adverse excursion" value={`${formatNumber(diagnostics.excursion.average_max_adverse_r, 2)}R`} detail={`${formatNumber(diagnostics.excursion.reached_half_r_percent, 1)}% reached +0.5R`} /><Diagnostic label="OHLC collisions" value={formatInteger(diagnostics.excursion.target_stop_collision_count)} detail="bars touching stop and target" /></div></section><section className="diagnostic-section"><h3>Exit behavior</h3><DiagnosticTable title="Outcomes by exit reason" headers={["Exit", "Trades", "Net P&L", "Win rate", "Avg R"]} rows={diagnostics.exit_reasons.map((item) => [humanize(item.label), formatInteger(item.trade_count), money.format(item.net_profit), `${formatNumber(item.win_rate, 1)}%`, `${formatNumber(item.average_result_r, 2)}R`])} /></section><section className="diagnostic-section"><h3>Signal context</h3>{contexts.length ? <div className="context-tables">{contexts.map(([key, item]) => <DiagnosticTable key={key} title={item.label} subtitle={`Signal-time value · ${item.unit}`} headers={["Range", "Trades", "Net P&L", "Win rate", "Avg R"]} rows={item.buckets.map((bucket) => [`${formatNumber(bucket.low, 3)}–${formatNumber(bucket.high, 3)}`, formatInteger(bucket.trade_count), money.format(bucket.net_profit), `${formatNumber(bucket.win_rate, 1)}%`, `${formatNumber(bucket.average_result_r, 2)}R`])} />)}</div> : <EmptyResult>No analyzable signal-context fields for this strategy.</EmptyResult>}</section></>;
}

function EquityView({ analysis, analytics }: { analysis: BacktestResult; analytics: ReturnType<typeof analyzeTrades> }) {
  const endingEquity = analysis.equity.at(-1)?.value;
  return <><SectionHeading eyebrow="Account curve" title="Equity & drawdown" detail={endingEquity == null ? "No equity points" : `${money.format(endingEquity)} ending equity`} />{analysis.equity.length ? <EquityChart equity={analysis.equity} drawdown={analysis.drawdown} /> : <EmptyResult>No equity points are available for this run.</EmptyResult>}<div className="equity-monthly-summary"><MonthlySummary rows={analytics.calendar} /></div></>;
}

function TradeList({ analysis, onSelectTrade }: { analysis: BacktestResult; onSelectTrade?: (trade: Trade) => void }) {
  const pageSize = 25;
  const [page, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(analysis.trades.length / pageSize));
  const visibleTrades = useMemo(() => analysis.trades.slice((page - 1) * pageSize, page * pageSize), [analysis.trades, page]);
  useEffect(() => { setPage(1); }, [analysis.fingerprint]);
  const open = (trade: Trade) => { onSelectTrade?.(trade); document.querySelector(".chart-shell")?.scrollIntoView({ behavior: "smooth", block: "center" }); };
  return <><SectionHeading eyebrow="Trade ledger" title={`${formatInteger(analysis.trades.length)} completed positions`} detail={onSelectTrade ? "Select a row to inspect it on the candle chart" : undefined} /><div className="table-wrap"><table className="trade-table"><thead><tr><th>#</th><th>Side</th><th>Entry</th><th>Entry SL</th><th>Entry TP</th><th>Exit</th><th>Reason</th><th>Qty</th><th>Net P&amp;L</th><th>Result</th></tr></thead><tbody>{analysis.trades.length === 0 ? <tr><td colSpan={10} className="empty-row">No qualified trades in this dataset and configuration.</td></tr> : visibleTrades.map((trade) => <tr key={trade.trade_id} className={onSelectTrade ? "selectable-trade" : ""} tabIndex={onSelectTrade ? 0 : undefined} onClick={() => open(trade)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") open(trade); }}><td>{formatInteger(trade.trade_id)}</td><td><span className={`side ${trade.direction}`}>{trade.direction}</span></td><td><strong>{formatNumber(trade.entry_price, 2)}</strong><small>{formatDateTime(trade.entry_time)}</small></td><td>{formatNumber(trade.initial_stop, 2)}</td><td>{formatNumber(trade.initial_target, 2)}</td><td><strong>{formatNumber(trade.exit_price, 2)}</strong><small>{formatDateTime(trade.exit_time)}</small></td><td>{humanize(trade.exit_reason)}</td><td>{formatNumber(trade.quantity, 2)}</td><td className={trade.net_pnl >= 0 ? "positive" : "negative"}>{money.format(trade.net_pnl)}</td><td>{formatNumber(trade.result_r, 2)}R</td></tr>)}</tbody></table></div><div className="pagination"><span>Rows {formatInteger((page - 1) * pageSize + (analysis.trades.length ? 1 : 0))}–{formatInteger(Math.min(page * pageSize, analysis.trades.length))} of {formatInteger(analysis.trades.length)}</span><div><button disabled={page === 1} onClick={() => setPage((current) => current - 1)}>Previous</button><span>Page {formatInteger(page)} / {formatInteger(pageCount)}</span><button disabled={page === pageCount} onClick={() => setPage((current) => current + 1)}>Next</button></div></div></>;
}

function RiskRobustness({ analysis, analytics }: { analysis: BacktestResult; analytics: ReturnType<typeof analyzeTrades> }) {
  const metrics = analysis.metrics;
  return <><SectionHeading eyebrow="Risk diagnostics" title="Risk & robustness" detail="Deterministic resampling uses this run fingerprint as its seed" /><div className="risk-card-grid"><Diagnostic label="Maximum drawdown" value={money.format(metrics.max_drawdown)} detail={`${formatNumber(metrics.max_drawdown_percent, 2)}% · ${formatDuration(metrics.max_drawdown_duration_seconds)}`} /><Diagnostic label="Longest recovery" value={formatDuration(metrics.longest_recovery_seconds)} detail="trough to prior peak" /><Diagnostic label="Top 5 profit concentration" value={`${formatNumber(analytics.contribution.top5Percent, 1)}%`} detail={`Top 10: ${formatNumber(analytics.contribution.top10Percent, 1)}%`} /><Diagnostic label="Probability profitable" value={`${formatNumber(analytics.monteCarlo.profitableProbability, 1)}%`} detail="750 bootstrap paths" /><Diagnostic label="Expected drawdown range" value={`${formatNumber(analytics.monteCarlo.drawdownP10, 1)}–${formatNumber(analytics.monteCarlo.drawdownP90, 1)}R`} detail={`median ${formatNumber(analytics.monteCarlo.drawdownP50, 1)}R`} /><Diagnostic label="Likely losing streak" value={`${formatInteger(analytics.monteCarlo.streakP50)}–${formatInteger(analytics.monteCarlo.streakP90)}`} detail="median to 90th percentile" /></div><div className="robustness-grid"><RollingSummary analytics={analytics} /><ReturnHistogram bins={analytics.histogram} /><ContributionTable title="Best trade contribution" trades={analytics.contribution.best} /><ContributionTable title="Worst trade contribution" trades={analytics.contribution.worst} /><PeriodTable title="Performance by year" rows={analytics.years} /><ComparisonTable title="Performance by market regime" rows={analytics.regimes} /><CostSensitivity rows={analytics.costSensitivity} /></div></>;
}

function RollingSummary({ analytics }: { analytics: ReturnType<typeof analyzeTrades> }) { const last30 = analytics.rolling30.at(-1); const last50 = analytics.rolling50.at(-1); return <section className="robustness-card"><h3>Rolling trade windows</h3><table><thead><tr><th>Window</th><th>Expectancy</th><th>Profit factor</th><th>Win rate</th></tr></thead><tbody>{[["30 trades", last30], ["50 trades", last50]].map(([label, point]) => { const value = point as typeof last30; return <tr key={label as string}><td>{label as string}</td><td>{value ? `${formatNumber(value.expectancyR, 2)}R` : "—"}</td><td>{value?.profitFactor == null ? "—" : formatNumber(value.profitFactor, 2)}</td><td>{value ? `${formatNumber(value.winRate, 1)}%` : "—"}</td></tr>; })}</tbody></table></section>; }
function ReturnHistogram({ bins }: { bins: HistogramBin[] }) { const max = Math.max(...bins.map((bin) => bin.count), 1); return <section className="robustness-card"><h3>Return distribution · R</h3><div className="histogram">{bins.map((bin) => <div key={bin.low} title={`${formatNumber(bin.low, 2)}R to ${formatNumber(bin.high, 2)}R: ${formatInteger(bin.count)} trades`}><span className={bin.high <= 0 ? "loss" : "gain"} style={{ height: `${bin.count / max * 100}%` }} /><small>{formatNumber(bin.low, 1)}</small></div>)}</div></section>; }
function ContributionTable({ title, trades }: { title: string; trades: Trade[] }) { return <section className="robustness-card"><h3>{title}</h3><table><thead><tr><th>Trade</th><th>Net P&amp;L</th><th>Result</th></tr></thead><tbody>{trades.map((trade) => <tr key={trade.trade_id}><td>#{trade.trade_id}</td><td className={trade.net_pnl >= 0 ? "positive" : "negative"}>{money.format(trade.net_pnl)}</td><td>{signed(trade.result_r)}R</td></tr>)}</tbody></table></section>; }
function PeriodTable({ title, rows }: { title: string; rows: PeriodSummary[] }) { return <section className="robustness-card"><h3>{title}</h3><table><thead><tr><th>Year</th><th>Net P&amp;L</th><th>Net R</th><th>Trades</th><th>Win rate</th><th>PF</th><th>Max DD</th></tr></thead><tbody>{rows.map((row) => <tr key={row.key}><td>{row.key}</td><td className={row.netProfit >= 0 ? "positive" : "negative"}>{money.format(row.netProfit)}</td><td>{signed(row.netR)}R</td><td>{formatInteger(row.trades)}</td><td>{formatNumber(row.winRate, 1)}%</td><td>{formatRatio(row.profitFactor)}</td><td>{money.format(row.maxDrawdown)}</td></tr>)}</tbody></table></section>; }
function CostSensitivity({ rows }: { rows: ReturnType<typeof analyzeTrades>["costSensitivity"] }) { return <section className="robustness-card cost-card"><h3>Cost sensitivity</h3><table><thead><tr><th>Scenario</th><th>Net result</th><th>Difference vs base</th></tr></thead><tbody>{rows.map((row) => { const base = rows.find((item) => item.multiple === 1)?.netProfit || 0; return <tr key={row.label}><td>{row.label}</td><td className={row.netProfit >= 0 ? "positive" : "negative"}>{money.format(row.netProfit)}</td><td>{money.format(row.netProfit - base)}</td></tr>; })}</tbody></table></section>; }

function summarizeGroups(trades: Trade[], groups: [string, (trade: Trade) => boolean][]): OutcomeSummary[] { return groups.map(([label, predicate]) => { const matching = trades.filter(predicate); return { label, trade_count: matching.length, net_profit: matching.reduce((sum, trade) => sum + trade.net_pnl, 0), win_rate: matching.length ? matching.filter((trade) => trade.net_pnl > 0).length / matching.length * 100 : 0, average_result_r: matching.length ? matching.reduce((sum, trade) => sum + trade.result_r, 0) / matching.length : 0 }; }); }
function ComparisonTable({ title, rows }: { title: string; rows: OutcomeSummary[] }) { return <section className="comparison-card"><h3>{title}</h3>{rows.length ? <table><thead><tr><th>Type</th><th>Trades</th><th>Net P&amp;L</th><th>Win rate</th><th>Avg R</th></tr></thead><tbody>{rows.map((row) => <tr key={row.label}><td>{row.label}</td><td>{formatInteger(row.trade_count)}</td><td className={row.net_profit >= 0 ? "positive" : "negative"}>{money.format(row.net_profit)}</td><td>{formatNumber(row.win_rate, 1)}%</td><td>{formatNumber(row.average_result_r, 2)}R</td></tr>)}</tbody></table> : <EmptyResult>No trades to compare.</EmptyResult>}</section>; }
function SectionHeading({ eyebrow, title, detail }: { eyebrow: string; title: string; detail?: string }) { return <div className="result-section-heading"><div><span className="eyebrow">{eyebrow}</span><h2>{title}</h2></div>{detail && <span>{detail}</span>}</div>; }
function Diagnostic({ label, value, detail }: { label: string; value: string; detail: string }) { return <div className="diagnostic"><span>{label}</span><strong>{value}</strong><small>{detail}</small></div>; }
function DiagnosticTable({ title, subtitle, headers, rows }: { title: string; subtitle?: string; headers: string[]; rows: string[][] }) { return <section className="diagnostic-table"><div><strong>{title}</strong>{subtitle && <small>{subtitle}</small>}</div>{rows.length ? <table><thead><tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={`${title}-${index}`}>{row.map((value, column) => <td key={column}>{value}</td>)}</tr>)}</tbody></table> : <EmptyResult>No completed trades in this group.</EmptyResult>}</section>; }
function Metric({ label, value, detail, tone }: { label: string; value: string; detail: string; tone?: string }) { return <div className="metric"><span>{label}</span><strong className={tone}>{value}</strong><small>{detail}</small></div>; }
function EmptyResult({ children }: { children: React.ReactNode }) { return <div className="result-empty">{children}</div>; }
function humanize(value: string) { return value.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase()); }
function formatRatio(value: number | null) { return value == null || !Number.isFinite(value) ? "—" : formatNumber(value, 2); }
function formatDuration(seconds: number) { if (!seconds) return "0m"; const days = Math.floor(seconds / 86400); const hours = Math.floor(seconds % 86400 / 3600); const minutes = Math.floor(seconds % 3600 / 60); return days ? `${days}d ${hours}h` : hours ? `${hours}h ${minutes}m` : `${minutes}m`; }
function signed(value: number) { return `${value >= 0 ? "+" : ""}${formatNumber(value, 2)}`; }
function tooltipAtCursor(text: string, clientX: number, clientY: number) { return { text, left: Math.min(clientX + 14, window.innerWidth - 260), top: Math.min(clientY + 14, window.innerHeight - 150) }; }
