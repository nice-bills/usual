"use client";
// Functional client: hold to talk, see what was heard and understood, confirm or sign.
// Holds no user knowledge of its own: everything shown comes from /api/state (Walrus Memory).
import { ConnectButton, useCurrentAccount, useSignPersonalMessage, useSignTransaction } from "@mysten/dapp-kit";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Proposal, Question, Reply } from "@/lib/agent";
import type { Action } from "@/lib/parse";
import type { State } from "@/lib/records";

type Health = { mock: boolean; network: string; tatum: boolean; walrusMemory: boolean; llm: string };
type Snapshot = { owner: string; symbol: string; balance: string; state: State; memory: { count: number; source: string; pending: number; error?: string }; questions: Question[] };

async function api<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api/${path}`, body === undefined ? undefined : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? res.statusText);
  return data as T;
}

function speak(text: string) {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(new SpeechSynthesisUtterance(text));
}

type Rec = { start(): void; stop(): void; abort(): void; onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null; onend: (() => void) | null; onerror: ((e: { error: string }) => void) | null; interimResults: boolean; continuous: boolean; lang: string };
const recognizer = (): Rec | null => {
  const w = window as unknown as { SpeechRecognition?: new () => Rec; webkitSpeechRecognition?: new () => Rec };
  const R = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  return R ? new R() : null;
};

export default function Usual() {
  const account = useCurrentAccount();
  const { mutateAsync: signMessage } = useSignPersonalMessage();
  const { mutateAsync: signTx } = useSignTransaction();
  const [health, setHealth] = useState<Health | null>(null);
  const [authed, setAuthed] = useState(false);
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [asking, setAsking] = useState<Question | null>(null);
  const [followUp, setFollowUp] = useState<Action | null>(null);
  const [skip, setSkip] = useState<string[]>([]);
  const [heard, setHeard] = useState("");
  const [reply, setReply] = useState<Reply | null>(null);
  const [status, setStatus] = useState("");
  const [listening, setListening] = useState(false);
  const [typed, setTyped] = useState("");
  const [memoryOn, setMemoryOn] = useState(true);
  const [autoPaying, setAutoPaying] = useState(false);
  const [settings, setSettings] = useState(false);
  const [typing, setTyping] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const rec = useRef<Rec | null>(null);
  const finalText = useRef("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { api<Health>("health").then(setHealth).catch((e) => setStatus(e.message)); }, []);
  const ready = !!health && (health.mock || authed);

  // Owner proves control of the wallet once; the server then accepts this browser.
  useEffect(() => {
    if (!health || health.mock || !account || authed) return;
    (async () => {
      const a = await api<{ message: string; at: number; owner: string }>(`auth?address=${account.address}`);
      if (a.owner !== account.address) return setStatus(`Connect the owner wallet ${a.owner.slice(0, 8)}…`);
      const { signature } = await signMessage({ message: new TextEncoder().encode(a.message) });
      await api("auth", { address: account.address, at: a.at, signature });
      setAuthed(true);
    })().catch((e) => setStatus(e.message));
  }, [health, account, authed, signMessage]);

  const refresh = useCallback(async (fresh = false) => {
    const s = await api<Snapshot>(`state?${fresh ? "fresh=1&" : ""}skip=${skip.join(",")}`);
    setSnap(s);
    return s;
  }, [skip]);

  useEffect(() => {
    if (!ready) return;
    api<Snapshot>("state").then((s) => {
      setSnap(s);
      const q = s.questions[0];
      if (q) { setAsking(q); speak(q.text); }
    }).catch((e) => setStatus(e.message));
  }, [ready]);  

  /** Owner signature path: server builds and validates, wallet signs, server executes through Tatum. */
  const signAndSubmit = useCallback(async (kind: "pay" | "limit" | "cafe", bytes: string, meta: Record<string, unknown> = {}) => {
    let signed = { bytes, signature: "mock" };
    if (!health?.mock) {
      setStatus("Waiting for your signature…");
      signed = await signTx({ transaction: bytes });
    }
    const r = await api<{ say: string; digest?: string }>("submit", { kind, bytes: signed.bytes, signature: signed.signature, meta });
    return r;
  }, [health, signTx]);

  const execute = useCallback(async (p: Proposal) => {
    try {
      let r: { say: string; digest?: string; needsOwner?: string; bytes?: string };
      if (p.type === "pay") {
        r = await api("pay", { to: p.to, amount: p.amount, path: p.path });
        const bytes = r.needsOwner ?? r.bytes;
        if (bytes) r = await signAndSubmit("pay", bytes);
      } else if (p.type === "limit") {
        const { bytes } = await api<{ bytes: string }>("limit", { category: p.category, amount: p.amount, periodDays: p.periodDays });
        r = await signAndSubmit("limit", bytes, { category: p.category, amount: p.amount, periodDays: p.periodDays });
      } else {
        r = await api("cafe/pay", { item: p.item, path: p.path });
        if (r.needsOwner) r = await signAndSubmit("cafe", r.needsOwner, { item: p.item });
      }
      // A payment ends as one check mark, then the screen returns to just the balance.
      setStatus("");
      setReply(null);
      setHeard("");
      setDone(r.say);
      setTimeout(() => setDone(null), 4000);
      speak(r.say);
      await refresh();
    } catch (e) {
      setStatus((e as Error).message);
    }
  }, [refresh, signAndSubmit]);

  const send = useCallback(async (text: string) => {
    if (!text.trim()) return;
    setHeard(text);
    setStatus("…");
    try {
      const r = await api<Reply>("talk", { text, asking, followUp, skip });
      setReply(r);
      setStatus("");
      speak(r.say);
      if (asking && r.action.kind === "name") setSkip((s) => [...s, asking.address]);
      if (r.asking !== undefined) setAsking(r.asking);
      setFollowUp(r.followUp ?? null);
      // Inside a learned limit the agent pays on its own after a short, cancellable pause.
      if (r.proposal && r.proposal.type !== "limit" && r.proposal.path === "agent") {
        setStatus("");
        setAutoPaying(true);
        timer.current = setTimeout(() => { setAutoPaying(false); execute(r.proposal!); }, 2000);
      }
      await refresh();
    } catch (e) {
      setStatus((e as Error).message);
    }
  }, [asking, followUp, skip, execute, refresh]);

  const startTalk = () => {
    const r = recognizer();
    if (!r) return setStatus("Voice isn't supported in this browser. Type instead.");
    window.speechSynthesis?.cancel();
    finalText.current = "";
    r.interimResults = true;
    r.continuous = true;
    r.lang = navigator.language || "en-US";
    r.onresult = (e) => {
      const text = Array.from(e.results).map((x) => x[0].transcript).join("");
      finalText.current = text;
      setHeard(text);
    };
    r.onerror = (e) => setStatus(e.error === "not-allowed" ? "Microphone is blocked. Allow it, or type instead." : `Voice stopped: ${e.error}. Type instead.`);
    r.onend = () => { setListening(false); send(finalText.current); };
    rec.current = r;
    setListening(true);
    r.start();
  };
  const stopTalk = () => rec.current?.stop();

  const hold = { onKeyDown: (e: React.KeyboardEvent) => { if ((e.key === " " || e.key === "Enter") && !e.repeat && !listening) { e.preventDefault(); startTalk(); } }, onKeyUp: (e: React.KeyboardEvent) => { if (e.key === " " || e.key === "Enter") stopTalk(); } };

  if (!health) return <main className="app" aria-busy="true" />;

  const proposal = reply?.proposal;
  const symbol = snap?.symbol ?? "USDC";
  const limits = Object.values(snap?.state?.limits ?? {});

  if (settings) {
    return (
      <main className="app settings">
        <header className="settings-top">
          <h1>Settings</h1>
          <button className="ghost" onClick={() => setSettings(false)}>Close settings</button>
        </header>
        {!health.mock && <ConnectButton />}
        <h2>Memory</h2>
        <p data-testid="memory">{snap?.memory.count ?? 0} memories · {snap?.memory.source}{snap?.memory.pending ? ` · ${snap.memory.pending} queued` : ""}</p>
        <button className="row-button" onClick={async () => { const r = await api<{ on: boolean }>("memory", { on: !memoryOn }); setMemoryOn(r.on); await refresh(); }}>Memory: {memoryOn ? "on" : "off"}</button>
        <button className="row-button" onClick={() => { setSettings(false); refresh(true).then(() => setStatus("Rebuilt from Walrus Memory.")); }}>Rebuild from Walrus</button>
        <h2>Limits</h2>
        {limits.length ? limits.map((l) => (
          <p key={l.category} className="limit"><span>{l.category}</span><span>{l.amount} {symbol} / {l.periodDays === 1 ? "day" : l.periodDays === 7 ? "week" : `${l.periodDays} days`}</span></p>
        )) : <p>No limits yet. Say “limit food to 10 a day”.</p>}
        <p className="fine">The chain holds the agent to these. Above one, it waits for your wallet.</p>
        <h2>Try the café</h2>
        <button className="row-button" onClick={() => { setSettings(false); send("buy a flat white at the café"); }}>Café: flat white</button>
        <button className="row-button" onClick={() => { setSettings(false); send("pay for a croissant at the café"); }}>Café: croissant</button>
        <p className="fine">{health.mock ? "Mock mode: no keys, in-memory ledger." : `${health.network} · Tatum ${health.tatum ? "on" : "off"} · Walrus Memory ${health.walrusMemory ? "on" : "off"}`} · parser: {health.llm}</p>
      </main>
    );
  }

  return (
    <main className="app">
      <button className="menu" aria-label="Settings" onClick={() => setSettings(true)}><span /><span /></button>

      <section className="stage" data-card={!!proposal || !!done}>
        {snap && <p className="balance" data-testid="balance">{snap.balance} <span className="unit">{symbol}</span></p>}

        {proposal && (
          <article className="card" key={JSON.stringify(proposal)}>
            <header>
              <span>Understood as</span>
              {"overLimit" in proposal && proposal.overLimit && <span className="pill">{proposal.overLimit.replace(/^o/, "O").replace(/ \(.*$/, "")}</span>}
            </header>
            <div data-testid="understood">
              <p className="amount">{proposal.amount} <span className="unit">{symbol}{proposal.type === "limit" ? ` per ${proposal.periodDays === 1 ? "day" : proposal.periodDays === 7 ? "week" : `${proposal.periodDays} days`}` : ""}</span></p>
              <dl>
                {proposal.type === "pay" && <><dt>To</dt><dd>{proposal.name} ({proposal.address.slice(0, 4)}…{proposal.address.slice(-2)})</dd></>}
                {proposal.type === "pay" && proposal.reason && <><dt>Why</dt><dd>{proposal.reason}</dd></>}
                {proposal.type === "cafe" && <><dt>To</dt><dd>Café · {proposal.label}</dd></>}
                {proposal.type === "limit" && <><dt>For</dt><dd>{proposal.category}</dd></>}
                {proposal.type !== "limit" && <><dt>Balance after</dt><dd>{proposal.balanceAfter}</dd></>}
              </dl>
            </div>
            {(proposal.type === "limit" || proposal.path === "owner") && <button className="approve" onClick={() => execute(proposal)}>Approve with wallet</button>}
            {autoPaying && (
              <>
                <div className="countdown" aria-hidden="true" />
                <button className="ghost" onClick={() => { clearTimeout(timer.current!); setAutoPaying(false); setReply(null); setStatus("Cancelled."); }}>Cancel payment</button>
              </>
            )}
          </article>
        )}

        {done && (
          <article className="card done" role="status">
            <span className="check" aria-hidden="true" />
            <p data-testid="status">{done}</p>
          </article>
        )}
      </section>

      <footer className="dock">
        <div className="words" aria-live="polite">
          {heard && <p className="heard" data-testid="heard">“{heard}”</p>}
          {reply ? <p className="say" data-testid="say">{reply.say}</p> : asking && <p className="say" data-testid="asking">{asking.text}</p>}
          {reply && asking && !proposal && <p className="say" data-testid="asking">{asking.text}</p>}
          {status && <p className="fine" role="status">{status}</p>}
          {!ready && <p className="say">{account ? "Sign the message in your wallet." : "Connect your wallet to start."}</p>}
        </div>
        {ready ? (
          <>
            <button className="orb" data-on={listening} aria-pressed={listening} aria-label={listening ? "Listening, release to send" : "Hold to talk"} onPointerDown={startTalk} onPointerUp={stopTalk} onPointerLeave={() => listening && stopTalk()} {...hold} />
            {typing ? (
              <form className="typed" onSubmit={(e) => { e.preventDefault(); send(typed); setTyped(""); }}>
                <input aria-label="Type instead" autoFocus placeholder="Send Mum her usual" value={typed} onChange={(e) => setTyped(e.target.value)} />
                <button type="submit" className="ghost">Send</button>
              </form>
            ) : (
              <button className="ghost" onClick={() => setTyping(true)}>Type</button>
            )}
          </>
        ) : !health.mock && <ConnectButton />}
      </footer>
    </main>
  );
}
