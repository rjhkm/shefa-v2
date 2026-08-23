import { useEffect, useMemo, useState } from "react";
import type { Analysis } from "../types";

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });

export default function Results({ analysis }: { analysis: Analysis }) {
  const { metrics } = analysis;
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

function Metric({ label, value, detail, tone }: { label: string; value: string; detail: string; tone?: string }) {
  return <div className="metric"><span>{label}</span><strong className={tone}>{value}</strong><small>{detail}</small></div>;
}
