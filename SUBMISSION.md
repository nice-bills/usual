# Submission draft

Track 3, Consumer Finance Apps. Also targeting Best Walrus Memory and Best Use of Agent Payments.

**Fill in yourself:** email, Discord, LinkedIn, Tatum ID, video link, repo link, blog link.

- SUI address: the wallet that owns the Walrus Memory account
- Account ID (SUI): `0xf66965b7eac1c51d1fc794bdd06dcdf126868ae0280d98ead1b4b2f483835753`
- MEMWAL_AGENT_ID: `d8d441451421bd7295e8b3ca304fc0d6a243767f12bad43c339820260154c2b6`

**Project description**

Usual is a wallet with no buttons that learns how you talk about money. Tap and talk ("Send Mum her usual"), see exactly what it heard and understood, and it pays. It builds what it knows from your chain history through Tatum's Sui gRPC gateway, stores every fact in a Walrus Memory account you own, and rebuilds from there on any device. Revoke its delegate key and it forgets. Limits are learned from your spending and enforced by native Sui allowances, so above a limit the agent key cannot pay. A café pays out over MPP on Sui from the same allowances.

**Feedback answers:** the form's two questions are yours to answer. Notes worth including:

- Walrus Memory: `health` reported `write_ready: true` while every write failed with `Enoki API error (400)` on 31 Oct. A write can also fail after being accepted, so accepted is not stored.
- Walrus Memory: each wallet owns its account, but Usual's delegate key sits on the server, so a server breach could read memory until the owner revokes it. It could not spend.
- Tatum: history is indexed only from a recent checkpoint, and the free plan's rate limit is easy to hit because building one transaction fires several calls.
