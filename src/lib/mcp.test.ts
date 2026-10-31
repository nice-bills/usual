import { describe, expect, it } from "vitest";
import { reduce } from "./records";
import { vi } from "vitest";

const MUM = "0x" + "1".repeat(64);
const state = reduce([
  { type: "CONTACT", name: "Mum", address: MUM, relation: "mum", source: "user", v: 1 },
  { type: "LIMIT", category: "family", amount: "100", periodDays: 7, allowanceId: "0xa", v: 1 },
]);
const confirmPay = vi.fn();
vi.mock("./env", () => ({ MOCK: true, USDC_DECIMALS: 6, env: { symbol: "USDC" } }));
vi.mock("./agent", () => ({ act: async () => ({ say: "ok" }), confirmPay: (...a: unknown[]) => confirmPay(...a), snapshot: async () => ({ balance: "1.00", symbol: "USDC", state, activity: [], questions: [] }) }));
const { handle } = await import("./mcp");

describe("mcp", () => {
  it("lists tools and marks the money tool destructive", async () => {
    const r = await handle({ id: 1, method: "tools/list" }) as { result: { tools: { name: string; annotations?: { destructiveHint?: boolean } }[] } };
    expect(r.result.tools.find((t) => t.name === "confirm_payment")?.annotations?.destructiveHint).toBe(true);
  });

  it("never reports a payment as sent when it needs the owner", async () => {
    confirmPay.mockResolvedValue({ ok: false, say: "x", needsOwner: "bytes" });
    const r = await handle({ id: 2, method: "tools/call", params: { name: "confirm_payment", arguments: { to: "Mum" } } }) as { result: { content: { text: string }[] } };
    expect(JSON.parse(r.result.content[0].text)).toMatchObject({ sent: false });
  });

  it("ignores notifications and rejects unknown tools", async () => {
    expect(await handle({ method: "notifications/initialized" })).toBeNull();
    expect(await handle({ id: 3, method: "tools/call", params: { name: "nope" } })).toMatchObject({ error: { code: -32602 } });
  });
});
