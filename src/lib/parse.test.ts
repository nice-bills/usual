import { describe, expect, it } from "vitest";
import { confirmLine, notAName, parseRules } from "./parse";

const ctx = { contacts: ["Mum"], asking: null };
const asking = { contacts: [], asking: { address: "0xabc" } };

describe("parseRules", () => {
  it.each([
    ["Send Mum her usual", { kind: "pay", to: "Mum", amount: undefined }],
    ["send mum 50", { kind: "pay", to: "Mum", amount: "50" }],
    ["Pay Kofi $12.50 please", { kind: "pay", to: "Kofi", amount: "12.50" }],
    ["give my sister twenty five dollars", { kind: "pay", to: "Sister", amount: "twenty five" }],
    ["What am I wasting money on?", { kind: "summary" }],
    ["what's my balance", { kind: "balance" }],
    ["show my subscriptions", { kind: "subscriptions" }],
    ["cancel the streaming subscription", { kind: "cancel", name: "Streaming" }],
    ["limit food to 3 a day", { kind: "set_limit", category: "food", amount: "3", periodDays: 1 }],
    ["cap family spending at 100 per week", { kind: "set_limit", category: "family", amount: "100", periodDays: 7 }],
    ["Mum's usual is 60", { kind: "set_usual", to: "Mum", amount: "60" }],
    ["pay for my coffee at the café", { kind: "cafe", item: "flat-white" }],
    ["remember that Kofi is my landlord", { kind: "remember", note: "Kofi is my landlord" }],
    ["don't let me spend more than 3 on food a day", { kind: "set_limit", category: "food", amount: "3", periodDays: 1 }],
    ["that's not Mum", { kind: "forget", name: "Mum" }],
    ["forget my gym", { kind: "forget", name: "Gym" }],
    ["hello there", { kind: "unknown" }],
  ])("%s", (text, want) => expect(parseRules(text, ctx)).toEqual(want));

  it("takes a bare phrase as the answer to a pending question", () => {
    expect(parseRules("Mum", asking)).toMatchObject({ kind: "name", name: "Mum", category: "family" });
    expect(parseRules("Streamly streaming subscription", asking)).toMatchObject({ kind: "name", category: "subscriptions" });
    expect(parseRules("what am I wasting money on", asking)).toEqual({ kind: "summary" });
  });

  it("knows a speech fragment is not a name", () => {
    expect(["The", "um", "Thank you", "ok", "x"].every(notAName)).toBe(true);
    expect(["Mum", "Gym", "Netflix", "Jo"].some(notAName)).toBe(false);
  });

  it("lets the user skip a question", () => {
    expect(parseRules("not sure", asking)).toEqual({ kind: "skip" });
    expect(parseRules("not sure", ctx)).toEqual({ kind: "unknown" });
  });

  it("reads answers to 'Who's that?'", () => {
    expect(parseRules("That's Mum.", asking)).toEqual({ kind: "name", name: "Mum", relation: "mum", category: "family" });
    expect(parseRules("that's my gym membership", asking)).toMatchObject({ kind: "name", name: "Gym", category: "subscriptions" });
    expect(parseRules("It's Streamly", asking)).toMatchObject({ kind: "name", name: "Streamly" });
    expect(parseRules("It's Streamly, a streaming subscription", asking)).toEqual({ kind: "name", name: "Streamly", relation: undefined, category: "subscriptions" });
    expect(parseRules("that's my mother", asking)).toMatchObject({ kind: "name", name: "Mother", relation: "mother" });
  });
});

describe("a question is never a name", () => {
  const asking = { address: "0x1", text: "Who's that?", count: 3, usual: "50" };
  it.each(["when is the rent due?", "when is the rent due", "did I pay the gym", "why is it so high"])("%s", (text) => {
    expect(parseRules(text, { asking, contacts: [] }).kind).not.toBe("name");
  });
});

describe("the LLM's reading of money is put back as a question", () => {
  it("asks about a café order, however it was phrased", () => {
    expect(confirmLine({ kind: "cafe", item: "flat-white" })).toBe("A flat white from the café?");
  });
  it("asks about a payment", () => {
    expect(confirmLine({ kind: "pay", to: "Mum" })).toBe("Send Mum the usual?");
  });
  it("needs no question for a harmless reading", () => {
    expect(confirmLine({ kind: "summary" })).toBeNull();
  });
  it("a sentence isn't a name", () => {
    expect(notAName("And I'Ll See You Next Time")).toBe(true);
    expect(notAName("Got It")).toBe(true);
    expect(notAName("Streamly")).toBe(false);
  });
});
