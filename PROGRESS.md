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

### Next (owner)
1. Create the empty GitHub repo `nice-bills/usual`, add the remote, push.
2. Deploy: import the repo in Vercel, or `vercel login` then deploy. Env vars from `.env`, but not `OWNER_SUI_PRIVATE_KEY` or payee keys; set `OWNER_ADDRESS` and `PUBLIC_ORIGIN`.
3. Wallet: import the demo owner key into Slush, test sign-in and an approval; hold-to-talk in Chrome; revoke the delegate in the dashboard.
4. Publish `BLOG.md`, record the voice video, submit the form.

### Known risks
- The write queue lives in process memory: a Vercel cold start can drop queued writes. Fix if it shows up: retry from the client, or keep the queue in the browser.
- The app-side window spend (`spentInWindow`) approximates the chain's fixed window. The chain is the real enforcer; the app check only decides which path to offer.
