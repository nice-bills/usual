import { cookies } from "next/headers";
import { COOKIE, authorized, sessionUser } from "./session";
import { trace } from "./trace";
import { asUser } from "./user";

// bigint -> string so state and proposals serialize.
export const json = (data: unknown, init?: ResponseInit) =>
  new Response(JSON.stringify(data, (_k, v) => (typeof v === "bigint" ? v.toString() : v)), {
    ...init,
    headers: { "content-type": "application/json", ...init?.headers },
  });

/** Wrap a handler: owner session required, errors become JSON. */
export function owned<A extends unknown[]>(fn: (req: Request, ...rest: A) => Promise<Response>) {
  return async (req: Request, ...rest: A) => {
    const cookie = (await cookies()).get(COOKIE)?.value;
    if (!authorized(cookie)) return json({ error: "Connect your wallet first." }, { status: 401 });
    const user = sessionUser(cookie);
    const start = Date.now();
    const path = new URL(req.url).pathname;
    try {
      const res = await (user ? asUser(user, () => fn(req, ...rest)) : fn(req, ...rest));
      if (path !== "/api/log") trace("api", { path, status: res.status, ms: Date.now() - start });
      return res;
    } catch (e) {
      console.error(e);
      trace("api-error", { path, ms: Date.now() - start, error: (e as Error).message });
      return json({ error: (e as Error).message }, { status: 500 });
    }
  };
}
