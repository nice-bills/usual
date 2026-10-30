import { describe, expect, it } from "vitest";
import { decode, encode, reduce, resolveContact, type Stamped } from "./records";

const A = "0x" + "a".repeat(64);
const B = "0x" + "b".repeat(64);

describe("records", () => {
  it("round-trips through encode/decode", () => {
    const r: Stamped = { type: "CONTACT", name: "Mum", address: A, relation: "mother", source: "chain+user", v: 1 };
    expect(decode(encode(r))).toEqual(r);
    expect(decode("no machine line here")).toBeNull();
  });

  it("newest v wins per key, regardless of order", () => {
    const s = reduce([
      { type: "USUAL", name: "Mum", amount: "60", v: 3 },
      { type: "USUAL", name: "mum", amount: "50", v: 2 },
    ]);
    expect(s.usuals.mum.amount).toBe("60");
  });

  it("resolves contacts and refuses to guess", () => {
    const s = reduce([
      { type: "CONTACT", name: "Mum", address: A, source: "user", v: 1 },
      { type: "CONTACT", name: "Kofi Mensah", address: A, source: "user", v: 1 },
      { type: "CONTACT", name: "Kofi Boateng", address: B, source: "user", v: 1 },
    ]);
    expect(resolveContact(s, "mum")).toMatchObject({ kind: "one" });
    expect(resolveContact(s, "my Mum")).toMatchObject({ kind: "one" });
    expect(resolveContact(s, "Kofi")).toMatchObject({ kind: "many" });
    expect(resolveContact(s, "Dad")).toEqual({ kind: "none" });
  });
});
