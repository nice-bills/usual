// Speech -> one typed Action. A free OpenAI-compatible LLM (Groq / Hugging Face) when a key is
// set, else deterministic rules. Either way the Action is only a proposal: the executor
// validates it against memory and limits.
import { env } from "./env";
import { CATEGORIES, type Category } from "./records";

export type Action =
  | { kind: "pay"; to: string; amount?: string }
  | { kind: "name"; name: string; relation?: string; category?: Category }
  | { kind: "set_usual"; to: string; amount: string }
  | { kind: "set_limit"; category: Category; amount: string; periodDays: number }
  | { kind: "summary" }
  | { kind: "subscriptions" }
  | { kind: "cancel"; name: string }
  | { kind: "balance" }
  | { kind: "cafe"; item?: string }
  | { kind: "remember"; note: string }
  | { kind: "skip" }
  | { kind: "forget"; name: string }
  | { kind: "add_contact"; name: string; amount?: string }
  | { kind: "mistake" }
  | { kind: "statement" }
  | { kind: "unknown"; say?: string };

export type Context = { asking?: { address: string } | null; contacts: string[] };

const RELATIONS: Record<string, Category> = {
  mum: "family", mom: "family", mother: "family", dad: "family", father: "family", sister: "family", brother: "family",
  son: "family", daughter: "family", wife: "family", husband: "family", partner: "family", grandma: "family", grandpa: "family",
  aunt: "family", uncle: "family", cousin: "family", friend: "family", family: "family",
  gym: "subscriptions", membership: "subscriptions", streaming: "subscriptions", subscription: "subscriptions", netflix: "subscriptions",
  spotify: "subscriptions", music: "subscriptions", phone: "subscriptions", internet: "subscriptions", rent: "subscriptions",
  cafe: "food", café: "food", coffee: "food", food: "food", lunch: "food", restaurant: "food", groceries: "food",
  taxi: "transport", bus: "transport", train: "transport", transport: "transport", uber: "transport", fuel: "transport",
};

export const isRelation = (name: string) => RELATIONS[name.toLowerCase()] === "family";

/** A fragment of speech, not a name: saving these would poison memory. */
export const notAName = (name: string) => name.trim().length < 2 || name.trim().split(/\s+/).length > 3 || /[?]$/.test(name.trim()) || /^(got it|wait a minute|never ?mind|hold on|one sec(ond)?|sorry)$/i.test(name.trim()) || /^(the|a|an|and|um+|uh+|hm+|okay|ok|yes|yeah|no|nope|hello|hi|thanks|thank you|you|bye|what|that|it|this|i)$/i.test(name.trim());

export function categoryOf(text: string): Category | undefined {
  for (const w of text.toLowerCase().split(/[^a-zé]+/)) if (RELATIONS[w]) return RELATIONS[w];
  return undefined;
}

const AMOUNT = /(?:\$\s*)?(\d[\d,]*(?:\.\d+)?)\s*(?:usdc|dollars?|bucks)?/i;
const WORD_AMOUNT = /\b((?:(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred)[\s-]*)+)\b/i;
const PERIOD: Record<string, number> = { day: 1, daily: 1, week: 7, weekly: 7, month: 30, monthly: 30 };

const clean = (s: string) => s.replace(/[.?!,]+$/g, "").trim();
const title = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase());

