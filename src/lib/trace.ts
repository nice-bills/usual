import { appendFileSync } from "node:fs";

/** One JSON line per event, for debugging test sessions. Off unless USUAL_TRACE names a file, or "stdout" on a host. Never audio or keys. */
export function trace(event: string, data: Record<string, unknown> = {}) {
  const file = process.env.USUAL_TRACE;
  if (!file) return;
  try {
    const line = JSON.stringify({ at: new Date().toISOString(), event, ...data }, (_k, v) => (typeof v === "bigint" ? v.toString() : v));
    if (file === "stdout") console.log(`[trace] ${line}`);
    else appendFileSync(file, `${line}\n`);
  } catch (e) {
    console.warn("[trace]", (e as Error).message);
  }
}
