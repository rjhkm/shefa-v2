import { useEffect, useRef } from "react";
import {
  CandlestickSeries,
  ColorType,
  createChart,
  createSeriesMarkers,
  HistogramSeries,
  LineSeries,
  type IChartApi,
  LineType,
  type LineWidth,
  type UTCTimestamp,
} from "lightweight-charts";
import { splitPlotSegments } from "../chartData";
import { formatNumber, money } from "../format";
import type { Analysis, ChartAppearance, Trade, TradeLabelMode } from "../types";

const time = (value: string) => Math.floor(new Date(value).getTime() / 1000) as UTCTimestamp;
const withOpacity = (color: string, opacity: number) => {
  const hex = color.replace("#", "");
  const value = hex.length === 3 ? hex.split("").map((part) => part + part).join("") : hex;
  const red = Number.parseInt(value.slice(0, 2), 16);
  const green = Number.parseInt(value.slice(2, 4), 16);
  const blue = Number.parseInt(value.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${opacity / 100})`;
};

type ChartData = Pick<Analysis, "candles" | "plot_schema" | "plots" | "trades">;

export default function StrategyChart({ analysis, appearance, theme, tradeLabelMode = "cash", initialCapital = 10_000, pipSize = 0.01, focusTradeId }: { analysis: ChartData; appearance: ChartAppearance; theme: "dark" | "light"; tradeLabelMode?: TradeLabelMode; initialCapital?: number; pipSize?: number; focusTradeId?: number | null }) {
  const container = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    if (!container.current) return;
    if (!analysis.candles.length) return;
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
      localization: { locale: "en-US", priceFormatter: (price: number) => formatNumber(price, 2) },
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

    analysis.plot_schema.forEach((plot) => {
      const points = analysis.plots[plot.key] || [];
      const setting = appearance.indicators[plot.key] || {
        visible: true,
        color: plot.color,
        negativeColor: plot.negative_color,
        lineWidth: plot.line_width || 2,
        opacity: 100,
      };
      if (!setting.visible || !points.length) return;
      if (plot.type === "histogram") {
        const series = chart.addSeries(
          HistogramSeries,
          { priceFormat: { type: "price", precision: 3, minMove: 0.001 }, priceLineVisible: false, lastValueVisible: false },
          plot.pane || 1,
        );
        series.setData(points.map((point, index, all) => ({
          time: time(point.time),
          value: point.value,
          color: withOpacity(index > 0 && point.value >= all[index - 1].value ? setting.color : setting.negativeColor || setting.color, setting.opacity),
        })));
        return;
      }
      const segments = plot.line_type === "step" ? [points] : splitPlotSegments(points, analysis.candles);
      segments.forEach((segment) => {
        const series = chart.addSeries(LineSeries, {
          color: withOpacity(setting.color, setting.opacity),
          lineType: plot.line_type === "step" ? LineType.WithSteps : LineType.Simple,
          lineWidth: Math.min(4, Math.max(1, setting.lineWidth)) as LineWidth,
          priceLineVisible: false,
          lastValueVisible: false,
        });
        series.setData(segment.map((point) => ({ time: time(point.time), value: point.value })));
      });
    });

    const firstVisibleTime = time(analysis.candles[0].time);
    const lastVisibleTime = time(analysis.candles[analysis.candles.length - 1].time);
    const entryTrades = analysis.trades.filter((trade) => inVisibleRange(trade.entry_time, firstVisibleTime, lastVisibleTime));
    const exitTrades = analysis.trades.filter((trade) => inVisibleRange(trade.exit_time, firstVisibleTime, lastVisibleTime));
    let overlay: HTMLDivElement | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let updateExitLabels: (() => void) | null = null;
    if (appearance.trades.visible) {
      const markers = [
        ...entryTrades.map((trade) => ({
          time: time(trade.entry_time),
          position: trade.direction === "long" ? "belowBar" as const : "aboveBar" as const,
          color: withOpacity(trade.direction === "long" ? appearance.trades.buyColor : appearance.trades.sellColor, appearance.trades.opacity),
          shape: trade.direction === "long" ? "arrowUp" as const : "arrowDown" as const,
          text: trade.direction === "long" ? "Buy" : "Sell",
        })),
        ...exitTrades.map((trade) => ({
          time: time(trade.exit_time),
          position: trade.direction === "long" ? "aboveBar" as const : "belowBar" as const,
          color: withOpacity("#d2ad67", appearance.trades.opacity),
          shape: "circle" as const,
        })),
      ].sort((left, right) => Number(left.time) - Number(right.time));
      createSeriesMarkers(candles, markers);

      overlay = document.createElement("div");
      overlay.className = "trade-label-overlay";
      container.current.appendChild(overlay);
      const labels = exitTrades.map((trade) => {
        const element = document.createElement("div");
        element.className = `trade-exit-label ${trade.direction === "long" ? "above" : "below"}`;
        element.style.opacity = String(appearance.trades.opacity / 100);
        const reason = document.createElement("strong");
        reason.textContent = exitReasonLabel(trade.exit_reason);
        const pnl = document.createElement("small");
        pnl.textContent = exitPnlLabel(trade, tradeLabelMode, initialCapital, pipSize);
        pnl.className = trade.net_pnl >= 0 ? "positive" : "negative";
        element.append(reason, pnl);
        overlay?.appendChild(element);
        return { element, trade };
      });
      updateExitLabels = () => labels.forEach(({ element, trade }) => {
        const x = chart.timeScale().timeToCoordinate(time(trade.exit_time));
        const y = candles.priceToCoordinate(trade.exit_price);
        if (x == null || y == null || x < 0 || x > (container.current?.clientWidth || 0)) {
          element.style.display = "none";
          return;
        }
        element.style.display = "flex";
        element.style.left = `${x}px`;
        element.style.top = `${y + (trade.direction === "long" ? -16 : 16)}px`;
      });
      chart.timeScale().subscribeVisibleLogicalRangeChange(updateExitLabels);
      resizeObserver = new ResizeObserver(updateExitLabels);
      resizeObserver.observe(container.current);
    }
    chart.panes()[0]?.setHeight(430);
    if (analysis.plot_schema.some((plot) => plot.pane === 1 && (appearance.indicators[plot.key]?.visible ?? true))) chart.panes()[1]?.setHeight(120);
    chart.timeScale().fitContent();
    const focusedTrade = analysis.trades.find((trade) => trade.trade_id === focusTradeId);
    if (focusedTrade) {
      const entry = time(focusedTrade.entry_time);
      const exit = time(focusedTrade.exit_time);
      const candleInterval = analysis.candles.length > 1 ? Math.max(60, time(analysis.candles[1].time) - time(analysis.candles[0].time)) : 3600;
      const padding = Math.max((exit - entry) * 1.5, candleInterval * 30);
      chart.timeScale().setVisibleRange({ from: (entry - padding) as UTCTimestamp, to: (exit + padding) as UTCTimestamp });
    }
    requestAnimationFrame(() => updateExitLabels?.());
    return () => {
      if (updateExitLabels) chart.timeScale().unsubscribeVisibleLogicalRangeChange(updateExitLabels);
      resizeObserver?.disconnect();
      overlay?.remove();
      chart.remove();
      chartRef.current = null;
    };
  }, [analysis, appearance, focusTradeId, initialCapital, pipSize, theme, tradeLabelMode]);

  return <div className="chart-canvas" ref={container} aria-label="Candlestick chart with strategy indicators" data-candle-count={analysis.candles.length} />;
}

function inVisibleRange(value: string, first: UTCTimestamp, last: UTCTimestamp) {
  const timestamp = time(value);
  return timestamp >= first && timestamp <= last;
}

function exitReasonLabel(reason: string) {
  const labels: Record<string, string> = {
    target: "TP",
    take_profit: "TP",
    stop: "SL",
    stop_loss: "SL",
    time_exit: "TIME",
    session_close: "CLOSE",
    ao_reversal: "AO EXIT",
    end_of_data: "EOD",
  };
  return labels[reason] || reason.replaceAll("_", " ").toUpperCase();
}

function exitPnlLabel(trade: Trade, mode: TradeLabelMode, initialCapital: number, pipSize: number) {
  if (mode === "percent") {
    const percent = initialCapital ? trade.net_pnl / initialCapital * 100 : 0;
    return `${percent >= 0 ? "+" : ""}${formatNumber(percent, 2)}%`;
  }
  if (mode === "pips") {
    const direction = trade.direction === "long" ? 1 : -1;
    const pips = pipSize > 0 ? (trade.exit_price - trade.entry_price) * direction / pipSize : 0;
    return `${pips >= 0 ? "+" : ""}${formatNumber(pips, 1)} pips`;
  }
  return `${trade.net_pnl >= 0 ? "+" : "−"}${money.format(Math.abs(trade.net_pnl))}`;
}
