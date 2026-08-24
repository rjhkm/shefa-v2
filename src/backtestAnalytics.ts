import type { Candle, OutcomeSummary, Trade } from "./types";

export type DailyCell = { date: string; day: number; netR: number; netProfit: number; trades: number; wins: number; losses: number; largestTrade: Trade };
export type PeriodSummary = { key: string; startingEquity: number; endingEquity: number; netProfit: number; netR: number; trades: number; wins: number; losses: number; winRate: number; profitFactor: number | null; maxDrawdown: number; costs: number };
export type RollingPoint = { trade: number; time: string; expectancyR: number; profitFactor: number | null; winRate: number };
export type CurvePoint = { trade: number; time: string; money: number; r: number; drawdownMoney: number; drawdownR: number };
export type HistogramBin = { low: number; high: number; count: number };
export type TradeAnalytics = ReturnType<typeof analyzeTrades>;

export function analyzeTrades(trades: Trade[], initialCapital: number, fingerprint: string, candles: Candle[] = []) {
  const ordered = [...trades].sort((left, right) => Date.parse(left.exit_time) - Date.parse(right.exit_time));
  const calendar = calendarRows(ordered, initialCapital);
  const curve = equityCurve(ordered, initialCapital);
  const rolling30 = rolling(ordered, 30);
  const rolling50 = rolling(ordered, 50);
  const resultRs = ordered.map((trade) => trade.result_r);
  return {
    calendar,
    curve,
    rolling30,
    rolling50,
    histogram: histogram(resultRs, 12),
    years: periodSummaries(ordered, initialCapital, (trade) => trade.exit_time.slice(0, 4)),
    regimes: marketRegimes(ordered, candles),
    costSensitivity: [0, 1, 1.5, 2].map((multiple) => ({
      label: multiple === 0 ? "No cost" : multiple === 1 ? "Base cost" : `${multiple}× cost`,
      multiple,
      netProfit: ordered.reduce((sum, trade) => sum + trade.gross_pnl - tradeCosts(trade) * multiple, 0),
    })),
    contribution: contribution(ordered),
    monteCarlo: monteCarlo(resultRs, fingerprint),
    bestMonth: [...calendar].sort((a, b) => b.netR - a.netR)[0] || null,
    worstMonth: [...calendar].sort((a, b) => a.netR - b.netR)[0] || null,
  };
}

function calendarRows(trades: Trade[], initialCapital: number) {
  const days = new Map<string, Trade[]>();
  trades.forEach((trade) => {
    const key = trade.exit_time.slice(0, 10);
    days.set(key, [...(days.get(key) || []), trade]);
  });
  const monthGroups = groupBy(trades, (trade) => trade.exit_time.slice(0, 7));
  let equity = initialCapital;
  return [...monthGroups.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([key, monthTrades]) => {
    const summary = summarizePeriod(key, monthTrades, equity);
    equity = summary.endingEquity;
    const cells = new Map<number, DailyCell>();
    [...days.entries()].filter(([date]) => date.startsWith(key)).forEach(([date, dailyTrades]) => {
      const largestTrade = [...dailyTrades].sort((a, b) => Math.abs(b.net_pnl) - Math.abs(a.net_pnl))[0];
      cells.set(Number(date.slice(8, 10)), {
        date,
        day: Number(date.slice(8, 10)),
        netR: sum(dailyTrades, "result_r"),
        netProfit: sum(dailyTrades, "net_pnl"),
        trades: dailyTrades.length,
        wins: dailyTrades.filter((trade) => trade.net_pnl > 0).length,
        losses: dailyTrades.filter((trade) => trade.net_pnl < 0).length,
        largestTrade,
      });
    });
    return { ...summary, cells };
  });
}

