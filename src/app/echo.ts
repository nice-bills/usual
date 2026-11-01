/** Whisper heard Usual's own voice: every word it heard is one Usual just said. */
export function isEcho(heard: string, spoken: string) {
  const words = (t: string) => t.toLowerCase().match(/[\p{L}\p{N}']+/gu) ?? [];
  const said = new Set(words(spoken));
  const got = words(heard);
  return got.length > 1 && got.every((w) => said.has(w));
}
