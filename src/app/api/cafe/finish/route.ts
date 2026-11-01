import { z } from "zod";
import { finishCafe } from "@/lib/agent";
import { json, owned } from "@/lib/http";

const Body = z.object({ item: z.string().max(40), challenge: z.string().min(1), bytes: z.string().min(1), signature: z.string().min(1), proofSignature: z.string().min(1) });

/** The device signed the payment and its proof: settle it and collect the receipt. */
export const POST = owned(async (req) => {
  const b = Body.parse(await req.json());
  return json(await finishCafe(b.item, b.challenge, b.bytes, b.signature, b.proofSignature));
});
