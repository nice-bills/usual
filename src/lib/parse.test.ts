import { describe, expect, it } from "vitest";
import { parseRules } from "./parse";

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
    ["hello there", { kind: "unknown" }],
  ])("%s", (text, want) => expect(parseRules(text, ctx)).toEqual(want));

  it("reads answers to 'Who's that?'", () => {
    expect(parseRules("That's Mum.", asking)).toEqual({ kind: "name", name: "Mum", relation: "mum", category: "family" });
    expect(parseRules("that's my gym membership", asking)).toMatchObject({ kind: "name", name: "Gym", category: "subscriptions" });
    expect(parseRules("It's Streamly", asking)).toMatchObject({ kind: "name", name: "Streamly" });
    expect(parseRules("It's Streamly, a streaming subscription", asking)).toEqual({ kind: "name", name: "Streamly", relation: undefined, category: "subscriptions" });
    expect(parseRules("that's my mother", asking)).toMatchObject({ kind: "name", name: "Mother", relation: "mother" });
  });
});
