# Decisions

Calls made while building, with the reason. Newest at the bottom.

1. **pnpm via `corepack pnpm`**, not a global shim. The owner declined installing shims into `~/.local/bin`.
2. **No Anthropic key. A free OpenAI-compatible LLM (Groq by default, Hugging Face router as the alternative), called with plain `fetch`.** The owner chose this. No SDK dependency.
3. **Rules first, LLM second.** A deterministic rule parser handles the core phrases ("Send Mum her usual", "That's Mum", "What am I wasting money on?", limits, café). The LLM only sees text the rules don't recognise. This makes the demo free, fast and repeatable, and the app works with no LLM key at all.
4. **The LLM returns one tool call (an `Action`), not a multi-turn tool loop.** Contacts are put in the prompt, so it needs no lookup tools. `resolve_contact`, `get_usual` and `prepare_payment` from the brief became deterministic server code (`validateIntent`) that runs after parsing. The LLM never signs and never decides amounts on its own: "the usual" is filled from memory.
5. **Tatum native gRPC through `@protobuf-ts/grpc-transport` + `@grpc/grpc-js`**, passed as the transport for `SuiGrpcClient`. Testnet host: `sui-testnet-grpc.gateway.tatum.io:443` (from docs.tatum.io/reference/rpc-sui), header `x-api-key`. The gateway lists `ListTransactions`, `SimulateTransaction` and `ExecuteTransaction`, so history, dry-run and execution all go through Tatum. Reads are serialised with a 340 ms gap (free plan ≈ 3 req/s) and cached briefly.
6. **History = `listTransactions({ filter: { sender: owner } })` + balance changes.** A positive USDC balance change for another address in a transaction the owner sent is a payment to that address.
7. **Memory state is rebuilt with one typed recall query per record type (limit 100 each).** `listMemories` returns metadata but no text, so typed recall is the full rebuild. Each memory is `sentence || JSON`, and the newest `v` wins per key. Writes accepted but not yet indexed are merged in, so nothing the user just said disappears.
8. **Writes batch through `rememberBulk` (≤20), with a queue that retries after 429 `retry_after` or 15 s.** This covers the relayer's 60 req/min limit and the server-side embedding failure (MemWal #1285). The queue lives in process memory. On Vercel a cold instance can drop it. Accepted risk; noted in PROGRESS.
9. **No local database for user knowledge.** The server's in-process copy is a 60 s cache of Walrus. "Rebuild from Walrus" (`?fresh=1`) bypasses it. When the delegate is revoked, recall fails, state is empty, and "Send Mum her usual" answers "Who's Mum?".
10. **Allowances are native and live on testnet (protocol 139 ≥ 137, checked 29 Oct).** One allowance per category, with the agent as spender:
    - family: 100 / 7 days
    - food: 3 / day
    - subscriptions: 60 / 30 days

    Inside a limit, the agent key pays from the owner's address balance with `tx.coin({ allowance })`. A new limit is revoke + reissue in one owner-signed transaction, because there is no update function.
