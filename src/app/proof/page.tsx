"use client";
import Link from "next/link";
import { useEffect, useState } from "react";

type Proof = { mock: boolean; network?: string; account?: string; namespace?: string; count?: number; blobs?: string[]; limit?: string | null; attempted?: string | null; refusal?: string | null };

const TXS = [
  ["Agent pays from the family allowance", "YPjCY2bJMgDMkrTMM6Wd6Pna9Yoggp9i6Zpaj4Z7AVE"],
  ["Agent pays the café over MPP", "7Zs52viPhY2oZHPWPsMCCAtTPtS39KmbA6Zd6sEaT1E7"],
  ["Owner signs a payment", "6NGAtKa4RVhHe37Js8599g41gXJagScA6QZAu3EBHU2Q"],
  ["One-shot approval, then MPP", "9kdA3BsCqrJ9MUVWpDuES8m4YnXqpHuB7gZg9nbQtAhJ"],
  ["Limit changed: revoke and reissue", "8SR4pNTgoS7JSR2aZHde8T39oLvXSKjTgUHuuNjeks6"],
];

export default function Page() {
  const [p, setP] = useState<Proof | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => { fetch("/api/proof").then((r) => r.json()).then(setP).catch(() => setFailed(true)); }, []);
  return (
    <main className="app settings">
      <header className="settings-top"><h1>Proof</h1><Link className="ghost" href="/">Back to Usual</Link></header>
      <h2>Walrus Memory, Mainnet</h2>
      {failed && <p className="problem">Couldn&apos;t load live proof.</p>}
      {!p && !failed && <p className="fine">Reading Walrus…</p>}
      {p?.mock && <p className="fine">Mock mode has no live proof. Run with keys.</p>}
      {p && !p.mock && (
        <>
          <p className="row"><span>Memories</span><span data-testid="count">{p.count}</span></p>
          <p className="fine">Account {p.account}, namespace {p.namespace}</p>
          {p.blobs?.map((b) => <a key={b} className="row" href={`https://walruscan.com/mainnet/blob/${b}`} target="_blank" rel="noreferrer"><span>Blob</span><span>{b.slice(0, 10)}…</span></a>)}
          <h2>The chain refuses the agent, live</h2>
          <p>Dry-run through Tatum: the agent tries to spend {p.attempted} against a limit of {p.limit}.</p>
          {p.refusal ? (
            <>
              <p className="row"><span>Result</span><span>Refused: {p.refusal.match(/E[A-Z]\w+/)?.[0] ?? "by the chain"}</span></p>
              <details className="fine"><summary>Full chain response</summary>{p.refusal}</details>
            </>
          ) : <p className="fine">No limit set yet.</p>}
        </>
      )}
      <h2>Testnet transactions</h2>
      {TXS.map(([label, d]) => <a key={d} className="row" href={`https://suiscan.xyz/testnet/tx/${d}`} target="_blank" rel="noreferrer"><span>{label}</span><span>{d.slice(0, 6)}…</span></a>)}
    </main>
  );
}
