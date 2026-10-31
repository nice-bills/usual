// Drives the real UI against a running server. A scripted wallet (demo owner key) answers the wallet
// popups and scripted speech stands in for the mic, so this proves everything except a human's voice.
// Usage: tsx --env-file=.env scripts/live-browser.ts check|demo [port]
import { createRequire } from "node:module";
import { readdirSync, renameSync } from "node:fs";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction } from "@mysten/sui/transactions";
import { sui } from "../src/lib/chain";

const mode = process.argv[2] ?? "check";
const base = `http://localhost:${process.argv[3] ?? 3300}`;
const require = createRequire(import.meta.url);
const pw = readdirSync("node_modules/.pnpm").find((d) => d.startsWith("playwright-core@"));
const { chromium } = require(`${process.cwd()}/node_modules/.pnpm/${pw}/node_modules/playwright-core`);

const owner = Ed25519Keypair.fromSecretKey(process.env.OWNER_SUI_PRIVATE_KEY!);
const addr = (k: string) => Ed25519Keypair.fromSecretKey(process.env[k]!).toSuiAddress();
const NAMES: [string, string][] = [
  [addr("PAYEE_MUM_PRIVATE_KEY"), "That's Mum"],
  [addr("PAYEE_GYM_PRIVATE_KEY"), "that's my gym"],
  [addr("PAYEE_STREAM_PRIVATE_KEY"), "It's Streamly, a streaming subscription"],
];

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  colorScheme: "light",
  ...(mode === "demo" ? { recordVideo: { dir: "demo", size: { width: 390, height: 844 } } } : {}),
});
const page = await ctx.newPage();
page.on("pageerror", (e: Error) => console.log("PAGE ERROR", e.message));

await page.exposeFunction("__walletSignTx", async (json: string) => {
  const bytes = await Transaction.from(json).build({ client: sui() });
  const r = await owner.signTransaction(bytes);
  console.log("wallet: signed transaction");
  return { bytes: r.bytes, signature: r.signature };
});
await page.exposeFunction("__walletSignMsg", async (b64: string) => {
  const r = await owner.signPersonalMessage(Buffer.from(b64, "base64"));
  console.log("wallet: signed sign-in message");
  return { bytes: r.bytes, signature: r.signature };
});
const network = process.env.SUI_NETWORK ?? "testnet";
// A plain string: tsx rewrites functions in ways a browser can't evaluate.
await page.addInitScript({ content: `(() => {
  const chain = "sui:${network}";
  const account = { address: "${owner.toSuiAddress()}", publicKey: new Uint8Array(${JSON.stringify([...owner.getPublicKey().toRawBytes()])}), chains: [chain], features: ["sui:signTransaction", "sui:signPersonalMessage"], label: "Demo owner" };
  const wallet = {
    version: "1.0.0", name: "Test Wallet", chains: [chain], accounts: [account],
    icon: "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==",
    features: {
      "standard:connect": { version: "1.0.0", connect: async () => ({ accounts: [account] }) },
      "standard:events": { version: "1.0.0", on: () => () => {} },
      "sui:signTransaction": { version: "2.0.0", signTransaction: async ({ transaction }) => window.__walletSignTx(await transaction.toJSON()) },
      "sui:signPersonalMessage": { version: "1.1.0", signPersonalMessage: async ({ message }) => window.__walletSignMsg(btoa(String.fromCharCode(...message))) },
    },
  };
  const reg = (api) => api.register(wallet);
  window.addEventListener("wallet-standard:app-ready", (e) => reg(e.detail));
  window.dispatchEvent(new CustomEvent("wallet-standard:register-wallet", { detail: reg }));
  window.SpeechRecognition = class {
    start() { window.__sr = this; }
    stop() { setTimeout(() => this.onend && this.onend(), 120); }
    abort() { this.onend && this.onend(); }
  };
})();` });

const pause = (ms: number) => page.waitForTimeout(ms);
/** Press the orb, let words arrive, release: the path a real hold takes. */
async function hold(text: string) {
  const box = await page.getByRole("button", { name: "Hold to talk" }).boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await pause(mode === "demo" ? 500 : 150);
  const words = text.split(" ");
  for (let i = 1; i <= words.length; i++) {
    await page.evaluate(`window.__sr.onresult({ results: [Object.assign([{ transcript: ${JSON.stringify(words.slice(0, i).join(" "))} }], { isFinal: false })] })`);
    await pause(mode === "demo" ? 230 : 40);
  }
  await page.mouse.up();
}
const text = (id: string) => page.getByTestId(id).first().textContent({ timeout: 90_000 });

