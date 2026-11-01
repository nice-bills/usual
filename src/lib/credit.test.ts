import { describe, expect, it, vi } from "vitest";

vi.mock("./env", () => ({ env: { symbol: "USDC" } }));
const { reduce } = await import("./records");
const { cleanSinceLine, creditReport, suspended } = await import("./credit");

const verdict = (outcome: "clean" | "wrong", at: number) => ({ type: "VERDICT" as const, category: "family" as const, outcome, at, digest: `d${at}`, v: at });
const line = (v: number) => ({ type: "LIMIT" as const, category: "family" as const, amount: "60", periodDays: 7, v });

describe("the agent's credit", () => {
  it("starts low and has to earn it", () => {
    expect(creditReport(reduce([])).score).toBe(20);
    expect(creditReport(reduce([verdict("clean", 1), verdict("clean", 2)])).score).toBe(36);
  });
  it("one mistake costs more than a clean payment earns", () => {
    const after = creditReport(reduce([verdict("clean", 1), verdict("clean", 2), verdict("wrong", 3)]));
    expect(after.score).toBe(18);
    expect(after.wrong).toBe(1);
  });
  it("a mistake suspends the line until the owner signs a new one", () => {
    expect(suspended(reduce([line(1), verdict("wrong", 2)]), "family")).toBe(true);
    expect(suspended(reduce([line(1), verdict("wrong", 2), line(3)]), "family")).toBe(false);
  });
  it("counts only what was earned since the line was signed", () => {
    expect(cleanSinceLine(reduce([verdict("clean", 1), line(2), verdict("clean", 3)]), "family")).toBe(1);
  });
});
