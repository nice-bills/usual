import { describe, expect, it, vi } from "vitest";

vi.mock("./env", () => ({ env: { sessionSecret: "test", memwalUrl: "https://relayer.test" } }));
vi.mock("./chain", () => ({ mainnet: () => null }));
const { delegateKey, nextStep } = await import("./memoryAccount");

describe("memory ownership", () => {
  it("each wallet gets its own stable delegate key", () => {
    expect(delegateKey("0xa")).toBe(delegateKey("0xa"));
    expect(delegateKey("0xa")).not.toBe(delegateKey("0xb"));
    expect(delegateKey("0xa")).toMatch(/^[0-9a-f]{64}$/);
  });
  it("walks create, then add, then stops", () => {
    expect(nextStep({ accountId: null, authorized: false })).toBe("create");
    expect(nextStep({ accountId: "0x1", authorized: false })).toBe("add");
    expect(nextStep({ accountId: "0x1", authorized: true })).toBeNull();
  });
});
