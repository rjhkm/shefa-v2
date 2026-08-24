import { useEffect, useRef } from "react";
import { AreaSeries, ColorType, createChart, HistogramSeries, type UTCTimestamp } from "lightweight-charts";
import type { ValuePoint } from "../types";

const time = (value: string) => Math.floor(new Date(value).getTime() / 1000) as UTCTimestamp;

export default function EquityChart({ equity, drawdown, forwardStart }: { equity: ValuePoint[]; drawdown: ValuePoint[]; forwardStart?: string }) {
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
    let separator: HTMLDivElement | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let updateSeparator: (() => void) | null = null;
    if (forwardStart) {
      separator = document.createElement("div");
      separator.className = "forward-equity-separator";
      separator.innerHTML = "<span>Forward test</span>";
      container.current.appendChild(separator);
      updateSeparator = () => {
        const x = chart.timeScale().timeToCoordinate(time(forwardStart));
        if (separator) separator.style.left = x == null ? "-100px" : `${x}px`;
      };
      chart.timeScale().subscribeVisibleLogicalRangeChange(updateSeparator);
      resizeObserver = new ResizeObserver(updateSeparator);
      resizeObserver.observe(container.current);
    }
    chart.timeScale().fitContent();
    requestAnimationFrame(() => updateSeparator?.());
    return () => {
      if (updateSeparator) chart.timeScale().unsubscribeVisibleLogicalRangeChange(updateSeparator);
      resizeObserver?.disconnect();
      separator?.remove();
      chart.remove();
    };
  }, [equity, drawdown, forwardStart]);
  return <div className="equity-chart" ref={container} aria-label="Equity curve and drawdown chart" />;
}
