import { z } from "zod";
import { env } from "@/lib/env";
import { json, owned } from "@/lib/http";
import { trace } from "@/lib/trace";

/** A natural voice for replies. The client stays silent if this fails. */
export const POST = owned(async (req) => {
  const { text } = z.object({ text: z.string().min(1).max(190) }).parse(await req.json());
  const res = await fetch(`${env.llmUrl.replace(/\/$/, "")}/audio/speech`, {
    method: "POST",
    headers: { authorization: `Bearer ${env.llmKey}`, "content-type": "application/json" },
    body: JSON.stringify({ model: "canopylabs/orpheus-v1-english", input: text, voice: "autumn", response_format: "wav" }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    trace("speech-failed", { status: res.status, text });
    return json({ error: `speech failed: ${res.status}` }, { status: 502 });
  }
  return new Response(res.body, { headers: { "content-type": "audio/wav" } });
});
