// Any wallet can sign in: it signs one message and gets an HMAC cookie naming its address.
import { createHmac, timingSafeEqual } from "node:crypto";
import { verifyPersonalMessageSignature } from "@mysten/sui/verify";
import { normalizeSuiAddress } from "@mysten/sui/utils";
import { env, MOCK } from "./env";
import type { User } from "./user";

export const COOKIE = "usual_session";
const TTL = 12 * 3600_000;
const mac = (s: string) => createHmac("sha256", env.sessionSecret).update(s).digest("hex");

// The wallet names its agent key here, so a cookie can't point Usual at a key the wallet never approved.
export const loginMessage = (address: string, agent: string, at: number) => `Usual: sign in as ${address} with agent ${agent} at ${at}`;

export async function login(address: string, agent: string, at: number, signature: string): Promise<string> {
  if (Math.abs(Date.now() - at) > 5 * 60_000) throw new Error("stale sign-in message");
  await verifyPersonalMessageSignature(new TextEncoder().encode(loginMessage(address, agent, at)), signature, { address });
  const body = `${normalizeSuiAddress(address)}.${normalizeSuiAddress(agent)}.${Date.now() + TTL}`;
  return `${body}.${mac(body)}`;
}

export const authorized = (cookie: string | undefined) => MOCK || !!sessionUser(cookie);

/** The wallet and agent key this cookie was issued to, or null if it's missing, forged or expired. */
export function sessionUser(cookie: string | undefined): User | null {
  if (!cookie) return null;
  const i = cookie.lastIndexOf(".");
  const body = cookie.slice(0, i);
  const sig = Buffer.from(cookie.slice(i + 1), "hex");
  const want = Buffer.from(mac(body), "hex");
  if (sig.length !== want.length || !timingSafeEqual(sig, want)) return null;
  const [address, agent, expires] = body.split(".");
  return Number(expires) > Date.now() ? { address, agent } : null;
}
