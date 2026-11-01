# Progress

## Session 1 (29 Oct 2026)

### Done
- Scaffold: Next.js 16 (App Router, TS), pnpm, vitest. Keys generated into `.env` by `pnpm keys` (addresses only printed).
- Core libraries (`src/lib`):
  - `money`: amount parsing.
  - `records`: memory format and state rebuild.
  - `insights`: recurring-payee inference, limit checks, intent validation.
  - `parse`: rules + free LLM.
  - `chain`: Tatum gRPC history, balance, simulate, execute+confirm.
  - `allowances`: native Sui allowance transaction builders.
  - `mpp`: café merchant + allowance-funded MPP client.
  - `memory`: Walrus Memory store, rebuild, write queue, proof.
  - `wallet`: real/mock facade.
  - `agent`: executor.
  - `session`: owner sign-in.
- API routes: `state`, `talk`, `pay`, `limit`, `submit`, `cafe/[item]` (402), `cafe/pay`, `memory`, `auth`, `health`.
- Scripts: `keys`, `gate`, `seed`, `setup:allowances`, `proof`.
- Functional client: hold-to-talk (Web Speech), typing fallback, heard / understood / reply lines, auto-pay after a 2 s cancellable pause inside limits, wallet signing outside them, café buttons, rebuild-from-Walrus, memory toggle.
- `npx e2e init` done (tester-army e2e, web engine, Groq gateway for agent steps). `tests/core.e2e.ts` runs the 7 core flows against mock mode and starts the app itself: `corepack pnpm test:e2e`. All 7 pass.
- 43 unit tests pass (amounts, records, inference, limits, intent validation, parser). Typecheck and lint are clean.
- Mock mode verified end to end over HTTP and in the browser:
  - cold-start "Who's that?" for Mum, gym (price rise) and streaming
  - send the usual, with the balance after
  - limits, then the agent pays, until the limit is hit and the owner signs
  - café inside the limit (agent) and over it (one-shot owner approval)
  - spending summary, then the cancel follow-up
  - "Who's Dad?"

### Live checks (29 Oct, late)
- Tatum gRPC testnet: protocol 139 read, balances read. ✓
- Walrus Memory Mainnet: health, write (blob `LVTXo9R9fsVhjIkCdcNJPkYBukiK3O6jmrSPo4PqZVM`), recall. ✓ Usual's typed record written, then rebuilt from Walrus in a fresh process with an empty cache. ✓
- Free LLM (Groq `openai/gpt-oss-120b`): "could you wire fifteen bucks over to my mum" became pay Mum 15; balance and cancel also parsed. ✓ (`llama-3.3-70b-versatile` isn't available to this key.)
- Walrus Memory plugin for Claude Code installed (`memwal@memwal-plugins` 0.0.18); its sign-in is pending the owner's wallet approval.
- Node upgraded to 24.22.2 (nvm default); the Walrus Memory MCP requires ≥ 24.22.1.

- Testnet live: 9 seeded USDC payments, 3 native allowances (family, food, subscriptions), agent paid from the family allowance (`YPjCY2bJMgDMkrTMM6Wd6Pna9Yoggp9i6Zpaj4Z7AVE`), café paid over MPP from the food allowance (`7Zs52viPhY2oZHPWPsMCCAtTPtS39KmbA6Zd6sEaT1E7`). DEMO_SCALE=0.05 fits the 20 USDC from the faucet.
- The first live run swapped Mum and Gym labels (test script answered in the wrong order); 1.50 USDC went to the gym test wallet. Corrected with newer records; summary and "the usual" now read correctly.

- Live owner paths: owner-signed payment, one-shot café approval over MPP, limit reissue (revoke + new allowance). ✓ The demo owner key signed; a real wallet popup is still untested.
- UI rebuilt around the owner's reference: one white screen, balance, orb, one card, settings screen. 7 e2e tests pass.
- Demo video recorded (`demo/usual-demo.mp4`, 65 s, mock mode, typed).
- `BLOG.md` drafted, README proof filled (36 memories on Mainnet).

- UI/UX audit (30 Oct): fixed off-screen Approve/Cancel on short phones, double-tap double pay, talking during the countdown, overdraft offered as approvable, missing memory-error notice, no way to correct or skip a name, no feedback on an empty hold, no first-use hint or loading state, summary as a card, what Usual remembers and activity now visible in Settings, café counted as food.

### 31 Oct
- Added: café counter page with QR (`/cafe`) and `/?request=` deep link; orb pulses on each recognised word.
- `scripts/live-browser.ts` drives the real UI with a scripted wallet and scripted speech. Passed on testnet: connect, sign-in, hold-to-talk, agent payment, QR link, over-limit approval. It found and we fixed a stale balance after paying, and repeat sign-in prompts.
- Unregistered delegate key against the real relayer: 401, 0 memories, "Who's Mum?".
- Writes that fail after acceptance now requeue (`settle` in `memory.ts`).
- Blocked: since 31 Oct every Walrus Memory write fails upstream (`Enoki API error (400)` ... `MoveCall to disallowed function ...::system::reserve_space`), though `health` reports `write_ready: true`. Reads work. Devnet demo data (TUSD, full-size amounts, namespace `usual-demo`) is seeded and waits on this.

- `/ambitious` round: evidence on beliefs, learned limits, fraud guards, mishear set, chain-refusal fallback (refusal proven live), restart-safe queue, chain-based activity, `/proof`, `pnpm rehearse`, replay score, namespace red team (see DECISIONS 32).

- Walrus writes recovered on 31 Oct. Queue flushed with nothing lost (41 memories in `usual`).
- Full demo passed with writes on: cold start, learned limit approved on chain, agent pays Mum, over-limit café over MPP, summary, proof page. Video: `demo/usual-live.mp4`, scripted wallet and speech, devnet TUSD.
- Chain-refusal fallback seen live: the weekly family allowance was spent, memory disagreed, and Usual asked for the signature.
- `pnpm rehearse` passes end to end.

### Next (owner)
1. Hold-to-talk with a real mic in Chrome.
2. Approve once in real Slush (import the demo owner key, testnet).
3. Revoke the delegate in the dashboard and check "Who's Mum?".
4. Then record, create the repo, deploy, publish `BLOG.md`, submit from `SUBMISSION.md`.

### Known risks
- The write queue is a file in the OS temp directory: on Vercel a new instance has an empty one, so a queued write can still be lost there.
- The app-side window spend (`spentInWindow`) approximates the chain's fixed window. The chain is the real enforcer; the app check only decides which path to offer.

## Public testnet (1 Nov 2026)

Any wallet can now use a deployment. `scripts/live-device.ts` runs a brand-new wallet through everything on testnet with real Walrus memory: faucet, sample history, naming, limit, device-signed payment, memory overriding a limit, semantic recall, MPP café from the device, deposit. All passed. Not yet tried with a real Slush wallet in a browser. See DECISIONS 38 to 46. Deploy config for Render is `.env.public` (never committed), written by `pnpm testnet:setup`. The demo video still shows the old build.

Wallet-owned memory: the same script now claims a real mainnet Walrus account from a wallet with no mainnet SUI, then revokes it and confirms Usual forgets. All 19 checks passed. 97 unit and 20 e2e tests pass.

Real phone test (1 Nov): Slush zkLogin sign-in, mainnet memory claim and a device-signed payment all worked. Voice, noise and first-run friction fixed from what the logs showed: DECISIONS 47 to 50.

Agent credit added (DECISIONS 51, 52). The full new-wallet flow passes on the hosted site, including a mistake suspending a line and one signature replacing it with a smaller one on-chain.
