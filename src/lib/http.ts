import { cookies } from "next/headers";
import { COOKIE, authorized } from "./session";

// bigint -> string so state and proposals serialize.
export const json = (data: unknown, init?: ResponseInit) =>
  new Response(JSON.stringify(data, (_k, v) => (typeof v === "bigint" ? v.toString() : v)), {
    ...init,
    headers: { "content-type": "application/json", ...init?.headers },
  });

/** Wrap a handler: owner session required, errors become JSON. */
export function owned<A extends unknown[]>(fn: (req: Request, ...rest: A) => Promise<Response>) {
  return async (req: Request, ...rest: A) => {
    if (!authorized((await cookies()).get(COOKIE)?.value)) return json({ error: "Connect the owner wallet first." }, { status: 401 });
    try {
      return await fn(req, ...rest);
    } catch (e) {
      console.error(e);
      return json({ error: (e as Error).message }, { status: 500 });
    }
  };
}
