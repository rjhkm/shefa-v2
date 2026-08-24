import { describe, expect, it } from "vitest";
import { formatDateRange, formatDateTime, formatInteger, formatNumber, money } from "./format";

describe("display number formatting", () => {
  it("uses commas for thousands and dots for decimals", () => {
    expect(formatNumber(1234567.5, 2)).toBe("1,234,567.50");
    expect(formatInteger(100000)).toBe("100,000");
    expect(money.format(12345.6)).toBe("$12,345.60");
  });

  it("formats timestamps and ranges for compact result context", () => {
    expect(formatDateTime("2026-03-02T08:05:04Z")).toMatch(/^2 Mar '26, \d+:05:04 [AP]M$/);
    expect(formatDateRange("2026-03-01T00:00:00Z", "2026-03-03T12:00:00Z")).toContain("2.5 days");
  });
});
