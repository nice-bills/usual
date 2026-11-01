# A wallet with no buttons that learns how you talk about money

Most of us don't think "transfer 50 USDC to 0x3f…a1". We think "send Mum her usual". Usual is a wallet built around that sentence. You hold to talk, you see exactly what it heard and what it understood, and it pays.

## What it does

- **Starts from your history.** Connect a wallet and Usual reads your past payments. "You've sent 0xc3…d1 2.50 USDC three times. Who's that?" Say "That's Mum", and it knows who Mum is and what her usual is.
- **Shows its working.** "Send Mum her usual" becomes "2.50 USDC to Mum (0xc3…d1), like the last 3 times · balance after: 2.225". The line appears before any money moves.
- **Keeps to limits the chain enforces.** Limits are native Sui allowances. Inside one, the agent key pays on its own. Above one, it literally cannot, so it asks for your signature.
- **Notices things.** "What am I wasting money on?" gets "Your gym went from 1.50 to 1.75, and you haven't mentioned Streamly since 29 Oct. Cancel Streamly?"

## How it uses Tatum

Every chain interaction goes through Tatum's Sui gRPC gateway, server-side, because the gateway speaks native gRPC rather than gRPC-Web.

- **History:** `LedgerService/ListTransactions` with a sender filter. Balance changes in each transaction reveal who was paid and how much. From that, Usual infers recurring payees, the usual amount and price rises.
- **Simulate:** `SimulateTransaction` dry-runs every payment, which is where "balance after" comes from.
- **Confirm:** payments execute through the gateway and are read back before Usual says they landed.

Two things bit us. Building one transaction fires several calls, so the free plan's rate limit answered 429 until we put a pacing and retry layer in the transport itself. And history is only indexed from a recent checkpoint, so asking from genesis fails; the query now starts from the earliest available checkpoint.

## How it uses Walrus Memory

There is no database of user knowledge in Usual. You own the Walrus Memory account; Usual holds a delegate key you can revoke. Each fact is one memory: a plain sentence for semantic recall, plus one machine-readable line. Contacts, usual amounts, limits, subscriptions, payments and mentions are all stored this way, and the newest version of a fact wins.

The part I care about most is who scores whom. Every finance app scores you. Usual is scored by you: it starts at 20 out of 100 with no right to spend, earns a credit line through clean payments, and loses it the moment you say "that was wrong". Each verdict is a memory, and each line is a real on-chain limit, so learning changes what the agent is allowed to do, not just what it says.

Ownership here is literal. Each wallet creates its own Walrus Memory account on mainnet the first time it signs in. Walrus sponsors that, so nobody needs mainnet SUI to try this, even though the money in the demo is on testnet. In Settings there's a button that revokes Usual's key. Press it and Usual knows nothing, because the chain says it no longer may.

The same idea runs through spending. The agent's key is created on your device and can't be read out of the browser. Our server builds transactions but can't sign them, so breaking into it can't move your money. The chain caps what that key can do, and memory can override it: tell Usual "don't pay Mum until she confirms" and the agent won't, even inside your limit.

On load, Usual rebuilds its whole state from Walrus with one typed recall per record type. A fresh process with an empty cache knows everything. Revoke the delegate and recall fails, so "Send Mum her usual" answers "Who's Mum?". The memory was never Usual's.

## How it learned over time

The memory changes what the product does, visibly:

1. First run: no names, so it asks about each repeat payee.
2. After naming: "the usual" resolves, and the payment needs no amount.
3. After three payments at a new amount, that amount becomes the new usual, and Usual tells you.
4. Corrections are memories too. In our own first live run a test script labelled Mum and the gym the wrong way round. We fixed it the way a user would: newer facts superseded older ones, and the wrong record stayed in history without being believed.

5. Beliefs carry evidence. "Like the last 3 times" comes from the chain, and when the last payments disagree, Usual asks. Replaying seeded, synthetic history, it was right 87.3% of the times it acted without asking, against 77.2% for repeating the last amount.
6. Limits are learned. Once payees are named, Usual proposes a limit from what you spend. Approve above a limit twice and it proposes raising it.

## Voice plus money

A mishear must never move money. A name one letter off gets "Did you mean Mum?". "Fifteen" against a usual of fifty is asked again. A first payment, or one far above normal, needs a signature even inside a limit. A test set of perturbed transcripts asserts none of them pays the wrong wallet.

## Agent payments

The café is an MPP merchant: it answers HTTP 402 until paid. The agent pays from the food allowance and proves it sent the transaction. Over the limit, one signature from you creates a one-shot allowance for exactly that price, valid for 10 minutes, and the agent finishes the payment. The agent never gets more authority than you gave it for that moment.

Speech becomes one typed action, from rules for the core phrases and a free LLM for everything else. Server code validates each action against memory and limits. The model proposes; code disposes.
