import { z } from "zod";
import { json, owned } from "@/lib/http";
import { trace } from "@/lib/trace";

const Body = z.object({ event: z.string().max(40), detail: z.record(z.string(), z.union([z.string().max(500), z.number(), z.boolean()])).default({}) });

/** What only the phone can see: timings as felt, voice failures, page errors. */
export const POST = owned(async (req) => {
  const b = Body.parse(await req.json());
  trace(`client:${b.event}`, b.detail);
  return json({ ok: true });
});
