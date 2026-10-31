import { cookies } from "next/headers";
import { z } from "zod";
import { MOCK } from "@/lib/env";
import { json } from "@/lib/http";
import { COOKIE, authorized, login, loginMessage } from "@/lib/session";
import { owner } from "@/lib/wallet";

/** The message to sign, plus which wallet owns this deployment. */
export async function GET(req: Request) {
  const address = new URL(req.url).searchParams.get("address") ?? "";
  const at = Date.now();
  const session = authorized((await cookies()).get(COOKIE)?.value);
  return json({ owner: owner(), mock: MOCK, at, session, message: loginMessage(address, at) });
}

export async function POST(req: Request) {
  const b = z.object({ address: z.string(), at: z.number(), signature: z.string() }).parse(await req.json());
  try {
    const token = await login(b.address, b.at, b.signature);
    (await cookies()).set(COOKIE, token, { httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 12 * 3600 });
    return json({ ok: true });
  } catch (e) {
    return json({ error: (e as Error).message }, { status: 403 });
  }
}
