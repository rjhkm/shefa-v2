import { useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, BarChart3, ChevronDown, CircleDot, Database, Moon, Palette, Play, RefreshCw, Settings2, Sun } from "lucide-react";
import { api } from "./api";
import StrategyChart from "./components/Chart";
import Results from "./components/Results";
import StrategyControls from "./components/StrategyControls";
import type { Analysis, ChartAppearance, StrategySchema } from "./types";

export default function App() {
  const [catalog, setCatalog] = useState<Record<string, string[]>>({});
  const [strategies, setStrategies] = useState<StrategySchema[]>([]);
  const [pair, setPair] = useState("");
  const [timeframe, setTimeframe] = useState("");
  const [strategyKey, setStrategyKey] = useState("");
  const [parameters, setParameters] = useState<Record<string, unknown>>({});
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [stale, setStale] = useState(false);
  const [error, setError] = useState("");
  const [theme, setTheme] = useState<"dark" | "light">(() => localStorage.getItem("shefa-theme") === "light" ? "light" : "dark");
  const [sourceTimezone, setSourceTimezone] = useState("");
  const [appearance, setAppearance] = useState<ChartAppearance>({
    basis: { visible: true, color: "#b8c0c8" },
    bands: { visible: true, color: "#7387c4" },
    fastEma: { visible: true, color: "#f0b84e" },
    ao: { visible: true, upColor: "#32b98a", downColor: "#ee625d" },
    trades: { visible: true, buyColor: "#22a978", sellColor: "#e0524d" },
  });
  const [execution, setExecution] = useState({
    initial_capital: 10000,
    risk_percent: 0.5,
    point_value: 1,
    spread: 0.2,
    slippage: 0,
    commission_per_quantity_per_side: 0,
  });

  const strategy = useMemo(() => strategies.find((item) => item.key === strategyKey), [strategies, strategyKey]);
  const pairs = Object.keys(catalog);

  useEffect(() => {
    Promise.all([api.catalog(), api.strategies()])
      .then(([catalogResponse, strategyResponse]) => {
        setCatalog(catalogResponse.datasets);
        setStrategies(strategyResponse.strategies);
        const firstPair = Object.keys(catalogResponse.datasets)[0] || "";
        setPair(firstPair);
        setTimeframe(catalogResponse.datasets[firstPair]?.[0] || "");
        const firstStrategy = strategyResponse.strategies[0];
        if (firstStrategy) {
          setStrategyKey(firstStrategy.key);
          setParameters(Object.fromEntries(firstStrategy.parameters.map((input) => [input.key, input.default])));
        }
      })
      .catch((reason) => setError(reason.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    localStorage.setItem("shefa-theme", theme);
  }, [theme]);

  const selectPair = (value: string) => {
    setPair(value);
    setTimeframe(catalog[value]?.[0] || "");
    setStale(Boolean(analysis));
  };

  const run = async () => {
    if (!pair || !timeframe || !strategyKey) return;
    setRunning(true);
    setError("");
    try {
      const result = await api.analyze({
        pair,
        timeframe,
        strategy_key: strategyKey,
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
      });
      setAnalysis(result);
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
        <div className="brand"><div className="brand-mark"><BarChart3 size={18} /></div><div><strong>Shefa</strong><span>Strategy Lab</span></div></div>
        <div className="selectors">
          <Selector label="Market" icon={<Database size={14} />} value={pair} options={pairs} onChange={selectPair} />
          <Selector label="Timeframe" value={timeframe} options={catalog[pair] || []} onChange={(value) => { setTimeframe(value); setStale(Boolean(analysis)); }} />
          <Selector label="Strategy" value={strategyKey} options={strategies.map((item) => item.key)} render={(value) => strategies.find((item) => item.key === value)?.name || value} onChange={(value) => { setStrategyKey(value); const next = strategies.find((item) => item.key === value); if (next) setParameters(Object.fromEntries(next.parameters.map((input) => [input.key, input.default]))); setStale(Boolean(analysis)); }} />
        </div>
        <button className="theme-button" onClick={() => setTheme((current) => current === "dark" ? "light" : "dark")} aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}>
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
          {strategy && <StrategyControls strategy={strategy} values={parameters} onChange={(key, value) => { setParameters((current) => ({ ...current, [key]: value })); setStale(Boolean(analysis)); }} />}
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
            <AppearanceField label="BB basis" setting={appearance.basis} onChange={(setting) => setAppearance((current) => ({ ...current, basis: setting }))} />
            <AppearanceField label="BB bands" setting={appearance.bands} onChange={(setting) => setAppearance((current) => ({ ...current, bands: setting }))} />
            <AppearanceField label="Fast EMA" setting={appearance.fastEma} onChange={(setting) => setAppearance((current) => ({ ...current, fastEma: setting }))} />
            <AppearanceField label="AO rising" setting={{ visible: appearance.ao.visible, color: appearance.ao.upColor }} onChange={(setting) => setAppearance((current) => ({ ...current, ao: { ...current.ao, visible: setting.visible, upColor: setting.color } }))} />
            <AppearanceField label="AO falling" setting={{ visible: appearance.ao.visible, color: appearance.ao.downColor }} onChange={(setting) => setAppearance((current) => ({ ...current, ao: { ...current.ao, visible: setting.visible, downColor: setting.color } }))} />
            <AppearanceField label="BUY markers" setting={{ visible: appearance.trades.visible, color: appearance.trades.buyColor }} onChange={(setting) => setAppearance((current) => ({ ...current, trades: { ...current.trades, visible: setting.visible, buyColor: setting.color } }))} />
            <AppearanceField label="SELL markers" setting={{ visible: appearance.trades.visible, color: appearance.trades.sellColor }} onChange={(setting) => setAppearance((current) => ({ ...current, trades: { ...current.trades, visible: setting.visible, sellColor: setting.color } }))} />
          </section>
        </aside>

        <section className="main-panel">
          <div className="context-bar">
            <div><span className="live-dot" /><strong>{pair || "NO DATA"}</strong><span>{timeframe || "—"}</span><span>{strategy?.name}</span></div>
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
                <div className="chart-label"><span>{analysis.dataset.file_name}</span><span>{analysis.dataset.row_count.toLocaleString()} tested · {analysis.dataset.rendered_row_count.toLocaleString()} rendered</span></div>
                <StrategyChart analysis={analysis} appearance={appearance} theme={theme} />
              </div>
              <Results analysis={analysis} />
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
}

function Selector({ label, icon, value, options, onChange, render = (value: string) => value }: { label: string; icon?: React.ReactNode; value: string; options: string[]; onChange: (value: string) => void; render?: (value: string) => string }) {
  return <label className="selector"><span>{icon}{label}</span><div><select value={value} onChange={(event) => onChange(event.target.value)}>{options.map((option) => <option value={option} key={option}>{render(option)}</option>)}</select><ChevronDown size={13} /></div></label>;
}

function ExecutionField({ label, value, step, onChange }: { label: string; value: number; step: number; onChange: (value: number) => void }) {
  return <label className="field"><span>{label}</span><input type="number" min={0} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} /></label>;
}

function AppearanceField({ label, setting, onChange }: { label: string; setting: { visible: boolean; color: string }; onChange: (setting: { visible: boolean; color: string }) => void }) {
  return <div className="appearance-row"><label><input type="checkbox" checked={setting.visible} onChange={(event) => onChange({ ...setting, visible: event.target.checked })} /><span>{label}</span></label><input type="color" value={setting.color} aria-label={`${label} color`} onChange={(event) => onChange({ ...setting, color: event.target.value })} /></div>;
}
