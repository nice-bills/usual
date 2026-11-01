import { describe, expect, it } from "vitest";
import { isEcho } from "./echo";

describe("isEcho", () => {
  it("drops Usual hearing itself", () => {
    expect(isEcho("Got it", "Got it, Mum. Usually 50 TUSD.")).toBe(true);
  });
  it("keeps what the user said", () => {
    expect(isEcho("Send Mum her usual", "Got it, Mum. Usually 50 TUSD.")).toBe(false);
  });
  it("never drops a one-word answer", () => {
    expect(isEcho("Yes", "Should I, yes or no?")).toBe(false);
  });
});
