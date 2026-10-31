import { env } from "@/lib/env";
import { json, owned } from "@/lib/http";
import { load } from "@/lib/memory";
import { trace } from "@/lib/trace";

const MAX_AUDIO = 5_000_000;

/** Whisper hears far better than the browser, and the prompt primes it with this user's own names. */
export const POST = owned(async (req) => {
  const body = await req.formData();
  const audio = body.get("audio");
  if (!(audio instanceof File) || audio.size === 0 || audio.size > MAX_AUDIO) return json({ error: "bad audio" }, { status: 400 });
  // Never hold Whisper up for a cold memory read: names only bias it.
  const names = await Promise.race([load().then((m) => Object.values(m.state.contacts).map((c) => c.name)), new Promise<string[]>((r) => setTimeout(() => r([]), 200))]);
  const language = body.get("language");
  const form = new FormData();
  form.set("file", audio);
  form.set("model", "whisper-large-v3-turbo");
  form.set("response_format", "json");
  form.set("temperature", "0");
  if (typeof language === "string" && /^[a-z]{2}$/.test(language)) form.set("language", language);
  form.set("prompt", `Send Mum her usual. That's my gym. What am I wasting money on? ${names.join(", ")}`);
  const start = Date.now();
  const res = await fetch(`${env.llmUrl.replace(/\/$/, "")}/audio/transcriptions`, { method: "POST", headers: { authorization: `Bearer ${env.llmKey}` }, body: form, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) {
    trace("whisper-failed", { status: res.status, bytes: audio.size, type: audio.type });
    return json({ error: `transcription failed: ${res.status}` }, { status: 502 });
  }
  const text = String((await res.json()).text ?? "").trim();
  trace("whisper", { text, ms: Date.now() - start, bytes: audio.size, type: audio.type, language });
  return json({ text });
});
