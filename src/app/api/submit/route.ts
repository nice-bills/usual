import { z } from "zod";
import { afterSigned } from "@/lib/agent";
import { json, owned } from "@/lib/http";
import { CATEGORIES } from "@/lib/records";

const Body = z.object({
  kind: z.enum(["pay", "agent-pay", "limit", "cafe", "starter", "seed", "deposit"]),
  bytes: z.string().min(1),
  signature: z.string().min(1),
  meta: z.object({
    category: z.enum(CATEGORIES as [string, ...string[]]).optional(),
    amount: z.string().optional(),
    periodDays: z.number().optional(),
    item: z.string().optional(),
  }).default({}),
});

/** Execute an owner-signed transaction through Tatum, confirm it, and remember what it did. */
export const POST = owned(async (req) => {
  const b = Body.parse(await req.json());
  return json(await afterSigned(b.kind, b.bytes, b.signature, b.meta as never));
});
