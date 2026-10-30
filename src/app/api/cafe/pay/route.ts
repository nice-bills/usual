import { z } from "zod";
import { payCafe } from "@/lib/agent";
import { json, owned } from "@/lib/http";
import { oneShotBytes, cafeQuote } from "@/lib/wallet";

const Body = z.object({ item: z.string().max(40), path: z.enum(["agent", "owner"]) });

/** Agent pays the café's 402 within the food allowance; above it, the owner approves a one-shot allowance. */
export const POST = owned(async (req) => {
  const b = Body.parse(await req.json());
  if (b.path === "agent") return json(await payCafe(b.item, undefined));
  const q = await cafeQuote(b.item, process.env.PUBLIC_ORIGIN ?? new URL(req.url).origin);
  return json({ ok: false, needsOwner: await oneShotBytes(q.label, q.amount) });
});
