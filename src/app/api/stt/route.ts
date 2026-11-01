import { env } from "@/lib/env";
import { json, owned } from "@/lib/http";
import { load } from "@/lib/memory";
import { trace } from "@/lib/trace";

const MAX_AUDIO = 5_000_000;
const NO_SPEECH = 0.6;
const MIN_LOGPROB = -1; // Below this Whisper is guessing, which is how noise became Icelandic.

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
  form.set("response_format", "verbose_json");
  form.set("temperature", "0");
  if (typeof language === "string" && /^[a-z]{2}$/.test(language)) form.set("language", language);
  // Vocabulary only. Whole sentences here get echoed back as speech on quiet audio.
  const prompt = ["yes", "no", "Mum", "USDC", "usual", "café", ...names].join(", ");
  form.set("prompt", prompt);
  const start = Date.now();
  const call = () => fetch(`${env.llmUrl.replace(/\/$/, "")}/audio/transcriptions`, { method: "POST", headers: { authorization: `Bearer ${env.llmKey}` }, body: form, signal: AbortSignal.any([req.signal, AbortSignal.timeout(15_000)]) });
  // Mobile links drop calls. One retry beats losing what the user said.
  const res = await call().catch((e) => {
    if (req.signal.aborted) throw e;
    trace("whisper-retry", { error: String(e.cause ?? e.message).slice(0, 120) });
    return call();
  });
  if (!res.ok) {
    trace("whisper-failed", { status: res.status, bytes: audio.size, type: audio.type });
    return json({ error: `transcription failed: ${res.status}` }, { status: 502 });
  }
  const result = await res.json() as { text?: string; segments?: { no_speech_prob: number; avg_logprob?: number }[] };
  // Whisper invents words on noise. Its own confidence decides whether anything was said.
  const heard = (result.segments ?? []).some((seg) => seg.no_speech_prob < NO_SPEECH && (seg.avg_logprob ?? 0) > MIN_LOGPROB);
  const raw = String(result.text ?? "").trim();
  // On near-silence Whisper can read the prompt back.
  const text = heard && !raw.toLowerCase().startsWith("yes, no, mum") ? raw : "";
  trace("whisper", { text, ms: Date.now() - start, bytes: audio.size, type: audio.type, language });
  return json({ text });
});
