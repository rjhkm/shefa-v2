import type { Candle, ValuePoint } from "./types";

export function splitPlotSegments(points: ValuePoint[], candles: Candle[]): ValuePoint[][] {
  if (!points.length) return [];
  const candleIndex = new Map(candles.map((candle, index) => [Date.parse(candle.time), index]));
  const segments: ValuePoint[][] = [];
  let segment: ValuePoint[] = [];
  let previousIndex: number | undefined;
  for (const point of points) {
    const currentIndex = candleIndex.get(Date.parse(point.time));
    if (previousIndex != null && currentIndex != null && currentIndex > previousIndex + 1) {
      segments.push(segment);
      segment = [];
    }
    segment.push(point);
    previousIndex = currentIndex;
  }
  if (segment.length) segments.push(segment);
  return segments;
}
