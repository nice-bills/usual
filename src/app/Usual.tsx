"use client";
// Functional client: hold to talk, see what was heard and understood, confirm or sign.
// Holds no user knowledge of its own: everything shown comes from /api/state (Walrus Memory).
import { ConnectButton, useCurrentAccount, useSignPersonalMessage, useSignTransaction } from "@mysten/dapp-kit";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Proposal, Question, Reply } from "@/lib/agent";
import type { Action } from "@/lib/parse";

type Health = { mock: boolean; network: string; tatum: boolean; walrusMemory: boolean; llm: string };
type Snapshot = { owner: string; symbol: string; balance: string; memory: { count: number; source: string; pending: number; error?: string }; questions: Question[] };

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
      setStatus(`${r.say}${r.digest ? ` · ${r.digest}` : ""}`);
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
        setStatus("Paying in 2s. Tap Cancel to stop.");
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
  const needsSignature = proposal && (proposal.type === "limit" || proposal.path === "owner");

  return (
    <main className="app">
      <header className="top">
        <span className="brand">Usual</span>
        {snap && (
          <span className="memory" data-testid="memory">
            {snap.memory.count} memories · {snap.memory.source}
            {snap.memory.pending ? ` · ${snap.memory.pending} queued` : ""}
          </span>
        )}
        {!health.mock && <ConnectButton />}
      </header>

      {snap?.memory.error && <p className="notice" role="alert">Can&apos;t reach your memory right now. I don&apos;t know who anyone is until it&apos;s back.</p>}

      {snap && (
        <p className="balance" data-testid="balance">
          {snap.balance} <span className="unit">{snap.symbol}</span>
        </p>
      )}

      {ready ? (
        <>
          <section className="talkback" aria-live="polite">
            {asking && <p className="question" data-testid="asking"><b>Usual:</b> {asking.text}</p>}
            {heard && <p className="heard" data-testid="heard"><b>Heard:</b> “{heard}”</p>}
            {reply?.understood && <p className="understood" data-testid="understood"><b>Understood as:</b> {reply.understood}</p>}
            {reply && <p className="say" data-testid="say"><b>Usual:</b> {reply.say}</p>}
            {needsSignature && <button className="primary" onClick={() => execute(proposal)}>Sign with wallet</button>}
            {autoPaying && (
              <button className="secondary" onClick={() => { clearTimeout(timer.current!); setAutoPaying(false); setStatus("Cancelled."); }}>Cancel payment</button>
            )}
            {status && <p className="status" data-testid="status">{status}</p>}
          </section>

          <footer className="dock">
            <button className="orb" data-on={listening} aria-pressed={listening} onPointerDown={startTalk} onPointerUp={stopTalk} onPointerLeave={() => listening && stopTalk()} {...hold}>
              {listening ? "Listening" : "Hold to talk"}
            </button>
            <form className="typed" onSubmit={(e) => { e.preventDefault(); send(typed); setTyped(""); }}>
              <input aria-label="Type instead" placeholder="Or type: Send Mum her usual" value={typed} onChange={(e) => setTyped(e.target.value)} />
              <button type="submit" className="secondary">Send</button>
            </form>
            <details className="demo">
              <summary>Demo controls</summary>
              <div className="demo-row">
                <button className="secondary" onClick={() => send("buy a flat white at the café")}>Café: flat white</button>
                <button className="secondary" onClick={() => send("pay for a croissant at the café")}>Café: croissant</button>
                <button className="secondary" onClick={() => refresh(true).then(() => setStatus("Rebuilt from Walrus Memory."))}>Rebuild from Walrus</button>
                <button className="secondary" onClick={async () => { const r = await api<{ on: boolean }>("memory", { on: !memoryOn }); setMemoryOn(r.on); await refresh(); }}>
                  Memory: {memoryOn ? "on" : "off"}
                </button>
              </div>
              <p className="meta">{health.mock ? "Mock mode: no keys, in-memory ledger." : `${health.network} · Tatum ${health.tatum ? "on" : "off"} · Walrus Memory ${health.walrusMemory ? "on" : "off"}`} · parser: {health.llm}</p>
            </details>
          </footer>
        </>
      ) : (
        <p className="question">{account ? "Sign the message in your wallet to continue." : "Connect the owner wallet to start."}</p>
      )}
      {status && !ready && <p className="status" role="alert">{status}</p>}
    </main>
  );
}
