import { z } from "zod";
import { confirmPay, ownerPay } from "@/lib/agent";
import { json, owned } from "@/lib/http";

const Body = z.object({ to: z.string().min(1).max(80), amount: z.string().max(40).optional(), path: z.enum(["agent", "owner"]) });

/** Server re-validates against memory and limits; the client's proposal is never trusted. */
export const POST = owned(async (req) => {
  const b = Body.parse(await req.json());
  return json(b.path === "agent" ? await confirmPay(b.to, b.amount) : await ownerPay(b.to, b.amount));
});
