# Usual

A wallet with no buttons that learns how you talk about money.

Hold to talk ("Send Mum her usual"). Usual shows what it heard and what it understood, then pays. It remembers who "Mum" is, what "the usual" means, your subscriptions and your limits. That memory is built from your chain history, lives in **your** Walrus Memory account, and the chain enforces your limits.

Built for Total Recall (Tatum × Walrus), Track 3: Consumer Finance.

## Try it without keys

```bash
corepack pnpm install
corepack pnpm dev:mock
```

Open http://localhost:3000, then:
1. Answer the "Who's that?" questions: "That's Mum", "That's my gym", "It's Streamly".
2. Type or say "Send Mum her usual".
3. Tap "Café: flat white". It's over the food limit, so it asks for a signature.
4. Ask "What am I wasting money on?"

## How it works

| Layer | What Usual does |
|---|---|
| **Tatum (Sui gRPC)** | Reads the owner's full transaction history (`ListTransactions`, sender filter) to infer recurring payees, amounts and price changes. Dry-runs every payment (`SimulateTransaction`) to show the balance after. Executes and confirms every payment through the gateway. |
| **Walrus Memory (Mainnet)** | The user owns the memory account. Usual is a revocable delegate key. Every fact (contact, usual, limit, subscription, payment, mention) is one memory. State is rebuilt from Walrus on load; there is no local database. Revoke the delegate and Usual forgets: "Who's Mum?" |
| **Sui allowances** | Learned limits are native `0x2::allowance` objects with periodic rate limits. The agent key is the spender and cannot exceed them. Above a limit, only the owner's signature pays. |
| **MPP (402) on Sui** | The café is an MPP merchant (`@suimpp/mpp`). The agent answers the 402 by paying from the food allowance. Over the limit, the owner approves a one-shot allowance and the agent completes the payment. |

The LLM proposes, code disposes. Speech becomes one typed action, from rules or a free LLM (Groq / Hugging Face). Server code validates every action against memory and limits. Ambiguity becomes a question ("Which Kofi?").

The memory is a real learning loop:

- Every belief carries evidence ("3 of the last 5 times"). Mixed evidence means Usual asks.
- Limits are learned from spending and proposed to you. Repeated approvals propose a raise.
- A first payment, or one far above normal, needs your signature even inside a limit.
- Misheard names and amounts are checked, never guessed (`src/lib/mishear.test.ts`).
- `/cafe` is a merchant counter with a QR request. `/proof` shows live evidence, including the chain refusing the agent.

Replay on seeded, synthetic history (`pnpm replay`): Usual acts without asking 90.0% of the time and is right 87.3% of those times; repeating the last amount is right 77.2%.

## Setup (live)

```bash
corepack pnpm keys              # generates agent, demo owner, payee and delegate keys into .env
# add TATUM_API_KEY and MEMWAL_ACCOUNT_ID (register the printed delegate key at memory.walrus.xyz)
# fund the owner (test SUI + USDC) and the agent (test SUI)
corepack pnpm gate              # Tatum read, Walrus write+recall, one USDC send
corepack pnpm seed              # recurring history: Mum ×3, gym 30/30/35, streaming ×2, café
corepack pnpm setup:allowances  # family 100/wk, food 3/day, subscriptions 60/mo
corepack pnpm dev
corepack pnpm proof             # memory count + blob IDs
```

See `.env.example`, `DECISIONS.md` and `PROGRESS.md`.

## Tests

```bash
corepack pnpm test
corepack pnpm rehearse
```

`rehearse` runs types, lint, unit and mishearing tests, the replay, the build, e2e, and live memory checks.

## Proof

Live run on Sui testnet with Walrus Memory on Mainnet. Amounts are `DEMO_SCALE=0.05` of the demo script to fit faucet balances.

- Walrus Memory account: `0xf66965b7eac1c51d1fc794bdd06dcdf126868ae0280d98ead1b4b2f483835753`
- Usual's delegate public key: `d8d441451421bd7295e8b3ca304fc0d6a243767f12bad43c339820260154c2b6`
- Memories on Mainnet in namespace `usual`: 41, plus the devnet demo namespaces (`corepack pnpm proof`)
- Blob: https://walruscan.com/mainnet/blob/LVTXo9R9fsVhjIkCdcNJPkYBukiK3O6jmrSPo4PqZVM
- Blob: https://walruscan.com/mainnet/blob/ABL6tJF2FMX9RJAwa9dHJ1cdoQ4pX46jdLkaOVYnoOE
- Blob: https://walruscan.com/mainnet/blob/CZKEI8qrlGBx4CTqMnt0UpPqbLLzo275JADpbmmUF48

The demo video (`demo/usual-live.mp4`) ran the real UI with Walrus Memory on Mainnet and full-size amounts on devnet, using TUSD, a test dollar we published there. Wallet signatures and speech were scripted.

Testnet transactions, all executed and confirmed through Tatum's gRPC gateway:

| What | Digest |
|---|---|
| Agent pays from the native family allowance | `YPjCY2bJMgDMkrTMM6Wd6Pna9Yoggp9i6Zpaj4Z7AVE` |
| Agent pays the café over MPP from the food allowance | `7Zs52viPhY2oZHPWPsMCCAtTPtS39KmbA6Zd6sEaT1E7` |
| Owner-signed payment | `6NGAtKa4RVhHe37Js8599g41gXJagScA6QZAu3EBHU2Q` |
| One-shot owner approval, then MPP café payment | `9kdA3BsCqrJ9MUVWpDuES8m4YnXqpHuB7gZg9nbQtAhJ` |
| Limit changed: revoke + reissue in one transaction | `8SR4pNTgoS7JSR2aZHde8T39oLvXSKjTgUHuuNjeks6` |
| Family allowance created | `B1VXzCNL2rHJEwGbRNoTqiXS7HgimrQx9W24S2cMnDGx` |
