import { appendFileSync } from "node:fs";

/** One JSON line per event, for debugging test sessions. Off unless USUAL_TRACE names a file. Never audio or keys. */
export function trace(event: string, data: Record<string, unknown> = {}) {
  const file = process.env.USUAL_TRACE;
  if (!file) return;
  try {
    appendFileSync(file, `${JSON.stringify({ at: new Date().toISOString(), event, ...data }, (_k, v) => (typeof v === "bigint" ? v.toString() : v))}\n`);
  } catch (e) {
    console.warn("[trace]", (e as Error).message);
  }
}
