import { useEffect, useRef } from "react";
import {
  CandlestickSeries,
  ColorType,
  createChart,
  createSeriesMarkers,
  HistogramSeries,
  LineSeries,
  type IChartApi,
  type UTCTimestamp,
} from "lightweight-charts";
import type { Analysis, ChartAppearance } from "../types";

const time = (value: string) => Math.floor(new Date(value).getTime() / 1000) as UTCTimestamp;

export default function StrategyChart({ analysis, appearance, theme }: { analysis: Analysis; appearance: ChartAppearance; theme: "dark" | "light" }) {
  const container = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    if (!container.current) return;
    const light = theme === "light";
    const chart = createChart(container.current, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: light ? "#ffffff" : "#0c0f12" },
        textColor: light ? "#5b6570" : "#8b959e",
        panes: { separatorColor: light ? "#d9dee3" : "#242a30", separatorHoverColor: "#c39a4b" },
      },
      grid: { vertLines: { color: light ? "#edf0f2" : "#171b20" }, horzLines: { color: light ? "#edf0f2" : "#171b20" } },
      crosshair: { vertLine: { color: "#6d7781" }, horzLine: { color: "#6d7781" } },
      timeScale: { borderColor: light ? "#d9dee3" : "#242a30", timeVisible: true, secondsVisible: false },
      rightPriceScale: { borderColor: light ? "#d9dee3" : "#242a30" },
    });
    chartRef.current = chart;
    const candles = chart.addSeries(CandlestickSeries, {
      upColor: "#50b895",
      downColor: "#df6c68",
      borderVisible: false,
      wickUpColor: "#50b895",
      wickDownColor: "#df6c68",
    });
    candles.setData(analysis.candles.map((bar) => ({ ...bar, time: time(bar.time) })));

    const lines = [
      ["bb_basis", appearance.basis.color, 2, appearance.basis.visible],
      ["bb_upper", appearance.bands.color, 2, appearance.bands.visible],
      ["bb_lower", appearance.bands.color, 2, appearance.bands.visible],
      ["fast_ema", appearance.fastEma.color, 3, appearance.fastEma.visible],
    ] as const;
    lines.forEach(([key, color, lineWidth, visible]) => {
      if (!visible) return;
      const series = chart.addSeries(LineSeries, { color, lineWidth, priceLineVisible: false, lastValueVisible: false });
      series.setData(analysis.plots[key].map((point) => ({ time: time(point.time), value: point.value })));
    });

    const ao = appearance.ao.visible ? chart.addSeries(
      HistogramSeries,
      { priceFormat: { type: "price", precision: 3, minMove: 0.001 }, priceLineVisible: false, lastValueVisible: false },
      1,
    ) : null;
    ao?.setData(
      analysis.plots.ao.map((point, index, all) => ({
        time: time(point.time),
        value: point.value,
        color: index > 0 && point.value >= all[index - 1].value ? appearance.ao.upColor : appearance.ao.downColor,
      })),
    );

    const firstVisibleTime = time(analysis.candles[0].time);
    const lastVisibleTime = time(analysis.candles[analysis.candles.length - 1].time);
    const visibleTrades = analysis.trades.filter((trade) => {
      const entryTime = time(trade.entry_time);
      return entryTime >= firstVisibleTime && entryTime <= lastVisibleTime;
    });
    if (appearance.trades.visible) createSeriesMarkers(
      candles,
      visibleTrades.flatMap((trade) => [
        {
          time: time(trade.entry_time),
          position: trade.direction === "long" ? "belowBar" : "aboveBar",
          color: trade.direction === "long" ? appearance.trades.buyColor : appearance.trades.sellColor,
          shape: trade.direction === "long" ? "arrowUp" : "arrowDown",
          text: trade.direction === "long" ? "BUY" : "SELL",
        },
        {
          time: time(trade.exit_time),
          position: trade.direction === "long" ? "aboveBar" : "belowBar",
          color: "#d2ad67",
          shape: "circle",
          text: "EXIT",
        },
      ]),
    );
    chart.panes()[0]?.setHeight(430);
    if (appearance.ao.visible) chart.panes()[1]?.setHeight(120);
    chart.timeScale().fitContent();
    return () => {
      chart.remove();
      chartRef.current = null;
    };
  }, [analysis, appearance, theme]);

  return <div className="chart-canvas" ref={container} aria-label="Candlestick chart with strategy indicators" />;
}
