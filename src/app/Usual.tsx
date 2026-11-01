"use client";
// One balance, one orb, one card at a time. Holds no user knowledge of its own:
// everything shown comes from /api/state (Walrus Memory).
import dynamic from "next/dynamic";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Proposal, Question, Reply } from "@/lib/agent";
import type { Action } from "@/lib/parse";
import type { Rec as MemoryRecord, State } from "@/lib/records";
import { fromBase64 } from "@mysten/sui/utils";
import type { WalletApi } from "./Wallet";
import { AddMoney } from "./AddMoney";

const Wallet = dynamic(() => import("./Wallet"), { ssr: false });

type Health = { mock: boolean; network: string; tatum: boolean; walrusMemory: boolean; llm: string };
type Snapshot = { owner: string; memoryOn: boolean; symbol: string; balance: string; loose: string | null; state: State; activity: { name: string; amount: string; digest: string }[]; memory: { account: string | null; count: number; source: string; pending: number; error?: string }; questions: Question[] };
type CafeSigning = { bytes: string; proof: string; challenge: string };
type Outcome = { say: string; digest?: string; needsOwner?: string; bytes?: string; agentBytes?: string; agentCafe?: CafeSigning; allowanceId?: string; ok?: boolean; followUp?: Action };

const AUTO_PAY_MS = 3000;
const HOLD_MS = 500;
const SILENCE_MS = 800;
const WAIT_FOR_SPEECH_MS = 7000;
const MAX_TURN_MS = 20_000;
const SILENCE = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=";

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

/** Best-effort debug note for the server's session log. */
const note = (event: string, detail: Record<string, string | number | boolean> = {}) => {
  fetch("/api/log", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ event, detail }) }).catch(() => {});
};

const calm = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Money rolls to its new value, so a payment reads as the balance changing, not swapping. */
function Rolling({ value, ms = 800 }: { value: string; ms?: number }) {
  const el = useRef<HTMLSpanElement>(null);
  const shown = useRef(0);
  useLayoutEffect(() => {
    const node = el.current!;
    const to = Number(value);
    const from = shown.current;
    shown.current = to;
    if (from === to || calm()) {
      node.textContent = value;
      return;
    }
    const places = value.split(".")[1]?.length ?? 0;
    node.textContent = from.toFixed(places);
    const start = performance.now();
    let frame = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / ms);
      node.textContent = p === 1 ? value : (from + (to - from) * (1 - (1 - p) ** 4)).toFixed(places);
      if (p < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(frame); node.textContent = value; };
  }, [value, ms]);
  // Hold the width so the unit beside the number stays put while digits roll.
  return <span ref={el} className="rolling" style={{ minInlineSize: `${Math.max(value.length, 6)}ch` }} />;
}

/** Words arrive one at a time. Stable keys mean only new words animate during live speech. */
function Words({ text, stagger = 0 }: { text: string; stagger?: number }) {
  return text.split(" ").map((w, i) => (
    <span key={i}>{i > 0 && " "}<span className="w" style={{ animationDelay: `${Math.min(i * stagger, 500)}ms` }}>{w}</span></span>
  ));
}

/** The signature: how many times Usual has seen this, as a shopkeeper's tally. */
function Tally({ count }: { count: number }) {
  const shown = Math.min(count, 10);
  const groups = Array.from({ length: Math.ceil(shown / 5) }, (_, g) => Math.min(5, shown - g * 5));
  return (
    <svg className="tally" width={(groups.length * 24 - 4) * 1.5} height="24" viewBox={`0 0 ${groups.length * 24 - 4} 16`} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      {groups.map((n, g) => (
        <g key={g} transform={`translate(${g * 24} 0)`}>
          {Array.from({ length: Math.min(n, 4) }, (_, i) => <path key={i} pathLength={1} style={{ animationDelay: `${240 + (g * 5 + i) * 70}ms` }} d={`M${2 + i * 4} 2v12`} />)}
          {n === 5 && <path pathLength={1} style={{ animationDelay: `${240 + (g * 5 + 4) * 70}ms` }} d="M0 11 16 5" />}
        </g>
      ))}
    </svg>
  );
}

const Wave = () => <span className="wave" aria-hidden="true"><i /><i /><i /><i /><i /></span>;

const Mic = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
  </svg>
);

const seenTimes = (reason: string) => Number(reason.match(/\d+/)?.[0] ?? 0);

type Done = { say: string; amount?: string; to?: string; digest?: string };

