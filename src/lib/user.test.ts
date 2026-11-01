import { describe, expect, it } from "vitest";
import { ownerAddress, operatorAddress } from "./chain";
import { sessionUser } from "./session";
import { asUser } from "./user";

describe("multi-wallet", () => {
  it("each request acts as its signed-in wallet", () => {
    expect(asUser({ address: "0xa", agent: "0xb" }, ownerAddress)).toBe("0xa");
    expect(ownerAddress()).toBe(operatorAddress());
  });
  it("rejects a forged session", () => {
    expect(sessionUser(`0xa.0xb.${Date.now() + 1000}.00`)).toBeNull();
    expect(sessionUser(undefined)).toBeNull();
  });
});
