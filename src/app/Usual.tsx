"use client";
// One balance, one orb, one card at a time. Holds no user knowledge of its own:
// everything shown comes from /api/state (Walrus Memory).
import { ConnectButton, useCurrentAccount, useSignPersonalMessage, useSignTransaction } from "@mysten/dapp-kit";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Proposal, Question, Reply } from "@/lib/agent";
import type { Action } from "@/lib/parse";
import type { State } from "@/lib/records";

type Health = { mock: boolean; network: string; tatum: boolean; walrusMemory: boolean; llm: string };
type Snapshot = { owner: string; symbol: string; balance: string; state: State; memory: { count: number; source: string; pending: number; error?: string }; questions: Question[] };
type Outcome = { say: string; digest?: string; needsOwner?: string; bytes?: string; ok?: boolean };

const AUTO_PAY_MS = 3000;

async function api<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api/${path}`, body === undefined ? undefined : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? res.statusText);
  return data as T;
}

type Rec = { start(): void; stop(): void; abort(): void; onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null; onend: (() => void) | null; onerror: ((e: { error: string }) => void) | null; interimResults: boolean; continuous: boolean; lang: string };
const recognizer = (): Rec | null => {
  const w = window as unknown as { SpeechRecognition?: new () => Rec; webkitSpeechRecognition?: new () => Rec };
  const R = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  return R ? new R() : null;
};

// A payment request from a café QR or link, as the sentence the user would have said.
const REQUESTS: Record<string, string> = {
  "flat-white": "buy a flat white at the café",
  croissant: "pay for a croissant at the café",
  breakfast: "buy a breakfast at the café",
};

const per = (days: number) => (days === 1 ? "day" : days === 7 ? "week" : days === 30 ? "month" : `${days} days`);

function readVoicePref() {
  try {
    return localStorage.getItem("usual.voice") !== "off";
  } catch {
    return true;
  }
}

export default function Usual() {
  const account = useCurrentAccount();
  const { mutateAsync: signMessage } = useSignPersonalMessage();
  const { mutateAsync: signTx } = useSignTransaction();
  const [health, setHealth] = useState<Health | null>(null);
  const [authed, setAuthed] = useState(false);
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [loadError, setLoadError] = useState("");
  const [asking, setAsking] = useState<Question | null>(null);
  const [followUp, setFollowUp] = useState<Action | null>(null);
  const [skip, setSkip] = useState<string[]>([]);
  const [heard, setHeard] = useState("");
  const [reply, setReply] = useState<Reply | null>(null);
  const [hint, setHint] = useState("");
  const [error, setError] = useState("");
  const [thinking, setThinking] = useState(false);
  const [busy, setBusy] = useState("");
  const [listening, setListening] = useState(false);
  const [typed, setTyped] = useState("");
  const [typing, setTyping] = useState(false);
  const [memoryOn, setMemoryOn] = useState(true);
  const [voiceOn, setVoiceOn] = useState(readVoicePref);
  const [autoPaying, setAutoPaying] = useState(false);
  const [settings, setSettings] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const rec = useRef<Rec | null>(null);
  const finalText = useRef("");
  const pressedAt = useRef(0);
  const voiceFailed = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const orb = useRef<HTMLButtonElement>(null);
  // Guards against a double tap paying twice; state alone updates too late.
  const running = useRef(false);
  const signingIn = useRef(false);

  const speak = useCallback((text: string) => {
    if (!voiceOn || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(text));
  }, [voiceOn]);

  const cancelAutoPay = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setAutoPaying(false);
  };

  useEffect(() => { api<Health>("health").then(setHealth).catch((e) => setLoadError(e.message)); }, []);
  const ready = !!health && (health.mock || authed);

  // Owner proves control of the wallet once; the server then accepts this browser.
  useEffect(() => {
    if (!health || health.mock || !account || authed || signingIn.current) return;
    signingIn.current = true;
    (async () => {
      const a = await api<{ message: string; at: number; owner: string; session: boolean }>(`auth?address=${account.address}`);
      if (a.owner !== account.address) return setError(`This isn't the owner wallet. Connect ${a.owner.slice(0, 6)}…${a.owner.slice(-4)}.`);
      if (a.session) return setAuthed(true);
      const { signature } = await signMessage({ message: new TextEncoder().encode(a.message) });
      await api("auth", { address: account.address, at: a.at, signature });
      setError("");
      setAuthed(true);
    })().catch((e) => setError(e.message)).finally(() => { signingIn.current = false; });
  }, [health, account, authed, signMessage]);

  const refresh = useCallback(async (fresh = false) => {
    const s = await api<Snapshot>(`state?${fresh ? "fresh=1&" : ""}skip=${skip.join(",")}`);
    setSnap(s);
    setLoadError("");
    return s;
  }, [skip]);

  const firstLoad = useCallback(() => {
    api<Snapshot>("state").then((s) => {
      setSnap(s);
      setLoadError("");
      setAsking(s.questions[0] ?? null);
    }).catch((e) => setLoadError(e.message));
  }, []);

  useEffect(() => { if (ready) firstLoad(); }, [ready, firstLoad]);

  /** Owner signature path: server builds and validates, wallet signs, server executes through Tatum. */
  const signAndSubmit = useCallback(async (kind: "pay" | "limit" | "cafe", bytes: string, meta: Record<string, unknown> = {}) => {
    let signed = { bytes, signature: "mock" };
    if (!health?.mock) {
      setBusy("Waiting for your wallet…");
      signed = await signTx({ transaction: bytes });
    }
    setBusy("Sending…");
    return api<Outcome>("submit", { kind, bytes: signed.bytes, signature: signed.signature, meta });
  }, [health, signTx]);

  const execute = useCallback(async (p: Proposal) => {
    if (running.current) return;
    running.current = true;
    setError("");
    setBusy("Sending…");
    try {
      let r: Outcome;
      if (p.type === "pay") {
        r = await api("pay", { to: p.to, amount: p.amount, path: p.path });
        const bytes = r.needsOwner ?? r.bytes;
        if (bytes) r = await signAndSubmit("pay", bytes);
        else if (r.ok === false) throw new Error(r.say);
      } else if (p.type === "limit") {
        const { bytes } = await api<{ bytes: string }>("limit", { category: p.category, amount: p.amount, periodDays: p.periodDays });
        r = await signAndSubmit("limit", bytes, { category: p.category, amount: p.amount, periodDays: p.periodDays });
      } else {
        r = await api("cafe/pay", { item: p.item, path: p.path });
        if (r.needsOwner) r = await signAndSubmit("cafe", r.needsOwner, { item: p.item });
      }
      // A payment ends as one check mark, then the screen returns to just the balance.
      setReply(null);
      setHeard("");
      setDone(r.say);
      setTimeout(() => setDone(null), 4000);
      speak(r.say);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      running.current = false;
      setBusy("");
    }
  }, [refresh, signAndSubmit, speak]);

  const send = useCallback(async (text: string) => {
    if (!text.trim()) return;
    cancelAutoPay();
    setHeard(text);
    setHint("");
    setError("");
    setDone(null);
    setReply(null);
    setThinking(true);
    try {
      const r = await api<Reply>("talk", { text, asking, followUp, skip });
      setReply(r);
      speak(r.say);
      if (asking && (r.action.kind === "name" || r.action.kind === "skip")) setSkip((s) => [...s, asking.address]);
      if (r.asking !== undefined) setAsking(r.asking);
      setFollowUp(r.followUp ?? null);
      // Inside a learned limit the agent pays on its own after a short, cancellable pause.
      if (r.proposal && r.proposal.type !== "limit" && r.proposal.path === "agent") {
        setAutoPaying(true);
        timer.current = setTimeout(() => { setAutoPaying(false); execute(r.proposal!); }, AUTO_PAY_MS);
      }
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setThinking(false);
    }
  }, [asking, followUp, skip, execute, refresh, speak]);

  // Opened from a café QR: treat the request as if it had been spoken, once the wallet has loaded.
  useEffect(() => {
    if (!snap) return;
    const url = new URL(window.location.href);
    const request = REQUESTS[url.searchParams.get("request") ?? ""];
    if (!request) return;
    url.searchParams.delete("request");
    window.history.replaceState(null, "", url);
    send(request); // eslint-disable-line react-hooks/set-state-in-effect
  }, [snap, send]);

  const startTalk = () => {
    if (listening) return;
    const r = recognizer();
    if (!r) {
      setHint("Voice doesn't work in this browser. Type instead.");
      setTyping(true);
      return;
    }
    cancelAutoPay();
    navigator.vibrate?.(10);
    window.speechSynthesis?.cancel();
    finalText.current = "";
    voiceFailed.current = false;
    pressedAt.current = Date.now();
    setHeard("");
    setReply(null);
    setDone(null);
    setHint("");
    setError("");
    r.interimResults = true;
    r.continuous = true;
    r.lang = navigator.language || "en-US";
    r.onresult = (e) => {
      const text = Array.from(e.results).map((x) => x[0].transcript).join("");
      finalText.current = text;
      setHeard(text);
      // The orb answers each word. No second mic stream: phones can't share it with speech recognition.
      orb.current?.animate([{ transform: "scale(1.14)" }, { transform: "scale(1.26)" }, { transform: "scale(1.14)" }], { duration: 260, easing: "ease-out" });
    };
    r.onerror = (e) => {
      if (e.error === "aborted" || e.error === "no-speech") return;
      voiceFailed.current = true;
      setHint(e.error === "not-allowed" ? "The microphone is blocked. Allow it, or type instead." : "Voice stopped working. Try again, or type instead.");
    };
    r.onend = () => {
      setListening(false);
      if (finalText.current.trim()) send(finalText.current);
      else if (voiceFailed.current) setTyping(true);
      else setHint(Date.now() - pressedAt.current < 400 ? "Keep holding while you talk." : "I didn't catch that. Try again.");
    };
    rec.current = r;
    setListening(true);
    try {
      r.start();
    } catch {
      setListening(false);
    }
  };
  const stopTalk = () => rec.current?.stop();

  const hold = {
    onKeyDown: (e: React.KeyboardEvent) => { if ((e.key === " " || e.key === "Enter") && !e.repeat) { e.preventDefault(); startTalk(); } },
    onKeyUp: (e: React.KeyboardEvent) => { if (e.key === " " || e.key === "Enter") stopTalk(); },
  };

  const symbol = snap?.symbol ?? "USDC";
  const state = snap?.state;
  const proposal = reply?.proposal;
  const insight = reply?.insight;
  const firstName = state ? Object.values(state.contacts).find((c) => state.usuals[c.name.toLowerCase()])?.name : undefined;
  const idle = !heard && !reply && !asking && !hint && !error && !listening && !thinking && !done;

  if (settings) {
    const close = () => setSettings(false);
    const explorer = (d: string) => (d.startsWith("MOCK") ? null : `https://suiscan.xyz/${health?.network ?? "testnet"}/tx/${d}`);
    return (
      <main className="app settings" onKeyDown={(e) => e.key === "Escape" && close()}>
        <header className="settings-top">
          <h1>Settings</h1>
          <button className="ghost" autoFocus onClick={close}>Close settings</button>
        </header>
        {health && !health.mock && <ConnectButton />}

        <h2>What I remember</h2>
        {snap?.memory.error && <p className="problem" role="alert">I can&apos;t reach your memory, so I don&apos;t know anyone right now.</p>}
        <p className="fine" data-testid="memory">{snap?.memory.count ?? 0} memories · {snap?.memory.source}{snap?.memory.pending ? ` · ${snap.memory.pending} waiting to save` : ""}</p>
        {state && Object.values(state.contacts).map((c) => {
          const sub = state.subscriptions[c.address];
          const usual = state.usuals[c.name.toLowerCase()];
          return (
            <p key={c.address} className="row">
              <span>{c.name}</span>
              <span>{sub ? `${sub.amount} ${symbol} a month${sub.cancelled ? ", cancelled" : ""}` : usual ? `usually ${usual.amount} ${symbol}` : ""}</span>
            </p>
          );
        })}
        <button className="row-button" onClick={async () => { const r = await api<{ on: boolean }>("memory", { on: !memoryOn }); setMemoryOn(r.on); await refresh(); }}>Memory: {memoryOn ? "on" : "off"}</button>
        <button className="row-button" onClick={() => { close(); refresh(true).then(() => setHint("Rebuilt from Walrus Memory.")); }}>Rebuild from Walrus</button>

        <h2>Limits</h2>
        {state && Object.values(state.limits).length ? Object.values(state.limits).map((l) => (
          <p key={l.category} className="row"><span className="cap">{l.category}</span><span>{l.amount} {symbol} a {per(l.periodDays)}</span></p>
        )) : <p className="fine">None yet. Say “limit food to 10 a day”.</p>}
        <p className="fine">The chain holds the agent to these. Above one, it waits for your wallet.</p>

        <h2>Activity</h2>
        {state?.payments.length ? state.payments.slice(0, 5).map((p) => {
          const href = explorer(p.digest);
          const text = <><span>{p.name ?? `${p.to.slice(0, 4)}…${p.to.slice(-2)}`}</span><span>{p.amount} {symbol}</span></>;
          return href ? <a key={p.digest} className="row" href={href} target="_blank" rel="noreferrer">{text}</a> : <p key={p.digest} className="row">{text}</p>;
        }) : <p className="fine">Nothing sent through Usual yet.</p>}

        <h2>Voice</h2>
        <button className="row-button" aria-pressed={voiceOn} onClick={() => {
          const next = !voiceOn;
          setVoiceOn(next);
          try { localStorage.setItem("usual.voice", next ? "on" : "off"); } catch { /* per-device nicety only */ }
        }}>Spoken replies: {voiceOn ? "on" : "off"}</button>

        <h2>Try the café</h2>
        <button className="row-button" onClick={() => { close(); send("buy a flat white at the café"); }}>Café: flat white</button>
        <button className="row-button" onClick={() => { close(); send("pay for a croissant at the café"); }}>Café: croissant</button>
        <p className="fine">{health?.mock ? "Mock mode: no keys, in-memory ledger." : `${health?.network} · Tatum ${health?.tatum ? "on" : "off"} · Walrus Memory ${health?.walrusMemory ? "on" : "off"}`} · parser: {health?.llm}</p>
      </main>
    );
  }

  return (
    <main className="app">
      <button className="menu" aria-label="Settings" onClick={() => setSettings(true)}><span /><span /></button>

      <section className="stage" data-card={!!proposal || !!insight || !!done} aria-live="polite">
        {snap ? (
          <p className="balance" data-testid="balance">{snap.balance} <span className="unit">{symbol}</span></p>
        ) : !loadError && (health?.mock || ready) ? <p className="balance loading" aria-label="Loading your balance">0.00</p> : null}

        {proposal && (
          <article className="card">
            <header>
              <span>Understood as</span>
              {"overLimit" in proposal && proposal.overLimit && <span className="pill">{proposal.overLimit.replace(/^o/, "O").replace(/ \(.*$/, "")}</span>}
            </header>
            <div data-testid="understood">
              <p className="amount">{proposal.amount} <span className="unit">{symbol}{proposal.type === "limit" ? ` a ${per(proposal.periodDays)}` : ""}</span></p>
              <dl>
                {proposal.type === "pay" && <><dt>To</dt><dd>{proposal.name} ({proposal.address.slice(0, 4)}…{proposal.address.slice(-2)})</dd></>}
                {proposal.type === "pay" && proposal.reason && <><dt>Why</dt><dd>{proposal.reason}</dd></>}
                {proposal.type === "cafe" && <><dt>To</dt><dd>Café · {proposal.label}</dd></>}
                {proposal.type === "limit" && <><dt>For</dt><dd className="cap">{proposal.category}</dd></>}
                {proposal.type !== "limit" && <><dt>Balance after</dt><dd>{proposal.balanceAfter}</dd></>}
              </dl>
            </div>
            {!autoPaying && <p className="note" data-testid="say">{reply.say}</p>}
            {error && <p className="problem" role="alert">{error}</p>}
            {(proposal.type === "limit" || proposal.path === "owner" || error) && (
              <button className="approve" disabled={!!busy} onClick={() => execute(proposal)}>{busy || (error ? "Try again" : "Approve with wallet")}</button>
            )}
            {busy && proposal.type !== "limit" && proposal.path === "agent" && !error && <p className="note">{busy}</p>}
            {autoPaying && (
              <>
                <p className="note">Sending in a moment</p>
                <div className="countdown" aria-hidden="true" style={{ animationDuration: `${AUTO_PAY_MS}ms` }} />
                <button className="ghost" onClick={() => { cancelAutoPay(); setReply(null); setHeard(""); setHint("Cancelled. Nothing was sent."); }}>Cancel payment</button>
              </>
            )}
          </article>
        )}

        {insight && !proposal && (
          <article className="card">
            <dl>
              {insight.rows.map((r) => <div key={r.label} className="pair"><dt>{r.label}</dt><dd>{r.value} {symbol}</dd></div>)}
            </dl>
            {insight.note && <p className="note strong" data-testid="say">{insight.note}</p>}
            {followUp?.kind === "cancel" && <button className="ghost" onClick={() => send("yes")}>Cancel {followUp.name}</button>}
          </article>
        )}

        {done && (
          <article className="card done">
            <span className="check" aria-hidden="true" />
            <p data-testid="status">{done}</p>
          </article>
        )}
      </section>

      <footer className="dock">
        <div className="words" aria-live="polite">
          {heard && <p className="heard" data-testid="heard">“{heard}”</p>}
          {listening && !heard && <p className="say">Listening…</p>}
          {thinking && <p className="say" aria-label="Thinking"><span className="dots" /></p>}
          {reply && !proposal && !insight && <p className="say" data-testid="say">{reply.say}</p>}
          {asking && !proposal && !insight && !listening && !thinking && (
            <p className="say" data-testid="asking">{asking.text} <button className="link" onClick={() => send("skip")}>Skip</button></p>
          )}
          {hint && <p className="say">{hint}</p>}
          {error && !proposal && <p className="problem" role="alert">{error}</p>}
          {snap?.memory.error && !heard && <p className="problem" role="alert">I can&apos;t reach your memory right now.</p>}
          {loadError && <p className="problem" role="alert">I couldn&apos;t load your wallet. <button className="link" onClick={firstLoad}>Try again</button></p>}
          {ready && !snap && !loadError && <p className="say">Reading your memory…</p>}
          {!ready && health && <p className="say">{account ? "Sign the message in your wallet." : "Connect your wallet to start."}</p>}
          {idle && snap && !snap.memory.error && <p className="say">{firstName ? `Try “Send ${firstName} the usual”` : "Hold to talk"}</p>}
        </div>
        {ready ? (
          <>
            <button ref={orb} className="orb" data-on={listening} aria-pressed={listening} aria-label={listening ? "Listening, release to send" : "Hold to talk"} onPointerDown={startTalk} onPointerUp={stopTalk} onPointerCancel={stopTalk} onPointerLeave={() => listening && stopTalk()} onContextMenu={(e) => e.preventDefault()} {...hold} />
            {typing ? (
              <form className="typed" onSubmit={(e) => { e.preventDefault(); send(typed); setTyped(""); }}>
                <input aria-label="Type instead" autoFocus placeholder="Send Mum her usual" value={typed} onChange={(e) => setTyped(e.target.value)} onKeyDown={(e) => e.key === "Escape" && setTyping(false)} onBlur={(e) => { if (!typed && !e.relatedTarget) setTyping(false); }} />
                <button type="submit" className="ghost">Send</button>
              </form>
            ) : (
              <button className="ghost" onClick={() => setTyping(true)}>Type</button>
            )}
          </>
        ) : health && !health.mock && <ConnectButton />}
      </footer>
    </main>
  );
}