11. **Above a limit, the owner signs.** For direct payments the owner signs the transfer itself. For the café (MPP), the owner signs a **one-shot allowance** (a lifetime cap of exactly the price, expiring in 10 minutes), and the agent then completes the 402 flow from it. That keeps MPP agent-driven and needs one wallet popup.
12. **Custom MPP client method** (`src/lib/mpp.ts`) mirrors `@suimpp/mpp/client` but pays from an allowance. The suimpp server only checks the recipient's balance change and that the proof signer equals the transaction sender (the agent), so it verifies as-is. `mppx` is pinned to 0.4.12 to match `@suimpp/mpp`'s dependency.
13. **The owner's USDC must sit in its address balance** for allowances to draw from. `setup:allowances` moves coins there with `0x2::coin::send_funds`.
14. **Subscriptions: cadence under 1 day is assumed monthly.** Seeded testnet history is minutes apart, not months. Price changes (30 → 35) are detected from amounts, so they work regardless.
15. **The "you haven't mentioned X" signal comes from MENTION memories**, written whenever the user names, pays or cancels someone. The wording is honest about dates ("since 29 Oct") rather than faking weeks.
16. **Learning loop:** three payments in a row at a new amount become the new usual, and Usual says so.
17. **Owner session:** on a live deployment, only the owner wallet can drive the app. It signs one personal message and gets a 12 h HMAC cookie. Mock mode skips this.
18. **Demo owner keypair lives in `.env` (testnet only)** so scripts can seed history and create allowances. The owner imports it into Slush to sign in the browser.
19. **The café is a route in this app** (`/api/cafe/[item]`). The merchant is a separate party in the protocol even though it ships in the same repo. Menu: flat white 4.50 (over the 3/day food limit), croissant 2.00 (inside it).
20. **Mock mode** (`pnpm dev:mock`, or any run without `TATUM_API_KEY`) uses an in-memory ledger with the same seeded history and the same three limits. Signing is echoed. Every flow runs with no keys.
21. **Functional UI only for now.** The owner asked for the core first and the design pass afterwards.
22. **LLM model: Groq `openai/gpt-oss-120b`.** `llama-3.3-70b-versatile` isn't served to this key; gpt-oss-120b handles tool calls and parsed every probe correctly. The e2e agent steps use `qwen/qwen3.8-27b`.
23. **Small live amounts.** `DEMO_SCALE=0.05` shrinks seeded history, limits and café prices to fit 20 faucet USDC. The full-size demo runs on devnet with TUSD, a test dollar we published there.
24. **History reads both senders.** The agent sends allowance payments, so payments are read for owner and agent, and only count when the owner's balance fell. Reading only the owner hid every agent payment from "the usual".
25. **Beliefs carry evidence.** `beliefFor` uses the last six payments. The card shows "like the last 3 times" or "3 of the last 5 times". Below 50% agreement over three or more payments, Usual asks instead of guessing.
26. **Limits are learned.** Once every payee is named, Usual proposes a limit for a category with spending and no limit (usual payment or monthly subscriptions plus 20%). Two owner approvals above a limit in 30 days proposes raising it. The owner signs either way.
27. **Fraud guards sit above limits.** A first payment to a wallet, or more than double the usual, needs the owner even inside a limit.
28. **Mishearing rules.** Names resolve only by exact match, spelling group (Mum, Mom, Mother), whole first name or clear prefix. A name one letter off gets "Did you mean Mum?". Teen/ty amounts (15 vs 50) that clash with the usual are re-asked. `src/lib/mishear.test.ts` asserts no case pays the wrong wallet.
29. **The chain is the enforcer.** Proven live: a spend inside the allowance simulates fine, a spend above it aborts with `EExceedsRateLimit`. If memory says yes and the chain says no, Usual falls back to the owner signature.
30. **Write queue survives restarts**, in a file in the OS temp directory. It holds unconfirmed writes only. A job that fails after acceptance goes back on the queue.
31. **Activity comes from the chain, not memory**, so it stays true when a memory write failed.
32. **Known limit on "your memory": a delegate key is not namespace-scoped.** Tested live: Usual's key can read other namespaces in the same account. Usual only ever queries its own, but that is our code, not an enforced boundary. For a real user, give Usual its own Walrus Memory account or keep sensitive memories elsewhere.
33. **Replay score is synthetic.** `pnpm replay` walks 100 seeded payees forward. It shows the method beats repeating the last amount; it is not evidence from real users.
34. **Unslop pass** using the process from unslop by Damir Sokolovsky (@heydamir, CC BY 4.0). World: the counter where they know your usual. Moment: a paper receipt when a payment lands. Signature: tally marks for how often Usual has seen something. The glossy orb became a flat ink disc with a microphone. Type is Instrument Sans with IBM Plex Mono on the receipt.
35. **Tap to talk, not hold.** A tap opens a conversation: voice detection ends each turn after 0.8 s of silence, Usual answers aloud, then listens again. "Yes" or "no" answers a ticket waiting for approval. A hold over 0.5 s still works as one push-to-talk turn.
36. **No live partial transcripts with Whisper.** Partials on short clips invented words and cost a call every 1.5 s. Words appear about a second after you stop. This trades the brief's live transcript for accuracy.
37. **Whisper is primed with vocabulary only.** Example sentences were read back as speech on quiet audio. Segments Whisper rates as likely silence are dropped.
