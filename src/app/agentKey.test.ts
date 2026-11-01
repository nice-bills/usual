// The device key must produce signatures Sui accepts, keep working after a reload, and never be readable.
import { verifyPersonalMessageSignature } from "@mysten/sui/verify";
import { beforeAll, describe, expect, it } from "vitest";
import { agentKey } from "./agentKey";

// Just enough IndexedDB: one store that keeps the CryptoKeyPair object as-is.
const keys = new Map<string, unknown>();
const done = <T>(result: T) => {
  const req = { result, onsuccess: null as null | (() => void), onerror: null };
  queueMicrotask(() => req.onsuccess?.());
  return req;
};
beforeAll(() => {
  const db = { transaction: () => ({ objectStore: () => ({ get: (k: string) => done(keys.get(k)), put: (v: unknown, k: string) => { keys.set(k, v); return done(k); } }) }) };
  (globalThis as unknown as { indexedDB: unknown }).indexedDB = { open: () => done(db) };
});

describe("device agent key", () => {
  it("signs what Sui can verify", async () => {
    const key = await agentKey("0xwallet");
    const message = new TextEncoder().encode("hello");
    const { signature } = await key.signPersonalMessage(message);
    await expect(verifyPersonalMessageSignature(message, signature, { address: key.toSuiAddress() })).resolves.toBeTruthy();
  });

  it("cannot be read out of the browser", async () => {
    await agentKey("0xwallet");
    const pair = keys.get("0xwallet") as CryptoKeyPair;
    expect(pair.privateKey.extractable).toBe(false);
    await expect(crypto.subtle.exportKey("pkcs8", pair.privateKey)).rejects.toThrow();
  });

  it("each wallet gets its own key", async () => {
    expect((await agentKey("0xa")).toSuiAddress()).not.toBe((await agentKey("0xb")).toSuiAddress());
  });
});
