import { useEffect, useState } from "react";
import { Activity, ArrowLeft, ArrowRight, BarChart3, CalendarClock, Database, History, Moon, Palette, PanelLeftClose, PanelLeftOpen, Play, Plus, Settings2, Sun } from "lucide-react";
import { api } from "./api";
import AppearancePanel, { appearanceForPlots } from "./components/AppearancePanel";
import StrategyChart from "./components/Chart";
import Results from "./components/Results";
import { formatDate, formatDateTime, formatInteger, formatNumber, money } from "./format";
import type { ChartPayload, RunSummary, SavedRun, Trade, TradeLabelMode } from "./types";

type PageProps = { navigate: (path: string) => void; theme: "dark" | "light"; toggleTheme: () => void };

export function HomePage(props: PageProps) {
  return <main className={`theme-${props.theme} page-shell`}>
    <PageHeader {...props} />
    <section className="home-page">
      <span className="eyebrow">Strategy workspace</span>
      <h1>What would you like to inspect?</h1>
      <p>Start with a fresh configuration or revisit the evidence from a completed run.</p>
      <div className="home-picker">
        <button onClick={() => props.navigate("/backtest/new")}><span className="picker-icon"><Plus size={21} /></span><span><strong>Run new backtest</strong><small>Choose a market, strategy, version, and execution assumptions.</small></span><ArrowRight size={17} /></button>
        <button onClick={() => props.navigate("/backtests")}><span className="picker-icon"><History size={21} /></span><span><strong>Past backtests</strong><small>Compare saved runs and reopen their full result breakdown.</small></span><ArrowRight size={17} /></button>
      </div>
    </section>
  </main>;
}

export function PastBacktestsPage(props: PageProps) {
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => { api.runs().then((response) => setRuns(response.runs)).catch((reason) => setError(reason.message)).finally(() => setLoading(false)); }, []);
  return <main className={`theme-${props.theme} page-shell`}>
    <PageHeader {...props} />
    <section className="history-page">
      <div className="page-heading"><div><button className="back-link" onClick={() => props.navigate("/")}><ArrowLeft size={13} /> Home</button><span className="eyebrow">Saved evidence</span><h1>Past backtests</h1><p>Every deterministic run saved by the engine, newest first.</p></div><button className="run-button" onClick={() => props.navigate("/backtest/new")}><Play size={14} fill="currentColor" /> New backtest</button></div>
      {loading ? <PageLoading label="Loading saved runs…" /> : error ? <div className="notice error">{error}</div> : <div className="history-table-wrap"><table className="history-table"><thead><tr><th>Run ID</th><th>Strategy</th><th>Version</th><th>Run range</th><th>Equity change</th><th>Max drawdown</th><th /></tr></thead><tbody>
        {runs.length ? runs.map((run) => <tr key={run.run_id} onClick={() => props.navigate(`/backtest/${run.run_id}`)}><td><strong>{run.run_id.toUpperCase()}</strong><small>{formatDateTime(run.created_at)}</small></td><td><strong>{run.strategy_name}</strong><small>{run.pair} · {run.timeframe}</small></td><td>v{run.strategy_version}</td><td><strong>{formatDays(run.run_days)}</strong><small>{formatRange(run.run_start_time, run.run_end_time)}</small></td><td className={run.equity_change >= 0 ? "positive" : "negative"}><strong>{money.format(run.equity_change)}</strong><small>{formatNumber(run.equity_change_percent, 2)}%</small></td><td className="negative"><strong>{money.format(run.metrics.max_drawdown)}</strong><small>{formatNumber(run.metrics.max_drawdown_percent, 2)}%</small></td><td><button aria-label={`Open run ${run.run_id}`}><ArrowRight size={14} /></button></td></tr>) : <tr><td colSpan={7} className="empty-row">No saved backtests yet.</td></tr>}
      </tbody></table></div>}
    </section>
  </main>;
}