function equityCurve(trades: Trade[], initialCapital: number): CurvePoint[] {
  let money = initialCapital;
  let cumulativeR = 0;
  let peakMoney = money;
  let peakR = 0;
  return trades.map((trade, index) => {
    money += trade.net_pnl;
    cumulativeR += trade.result_r;
    peakMoney = Math.max(peakMoney, money);
    peakR = Math.max(peakR, cumulativeR);
    return { trade: index + 1, time: trade.exit_time, money, r: cumulativeR, drawdownMoney: money - peakMoney, drawdownR: cumulativeR - peakR };
  });
}

function rolling(trades: Trade[], window: number): RollingPoint[] {
  return trades.map((trade, index) => {
    const slice = trades.slice(Math.max(0, index - window + 1), index + 1);
    return { trade: index + 1, time: trade.exit_time, expectancyR: sum(slice, "result_r") / slice.length, profitFactor: profitFactor(slice), winRate: slice.filter((item) => item.net_pnl > 0).length / slice.length * 100 };
  }).filter((_, index) => index + 1 >= Math.min(window, trades.length));
}

function histogram(values: number[], count: number): HistogramBin[] {
  if (!values.length) return [];
  const low = Math.min(...values);
  const high = Math.max(...values);
  const width = high === low ? 1 : (high - low) / count;
  const bins = Array.from({ length: count }, (_, index) => ({ low: low + index * width, high: low + (index + 1) * width, count: 0 }));
  values.forEach((value) => bins[Math.min(count - 1, Math.floor((value - low) / width))].count++);
  return bins;
}

function contribution(trades: Trade[]) {
  const winners = [...trades].filter((trade) => trade.net_pnl > 0).sort((a, b) => b.net_pnl - a.net_pnl);
  const losers = [...trades].filter((trade) => trade.net_pnl < 0).sort((a, b) => a.net_pnl - b.net_pnl);
  const totalProfit = sum(winners, "net_pnl");
  return {
    best: winners.slice(0, 5),
    worst: losers.slice(0, 5),
    top5Percent: totalProfit ? sum(winners.slice(0, 5), "net_pnl") / totalProfit * 100 : 0,
    top10Percent: totalProfit ? sum(winners.slice(0, 10), "net_pnl") / totalProfit * 100 : 0,
  };
}

function monteCarlo(values: number[], seedText: string) {
  if (!values.length) return { drawdownP10: 0, drawdownP50: 0, drawdownP90: 0, streakP50: 0, streakP90: 0, profitableProbability: 0 };
  const random = seededRandom(seedText);
  const drawdowns: number[] = [];
  const streaks: number[] = [];
  let profitable = 0;
  for (let simulation = 0; simulation < 750; simulation++) {
    let equity = 0;
    let peak = 0;
    let maxDrawdown = 0;
    let losingStreak = 0;
    let maxLosingStreak = 0;
    for (let index = 0; index < values.length; index++) {
      const result = values[Math.floor(random() * values.length)];
      equity += result;
      peak = Math.max(peak, equity);
      maxDrawdown = Math.max(maxDrawdown, peak - equity);
      losingStreak = result < 0 ? losingStreak + 1 : 0;
      maxLosingStreak = Math.max(maxLosingStreak, losingStreak);
    }
    if (equity > 0) profitable++;
    drawdowns.push(maxDrawdown);
    streaks.push(maxLosingStreak);
  }
  drawdowns.sort((a, b) => a - b);
  streaks.sort((a, b) => a - b);
  return { drawdownP10: percentile(drawdowns, .1), drawdownP50: percentile(drawdowns, .5), drawdownP90: percentile(drawdowns, .9), streakP50: percentile(streaks, .5), streakP90: percentile(streaks, .9), profitableProbability: profitable / 750 * 100 };
}

