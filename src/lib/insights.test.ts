import { describe, expect, it } from "vitest";
import { checkLimit, inferRecurring, validateIntent } from "./insights";
import { reduce, type Stamped } from "./records";

const MUM = "0x" + "1".repeat(64);
const GYM = "0x" + "2".repeat(64);
const DAY = 86_400_000;
const now = 100 * DAY;

describe("inferRecurring", () => {
  it("finds repeated payees, usual amount, cadence and price changes", () => {
    const out = inferRecurring([
      { to: MUM, amount: 50_000_000n, digest: "a", at: 10 * DAY },
      { to: MUM, amount: 50_000_000n, digest: "b", at: 17 * DAY },
      { to: MUM, amount: 50_000_000n, digest: "c", at: 24 * DAY },
      { to: GYM, amount: 30_000_000n, digest: "d", at: 1 * DAY },
      { to: GYM, amount: 30_000_000n, digest: "e", at: 31 * DAY },
      { to: GYM, amount: 35_000_000n, digest: "f", at: 61 * DAY },
      { to: "0xonce", amount: 1n, digest: "g", at: 5 * DAY },
    ]);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ address: MUM, count: 3, usual: 50_000_000n, cadenceDays: 7 });
    expect(out[1]).toMatchObject({ address: GYM, usual: 30_000_000n, last: 35_000_000n, previous: 30_000_000n, cadenceDays: 30 });
  });
});

const base: Stamped[] = [
  { type: "CONTACT", name: "Mum", address: MUM, relation: "mother", source: "chain+user", v: 1 },
  { type: "USUAL", name: "Mum", amount: "50", count: 3, v: 1 },
  { type: "LIMIT", category: "family", amount: "100", periodDays: 7, allowanceId: "0xallow", v: 1 },
];

describe("validateIntent", () => {
  it("fills the usual amount and checks the family limit", () => {
    const v = validateIntent(reduce(base), { to: "Mum", useUsual: true }, now);
    expect(v).toMatchObject({ ok: true, plan: { amountText: "50", category: "family", limit: { ok: true, allowanceId: "0xallow" } } });
  });

  it("asks when the payee is unknown or the amount is unclear", () => {
    expect(validateIntent(reduce(base), { to: "Dad" }, now)).toEqual({ ok: false, ask: "Who's Dad?" });
    expect(validateIntent(reduce(base), { to: "Mum", amount: "loads" }, now)).toMatchObject({ ok: false });
  });

  it("refuses a cancelled subscription", () => {
    const s = reduce([...base, { type: "SUBSCRIPTION", name: "Mum", address: MUM, amount: "5", cadenceDays: 30, lastAt: 0, cancelled: true, v: 2 }]);
    expect(validateIntent(s, { to: "Mum" }, now)).toMatchObject({ ok: false });
  });

  it("goes over the limit once this window's spend is counted", () => {
    const s = reduce([...base, { type: "PAYMENT", to: MUM, amount: "80", digest: "x", category: "family", at: now - DAY, via: "agent", v: 2 }]);
    const v = validateIntent(s, { to: "Mum" }, now);
    expect(v.ok && v.plan.limit).toMatchObject({ ok: false, remaining: 20_000_000n });
  });

  it("ignores spend outside the window and owner-signed spend", () => {
    const s = reduce([
      ...base,
      { type: "PAYMENT", to: MUM, amount: "80", digest: "x", category: "family", at: now - 8 * DAY, via: "agent", v: 2 },
      { type: "PAYMENT", to: MUM, amount: "80", digest: "y", category: "family", at: now - DAY, via: "owner", v: 2 },
    ]);
    expect(checkLimit(s, "family", 50_000_000n, now).ok).toBe(true);
  });
});