export function SavedBacktestPage({ runId, ...props }: PageProps & { runId: string }) {
  const [run, setRun] = useState<SavedRun | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [focusedTradeId, setFocusedTradeId] = useState<number | null>(null);
  const [focusedChart, setFocusedChart] = useState<ChartPayload | null>(null);
  const [chartError, setChartError] = useState("");
  useEffect(() => { api.run(runId).then(setRun).catch((reason) => setError(reason.message)).finally(() => setLoading(false)); }, [runId]);
  return <main className={`theme-${props.theme}`}>
    <PageHeader {...props} />
    {loading ? <PageLoading label="Opening saved backtest…" /> : error || !run ? <section className="history-page"><button className="back-link" onClick={() => props.navigate("/backtests")}><ArrowLeft size={13} /> Past backtests</button><div className="notice error">{error || "Saved run not found"}</div></section> : <SavedResultWorkspace run={run} theme={props.theme} chartError={chartError} focusTradeId={focusedTradeId} focusedChart={focusedChart} onSelectTrade={focusTrade} />}
  </main>;

  async function focusTrade(trade: Trade) {
    if (!run) return;
    setChartError("");
    if (chartContainsTrade(run.candles, trade)) {
      setFocusedChart(null);
      setFocusedTradeId(trade.trade_id);
      return;
    }
    try {
      const focused = await api.runChart(runId, trade.entry_time, trade.exit_time);
      setFocusedChart(focused);
      setFocusedTradeId(trade.trade_id);
    } catch (reason) {
      setChartError(reason instanceof Error ? reason.message : "Could not load the selected trade chart");
    }
  }
}

function SavedResultWorkspace({ run, theme, chartError, focusTradeId, focusedChart, onSelectTrade }: { run: SavedRun; theme: "dark" | "light"; chartError: string; focusTradeId: number | null; focusedChart: ChartPayload | null; onSelectTrade: (trade: Trade) => void }) {
  const [appearance, setAppearance] = useState(() => appearanceForPlots(run.plot_schema));
  const [labelMode, setLabelMode] = useState<TradeLabelMode>("cash");
  const [panelOpen, setPanelOpen] = useState(true);
  useEffect(() => setAppearance(appearanceForPlots(run.plot_schema)), [run.run_id, run.plot_schema]);
  const initialCapital = numericValue(run.execution.initial_capital, 10_000);
  const pipSize = numericValue(run.strategy.parameters.pip_size, 0.01);

  return <>
    <section className="saved-config-panel" aria-label="Saved backtest configuration">
      <ReadOnlyConfig icon={<Database size={13} />} label="Market" value={run.pair} />
      <ReadOnlyConfig label="Timeframe" value={run.timeframe} />
      <ReadOnlyConfig label="Strategy" value={run.strategy.name} />
      <ReadOnlyConfig label="Version" value={`v${run.strategy.version}`} />
      <div className="saved-config-run"><span>Saved run · {run.run_id.toUpperCase()}</span><small>{formatDateTime(run.created_at)}</small></div>
    </section>
    <div className={`workspace saved-workspace${panelOpen ? "" : " panel-collapsed"}`}>
      <aside className={`sidebar saved-parameter-sidebar${panelOpen ? "" : " collapsed"}`}>
        <div className="sidebar-title">{panelOpen && <span><Settings2 size={15} /> Parameters</span>}<button className="chart-panel-toggle" type="button" aria-label={panelOpen ? "Collapse parameters panel" : "Expand parameters panel"} aria-expanded={panelOpen} onClick={() => setPanelOpen((current) => !current)}>{panelOpen ? <PanelLeftClose size={15} /> : <PanelLeftOpen size={15} />}</button></div>
        {panelOpen && <>
          {run.strategy.version_notes && <div className="version-notes"><strong>Version notes</strong><p>{run.strategy.version_notes}</p></div>}
          <ReadOnlyFields title="Strategy" values={run.strategy.parameters} />
          <ReadOnlyFields title="Execution" values={run.execution} />
          <section className="control-group"><h3>Chart display</h3><label className="field"><span>Exit P&amp;L</span><select id="pnl-label-mode" value={labelMode} onChange={(event) => setLabelMode(event.target.value as TradeLabelMode)}><option value="cash">P&amp;L $</option><option value="percent">P&amp;L %</option><option value="pips"># Pips</option></select></label>{labelMode === "pips" && <small className="readonly-hint">1 pip = {formatNumber(pipSize, 4, 0)} price units</small>}</section>
          <section className="control-group appearance-group"><h3><Palette size={11} /> Appearance</h3><AppearancePanel plots={run.plot_schema} appearance={appearance} onChange={setAppearance} /></section>
        </>}
      </aside>
      <section className="main-panel">
        <div className="context-bar"><div><span className="live-dot" /><strong>RUN {run.run_id.toUpperCase()}</strong><span>{formatRange(run.run_start_time || null, run.run_end_time || null)}</span></div><div><span>{run.dataset.source_timezone || "UTC · unconfirmed"}</span></div></div>
        {chartError && <div className="notice error">{chartError}</div>}
        {run.chart_warning || !run.candles.length ? <div className="notice chart-warning">Candle chart unavailable: {run.chart_warning || "no candle data was returned"}.</div> : <div className="chart-shell saved-workspace-chart"><div className="chart-label"><span>{run.dataset.file_name}</span><span>{focusedChart ? `${formatInteger(focusedChart.candles.length)} candles · focused trade` : `${formatInteger(run.dataset.rendered_row_count)} candles · ${formatInteger(run.trades.length)} trades`}</span></div><StrategyChart analysis={focusedChart ? { ...run, ...focusedChart } : run} appearance={appearance} theme={theme} tradeLabelMode={labelMode} initialCapital={initialCapital} pipSize={pipSize} focusTradeId={focusTradeId} /></div>}
        <Results analysis={{ ...run, saved_run_id: run.run_id }} initialCapital={initialCapital} onSelectTrade={onSelectTrade} />
      </section>
    </div>
  </>;
}

