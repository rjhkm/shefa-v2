import { describe, expect, it } from "vitest";
import { formatInteger, formatNumber, money } from "./format";

describe("display number formatting", () => {
  it("uses commas for thousands and dots for decimals", () => {
    expect(formatNumber(1234567.5, 2)).toBe("1,234,567.50");
    expect(formatInteger(100000)).toBe("100,000");
    expect(money.format(12345.6)).toBe("$12,345.60");
  });
});
