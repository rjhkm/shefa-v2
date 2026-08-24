import { useEffect, useRef } from "react";
import { AreaSeries, ColorType, createChart, HistogramSeries, type UTCTimestamp } from "lightweight-charts";
import type { ValuePoint } from "../types";

const time = (value: string) => Math.floor(new Date(value).getTime() / 1000) as UTCTimestamp;

export default function EquityChart({ equity, drawdown }: { equity: ValuePoint[]; drawdown: ValuePoint[] }) {
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!container.current) return;
    const light = container.current.closest(".theme-light") != null;
    const chart = createChart(container.current, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: light ? "#ffffff" : "#0c0f12" }, textColor: light ? "#5b6570" : "#8b959e", panes: { separatorColor: light ? "#d9dee3" : "#242a30" } },
      grid: { vertLines: { color: light ? "#edf0f2" : "#171b20" }, horzLines: { color: light ? "#edf0f2" : "#171b20" } },
      timeScale: { borderColor: light ? "#d9dee3" : "#242a30", timeVisible: true },
      rightPriceScale: { borderColor: light ? "#d9dee3" : "#242a30" },
    });
    const equitySeries = chart.addSeries(AreaSeries, { lineColor: "#55ba98", topColor: "rgba(85, 186, 152, .28)", bottomColor: "rgba(85, 186, 152, .02)", lineWidth: 2, priceLineVisible: false });
    equitySeries.setData(equity.map((point) => ({ time: time(point.time), value: point.value })));
    if (drawdown.length) {
      const drawdownSeries = chart.addSeries(HistogramSeries, { color: "rgba(221, 113, 109, .6)", priceLineVisible: false, lastValueVisible: false }, 1);
      drawdownSeries.setData(drawdown.map((point) => ({ time: time(point.time), value: point.value })));
      chart.panes()[0]?.setHeight(330);
      chart.panes()[1]?.setHeight(110);
    }
    chart.timeScale().fitContent();
    return () => chart.remove();
  }, [equity, drawdown]);
  return <div className="equity-chart" ref={container} aria-label="Equity curve and drawdown chart" />;
}
