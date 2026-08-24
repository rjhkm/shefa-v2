import { useState } from "react";
import type { ChartAppearance, IndicatorAppearance, PlotSchema } from "../types";

export function defaultIndicatorAppearance(plot: PlotSchema): IndicatorAppearance {
  return { visible: true, color: plot.color, negativeColor: plot.negative_color, lineWidth: plot.line_width || 2, opacity: 100 };
}

export function appearanceForPlots(plots: PlotSchema[]): ChartAppearance {
  return {
    indicators: Object.fromEntries(plots.map((plot) => [plot.key, defaultIndicatorAppearance(plot)])),
    trades: { visible: true, buyColor: "#22a978", sellColor: "#e0524d", opacity: 100 },
  };
}

export default function AppearancePanel({ plots, appearance, onChange }: { plots: PlotSchema[]; appearance: ChartAppearance; onChange: (appearance: ChartAppearance) => void }) {
  return <>
    {plots.map((plot) => {
      const setting = appearance.indicators[plot.key] || defaultIndicatorAppearance(plot);
      return <AppearanceField key={plot.key} plot={plot} setting={setting} onChange={(next) => onChange({ ...appearance, indicators: { ...appearance.indicators, [plot.key]: next } })} />;
    })}
    {!plots.length && <p className="appearance-empty">This strategy has no chart indicators.</p>}
    <div className="appearance-subheading">Trade markers</div>
    <MarkerAppearanceField appearance={appearance.trades} onChange={(trades) => onChange({ ...appearance, trades })} />
  </>;
}

function AppearanceField({ plot, setting, onChange }: { plot: PlotSchema; setting: IndicatorAppearance; onChange: (setting: IndicatorAppearance) => void }) {
  const [expanded, setExpanded] = useState(false);
  const swatch = plot.negative_color ? `linear-gradient(90deg, ${setting.color} 0 50%, ${setting.negativeColor || plot.negative_color} 50% 100%)` : setting.color;
  return <div className="appearance-item">
    <div className="appearance-row"><label><input type="checkbox" checked={setting.visible} onChange={(event) => onChange({ ...setting, visible: event.target.checked })} /><span>{plot.label}</span></label><button className="appearance-swatch" style={{ background: swatch }} aria-label={`Edit ${plot.label} appearance`} aria-expanded={expanded} onClick={() => setExpanded((current) => !current)} /></div>
    {expanded && <div className="appearance-details appearance-popover">
      <label><span>{plot.negative_color ? "Rising" : "Color"}</span><input type="color" value={setting.color} aria-label={`${plot.label} color`} onChange={(event) => onChange({ ...setting, color: event.target.value })} /></label>
      {plot.negative_color && <label><span>Falling</span><input type="color" value={setting.negativeColor || plot.negative_color} aria-label={`${plot.label} falling color`} onChange={(event) => onChange({ ...setting, negativeColor: event.target.value })} /></label>}
      {plot.type === "line" && <label><span>Thickness</span><input type="number" min={1} max={4} step={1} value={setting.lineWidth} onChange={(event) => onChange({ ...setting, lineWidth: Math.min(4, Math.max(1, Number(event.target.value))) })} /></label>}
      <label><span>Opacity</span><input type="range" min={10} max={100} step={5} value={setting.opacity} onChange={(event) => onChange({ ...setting, opacity: Number(event.target.value) })} /><output>{setting.opacity}%</output></label>
    </div>}
  </div>;
}

function MarkerAppearanceField({ appearance, onChange }: { appearance: ChartAppearance["trades"]; onChange: (appearance: ChartAppearance["trades"]) => void }) {
  const [expanded, setExpanded] = useState(false);
  return <div className="appearance-item marker-appearance">
    <div className="appearance-row"><label><input type="checkbox" checked={appearance.visible} onChange={(event) => onChange({ ...appearance, visible: event.target.checked })} /><span>Entries &amp; exits</span></label><button className="appearance-swatch" style={{ background: `linear-gradient(90deg, ${appearance.buyColor} 0 50%, ${appearance.sellColor} 50% 100%)` }} aria-label="Edit trade marker appearance" aria-expanded={expanded} onClick={() => setExpanded((current) => !current)} /></div>
    {expanded && <div className="appearance-details appearance-popover"><label><span>Buy</span><input type="color" value={appearance.buyColor} aria-label="Buy marker color" onChange={(event) => onChange({ ...appearance, buyColor: event.target.value })} /></label><label><span>Sell</span><input type="color" value={appearance.sellColor} aria-label="Sell marker color" onChange={(event) => onChange({ ...appearance, sellColor: event.target.value })} /></label><label><span>Opacity</span><input type="range" min={10} max={100} step={5} value={appearance.opacity} onChange={(event) => onChange({ ...appearance, opacity: Number(event.target.value) })} /><output>{appearance.opacity}%</output></label></div>}
  </div>;
}
