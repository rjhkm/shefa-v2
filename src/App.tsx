import { useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, BarChart3, ChevronDown, CircleDot, Database, Moon, Palette, Play, RefreshCw, Settings2, Sun } from "lucide-react";
import { api } from "./api";
import StrategyChart from "./components/Chart";
import Results from "./components/Results";
import { formatDateRange, formatInteger } from "./format";
import StrategyControls from "./components/StrategyControls";
import { HomePage, NotFoundPage, PastBacktestsPage, SavedBacktestPage } from "./pages";
import { compatibleTimeframes, preferredTimeframe } from "./strategyTimeframe";
import { latestStrategyVersion, strategyKeys, versionsForStrategy } from "./strategyVersions";
import AppearancePanel, { defaultIndicatorAppearance } from "./components/AppearancePanel";
import type { Analysis, ChartAppearance, ChartPayload, StrategySchema, Trade } from "./types";

type Theme = "dark" | "light";
type Navigate = (path: string) => void;

export default function App() {
  const [path, setPath] = useState(() => window.location.pathname);
  const [theme, setTheme] = useState<Theme>(() => localStorage.getItem("shefa-theme") === "light" ? "light" : "dark");
  useEffect(() => {
    const onPopState = () => setPath(window.location.pathname);
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);
  useEffect(() => { localStorage.setItem("shefa-theme", theme); }, [theme]);
  useEffect(() => { window.scrollTo({ top: 0, left: 0 }); }, [path]);
  const navigate: Navigate = (nextPath) => {
    if (nextPath !== window.location.pathname) window.history.pushState({}, "", nextPath);
    setPath(nextPath);
  };
  const pageProps = { navigate, theme, toggleTheme: () => setTheme((current) => current === "dark" ? "light" : "dark") };
  if (path === "/") return <HomePage {...pageProps} />;
  if (path === "/backtest/new") return <BacktestLab {...pageProps} />;
  if (path === "/backtests") return <PastBacktestsPage {...pageProps} />;
  const savedRunMatch = path.match(/^\/backtest\/([a-f0-9]{12})$/i);
  if (savedRunMatch) return <SavedBacktestPage {...pageProps} runId={savedRunMatch[1].toLowerCase()} />;
  return <NotFoundPage {...pageProps} />;
}

function BacktestLab({ theme, toggleTheme, navigate }: { theme: Theme; toggleTheme: () => void; navigate: Navigate }) {
  const [catalog, setCatalog] = useState<Record<string, string[]>>({});
  const [strategies, setStrategies] = useState<StrategySchema[]>([]);
  const [pair, setPair] = useState("");
  const [timeframe, setTimeframe] = useState("");
  const [strategyKey, setStrategyKey] = useState("");
  const [strategyId, setStrategyId] = useState("");
  const [parameters, setParameters] = useState<Record<string, unknown>>({});
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [focusedTradeId, setFocusedTradeId] = useState<number | null>(null);
  const [focusedChart, setFocusedChart] = useState<ChartPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [stale, setStale] = useState(false);
  const [error, setError] = useState("");
  const [sourceTimezone, setSourceTimezone] = useState("");
  const [dateRanges, setDateRanges] = useState({
    backtestStart: "", backtestEnd: "", forwardEnabled: false, forwardStart: "", forwardEnd: "",
  });
  const [appearance, setAppearance] = useState<ChartAppearance>({
    indicators: {},
    trades: { visible: true, buyColor: "#22a978", sellColor: "#e0524d", opacity: 100 },
  });
  const [execution, setExecution] = useState({
    initial_capital: 10000,
    risk_percent: 0.5,
    point_value: 1,
    spread: 0.2,
    slippage: 0,
    commission_per_quantity_per_side: 0,
  });

  const strategy = useMemo(() => strategies.find((item) => item.id === strategyId), [strategies, strategyId]);
  const strategyFamilies = useMemo(() => strategyKeys(strategies), [strategies]);
  const strategyVersions = useMemo(() => versionsForStrategy(strategies, strategyKey), [strategies, strategyKey]);
  const pairs = Object.keys(catalog);
  const timeframeOptions = compatibleTimeframes(strategy, catalog[pair] || []);

  useEffect(() => {
    Promise.all([api.catalog(), api.strategies()])
      .then(([catalogResponse, strategyResponse]) => {
        setCatalog(catalogResponse.datasets);
        setStrategies(strategyResponse.strategies);
        const firstPair = Object.keys(catalogResponse.datasets)[0] || "";
        setPair(firstPair);
        setTimeframe(catalogResponse.datasets[firstPair]?.[0] || "");
        const firstKey = strategyKeys(strategyResponse.strategies)[0] || "";
        const firstStrategy = latestStrategyVersion(strategyResponse.strategies, firstKey);
        if (firstStrategy) {
          setStrategyKey(firstStrategy.key);
          setStrategyId(firstStrategy.id);
          setParameters(Object.fromEntries(firstStrategy.parameters.map((input) => [input.key, input.default])));
        }
      })
      .catch((reason) => setError(reason.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!strategy) return;
    setAppearance((current) => ({
      ...current,
      indicators: Object.fromEntries((strategy.plots || []).map((plot) => [
        plot.key,
        current.indicators[plot.key] || defaultIndicatorAppearance(plot),
      ])),
    }));
  }, [strategy]);

  useEffect(() => {
    if (!pair || !timeframe) return;
    let cancelled = false;
    api.datasetRange(pair, timeframe).then((range) => {
      if (cancelled) return;
      const start = toDateTimeInput(range.start_time);
      const end = toDateTimeInput(range.end_time);
      const split = toDateTimeInput(new Date(Date.parse(range.start_time) + (Date.parse(range.end_time) - Date.parse(range.start_time)) * .8).toISOString());
      setDateRanges({ backtestStart: start, backtestEnd: end, forwardEnabled: false, forwardStart: split, forwardEnd: end });
    }).catch((reason) => { if (!cancelled) setError(reason.message); });
    return () => { cancelled = true; };
  }, [pair, timeframe]);

  const selectPair = (value: string) => {
    setPair(value);
    setTimeframe(preferredTimeframe(strategy, catalog[value] || []));
    setStale(Boolean(analysis));
  };

  const run = async () => {
    if (!pair || !timeframe || !strategyId) return;
    setRunning(true);
    setError("");
    try {
      const result = await api.analyze({
        pair,
        timeframe,
        strategy_key: strategyKey,
        strategy_id: strategyId,
        parameters,
        initial_capital: execution.initial_capital,
        sizing_mode: "risk",
        risk_percent: execution.risk_percent,
        fixed_quantity: 1,
        point_value: execution.point_value,
        quantity_step: 0.01,
        minimum_quantity: 0.01,
        spread: execution.spread,
        slippage: execution.slippage,
        commission_per_quantity_per_side: execution.commission_per_quantity_per_side,
        source_timezone: sourceTimezone || null,
        backtest_start_time: dateRanges.backtestStart || null,
        backtest_end_time: dateRanges.backtestEnd || null,
        forward_enabled: dateRanges.forwardEnabled,
        forward_start_time: dateRanges.forwardEnabled ? dateRanges.forwardStart : null,
        forward_end_time: dateRanges.forwardEnabled ? dateRanges.forwardEnd : null,
      });
      setAnalysis(result);
      setFocusedTradeId(null);
      setFocusedChart(null);
      setStale(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Backtest failed");
    } finally {
      setRunning(false);
    }
  };

  if (loading) return <div className="boot"><Activity className="spin" /> Opening strategy lab…</div>;

  return (
    <main className={`theme-${theme}`}>
      <header className="topbar">
        <button className="brand" onClick={() => navigate("/")}><span className="brand-mark"><BarChart3 size={18} /></span><span className="brand-copy"><strong>Shefa</strong><span>Strategy Lab</span></span></button>
        <div className="selectors">
          <Selector label="Market" icon={<Database size={14} />} value={pair} options={pairs} onChange={selectPair} />
          <Selector label="Timeframe" value={timeframe} options={timeframeOptions} onChange={(value) => { setTimeframe(value); setStale(Boolean(analysis)); }} />
          <Selector label="Strategy" value={strategyKey} options={strategyFamilies} render={(value) => strategies.find((item) => item.key === value)?.name || value} onChange={(value) => { setStrategyKey(value); const next = latestStrategyVersion(strategies, value); if (next) { setStrategyId(next.id); applyStrategyVersion(next); } setStale(Boolean(analysis)); }} />
          <Selector label="Version" value={strategyId} options={strategyVersions.map((item) => item.id)} render={(value) => `v${strategies.find((item) => item.id === value)?.version || value}`} onChange={(value) => { setStrategyId(value); const next = strategies.find((item) => item.id === value); if (next) applyStrategyVersion(next); setStale(Boolean(analysis)); }} />
        </div>
        <button className="theme-button" onClick={toggleTheme} aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}>
          {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
        </button>
        <button className="run-button" onClick={run} disabled={running || !pair || !timeframe}>
          {running ? <RefreshCw size={15} className="spin" /> : <Play size={15} fill="currentColor" />}
          {running ? "Running" : "Run backtest"}
        </button>
      </header>

      <div className="workspace">
        <aside className="sidebar">
          <div className="sidebar-title"><span><Settings2 size={15} /> Parameters</span><small>v{strategy?.version || "—"}</small></div>
          {strategy?.version_notes && <div className="version-notes"><strong>Version notes</strong><p>{strategy.version_notes}</p></div>}
          {strategy && <StrategyControls strategy={strategy} values={parameters} onChange={(key, value) => { setParameters((current) => ({ ...current, [key]: value })); setStale(Boolean(analysis)); }} />}
          <section className="control-group date-range-controls">
            <h3>Date ranges · UTC</h3>
            <DateTimeRange label="Main backtest" start={dateRanges.backtestStart} end={dateRanges.backtestEnd} onChange={(start, end) => updateDateRange({ backtestStart: start, backtestEnd: end })} />
            <label className="toggle-row forward-toggle"><span>Forward testing</span><input type="checkbox" checked={dateRanges.forwardEnabled} onChange={(event) => {
              const enabled = event.target.checked;
              setDateRanges((current) => ({ ...current, forwardEnabled: enabled, backtestEnd: enabled && current.forwardStart && current.backtestEnd >= current.forwardStart ? oneSecondBefore(current.forwardStart) : current.backtestEnd }));
              setStale(Boolean(analysis));
            }} /></label>
            {dateRanges.forwardEnabled && <DateTimeRange label="Forward test" start={dateRanges.forwardStart} end={dateRanges.forwardEnd} onChange={(start, end) => updateDateRange({ forwardStart: start, forwardEnd: end })} />}
          </section>
          <section className="control-group">
            <h3>Execution</h3>
            <ExecutionField label="Initial capital" value={execution.initial_capital} step={100} onChange={(value) => setExecutionValue("initial_capital", value)} />
            <ExecutionField label="Risk %" value={execution.risk_percent} step={0.1} onChange={(value) => setExecutionValue("risk_percent", value)} />
            <ExecutionField label="Point value" value={execution.point_value} step={1} onChange={(value) => setExecutionValue("point_value", value)} />
            <ExecutionField label="Spread · price" value={execution.spread} step={0.01} onChange={(value) => setExecutionValue("spread", value)} />
            <ExecutionField label="Slippage · side" value={execution.slippage} step={0.01} onChange={(value) => setExecutionValue("slippage", value)} />
            <ExecutionField label="Commission · qty/side" value={execution.commission_per_quantity_per_side} step={0.01} onChange={(value) => setExecutionValue("commission_per_quantity_per_side", value)} />
            <label className="field timezone-field"><span>Data timezone</span><input type="text" value={sourceTimezone} placeholder="Unconfirmed UTC" onChange={(event) => { setSourceTimezone(event.target.value); setStale(Boolean(analysis)); }} /></label>
          </section>
          <section className="control-group appearance-group">
            <h3><Palette size={11} /> Appearance</h3>
            <AppearancePanel plots={strategy?.plots || []} appearance={appearance} onChange={setAppearance} />
          </section>
        </aside>

        <section className="main-panel">
          <div className="context-bar">
            <div><span className="live-dot" /><strong>{pair || "NO DATA"}</strong><span>{timeframe || "—"}</span><span>{strategy?.name}</span>{dateRanges.backtestStart && dateRanges.backtestEnd && <span>{formatDateRange(dateRanges.backtestStart, dateRanges.forwardEnabled ? dateRanges.forwardEnd : dateRanges.backtestEnd)}</span>}</div>
            <div>{stale && <span className="stale"><CircleDot size={12} /> Settings changed — rerun</span>}<span>{sourceTimezone || "UTC · unconfirmed"}</span></div>
          </div>
          {error && <div className="notice error"><AlertTriangle size={16} /><span>{error}</span></div>}
          {!pairs.length ? (
            <div className="empty-state">
              <div className="empty-icon"><Database size={26} /></div>
              <span className="eyebrow">Waiting for market data</span>
              <h1>Add your first candle file</h1>
              <p>Place a CSV in <code>data/candles</code> using the filename <strong>XAUUSD - 15m.csv</strong>, then refresh this page.</p>
              <div className="schema"><span>timestamp</span><span>open</span><span>high</span><span>low</span><span>close</span><em>volume · optional</em></div>
            </div>
          ) : analysis ? (
            <>
              {analysis.dataset.warnings.map((warning) => <div className="notice" key={warning}><AlertTriangle size={15} /><span>{warning}</span></div>)}
              <div className={stale ? "chart-shell stale-data" : "chart-shell"}>
                <div className="chart-label"><span>{analysis.dataset.file_name}</span><span>{focusedChart ? `${formatInteger(focusedChart.candles.length)} candles · focused trade` : `${formatInteger(analysis.dataset.row_count)} tested · ${formatInteger(analysis.dataset.rendered_row_count)} rendered`}</span></div>
                <StrategyChart analysis={{ ...(focusedChart ? { ...analysis, ...focusedChart } : analysis), trades: [...analysis.trades, ...(analysis.forward_test?.trades || [])] }} appearance={appearance} theme={theme} focusTradeId={focusedTradeId} />
              </div>
              <Results analysis={analysis} initialCapital={execution.initial_capital} onSelectTrade={focusTrade} />
            </>
          ) : (
            <div className="empty-state ready">
              <div className="empty-icon"><Activity size={26} /></div>
              <span className="eyebrow">Dataset ready</span>
              <h1>Inspect the setup. Run when ready.</h1>
              <p>The engine will calculate every indicator and simulate entries from completed candles only.</p>
              <button className="ghost-run" onClick={run}><Play size={14} fill="currentColor" /> Run first backtest</button>
            </div>
          )}
        </section>
      </div>
    </main>
  );

  function setExecutionValue(key: keyof typeof execution, value: number) {
    setExecution((current) => ({ ...current, [key]: value }));
    setStale(Boolean(analysis));
  }

  function updateDateRange(change: Partial<typeof dateRanges>) {
    setDateRanges((current) => ({ ...current, ...change }));
    setStale(Boolean(analysis));
  }

  async function focusTrade(trade: Trade) {
    if (!analysis) return;
    if (chartContainsTrade(analysis.candles, trade)) {
      setFocusedChart(null);
      setFocusedTradeId(trade.trade_id);
      return;
    }
    try {
      const focused = await api.runChart(analysis.saved_run_id, trade.entry_time, trade.exit_time);
      setFocusedChart(focused);
      setFocusedTradeId(trade.trade_id);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load the selected trade chart");
    }
  }

  function applyStrategyVersion(next: StrategySchema) {
    setParameters(Object.fromEntries(next.parameters.map((input) => [input.key, input.default])));
    if (next.required_timeframe) setTimeframe(preferredTimeframe(next, catalog[pair] || []));
  }
}

function chartContainsTrade(candles: Analysis["candles"], trade: Trade) {
  if (!candles.length) return false;
  return Date.parse(trade.entry_time) >= Date.parse(candles[0].time) && Date.parse(trade.exit_time) <= Date.parse(candles.at(-1)!.time);
}

function Selector({ label, icon, value, options, onChange, render = (value: string) => value }: { label: string; icon?: React.ReactNode; value: string; options: string[]; onChange: (value: string) => void; render?: (value: string) => string }) {
  return <label className="selector"><span>{icon}{label}</span><div><select value={value} onChange={(event) => onChange(event.target.value)}>{options.map((option) => <option value={option} key={option}>{render(option)}</option>)}</select><ChevronDown size={13} /></div></label>;
}

function ExecutionField({ label, value, step, onChange }: { label: string; value: number; step: number; onChange: (value: number) => void }) {
  return <label className="field"><span>{label}</span><input type="number" min={0} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} /></label>;
}

function DateTimeRange({ label, start, end, onChange }: { label: string; start: string; end: string; onChange: (start: string, end: string) => void }) {
  return <fieldset className="date-time-range"><legend>{label}</legend><label><span>From</span><input type="datetime-local" step="1" value={start} onChange={(event) => onChange(event.target.value, end)} /></label><label><span>To</span><input type="datetime-local" step="1" value={end} onChange={(event) => onChange(start, event.target.value)} /></label></fieldset>;
}

function toDateTimeInput(value: string) { return new Date(value).toISOString().slice(0, 19); }
function oneSecondBefore(value: string) { return new Date(Date.parse(`${value}Z`) - 1000).toISOString().slice(0, 19); }
