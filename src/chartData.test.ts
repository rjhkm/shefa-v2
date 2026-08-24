import { describe, expect, it } from "vitest";
import { splitPlotSegments } from "./chartData";

const point = (time: string, value: number) => ({ time, value });

describe("splitPlotSegments", () => {
  it("breaks a line when merged indicator windows have candles between them", () => {
    const candles = [
      { time: "2026-01-01T00:00:00Z", open: 1, high: 2, low: 0, close: 1 },
      { time: "2026-01-01T00:01:00Z", open: 1, high: 2, low: 0, close: 1 },
      { time: "2026-01-01T00:02:00Z", open: 1, high: 2, low: 0, close: 1 },
      { time: "2026-01-01T00:03:00Z", open: 1, high: 2, low: 0, close: 1 },
    ];

    expect(splitPlotSegments([
      point(candles[0].time, 10),
      point(candles[1].time, 11),
      point(candles[3].time, 20),
    ], candles)).toEqual([
      [point(candles[0].time, 10), point(candles[1].time, 11)],
      [point(candles[3].time, 20)],
    ]);
  });
});
