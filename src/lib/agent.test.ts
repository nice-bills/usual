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
const recalled = vi.hoisted(() => vi.fn<(q: string) => Promise<string[]>>(async () => []));
vi.mock("./parse", () => ({ answerFrom: async (_q: string, m: string[]) => m[0], notAName: () => false, parse: async () => ({ action: { kind: "pay", to: "Mum" }, by: "rules" }) }));
vi.mock("./memory", () => ({ load: async () => ({ state: reduce(records), records, source: "mock", pending: 0 }), remember: async (r: unknown[]) => ({ stored: r, queued: 0 }), memoryOn: () => true, ownedAccount: () => null, recallAbout: async (q: string) => recalled(q) }));
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

describe("memory changes what Usual does", () => {
  beforeEach(() => {
    preview.mockReset();
    preview.mockImplementation(async (_to: string, _amount: bigint, allowanceId?: string) => ({ path: allowanceId ? "agent" : "owner", ok: true, error: null, balanceAfter: 350_000_000n, simulated: true }));
  });

  it("something said about a person takes the agent's hands off, even inside the limit", async () => {
    records.push({ type: "CORRECTION", note: "Don't pay Mum until she confirms the new number", v: 99 });
    const r = await talk("Send Mum her usual", {});
    records.pop();
    expect(r.proposal).toMatchObject({ type: "pay", path: "owner" });
    expect(r.say).toContain("You told me: “Don't pay Mum");
  });

  it("answers open questions only from what memory recalls", async () => {
    recalled.mockResolvedValueOnce(["Correction from the user: rent is due on the first."]);
    expect((await act({ kind: "unknown" }, { text: "when is rent due?" })).say).toContain("rent is due on the first");
  });

  it("admits it doesn't know when memory has nothing", async () => {
    recalled.mockResolvedValueOnce([]);
    expect((await act({ kind: "unknown" }, { text: "what's my blood type?" })).say).toContain("don't have anything");
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