function ReadOnlyConfig({ icon, label, value }: { icon?: React.ReactNode; label: string; value: string }) { return <div className="readonly-config"><span>{icon}{label}</span><strong>{value}</strong></div>; }
function ReadOnlyFields({ title, values }: { title: string; values: Record<string, unknown> }) { return <section className="control-group"><h3>{title}</h3>{Object.entries(values).map(([key, value]) => <div className="readonly-field" key={key}><span>{parameterLabel(key)}</span><strong>{formatReadonlyValue(value)}</strong></div>)}</section>; }

export function NotFoundPage(props: PageProps) {
  return <main className={`theme-${props.theme} page-shell`}><PageHeader {...props} /><section className="home-page"><span className="eyebrow">404</span><h1>Page not found</h1><button className="ghost-run" onClick={() => props.navigate("/")}><ArrowLeft size={14} /> Return home</button></section></main>;
}

export function PageHeader({ navigate, theme, toggleTheme }: PageProps) {
  return <header className="topbar result-navigation-topbar"><button className="brand" onClick={() => navigate("/")}><span className="brand-mark"><BarChart3 size={18} /></span><span className="brand-copy"><strong>Shefa</strong><span>Strategy Lab</span></span></button><nav><button onClick={() => navigate("/backtest/new")}><Plus size={13} /> New backtest</button><button onClick={() => navigate("/backtests")}><CalendarClock size={13} /> Past backtests</button></nav><button className="theme-button" onClick={toggleTheme} aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}>{theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}</button></header>;
}

function PageLoading({ label }: { label: string }) { return <div className="page-loading"><Activity className="spin" /> {label}</div>; }
function formatDays(days: number | null) { return days == null ? "—" : `${formatNumber(days, days < 1 ? 2 : 1)} days`; }
function formatRange(start: string | null, end: string | null) { return start && end ? `${formatDate(start)} – ${formatDate(end)}` : "Range unavailable"; }
function numericValue(value: unknown, fallback: number) { return typeof value === "number" && Number.isFinite(value) ? value : fallback; }
function chartContainsTrade(candles: SavedRun["candles"], trade: Trade) { return Boolean(candles.length && Date.parse(trade.entry_time) >= Date.parse(candles[0].time) && Date.parse(trade.exit_time) <= Date.parse(candles.at(-1)!.time)); }
function parameterLabel(key: string) { return key.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()).replace("Atr", "ATR"); }
function formatReadonlyValue(value: unknown) { if (value == null || value === "") return "—"; if (typeof value === "boolean") return value ? "Yes" : "No"; if (typeof value === "number") return formatNumber(value, 4, 0); return String(value); }