function readVoicePref() {
  try {
    return localStorage.getItem("usual.voice") !== "off";
  } catch {
    return true;
  }
}

export default function Usual({ health }: { health: Health }) {
  const [wallet, setWallet] = useState<WalletApi | null>(null);
  const account = wallet?.address;
  const [undo, setUndo] = useState<MemoryRecord[] | null>(null);
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
  const [voiceOn, setVoiceOn] = useState(readVoicePref);
  const [autoPaying, setAutoPaying] = useState(false);
  const [settings, setSettings] = useState(false);
  const [done, setDone] = useState<Done | null>(null);
  const [tearing, setTearing] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const rec = useRef<Rec | null>(null);
  const finalText = useRef("");
  const pressedAt = useRef(0);
  const voiceFailed = useRef(false);
  const stopHeld = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const orb = useRef<HTMLButtonElement>(null);
  const conversation = useRef(false);
  const listenAgain = useRef<(() => void) | null>(null);
  const awaitingYes = useRef<Proposal | null>(null);
  const audioContext = useRef<AudioContext | null>(null);
  const player = useRef<HTMLAudioElement | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const balanceEl = useRef<HTMLParagraphElement>(null);
  const balanceBox = useRef<DOMRect | null>(null);
  // Guards against a double tap paying twice; state alone updates too late.
  const running = useRef(false);
  const signingIn = useRef(false);

  /** Resolves when the voice has finished, so the mic never hears Usual talking. */
  const speak = useCallback(async (text: string) => {
    const audio = player.current;
    if (!voiceOn || !audio || health.llm === "rules") return;
    try {
      const res = await fetch("/api/tts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: text.slice(0, 190) }) });
      if (!res.ok) return;
      audio.src = URL.createObjectURL(await res.blob());
      await audio.play();
      await new Promise<void>((done) => {
        audio.onended = () => done();
        audio.onerror = () => done();
        // Backstop only: iOS can skip the ended event when the page is interrupted.
        setTimeout(done, (Number.isFinite(audio.duration) ? audio.duration * 1000 : 8000) + 500);
      });
    } catch (e) {
      note("voice-failed", { message: (e as Error).message }); // the words are on screen, so this stays silent
    }
  }, [voiceOn, health]);

  /** In a conversation, listen again once Usual has finished talking. */
  const keepListening = useCallback(async (spoken: Promise<void>) => {
    await spoken;
    if (conversation.current) listenAgain.current?.();
  }, []);

  const cancelAutoPay = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setAutoPaying(false);
  };

  const ready = health.mock || authed;

  useEffect(() => {
    const crash = (e: ErrorEvent) => note("page-error", { message: e.message });
    const rejected = (e: PromiseRejectionEvent) => note("unhandled-rejection", { message: String(e.reason).slice(0, 300) });
    window.addEventListener("error", crash);
    window.addEventListener("unhandledrejection", rejected);
    note("open", { width: window.innerWidth, height: window.innerHeight, agent: navigator.userAgent.slice(0, 200) });
    return () => { window.removeEventListener("error", crash); window.removeEventListener("unhandledrejection", rejected); };
  }, []);

  // Owner proves control of the wallet once; the server then accepts this browser.
  useEffect(() => {
    if (health.mock || !account || !wallet?.agent || authed || signingIn.current) return;
    signingIn.current = true;
    (async () => {
      const agent = wallet.agent!.toSuiAddress();
      const a = await api<{ message: string; at: number; session: boolean }>(`auth?address=${account}&agent=${agent}`);
      if (a.session) return setAuthed(true);
      const { signature } = await wallet.signMessage({ message: new TextEncoder().encode(a.message) });
      await api("auth", { address: account, agent, at: a.at, signature });
      setError("");
      setAuthed(true);
    })().catch((e) => setError(e.message)).finally(() => { signingIn.current = false; });
  }, [health, account, authed, wallet]);

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
  const signAndSubmit = useCallback(async (kind: "pay" | "limit" | "cafe" | "starter" | "deposit", bytes: string, meta: Record<string, unknown> = {}) => {
    let signed = { bytes, signature: "mock" };
    if (!health.mock) {
      setBusy("Waiting for your wallet…");
      signed = await wallet!.signTx({ transaction: bytes });
    }
    setBusy("Sending…");
    return api<Outcome>("submit", { kind, bytes: signed.bytes, signature: signed.signature, meta });
  }, [health, wallet]);

  /** Inside a limit no popup appears: the agent key on this device signs, and the server never can. */
  const signAsAgent = useCallback(async (kind: "agent-pay" | "seed", bytes: string) => {
    const signed = await wallet!.agent!.signTransaction(fromBase64(bytes));
    return api<Outcome>("submit", { kind, bytes: signed.bytes, signature: signed.signature });
  }, [wallet]);

  const payCafeOnDevice = useCallback(async (s: CafeSigning, item: string) => {
    const agent = wallet!.agent!;
    const [tx, proof] = await Promise.all([agent.signTransaction(fromBase64(s.bytes)), agent.signPersonalMessage(fromBase64(s.proof))]);
    return api<Outcome>("cafe/finish", { item, challenge: s.challenge, bytes: tx.bytes, signature: tx.signature, proofSignature: proof.signature });
  }, [wallet]);

  /** One sponsored step at a time on mainnet: the wallet signs, Walrus pays. Returns once the chain agrees. */
  const memoryAccount = useCallback(async (revoke = false) => {
    for (let i = 0; i < 2; i++) {
      const p = await api<{ done?: boolean; message: string; kind: string; timestamp: number; nonce: string }>("memory/account", { action: "prepare", revoke });
      if (p.done) return;
      const { signature } = await wallet!.signMessage({ message: new TextEncoder().encode(p.message) });
      const s = await api<{ bytes: string; digest: string }>("memory/account", { action: "sponsor", kind: p.kind, timestamp: p.timestamp, nonce: p.nonce, signature });
      const signed = await wallet!.signTx({ transaction: s.bytes, chain: "sui:mainnet" });
      await api("memory/account", { action: "execute", digest: s.digest, signature: signed.signature });
      if (revoke) return;
    }
  }, [wallet]);

  const changeMemoryAccount = useCallback(async (revoke: boolean) => {
    setError("");
    setBusy("Waiting for your wallet…");
    try {
      await memoryAccount(revoke);
      setHint(revoke ? "Done. I can't read your memory any more." : "Your memory is yours now.");
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }, [memoryAccount, refresh]);

  /** New wallet: its own memory first, then test money and gas from the server, one approval, then the device key lays down sample history. */
  const getStarted = useCallback(async () => {
    setError("");
    setBusy("Making your memory yours…");
    try {
      // Walrus's sponsor can be busy. A tester can still try Usual, and claim from Settings later.
      await memoryAccount().catch((e) => setHint(`Your memory stays on Usual's account for now. ${(e as Error).message}`));
      setBusy("Getting your test money…");
      const { bytes } = await api<{ bytes: string }>("faucet", {});
      const r = await signAndSubmit("starter", bytes);
      if (r.ok === false || !r.allowanceId) throw new Error(r.say || "That approval didn't go through.");
      setBusy("Adding sample payments…");
      for (let round = 0; round < 3; round++) {
        const next = await api<{ bytes: string }>("seed", { allowanceId: r.allowanceId, round });
        await signAsAgent("seed", next.bytes);
      }
      firstLoad();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }, [memoryAccount, signAndSubmit, signAsAgent, firstLoad]);

  const addDeposit = useCallback(async () => {
    setError("");
    try {
      const { bytes } = await api<{ bytes: string }>("deposit", {});
      const r = await signAndSubmit("deposit", bytes);
      setHint(r.say);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }, [signAndSubmit, refresh]);

  const execute = useCallback(async (p: Proposal) => {
    if (running.current) return;
    running.current = true;
    setError("");
    setBusy("Sending…");
    const slow = setTimeout(() => setBusy((b) => (b === "Sending…" ? "Waiting for the network to confirm…" : b)), 1800);
    try {
      let r: Outcome;
      if (p.type === "pay") {
        r = await api("pay", { to: p.to, amount: p.amount, path: p.path });
        const bytes = r.needsOwner ?? r.bytes;
        if (r.agentBytes) r = await signAsAgent("agent-pay", r.agentBytes);
        else if (bytes) r = await signAndSubmit("pay", bytes);
        else if (r.ok === false) throw new Error(r.say);
      } else if (p.type === "limit") {
        const { bytes } = await api<{ bytes: string }>("limit", { category: p.category, amount: p.amount, periodDays: p.periodDays });
        r = await signAndSubmit("limit", bytes, { category: p.category, amount: p.amount, periodDays: p.periodDays });
      } else {
        r = await api("cafe/pay", { item: p.item, path: p.path });
        if (r.needsOwner) r = await signAndSubmit("cafe", r.needsOwner, { item: p.item });
        if (r.agentCafe) r = await payCafeOnDevice(r.agentCafe, p.item);
      }
      // A payment ends as one check mark, then the screen returns to just the balance.
      setReply(null);
      setHeard("");
      setDone({ say: r.say, digest: r.digest, amount: p.type === "limit" ? undefined : p.amount, to: p.type === "pay" ? p.name : p.type === "cafe" ? `Café · ${p.label}` : undefined });
      setFollowUp(r.followUp ?? null);
      navigator.vibrate?.(20);
      const hold = r.followUp ? 7700 : 3700;
      setTimeout(() => setTearing(true), hold);
      setTimeout(() => { setDone(null); setTearing(false); }, hold + 300);
      awaitingYes.current = null;
      refresh().catch(() => {});
      keepListening(speak(r.say));
    } catch (e) {
      setError((e as Error).message);
      note("payment-failed", { message: (e as Error).message });
    } finally {
      clearTimeout(slow);
      running.current = false;
      setBusy("");
    }
  }, [refresh, signAndSubmit, signAsAgent, payCafeOnDevice, speak, keepListening]);

  /** Puts memory back as it was before the last change. Money that moved stays moved. */
  const revert = useCallback(async () => {
    if (!undo) return;
    const records = undo;
    setUndo(null);
    setReply(null);
    setHeard("");
    setDone(null);
    setHint("Undone.");
    await api("undo", { records });
    setSkip([]);
    const s = await api<Snapshot>("state");
    setSnap(s);
    setAsking(s.questions[0] ?? null);
  }, [undo]);

  const send = useCallback(async (text: string) => {
    if (!text.trim()) return;
    if (undo && /^(undo|go back|revert|take that back|never ?mind)\b/i.test(text.trim())) return revert();
    // A ticket waiting for approval: yes or no out loud does what the button does.
    const waiting = awaitingYes.current;
    if (waiting && /^(yes|yeah|yep|ok|okay|sure|approve|do it|go ahead)\b/i.test(text.trim())) {
      setHeard(text);
      return execute(waiting);
    }
    if (waiting && /^(no|nope|cancel|stop|never ?mind)\b/i.test(text.trim())) {
      awaitingYes.current = null;
      setReply(null);
      setHeard("");
      setHint("Cancelled. Nothing was sent.");
      keepListening(speak("Cancelled. Nothing was sent."));
      return;
    }
    awaitingYes.current = null;
    cancelAutoPay();
    setHeard(text);
    setHint("");
    setError("");
    setDone(null);
    setReply(null);
    setThinking(true);
    try {
      const started = Date.now();
      const r = await api<Reply>("talk", { text, asking, followUp, skip });
      note("reply", { ms: Date.now() - started, text });
      setReply(r);
      setThinking(false);
      setUndo(r.undo?.length ? r.undo : null);
      const spoken = speak(r.say);
      if (asking && (r.action.kind === "name" || r.action.kind === "skip")) setSkip((s) => [...s, asking.address]);
      if (r.asking !== undefined) setAsking(r.asking);
      setFollowUp(r.followUp ?? null);
      // Inside a learned limit the agent pays on its own after a short, cancellable pause.
      if (r.proposal && r.proposal.type !== "limit" && r.proposal.path === "agent") {
        setAutoPaying(true);
        timer.current = setTimeout(() => { setAutoPaying(false); execute(r.proposal!); }, AUTO_PAY_MS);
      } else {
        if (r.proposal) awaitingYes.current = r.proposal;
        keepListening(spoken);
      }
      refresh().catch(() => {});
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setThinking(false);
    }
  }, [asking, followUp, skip, undo, revert, execute, refresh, speak, keepListening]);

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

  /** Holds record for Whisper. Partial audio is transcribed as you talk, the full clip on release. */
  const startWhisper = async () => {
    cancelAutoPay();
    navigator.vibrate?.(10);
    const box = orb.current?.getBoundingClientRect();
    if (box) { document.documentElement.style.setProperty("--ox", `${box.left + box.width / 2}px`); document.documentElement.style.setProperty("--oy", `${box.top + box.height / 2}px`); }
    pressedAt.current = Date.now();
    stopHeld.current = false;
    setTyping(false);
    setHint("");
    setListening(true);
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
      note("mic-denied", { message: (e as Error).message, resumed: !!conversation.current });
      setListening(false);
      conversation.current = false;
      setHint("The microphone is blocked. Allow it, or type instead.");
      return;
    }
    // Released during the permission prompt: nothing was said.
    if (stopHeld.current) {
      stream.getTracks().forEach((t) => t.stop());
      setListening(false);
      setHint("Mic is on. Hold again and talk.");
      return;
    }
    const chunks: Blob[] = [];
    const mime = ["audio/webm", "audio/mp4"].find((m) => MediaRecorder.isTypeSupported(m)) ?? "";
    const media = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    recorder.current = media;
    const hear = async () => {
      const form = new FormData();
      form.set("language", navigator.language.slice(0, 2));
      form.set("audio", new File(chunks, mime.includes("mp4") ? "speech.mp4" : "speech.webm", { type: mime || "audio/webm" }));
      const res = await fetch("/api/stt", { method: "POST", body: form });
      if (!res.ok) throw new Error("transcription failed");
      return (await res.json() as { text: string }).text;
    };
    let spoke = false;
    // One clean transcript per turn. Partials on short clips flashed invented words.
    media.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    const onSpeech = () => {
      spoke = true;
      setSpeaking(true);
      setHeard("");
      setReply(null);
      setDone(null);
      setError("");
      orb.current?.animate([{ transform: "scale(1.08)" }, { transform: "scale(1.2)" }, { transform: "scale(1.08)" }], { duration: 260, easing: "cubic-bezier(0.22, 1, 0.36, 1)" });
    };
    media.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      recorder.current = null;
      setListening(false);
      setSpeaking(false);
      if (!spoke) {
        conversation.current = false;
        setHint("Tap to talk");
        return;
      }
      setThinking(true);
      const released = Date.now();
      note("released", { heldMs: released - pressedAt.current, bytes: chunks.reduce((n, c) => n + c.size, 0) });
      try {
        const text = await hear();
        note("transcribed", { ms: Date.now() - released, text });
        if (text) await send(text);
        else {
          setHint("I didn't catch that.");
          keepListening(Promise.resolve());
        }
      } catch (e) {
        note("hearing-failed", { message: (e as Error).message });
        setHint("I couldn't hear that. Say it again.");
        keepListening(Promise.resolve());
      } finally {
        setThinking(false);
      }
    };
    media.start();
    // Voice detection: speech starts the moment, a short silence ends the turn.
    const context = audioContext.current;
    if (!context) return;
    context.resume().catch(() => {});
    const source = context.createMediaStreamSource(stream);
    const meter = context.createAnalyser();
    meter.fftSize = 1024;
    source.connect(meter);
    const wave = new Float32Array(meter.fftSize);
    const opened = Date.now();
    // The quietest recent moment is the room. A fixed start window would mistake someone already talking for it.
    let room = Infinity;
    let lastVoice = 0;
    const watch = setInterval(() => {
      if (media.state !== "recording") {
        clearInterval(watch);
        source.disconnect();
        return;
      }
      meter.getFloatTimeDomainData(wave);
      const level = Math.sqrt(wave.reduce((sum, v) => sum + v * v, 0) / wave.length);
      const open = Date.now() - opened;
      room = Math.min(room * 1.002, Math.max(level, 0.001));
      if (level > Math.max(0.012, room * 3)) {
        lastVoice = Date.now();
        if (!spoke) onSpeech();
      }
      if ((spoke && Date.now() - lastVoice > SILENCE_MS) || (!spoke && open > WAIT_FOR_SPEECH_MS) || open > MAX_TURN_MS) media.stop();
    }, 50);
  };
  useEffect(() => { listenAgain.current = () => { startWhisper(); }; });

  const startTalk = () => {
    if (listening) return;
    // iOS only plays audio from an element first touched inside a gesture.
    player.current ??= new Audio();
    player.current.pause();
    player.current.src = SILENCE;
    player.current.play().catch(() => {});
    if (health.llm !== "rules" && typeof MediaRecorder !== "undefined" && navigator.mediaDevices) return startWhisper();
    const r = recognizer();
    if (!r) {
      setHint("Voice doesn't work in this browser. Type instead.");
      setTyping(true);
      return;
    }
    cancelAutoPay();
    navigator.vibrate?.(10);
    // The citrus flood grows out of the orb, wherever the layout has put it.
    const box = orb.current?.getBoundingClientRect();
    if (box) { document.documentElement.style.setProperty("--ox", `${box.left + box.width / 2}px`); document.documentElement.style.setProperty("--oy", `${box.top + box.height / 2}px`); }
        finalText.current = "";
    voiceFailed.current = false;
    pressedAt.current = Date.now();
    setHeard("");
    setReply(null);
    setDone(null);
    setHint("");
    setError("");
    r.interimResults = true;
    // Android Chrome repeats earlier words in continuous mode, which garbles names.
    r.continuous = !/Android/i.test(navigator.userAgent);
    r.lang = navigator.language || "en-US";
    r.onresult = (e) => {
      const text = Array.from(e.results).map((x) => x[0].transcript).join("");
      finalText.current = text;
      setHeard(text);
      // The orb answers each word. No second mic stream: phones can't share it with speech recognition.
      orb.current?.animate([{ transform: "scale(1.12)" }, { transform: "scale(1.2)" }, { transform: "scale(1.12)" }], { duration: 260, easing: "cubic-bezier(0.22, 1, 0.36, 1)" });
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
  const stopTalk = () => {
    if (recorder.current?.state === "recording") recorder.current.stop();
    else if (!recorder.current) rec.current?.stop();
    stopHeld.current = true;
  };

  const pressOrb = () => {
    if (recorder.current?.state === "recording") {
      conversation.current = false;
      recorder.current.stop();
      return;
    }
    if (listening) return;
    conversation.current = true;
    const Context = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    audioContext.current ??= new Context();
    audioContext.current.resume().catch(() => {});
    startTalk();
  };
  /** A tap starts a conversation; a long hold still works as one push-to-talk turn. */
  const releaseOrb = () => {
    if (Date.now() - pressedAt.current < HOLD_MS) return;
    conversation.current = false;
    stopTalk();
  };

  const hold = {
    onKeyDown: (e: React.KeyboardEvent) => { if ((e.key === " " || e.key === "Enter") && !e.repeat) { e.preventDefault(); pressOrb(); } },
    onKeyUp: (e: React.KeyboardEvent) => { if (e.key === " " || e.key === "Enter") releaseOrb(); },
  };

  const symbol = snap?.symbol ?? "USDC";
  const state = snap?.state;
  const proposal = reply?.proposal;
  const insight = reply?.insight;
  const firstName = state ? Object.values(state.contacts).find((c) => state.usuals[c.name.toLowerCase()])?.name : undefined;
  const idle = !heard && !reply && !asking && !hint && !error && !listening && !thinking && !done;

  const loaded = !!snap;
  const cardUp = !!proposal || !!insight || !!done;
  const orbState = listening ? "listening" : thinking || busy ? "working" : error ? "error" : done ? "done" : idle ? "invite" : "idle";

  // The balance travels between centre and top instead of jumping when a card arrives.
  useLayoutEffect(() => {
    const node = balanceEl.current;
    if (!node) return;
    const now = node.getBoundingClientRect();
    const was = balanceBox.current;
    balanceBox.current = now;
    if (!was || calm() || (was.top === now.top && was.height === now.height)) return;
    const zoom = was.height / now.height;
    node.animate(
      [{ transform: `translate(${was.left + was.width / 2 - now.left - now.width / 2}px, ${was.top + was.height / 2 - now.top - now.height / 2}px) scale(${zoom})` }, { transform: "none" }],
      { duration: 320, easing: "cubic-bezier(0.32, 0.72, 0, 1)" },
    );
  }, [cardUp, loaded]);

  if (settings) {
    const close = () => setSettings(false);
    const explorer = (d: string) => (d.startsWith("MOCK") ? null : `https://suiscan.xyz/${health.network}/tx/${d}`);
    return (
      <main className="app settings sheet" onKeyDown={(e) => e.key === "Escape" && close()}>
        <header className="settings-top">
          <h1>Settings</h1>
          <button className="ghost" autoFocus onClick={close}>Close settings</button>
        </header>

        <h2>What I remember</h2>
        {snap?.memory.error && <p className="problem" role="alert">I can&apos;t reach your memory, so I don&apos;t know anyone right now.</p>}
        <p className="fine" data-testid="memory">{snap?.memory.count ?? 0} memories · {snap?.memory.source}{snap?.memory.pending ? ` · ${snap.memory.pending} waiting to save` : ""}</p>
        {state && Object.values(state.contacts).map((c) => {
          const sub = state.subscriptions[c.address];
          const usual = state.usuals[c.name.toLowerCase()];
          return (
            <p key={c.address} className="row">
              <span>{c.name}</span>
              <span>{usual?.count ? <Tally count={usual.count} /> : null}{sub ? `${sub.amount} ${symbol} a month${sub.cancelled ? ", cancelled" : ""}` : usual ? `usually ${usual.amount} ${symbol}` : ""}</span>
            </p>
          );
        })}
        <button className="row-button" onClick={async () => { await api("memory", { on: !snap?.memoryOn }); await refresh(); }}>Memory: {snap?.memoryOn === false ? "off" : "on"}</button>
        <button className="row-button" onClick={() => { close(); refresh(true).then(() => setHint("Rebuilt from Walrus Memory.")); }}>Rebuild from Walrus</button>
        {!health.mock && (snap?.memory.account ? (
          <>
            <p className="fine">Yours, in <a href={`https://suiscan.xyz/mainnet/object/${snap.memory.account}`} target="_blank" rel="noreferrer">your own Walrus account</a>. Only your wallet can let me in or lock me out.</p>
            <button className="row-button" onClick={() => { close(); changeMemoryAccount(true); }}>Revoke Usual&apos;s access</button>
          </>
        ) : (
          <button className="row-button" onClick={() => { close(); changeMemoryAccount(false); }}>Make this memory yours</button>
        ))}

        <h2>Limits</h2>
        {state && Object.values(state.limits).length ? Object.values(state.limits).map((l) => (
          <p key={l.category} className="row"><span className="cap">{l.category}</span><span>{l.amount} {symbol} a {per(l.periodDays)}</span></p>
        )) : <p className="fine">None yet. Say “limit food to 10 a day”.</p>}
        <p className="fine">The chain holds the agent to these. Above one, it waits for your wallet.</p>

        <h2>Activity</h2>
        {snap?.activity.length ? snap.activity.map((p) => {
          const href = explorer(p.digest);
          const text = <><span>{p.name}</span><span>{p.amount} {symbol}</span></>;
          return href ? <a key={p.digest} className="row" href={href} target="_blank" rel="noreferrer">{text}</a> : <p key={p.digest} className="row">{text}</p>;
        }) : <p className="fine">Nothing sent yet.</p>}

        <h2>Voice</h2>
        {!health.mock && snap && <AddMoney address={snap.owner} symbol={snap.symbol} network={health.network} />}
        <button className="row-button" aria-pressed={voiceOn} onClick={() => {
          const next = !voiceOn;
          setVoiceOn(next);
          try { localStorage.setItem("usual.voice", next ? "on" : "off"); } catch { /* per-device nicety only */ }
        }}>Spoken replies: {voiceOn ? "on" : "off"}</button>

        <h2>Try the café</h2>
        <button className="row-button" onClick={() => { close(); send("buy a flat white at the café"); }}>Café: flat white</button>
        <button className="row-button" onClick={() => { close(); send("pay for a croissant at the café"); }}>Café: croissant</button>
        {health.mock && <p className="fine">Demo mode: play money, nothing leaves this device.</p>}
      </main>
    );
  }

  return (
    <main className="app" data-listening={speaking}>
      <div className="flood" aria-hidden="true" />
      <button className="menu" aria-label="Settings" onClick={() => setSettings(true)}><span /><span /></button>

      <section className="stage" data-card={cardUp} aria-live="polite">
        {snap ? (
          <p className="balance" ref={balanceEl} data-testid="balance"><Rolling value={snap.balance} /> <span className="unit">{symbol}</span></p>
        ) : !loadError && ready ? <p className="balance loading" aria-label="Loading your balance">0.00</p> : null}

        {proposal && (
          <article className="card">
            <header>
              <span>Understood as</span>
              {"overLimit" in proposal && proposal.overLimit && <span className="pill">{proposal.overLimit.replace(/^o/, "O").replace(/ \(.*$/, "")}</span>}
            </header>
            <div data-testid="understood">
              <p className="amount"><Rolling value={proposal.amount} ms={420} /> <span className="unit">{symbol}{proposal.type === "limit" ? ` a ${per(proposal.periodDays)}` : ""}</span></p>
              <dl>
                {proposal.type === "pay" && <><dt>To</dt><dd>{proposal.name} ({proposal.address.slice(0, 4)}…{proposal.address.slice(-2)})</dd></>}
                {proposal.type === "pay" && proposal.reason && <><dt>Why</dt><dd>{seenTimes(proposal.reason) > 0 && <Tally count={seenTimes(proposal.reason)} />}{proposal.reason}</dd></>}
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
            {busy && !error && (
              <>
                {proposal.type !== "limit" && proposal.path === "agent" && <p className="note">{busy}</p>}
                <div className="working" aria-hidden="true"><i /></div>
              </>
            )}
            {autoPaying && (
              <>
                <p className="note">Sending in a moment</p>
                <div className="countdown" aria-hidden="true" style={{ animationDuration: `${AUTO_PAY_MS}ms` }} />
                <button className="ghost" onClick={() => { cancelAutoPay(); conversation.current = false; setReply(null); setHeard(""); setHint("Cancelled. Nothing was sent."); }}>Cancel payment</button>
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

        {done && (done.amount ? (
          <div className="slip" data-tearing={tearing}><span className="stamp" aria-hidden="true">Paid</span><article className="receipt">
            <p className="said" data-testid="status">{/\. /.test(done.say) ? done.say : done.say.replace(/\.$/, "")}</p>
            <p className="total"><span>Paid</span><span>{done.amount} {symbol}</span></p>
            <dl>
              <dt>To</dt><dd>{done.to}</dd>
              {done.digest && <><dt>Ref</dt><dd>{done.digest.slice(0, 8)}</dd></>}
            </dl>
          </article></div>
        ) : (
          <article className="card done" data-tearing={tearing}>
            <span className="check" aria-hidden="true" />
            <p data-testid="status">{done.say}</p>
          </article>
        ))}
      </section>

      <footer className="dock">
        <div className="words" aria-live="polite">
          {heard && <p className="heard" data-testid="heard">“<Words text={heard} />”</p>}
          {listening && !reply && !done && <p className="heard">Listening…</p>}
          {thinking && <p className="say">Thinking…</p>}
          {reply && !proposal && !insight && (
            <p className="say" key={reply.say} data-testid="say"><Words text={reply.say} stagger={35} /> {undo && <button className="link" onClick={revert}>Undo</button>} {asking && reply.say.includes(asking.text) && <button className="link" onClick={() => send("skip")}>Skip</button>}</p>
          )}
          {asking && !reply?.say.includes(asking.text) && !proposal && !insight && !listening && !thinking && (
            <p className="say" key={asking.text} data-testid="asking"><Words text={asking.text} stagger={35} /> <button className="link" onClick={() => send("skip")}>Skip</button></p>
          )}
          {hint && <p className="say">{hint}</p>}
          {error && !proposal && <p className="problem" role="alert">{error}</p>}
          {snap?.memory.error && !heard && <p className="problem" role="alert">I can&apos;t reach your memory right now.</p>}
          {loadError && <p className="problem" role="alert">I couldn&apos;t load your wallet. <button className="link" onClick={firstLoad}>Try again</button></p>}
          {ready && !snap && !loadError && <p className="say">Reading your memory…</p>}
          {!ready && <p className="say">{account ? "Sign the message in your wallet." : "Connect your wallet to start."}</p>}
          {!health.mock && health.network !== "mainnet" && snap && !snap.activity.length && !snap.loose && !busy && !heard && (
            <p className="say">This is Sui testnet, so the money is pretend. <button className="link" onClick={getStarted}>Get 1,000 test dollars</button></p>
          )}
          {snap?.loose && !busy && (
            <p className="say">{snap.loose} {snap.symbol} arrived. <button className="link" onClick={addDeposit}>Add it to Usual</button></p>
          )}
          {idle && snap && snap.activity.length > 0 && !snap.memory.error && <p className="say">{firstName ? `Try “Send ${firstName} the usual”` : "Tap to talk"}</p>}
        </div>
        {ready ? (
          <>
            <button ref={orb} className="orb" data-state={orbState} data-on={listening} aria-pressed={listening} aria-label={listening ? "Listening, tap to finish" : "Tap to talk"} onPointerDown={pressOrb} onPointerUp={releaseOrb} onPointerCancel={releaseOrb} onContextMenu={(e) => e.preventDefault()} {...hold}>{listening ? <Wave /> : <Mic />}</button>
            {typing ? (
              <form className="typed" onSubmit={(e) => { e.preventDefault(); send(typed); setTyped(""); }}>
                <input aria-label="Type instead" autoFocus placeholder="Send Mum her usual" value={typed} onChange={(e) => setTyped(e.target.value)} onKeyDown={(e) => e.key === "Escape" && setTyping(false)} onBlur={(e) => { if (!typed && !e.relatedTarget) setTyping(false); }} />
                <button type="submit" className="ghost">Send</button>
              </form>
            ) : (
              <button className="ghost" onClick={() => setTyping(true)}>Type</button>
            )}
          </>
        ) : null}
        {!health.mock && <Wallet onChange={setWallet} show={!ready} network={health.network} />}
      </footer>
    </main>
  );
}
