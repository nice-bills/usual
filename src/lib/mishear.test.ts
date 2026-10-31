// Red team for voice + money: perturbed transcripts must never pay the wrong person or a misheard amount.
import { describe, expect, it } from "vitest";
import { validateIntent, type ChainPayment } from "./insights";
import { parseRules, type Action } from "./parse";
import { reduce, type Stamped } from "./records";

const MUM = "0x" + "1".repeat(64);
const GYM = "0x" + "2".repeat(64);
const KOFI_A = "0x" + "3".repeat(64);
const KOFI_B = "0x" + "4".repeat(64);
const TOM = "0x" + "5".repeat(64);
const DAY = 86_400_000;
const now = 100 * DAY;

const recs: Stamped[] = [
  { type: "CONTACT", name: "Mum", address: MUM, relation: "mum", source: "chain+user", v: 1 },
  { type: "USUAL", name: "Mum", amount: "50", count: 3, v: 1 },
  { type: "CONTACT", name: "Gym", address: GYM, source: "chain+user", v: 1 },
  { type: "CONTACT", name: "Kofi Mensah", address: KOFI_A, source: "user", v: 1 },
  { type: "CONTACT", name: "Kofi Boateng", address: KOFI_B, source: "user", v: 1 },
  { type: "CONTACT", name: "Tom", address: TOM, source: "user", v: 1 },
  { type: "LIMIT", category: "family", amount: "500", periodDays: 7, allowanceId: "0xa", v: 1 },
];
const hist: ChainPayment[] = [1, 2, 3].map((i) => ({ to: MUM, amount: 50_000_000n, digest: `m${i}`, at: i * DAY }));
const s = reduce(recs);

function outcome(text: string) {
  const a: Action = parseRules(text, { contacts: [], asking: null });
  if (a.kind !== "pay") return { paid: null };
  const v = validateIntent(s, { to: a.to, amount: a.amount }, now, hist);
  return v.ok ? { paid: v.plan.contact.address, amount: v.plan.amount, guard: v.plan.guard } : { paid: null, ask: v.ask };
}

describe("never pays the wrong person", () => {
  it.each([
    ["send mum her usual", MUM],
    ["send mom her usual", MUM],
    ["send my mother the usual", MUM],
    ["Send Mum 50", MUM],
    ["send tom 50", TOM],
  ])("%s pays the right wallet", (text, want) => expect(outcome(text).paid).toBe(want));

  it.each([
    "send nun her usual", "send rum 50", "send mumbai 50", "send mum and dad 50", "send kofi 20",
    "send dad 50", "send gum 20", "send them 50", "send her usual", "send mum 50 no wait 20",
    "pay the man 10", "send tim 50", "send jim 50", "send gyms 20", "send 50",
  ])("%s refuses or asks", (text) => expect(outcome(text).paid).toBeNull());
});

describe("never trusts a misheard amount", () => {
  it.each(["send mum 15", "send mum fifteen"])("%s is checked against the usual 50", (text) => {
    const r = outcome(text);
    expect(r.paid).toBeNull();
    expect(r.ask).toContain("50");
  });

  it("forces a signature far above the usual", () => expect(outcome("send mum 500").guard).toBe("Much more than usual"));
  it("forces a signature on a first payment", () => expect(outcome("send tom 5").guard).toBe("First payment to this wallet"));
  it("asks when the evidence is mixed", () => {
    const mixed = [10, 20, 30, 40].map((n, i) => ({ to: MUM, amount: BigInt(n) * 1_000_000n, digest: `x${i}`, at: i * DAY }));
    expect(validateIntent(s, { to: "Mum" }, now, mixed)).toMatchObject({ ok: false });
  });
});
