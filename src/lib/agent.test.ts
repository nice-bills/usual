// The chain is the enforcer: when memory says yes and the chain refuses the agent, the owner still can pay.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { reduce, type Stamped } from "./records";

const MUM = "0x" + "1".repeat(64);
const records: Stamped[] = [
  { type: "CONTACT", name: "Mum", address: MUM, relation: "mum", source: "chain+user", v: 1 },
  { type: "USUAL", name: "Mum", amount: "50", count: 3, v: 1 },
  { type: "LIMIT", category: "family", amount: "100", periodDays: 7, allowanceId: "0xallow", v: 1 },
];
const preview = vi.fn();

vi.mock("./env", () => ({ MOCK: true, USDC_DECIMALS: 6, env: { symbol: "USDC" } }));
vi.mock("./parse", () => ({ parse: async () => ({ action: { kind: "pay", to: "Mum" }, by: "rules" }) }));
vi.mock("./memory", () => ({ load: async () => ({ state: reduce(records), records, source: "mock", pending: 0 }), remember: async (r: unknown[]) => ({ stored: r, queued: 0 }), memoryOn: () => true }));
vi.mock("./wallet", () => ({
  preview: (...a: unknown[]) => preview(...a),
  balance: async () => 400_000_000n,
  history: async () => [1, 2, 3].map((i) => ({ to: MUM, amount: 50_000_000n, digest: `${i}`, at: i })),
  cafeAddress: () => "0xcafe",
  owner: () => "0x0",
}));

const { act, talk } = await import("./agent");

describe("chain refusal", () => {
  beforeEach(() => preview.mockReset());

  it("uses the agent when the chain agrees", async () => {
    preview.mockResolvedValue({ path: "agent", ok: true, error: null, balanceAfter: 350_000_000n, simulated: true });
    const r = await talk("Send Mum her usual", {});
    expect(r.proposal).toMatchObject({ type: "pay", path: "agent" });
  });

  it("falls back to the owner when the chain refuses the agent", async () => {
    preview
      .mockResolvedValueOnce({ path: "agent", ok: false, error: "EExceedsRateLimit", balanceAfter: 350_000_000n, simulated: true })
      .mockResolvedValueOnce({ path: "owner", ok: true, error: null, balanceAfter: 350_000_000n, simulated: true });
    const r = await talk("Send Mum her usual", {});
    expect(r.proposal).toMatchObject({ type: "pay", path: "owner", overLimit: "over what the agent can spend" });
    expect(r.say).toContain("needs your signature");
  });
});

describe("naming", () => {
  it("never moves a known name onto a second wallet", async () => {
    const other = "0x" + "2".repeat(64);
    const r = await act({ kind: "name", name: "Mum" }, { asking: { address: other, text: "Who's that?", count: 3, usual: "30" } });
    expect(r.say).toContain("You already have a Mum");
    expect(r.remembered).toBe(0);
  });
});