/** Rule parser for the phrases the product is built around. */
export function parseRules(raw: string, ctx: Context): Action {
  const t = clean(raw.toLowerCase().replace(/[’]/g, "'"));
  if (!t) return { kind: "unknown" };

  if (ctx.asking && /^(skip|pass|not sure|no idea|i don'?t know|dunno|ask me later|later)\b/.test(t)) return { kind: "skip" };
  const wrong = t.match(/^(?:no,?\s*)?(?:that'?s not|that isn'?t|it'?s not)\s+(?:my\s+)?(.+)$/) ?? t.match(/^(?:forget|remove|delete)\s+(?:my\s+|about\s+)?(.+)$/);
  if (wrong) return { kind: "forget", name: title(clean(wrong[1])) };

  if (/^(?:no,?\s*)?(?:that was (?:wrong|a mistake)|you (?:shouldn'?t have|got that wrong|messed up)|don'?t do that again|that payment was wrong)/.test(t)) return { kind: "mistake" };
  if (/\b(how am i doing|how are you doing|your (?:credit|score)|credit (?:score|line)|statement|report card)\b/.test(t)) return { kind: "statement" };

  // Answer to "Who's that?"
  const naming = t.match(/^(?:that'?s|that is|it'?s|it is|this is|they'?re)\s+(?:my\s+|the\s+|a\s+)?(.+)$/);
  if (ctx.asking && naming) {
    const words = clean(naming[1]);
    // "Streamly, a streaming subscription" -> name "Streamly"; the rest only hints the category.
    const head = clean(words.split(/,|\s+(?:a|an|the|my|for)\s+/)[0]);
    const relation = words.split(/\s+/).find((w) => RELATIONS[w]);
    const name = title(head.replace(/\b(membership|subscription|account)\b/g, "").trim() || head);
    return { kind: "name", name, relation: relation && RELATIONS[relation] === "family" ? relation : undefined, category: categoryOf(words) };
  }

  const capped = t.match(/\b(?:limit|cap)\s+(?:my\s+|on\s+)?(\w+)(?:\s+spending)?\s+(?:to|at)\s+(.+?)\s*(?:a|per|every|each)?\s*(day|daily|week|weekly|month|monthly)$/);
  const spendOn = t.match(/\b(?:don'?t let me spend|keep)\s+(?:more than\s+)?(.+?)\s+on\s+(\w+)\s+(?:a|per|every|each)\s+(day|week|month)/);
  const lim = capped ? { cat: capped[1], amt: capped[2], per: capped[3] } : spendOn ? { cat: spendOn[2], amt: spendOn[1], per: spendOn[3] } : null;
  if (lim) {
    const category = (CATEGORIES as string[]).includes(lim.cat) ? (lim.cat as Category) : categoryOf(lim.cat);
    if (category) return { kind: "set_limit", category, amount: clean(lim.amt), periodDays: PERIOD[lim.per] };
  }

  // A pending question means a bare phrase is its answer, even if it says "subscription".
  if (ctx.asking && !naming && !raw.trim().endsWith("?") && !/^(send|pay|give|transfer|what|where|when|why|who|whose|which|how|did|do|does|is|are|am|can|could|should|would|will|have|has|tell|show|cancel|limit|cap|buy|order|remember|forget)\b/.test(t)) {
    const relation = t.split(/\s+/).find((w) => RELATIONS[w]);
    const head = clean(t.split(/,|\s+(?:a|an|the|my|for)\s+/)[0]);
    const name = title(head.replace(/\b(membership|subscription|account)\b/g, "").trim() || head);
    return { kind: "name", name, relation: relation && RELATIONS[relation] === "family" ? relation : undefined, category: categoryOf(t) };
  }

  if (/\b(balance|how much (do i|have i) (have|got)|what do i have)\b/.test(t)) return { kind: "balance" };
  if (/\b(wast\w*|where('?s| is| does) my money|spending|spent|habits?)\b/.test(t)) return { kind: "summary" };
  if (/\bsubscriptions?\b/.test(t) && !/\bcancel\b/.test(t)) return { kind: "subscriptions" };

  const cancel = t.match(/\b(?:cancel|stop paying(?: for)?|drop)\s+(?:my\s+|the\s+)?(.+?)(?:\s+subscription)?$/);
  if (cancel) return { kind: "cancel", name: title(cancel[1]) };

  const usual = t.match(/^(.+?)'?s usual is\s+(.+)$/);
  if (usual) return { kind: "set_usual", to: title(usual[1].replace(/^my\s+/, "")), amount: clean(usual[2]) };

  if (/\b(caf[eé]|coffee|flat white|croissant|breakfast)\b/.test(t) && /\b(pay|buy|get|order|scan)\b/.test(t)) {
    const item = /croissant/.test(t) ? "croissant" : /breakfast/.test(t) ? "breakfast" : "flat-white";
    return { kind: "cafe", item };
  }

  const pay = t.match(/^(?:please\s+)?(?:send|pay|give|transfer)\s+(.+)$/);
  if (pay) {
    let rest = pay[1];
    const num = rest.match(AMOUNT) ?? rest.match(WORD_AMOUNT);
    const amount = num ? clean(num[1]) : undefined;
    if (num) rest = rest.replace(num[0], " ");
    const to = rest
      .replace(/\b(her|his|their|the|my|usual|usdc|dollars?|bucks|to|again|please|amount|now)\b/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (to) return { kind: "pay", to: title(to), amount };
  }

  const note = t.match(/^(?:remember|note)(?: that)?\s+(.+)$/);
  if (note) return { kind: "remember", note: clean(raw.replace(/^\s*(remember|note)(\s+that)?\s+/i, "")) };

  return { kind: "unknown" };
}

// One tool per action; the model must pick exactly one.
const TOOLS = [
  { name: "pay", description: "Send money to a person or payee. Omit amount when the user says 'the usual' or gives none.", properties: { to: { type: "string" }, amount: { type: "string" } }, required: ["to"] },
  { name: "name", description: "The user names the wallet Usual just asked about ('That's Mum', 'my gym').", properties: { name: { type: "string" }, relation: { type: "string", description: "family relation if any, e.g. mother" }, category: { type: "string", enum: CATEGORIES } }, required: ["name"] },
  { name: "set_usual", description: "User states the usual amount for someone.", properties: { to: { type: "string" }, amount: { type: "string" } }, required: ["to", "amount"] },
  { name: "set_limit", description: "User sets a spending limit for a category.", properties: { category: { type: "string", enum: CATEGORIES }, amount: { type: "string" }, periodDays: { type: "number" } }, required: ["category", "amount", "periodDays"] },
  { name: "summary", description: "Where is my money going / what am I wasting money on.", properties: {}, required: [] },
  { name: "subscriptions", description: "List recurring payments.", properties: {}, required: [] },
  { name: "cancel", description: "Stop paying a subscription.", properties: { name: { type: "string" } }, required: ["name"] },
  { name: "balance", description: "How much money the user has.", properties: {}, required: [] },
  { name: "cafe", description: "Pay the café for an item.", properties: { item: { type: "string", enum: ["flat-white", "croissant", "breakfast"] } }, required: [] },
  { name: "remember", description: "User asks Usual to remember a fact or correction.", properties: { note: { type: "string" } }, required: ["note"] },
  { name: "skip", description: "User doesn't know or won't say who the wallet is.", properties: {}, required: [] },
  { name: "forget", description: "User says a remembered name is wrong, or asks to forget someone.", properties: { name: { type: "string" } }, required: ["name"] },
  { name: "mistake", description: "User says the agent's last payment was wrong or shouldn't have happened.", properties: {}, required: [] },
  { name: "statement", description: "User asks how the agent is doing, its score, credit line or statement.", properties: {}, required: [] },
  { name: "unknown", description: "Nothing above fits; reply briefly.", properties: { say: { type: "string" } }, required: [] },
].map((t) => ({ type: "function" as const, function: { name: t.name, description: t.description, parameters: { type: "object", properties: t.properties, required: t.required } } }));

export async function parseLLM(text: string, ctx: Context): Promise<Action | null> {
  if (!env.llmKey) return null;
  const system = `You turn what a wallet user said into exactly one tool call. Never invent amounts or people.
Known contacts: ${ctx.contacts.join(", ") || "none yet"}.${ctx.asking ? `\nUsual just asked the user who wallet ${ctx.asking.address} is; a bare name or relation is a "name" answer.` : ""}`;
  try {
    const res = await fetch(`${env.llmUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${env.llmKey}` },
      body: JSON.stringify({ model: env.llmModel, temperature: 0, tools: TOOLS, tool_choice: "required", messages: [{ role: "system", content: system }, { role: "user", content: text }] }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 200)}`);
    const call = (await res.json()).choices?.[0]?.message?.tool_calls?.[0]?.function;
    if (!call) return null;
    const args = JSON.parse(call.arguments || "{}");
    return { kind: call.name, ...args } as Action;
  } catch (e) {
    console.warn("[llm] falling back to rules:", (e as Error).message);
    return null;
  }
}

/** Answer from recalled memories and nothing else. No LLM: the nearest memory, as it was saved. */
export async function answerFrom(question: string, memories: string[]): Promise<string> {
  if (!env.llmKey) return memories[0];
  const system = `You are Usual, a wallet that remembers. Answer in one or two short spoken sentences, using only these memories. If they don't answer it, say you don't know yet. Never give financial advice.\n${memories.map((m) => `- ${m}`).join("\n")}`;
  try {
    const res = await fetch(`${env.llmUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${env.llmKey}` },
      body: JSON.stringify({ model: env.llmModel, temperature: 0, messages: [{ role: "system", content: system }, { role: "user", content: question }] }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) throw new Error(`${res.status}`);
    return (await res.json()).choices?.[0]?.message?.content?.trim() || memories[0];
  } catch (e) {
    console.warn("[llm] answering from the nearest memory:", (e as Error).message);
    return memories[0];
  }
}

/** The LLM must pick a tool, so noise can come back as a purchase, and people say things no rule expects.
 *  So its reading of anything that changes money or memory is put back to the user as a question. */
export function confirmLine(a: Action): string | null {
  switch (a.kind) {
    case "pay": return `Send ${a.to}${a.amount ? ` ${a.amount}` : " the usual"}?`;
    case "cafe": return `A ${(a.item ?? "flat-white").replace("-", " ")} from the café?`;
    case "set_limit": return `Cap ${a.category} at ${a.amount} every ${a.periodDays} days?`;
    case "set_usual": return `Make ${a.amount} ${a.to}'s usual?`;
    case "cancel": return `Stop ${a.name}?`;
    case "forget": return `Forget ${a.name}?`;
    case "skip": return "Skip this one?";
    case "mistake": return "Mark my last payment as wrong?";
    default: return null;
  }
}

/** Rules first for the phrases they know (fast, free, deterministic); the LLM handles the rest. */
export async function parse(text: string, ctx: Context): Promise<{ action: Action; by: "rules" | "llm" }> {
  const ruled = parseRules(text, ctx);
  if (ruled.kind !== "unknown") return { action: ruled, by: "rules" };
  // One or two letters is noise, not a sentence.
  if ((text.match(/\p{L}/gu) ?? []).length < 3) return { action: { kind: "unknown", say: "Sorry, say that again." }, by: "rules" };
  const llm = await parseLLM(text, ctx);
  return llm ? { action: llm, by: "llm" } : { action: ruled, by: "rules" };
}
