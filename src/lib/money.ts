import { USDC_DECIMALS } from "./env";

const WORDS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
  twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};

/** Parse a human amount ("50", "$12.50", "4,500", "fifty", "twenty five") into USDC base units. Null if unclear. */
export function parseAmount(input: string | number): bigint | null {
  let s = String(input).trim().toLowerCase().replace(/usdc|dollars?|bucks|\$/g, "").replace(/,/g, "").trim();
  if (!s) return null;
  if (!/^\d/.test(s)) {
    let n = 0;
    for (const w of s.split(/[\s-]+/).filter((w) => w && w !== "and")) {
      if (w === "hundred") n *= 100;
      else if (w in WORDS) n += WORDS[w];
      else return null;
    }
    s = String(n);
  }
  const m = s.match(/^(\d+)(?:\.(\d+))?$/);
  if (!m || (m[2] && m[2].length > USDC_DECIMALS)) return null;
  const base = BigInt(m[1]) * 10n ** BigInt(USDC_DECIMALS) + BigInt((m[2] ?? "").padEnd(USDC_DECIMALS, "0"));
  return base > 0n ? base : null;
}

/** Base units to a display string: 50000000n -> "50", 4500000n -> "4.50". */
export function formatAmount(base: bigint | string | number): string {
  const b = BigInt(base);
  const neg = b < 0n;
  const abs = neg ? -b : b;
  const whole = abs / 10n ** BigInt(USDC_DECIMALS);
  const frac = (abs % 10n ** BigInt(USDC_DECIMALS)).toString().padStart(USDC_DECIMALS, "0").replace(/0+$/, "");
  const out = frac ? `${whole}.${frac.padEnd(2, "0")}` : `${whole}`;
  return neg ? `-${out}` : out;
}

/** Balances always show cents: 458 -> "458.00", 4.825 stays. */
export function formatBalance(base: bigint | string | number): string {
  const s = formatAmount(base);
  return s.includes(".") ? s : `${s}.00`;
}

export const shortAddr = (a: string) => `${a.slice(0, 4)}…${a.slice(-2)}`;
