import type { analyzeTrades } from "../backtestAnalytics";
import { formatInteger, formatNumber, money } from "../format";

export default function MonthlySummary({ rows }: { rows: ReturnType<typeof analyzeTrades>["calendar"] }) {
  return <section className="monthly-summary"><h3>Monthly summary</h3><div className="table-wrap"><table><thead><tr><th>Month</th><th>Starting equity</th><th>Ending equity</th><th>Net profit / Net R</th><th>Trades</th><th>Win rate</th><th>Profit factor</th><th>Max drawdown</th><th>Trading costs</th></tr></thead><tbody>{rows.map((row) => <tr key={row.key}><td><strong>{row.key}</strong></td><td>{money.format(row.startingEquity)}</td><td>{money.format(row.endingEquity)}</td><td className={row.netProfit >= 0 ? "positive" : "negative"}>{money.format(row.netProfit)}<small>{signed(row.netR)}R</small></td><td>{formatInteger(row.trades)}</td><td>{formatNumber(row.winRate, 1)}%</td><td>{row.profitFactor == null ? "—" : formatNumber(row.profitFactor, 2)}</td><td className="negative">{money.format(row.maxDrawdown)}</td><td>{money.format(row.costs)}</td></tr>)}</tbody></table></div></section>;
}

function signed(value: number) { return `${value >= 0 ? "+" : ""}${formatNumber(value, 2)}`; }
