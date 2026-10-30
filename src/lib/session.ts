// Only the owner wallet may drive a live deployment: it signs one message, gets an HMAC cookie.
import { createHmac, timingSafeEqual } from "node:crypto";
import { verifyPersonalMessageSignature } from "@mysten/sui/verify";
import { normalizeSuiAddress } from "@mysten/sui/utils";
import { env, MOCK } from "./env";
import { owner } from "./wallet";

export const COOKIE = "usual_session";
const TTL = 12 * 3600_000;
const mac = (s: string) => createHmac("sha256", env.sessionSecret).update(s).digest("hex");

export const loginMessage = (address: string, at: number) => `Usual: sign in as ${address} at ${at}`;

export async function login(address: string, at: number, signature: string): Promise<string> {
  if (Math.abs(Date.now() - at) > 5 * 60_000) throw new Error("stale sign-in message");
  if (normalizeSuiAddress(address) !== normalizeSuiAddress(owner())) throw new Error("this wallet is not the owner of this Usual");
  await verifyPersonalMessageSignature(new TextEncoder().encode(loginMessage(address, at)), signature, { address });
  const body = `${normalizeSuiAddress(address)}.${Date.now() + TTL}`;
  return `${body}.${mac(body)}`;
}

export function authorized(cookie: string | undefined): boolean {
  if (MOCK) return true;
  if (!cookie) return false;
  const i = cookie.lastIndexOf(".");
  const body = cookie.slice(0, i);
  const sig = Buffer.from(cookie.slice(i + 1), "hex");
  const want = Buffer.from(mac(body), "hex");
  if (sig.length !== want.length || !timingSafeEqual(sig, want)) return false;
  return Number(body.split(".")[1]) > Date.now();
}
