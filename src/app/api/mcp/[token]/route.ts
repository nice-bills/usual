import { createHash, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";
import { handle } from "@/lib/mcp";

const digest = (s: string) => createHash("sha256").update(s).digest();

export async function POST(req: Request, ctx: RouteContext<"/api/mcp/[token]">) {
  const { token } = await ctx.params;
  if (!env.mcpToken || !timingSafeEqual(digest(token), digest(env.mcpToken))) return new Response("Not found", { status: 404 });
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) return Response.json({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "Invalid request" } }, { status: 400 });
  const out = await handle(body);
  return out ? Response.json(out) : new Response(null, { status: 202 });
}

// No server-initiated stream: this server only answers requests.
export const GET = () => new Response(null, { status: 405, headers: { allow: "POST" } });
