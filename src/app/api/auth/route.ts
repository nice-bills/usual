import { normalizeSuiAddress } from "@mysten/sui/utils";
import { cookies } from "next/headers";
import { z } from "zod";
import { MOCK } from "@/lib/env";
import { json } from "@/lib/http";
import { COOKIE, login, loginMessage, sessionUser } from "@/lib/session";

/** The message to sign, and whether this browser is already signed in as that wallet. */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const address = q.get("address") ?? "";
  const agent = q.get("agent") ?? "";
  const at = Date.now();
  const user = sessionUser((await cookies()).get(COOKIE)?.value);
  const session = user?.address === normalizeSuiAddress(address) && user.agent === normalizeSuiAddress(agent);
  return json({ mock: MOCK, at, session, message: loginMessage(address, agent, at) });
}

export async function POST(req: Request) {
  const b = z.object({ address: z.string(), agent: z.string(), at: z.number(), signature: z.string() }).parse(await req.json());
  try {
    const token = await login(b.address, b.agent, b.at, b.signature);
    (await cookies()).set(COOKIE, token, { httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 12 * 3600 });
    return json({ ok: true });
  } catch (e) {
    return json({ error: (e as Error).message }, { status: 403 });
  }
}
