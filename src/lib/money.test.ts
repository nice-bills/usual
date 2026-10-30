import { describe, expect, it } from "vitest";
import { formatAmount, parseAmount } from "./money";

describe("parseAmount", () => {
  it.each([
    ["50", 50_000_000n],
    ["$12.50", 12_500_000n],
    ["4,500", 4_500_000_000n],
    ["4.5 USDC", 4_500_000n],
    ["fifty", 50_000_000n],
    ["twenty five", 25_000_000n],
    ["one hundred", 100_000_000n],
    [7, 7_000_000n],
  ])("%s", (input, want) => expect(parseAmount(input)).toBe(want));

  it.each(["", "0", "abc", "-5", "1.1234567", "lots"])("rejects %s", (input) => expect(parseAmount(input)).toBeNull());
});

describe("formatAmount", () => {
  it.each([
    [50_000_000n, "50"],
    [4_500_000n, "4.50"],
    [412_500_000n, "412.50"],
    [1n, "0.000001"],
    [-3_000_000n, "-3"],
  ])("%s", (input, want) => expect(formatAmount(input)).toBe(want));
});
