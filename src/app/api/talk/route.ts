import { z } from "zod";
import { talk } from "@/lib/agent";
import { json, owned } from "@/lib/http";
import { trace } from "@/lib/trace";

const Body = z.object({
  text: z.string().trim().min(1).max(500),
  asking: z.object({ address: z.string(), text: z.string(), count: z.number(), usual: z.string() }).nullish(),
  followUp: z.record(z.string(), z.unknown()).nullish(),
  skip: z.array(z.string()).max(50).optional(),
});

export const POST = owned(async (req) => {
  const b = Body.parse(await req.json());
  const r = await talk(b.text, { asking: b.asking, followUp: b.followUp as never, skip: b.skip });
  trace("talk", { heard: b.text, by: r.by, action: r.action, say: r.say, understood: r.understood, path: r.proposal?.type === "limit" ? "owner" : r.proposal?.path, asking: b.asking?.text, memoryError: r.memoryError });
  return json(r);
});