function marketRegimes(trades: Trade[], candles: Candle[]): OutcomeSummary[] {
  if (trades.some((trade) => trade.market_regime)) {
    return summarizeGroups([...groupBy(trades, (trade) => trade.market_regime || "Unclassified").entries()]);
  }
  if (!candles.length) return summarizeGroups([["Unclassified", trades]]);
  const times = candles.map((candle) => Date.parse(candle.time));
  const groups = new Map<string, Trade[]>();
  trades.forEach((trade) => {
    const target = Date.parse(trade.entry_time);
    if (target < times[0] || target > times.at(-1)!) {
      groups.set("Outside loaded chart range", [...(groups.get("Outside loaded chart range") || []), trade]);
      return;
    }
    let low = 0;
    let high = times.length - 1;
    while (low < high) { const middle = Math.ceil((low + high) / 2); if (times[middle] <= target) low = middle; else high = middle - 1; }
    const window = candles.slice(Math.max(0, low - 20), low + 1);
    const changes = window.slice(1).map((candle, index) => candle.close / window[index].close - 1);
    const momentum = window.length > 1 ? window.at(-1)!.close / window[0].close - 1 : 0;
    const noise = Math.sqrt(changes.reduce((total, change) => total + change * change, 0));
    const regime = Math.abs(momentum) <= noise * 1.25 ? "Range / mixed" : momentum > 0 ? "Uptrend" : "Downtrend";
    groups.set(regime, [...(groups.get(regime) || []), trade]);
  });
  return summarizeGroups([...groups.entries()]);
}

function periodSummaries(trades: Trade[], initialCapital: number, key: (trade: Trade) => string) {
  let equity = initialCapital;
  return [...groupBy(trades, key).entries()].sort(([left], [right]) => left.localeCompare(right)).map(([period, items]) => {
    const summary = summarizePeriod(period, items, equity);
    equity = summary.endingEquity;
    return summary;
  });
}

function summarizePeriod(key: string, trades: Trade[], startingEquity: number): PeriodSummary {
  let running = 0;
  let peak = 0;
  let maxDrawdown = 0;
  trades.forEach((trade) => { running += trade.net_pnl; peak = Math.max(peak, running); maxDrawdown = Math.max(maxDrawdown, peak - running); });
  const netProfit = sum(trades, "net_pnl");
  const wins = trades.filter((trade) => trade.net_pnl > 0).length;
  const losses = trades.filter((trade) => trade.net_pnl < 0).length;
  return { key, startingEquity, endingEquity: startingEquity + netProfit, netProfit, netR: sum(trades, "result_r"), trades: trades.length, wins, losses, winRate: trades.length ? wins / trades.length * 100 : 0, profitFactor: profitFactor(trades), maxDrawdown, costs: trades.reduce((total, trade) => total + tradeCosts(trade), 0) };
}

function summarizeGroups(groups: [string, Trade[]][]): OutcomeSummary[] {
  return groups.map(([label, trades]) => ({ label, trade_count: trades.length, net_profit: sum(trades, "net_pnl"), win_rate: trades.length ? trades.filter((trade) => trade.net_pnl > 0).length / trades.length * 100 : 0, average_result_r: trades.length ? sum(trades, "result_r") / trades.length : 0 }));
}

function profitFactor(trades: Trade[]) { const wins = trades.filter((trade) => trade.net_pnl > 0).reduce((total, trade) => total + trade.net_pnl, 0); const losses = Math.abs(trades.filter((trade) => trade.net_pnl < 0).reduce((total, trade) => total + trade.net_pnl, 0)); return losses ? wins / losses : null; }
function tradeCosts(trade: Trade) { return trade.spread_cost + trade.slippage_cost + trade.commission_cost; }
function sum<K extends keyof Trade>(trades: Trade[], key: K) { return trades.reduce((total, trade) => total + Number(trade[key]), 0); }
function groupBy(trades: Trade[], key: (trade: Trade) => string) { const groups = new Map<string, Trade[]>(); trades.forEach((trade) => { const value = key(trade); groups.set(value, [...(groups.get(value) || []), trade]); }); return groups; }
function percentile(values: number[], value: number) { return values[Math.min(values.length - 1, Math.floor((values.length - 1) * value))] || 0; }
function seededRandom(text: string) { let state = [...text].reduce((total, character) => (total * 31 + character.charCodeAt(0)) >>> 0, 2166136261); return () => { state = (state * 1664525 + 1013904223) >>> 0; return state / 4294967296; }; }