await page.goto(base);
await page.getByRole("button", { name: "Connect Wallet" }).first().click();
await page.getByText("Test Wallet").first().click();
await page.getByTestId("balance").waitFor({ timeout: 90_000 });
console.log("signed in, balance:", await text("balance"));

if (mode === "demo") {
  await pause(2500);
  for (let i = 0; i < 3; i++) {
    const q = (await page.locator(".words").textContent()) ?? "";
    const m = [...q.matchAll(/0x[0-9a-f]{2}…([0-9a-f]{2})/g)].at(-1);
    const answer = NAMES.find(([a]) => a.endsWith(m?.[1] ?? "--"));
    if (!answer) break;
    await pause(1800);
    await hold(answer[1]);
    await pause(3200);
  }
  // Learned limit: everyone is named, so Usual proposes a cap from the spending it has seen.
  console.log("proposal:", await text("say"));
  await pause(2500);
  await hold("yes");
  await page.getByRole("button", { name: "Approve with wallet" }).waitFor({ timeout: 60_000 });
  await pause(3000);
  await page.getByRole("button", { name: "Approve with wallet" }).click();
  await page.getByTestId("status").waitFor({ timeout: 90_000 });
  console.log("limit:", await text("status"));
  await pause(5000);
  await hold("Send Mum her usual");
  await page.getByTestId("understood").waitFor({ timeout: 60_000 });
  console.log("understood:", (await text("understood"))?.replace(/\s+/g, " "));
  await page.getByTestId("status").waitFor({ timeout: 60_000 });
  console.log("done:", await text("status"));
  await pause(5000);
  await page.goto(`${base}/cafe`);
  await pause(2500);
  await page.getByRole("link", { name: "Open in Usual" }).click();
  await page.getByRole("button", { name: "Approve with wallet" }).waitFor({ timeout: 90_000 });
  console.log("café:", await text("say"));
  await pause(3500);
  await page.getByRole("button", { name: "Approve with wallet" }).click();
  await page.getByTestId("status").waitFor({ timeout: 90_000 });
  console.log("done:", await text("status"));
  await pause(5000);
  await hold("What am I wasting money on?");
  await page.getByRole("button", { name: /^Cancel / }).waitFor({ timeout: 60_000 });
  console.log("summary:", await text("say"));
  await pause(6000);
  await page.getByRole("button", { name: "Settings" }).click();
  await pause(4000);
  await page.goto(`${base}/proof`);
  await page.getByTestId("count").waitFor({ timeout: 60_000 });
  console.log("proof memories:", await text("count"));
  await pause(4000);
} else {
  await hold("Send Mum her usual");
  await page.getByTestId("understood").waitFor({ timeout: 60_000 });
  console.log("usual:", (await text("understood"))?.replace(/\s+/g, " "));
  await page.getByRole("button", { name: "Cancel payment" }).click();
  await hold("send mun 1");
  await page.getByText("Did you mean Mum?").waitFor({ timeout: 60_000 });
  console.log("mishear: asked");
  await hold("Send Mum 0.05");
  await page.getByTestId("understood").waitFor({ timeout: 60_000 });
  console.log("understood:", (await text("understood"))?.replace(/\s+/g, " "));
  await page.getByTestId("status").waitFor({ timeout: 60_000 });
  console.log("agent:", await text("status"), "| balance:", await text("balance"));
  await page.goto(`${base}/?request=flat-white`);
  await page.getByRole("button", { name: "Approve with wallet" }).waitFor({ timeout: 90_000 });
  console.log("café:", await text("say"));
  await page.getByRole("button", { name: "Approve with wallet" }).click();
  await page.getByTestId("status").waitFor({ timeout: 90_000 });
  console.log("approved:", await text("status"));
}
const video = page.video();
const path = video ? await video.path() : null;
await ctx.close();
await browser.close();
if (path) renameSync(path, "demo/usual-live.webm");
