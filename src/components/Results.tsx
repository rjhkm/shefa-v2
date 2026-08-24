import { useEffect, useMemo, useState } from "react";
import type { Analysis } from "../types";

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });

export default function Results({ analysis }: { analysis: Analysis }) {
  const { metrics } = analysis;
  const diagnostics = analysis.strategy_diagnostics;
  const pageSize = 25;
  const [page, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(analysis.trades.length / pageSize));
  const visibleTrades = useMemo(() => analysis.trades.slice((page - 1) * pageSize, page * pageSize), [analysis.trades, page]);
  useEffect(() => setPage(1), [analysis.fingerprint]);
  return (
    <section className="results">
      <div className="metric-strip">
        <Metric label="Net profit" value={money.format(metrics.net_profit)} tone={metrics.net_profit >= 0 ? "positive" : "negative"} detail={`${metrics.return_percent.toFixed(2)}% return`} />
        <Metric label="Closed trades" value={String(metrics.closed_trades)} detail={`${metrics.win_rate.toFixed(1)}% win rate`} />
        <Metric label="Profit factor" value={metrics.profit_factor == null ? "—" : metrics.profit_factor.toFixed(2)} detail={`${metrics.expectancy_r.toFixed(2)}R expectancy`} />
        <Metric label="Max drawdown" value={money.format(metrics.max_drawdown)} tone="negative" detail={`${metrics.max_drawdown_percent.toFixed(2)}% of capital`} />
      </div>
      <section className="diagnostics">
        <div className="diagnostics-heading"><span className="eyebrow">Strategy diagnostics</span><span>Decision-time context and post-trade outcomes</span></div>
        <div className="diagnostic-overview">
          <Diagnostic label="Avg. favourable excursion" value={`${diagnostics.excursion.average_max_favorable_r.toFixed(2)}R`} detail={`${diagnostics.excursion.reached_one_r_percent.toFixed(1)}% reached +1R`} />
          <Diagnostic label="Avg. adverse excursion" value={`${diagnostics.excursion.average_max_adverse_r.toFixed(2)}R`} detail={`${diagnostics.excursion.reached_half_r_percent.toFixed(1)}% reached +0.5R`} />
          <Diagnostic label="OHLC collisions" value={String(diagnostics.excursion.target_stop_collision_count)} detail="bars touching both stop and target" />
        </div>
        <div className="diagnostic-grid">
          <DiagnosticTable title="Exit outcomes" headers={["Exit", "Trades", "Net P&L", "Win rate", "Avg R"]} rows={diagnostics.exit_reasons.map((item) => [item.label.replaceAll("_", " "), String(item.trade_count), money.format(item.net_profit), `${item.win_rate.toFixed(1)}%`, `${item.average_result_r.toFixed(2)}R`])} />
          <div className="context-tables">
            {Object.entries(diagnostics.context_outcomes).map(([key, item]) => (
              <DiagnosticTable key={key} title={item.label} subtitle={`Signal-time value · ${item.unit}`} headers={["Range", "Trades", "Net P&L", "Win rate", "Avg R"]} rows={item.buckets.map((bucket) => [`${bucket.low.toFixed(3)}–${bucket.high.toFixed(3)}`, String(bucket.trade_count), money.format(bucket.net_profit), `${bucket.win_rate.toFixed(1)}%`, `${bucket.average_result_r.toFixed(2)}R`])} />
            ))}
          </div>
        </div>
      </section>
      <div className="result-heading">
        <div><span className="eyebrow">Trade ledger</span><h2>{analysis.trades.length} completed positions</h2></div>
        <span className="fingerprint">SAVED RUN {analysis.saved_run_id.toUpperCase()}</span>
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>#</th><th>Side</th><th>Entry</th><th>Exit</th><th>Reason</th><th>Qty</th><th>Net P&amp;L</th><th>Result</th></tr></thead>
          <tbody>
            {analysis.trades.length === 0 ? (
              <tr><td colSpan={8} className="empty-row">No qualified trades in this dataset and configuration.</td></tr>
            ) : visibleTrades.map((trade) => (
              <tr key={trade.trade_id}>
                <td>{String(trade.trade_id).padStart(2, "0")}</td>
                <td><span className={`side ${trade.direction}`}>{trade.direction}</span></td>
                <td><strong>{trade.entry_price.toFixed(2)}</strong><small>{new Date(trade.entry_time).toLocaleString()}</small></td>
                <td><strong>{trade.exit_price.toFixed(2)}</strong><small>{new Date(trade.exit_time).toLocaleString()}</small></td>
                <td>{trade.exit_reason.replaceAll("_", " ")}</td>
                <td>{trade.quantity.toFixed(2)}</td>
                <td className={trade.net_pnl >= 0 ? "positive" : "negative"}>{money.format(trade.net_pnl)}</td>
                <td>{trade.result_r.toFixed(2)}R</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="pagination">
        <span>Rows {(page - 1) * pageSize + (analysis.trades.length ? 1 : 0)}–{Math.min(page * pageSize, analysis.trades.length)} of {analysis.trades.length}</span>
        <div><button disabled={page === 1} onClick={() => setPage((current) => current - 1)}>Previous</button><span>Page {page} / {pageCount}</span><button disabled={page === pageCount} onClick={() => setPage((current) => current + 1)}>Next</button></div>
      </div>
    </section>
  );
}

function Diagnostic({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <div className="diagnostic"><span>{label}</span><strong>{value}</strong><small>{detail}</small></div>;
}

function DiagnosticTable({ title, subtitle, headers, rows }: { title: string; subtitle?: string; headers: string[]; rows: string[][] }) {
  return <section className="diagnostic-table"><div><strong>{title}</strong>{subtitle && <small>{subtitle}</small>}</div><table><thead><tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={`${title}-${index}`}>{row.map((value, column) => <td key={column}>{value}</td>)}</tr>)}</tbody></table></section>;
}

function Metric({ label, value, detail, tone }: { label: string; value: string; detail: string; tone?: string }) {
  return <div className="metric"><span>{label}</span><strong className={tone}>{value}</strong><small>{detail}</small></div>;
}
