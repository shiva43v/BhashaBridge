"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { RemoteAudioTrack, Room } from "livekit-client";
import Brand from "./Brand";
import CallControls from "./CallControls";
import SummaryView from "./SummaryView";
import TranscriptPanel, { type Turn } from "./TranscriptPanel";
import TranslationAudio from "./TranslationAudio";
import { endCall, getCall, getToken, type CallData, type Identity } from "@/lib/api";
import { langOf } from "@/lib/languages";
import { joinRoom, otherOf, type LiveEvent } from "@/lib/livekit";

type Phase = "loading" | "lobby" | "joining" | "live" | "ended" | "error";

export default function CallRoom({ callId, me, showInvite, review }: {
  callId: string; me: Identity | null; showInvite: boolean; review: boolean;
}) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [call, setCall] = useState<CallData | null>(null);
  const [error, setError] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [track, setTrack] = useState<RemoteAudioTrack | null>(null);
  const [presence, setPresence] = useState({ interpreter: false, other: false });
  const [speaking, setSpeaking] = useState({ interpreter: false, other: false });
  const [micOn, setMicOn] = useState(true);
  const [ending, setEnding] = useState(false);
  const [copied, setCopied] = useState(false);
  const room = useRef<Room | null>(null);

  const fromHistory = (c: CallData): Turn[] => c.transcript.map((t) => ({
    id: t.id, speaker: t.speaker, sourceLanguage: t.sourceLanguage, sourceText: t.sourceText,
    targetLanguage: t.targetLanguage, translatedText: t.translatedText, totalMs: t.totalMs,
  }));

  useEffect(() => {
    getCall(callId)
      .then((c) => {
        setCall(c); setTurns(fromHistory(c));
        setPhase(review || c.status === "ended" ? "ended" : "lobby");
      })
      .catch((e) => { setError(e.message); setPhase("error"); });
    return () => { room.current?.disconnect(); };
  }, [callId, review]);

  const names = useMemo(() => Object.fromEntries((call?.participants ?? []).map((p) => [p.identity, p.displayName])), [call]);
  const mine = call?.participants.find((p) => p.identity === me);

  const onEvent = useCallback((e: LiveEvent) => {
    setTurns((prev) => {
      const i = prev.findIndex((t) => t.id === e.turnId);
      const next = [...prev];
      if (e.type === "transcript" && i < 0)
        next.push({ id: e.turnId, speaker: e.speaker, sourceLanguage: e.sourceLanguage, sourceText: e.text });
      else if (i >= 0 && e.type === "translation") next[i] = { ...next[i], targetLanguage: e.targetLanguage, translatedText: e.text };
      else if (i >= 0 && e.type === "metrics") next[i] = { ...next[i], totalMs: e.totalMs };
      else if (i >= 0 && e.type === "error") next[i] = { ...next[i], error: "This sentence couldn't be interpreted. Please say it again." };
      return next;
    });
  }, []);

  async function join() {
    if (!me) return;
    setPhase("joining"); setError("");
    try {
      const { token } = await getToken(callId, me);
      room.current = await joinRoom(token, me, {
        onInterpreterTrack: setTrack, onPresence: setPresence, onSpeaking: setSpeaking, onEvent,
        onDisconnected: () => setPresence({ interpreter: false, other: false }),
      });
      await room.current.startAudio().catch(() => {});
      setPhase("live");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not join the call.";
      setError(/permission|denied|NotAllowed/i.test(msg) ? "Microphone access was blocked. Allow the microphone in your browser and try again." : msg);
      setPhase("lobby");
    }
  }

  async function finish() {
    setEnding(true);
    try {
      room.current?.disconnect();
      const done = await endCall(callId);
      setCall(done); setTurns(fromHistory(done)); setPhase("ended");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not end the call."); 
    } finally { setEnding(false); }
  }

  async function toggleMic() {
    const next = !micOn;
    await room.current?.localParticipant.setMicrophoneEnabled(next);
    setMicOn(next);
  }

  const inviteUrl = typeof window !== "undefined" && call ? `${window.location.origin}/call/${call.callId}?as=${otherOf(me ?? "user-a")}` : "";
  async function copyInvite() {
    await navigator.clipboard.writeText(inviteUrl).catch(() => {});
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  }

  return (
    <main className="wrap">
      <div className="call-head"><Brand /><Link className="hint" href="/">New call</Link></div>

      {phase === "loading" && <p className="hint" style={{ marginTop: 32 }}>Loading call…</p>}

      {phase === "error" && (
        <div className="lobby"><h2>Can't open this call</h2><p className="error">{error}</p>
          <div className="actions"><Link className="btn" href="/">Back to start</Link></div></div>
      )}

      {(phase === "lobby" || phase === "joining") && call && (
        <div className="lobby">
          {!me ? (
            <>
              <h2>Who are you?</h2>
              <p className="hint">Pick your name to join this call.</p>
              <div className="actions">
                {call.participants.map((p) => (
                  <Link key={p.identity} className="btn" href={`/call/${callId}?as=${p.identity}`}>I'm {p.displayName}</Link>
                ))}
              </div>
            </>
          ) : mine && (
            <>
              <h2>Ready, {mine.displayName}?</h2>
              <div className="roles">
                <div className="role"><div className="label">You speak</div><div className="value" lang={langOf(mine.spokenLanguage).tag}>{langOf(mine.spokenLanguage).native}</div></div>
                <div className="role"><div className="label">You hear</div><div className="value" lang={langOf(mine.listeningLanguage).tag}>{langOf(mine.listeningLanguage).native}</div></div>
              </div>
              <p className="hint" style={{ marginTop: 14 }}>Wear headphones so the interpreter's voice doesn't loop back into your microphone. Speak one sentence at a time and pause; the interpretation plays after you stop.</p>
              {(showInvite || me === "user-a") && (
                <div style={{ marginTop: 18 }}>
                  <span className="legend">Send this link to {names[otherOf(me)]}</span>
                  <div className="invite">
                    <input className="text-input" readOnly value={inviteUrl} aria-label="Invite link" onFocus={(e) => e.currentTarget.select()} />
                    <button className="btn ghost" onClick={copyInvite}>{copied ? "Copied" : "Copy link"}</button>
                  </div>
                </div>
              )}
              <div className="actions">
                <button className="btn" onClick={join} disabled={phase === "joining"}>{phase === "joining" ? "Joining…" : "Join call"}</button>
              </div>
              {error && <p className="error" role="alert" style={{ marginTop: 12 }}>{error}</p>}
            </>
          )}
        </div>
      )}

      {phase === "live" && call && me && mine && (
        <>
          <div className="status-row" aria-live="polite">
            <span className={`chip ${presence.other ? "on" : ""} ${speaking.other ? "speaking" : ""}`}><span className="dot" />{presence.other ? `${names[otherOf(me)]} is here` : `Waiting for ${names[otherOf(me)]}`}</span>
            <span className={`chip ${presence.interpreter ? "on" : ""} ${speaking.interpreter ? "speaking" : ""}`}><span className="dot" />{presence.interpreter ? (speaking.interpreter ? "Interpreter is speaking" : "Interpreter ready") : "Interpreter starting…"}</span>
          </div>
          <div className="roles">
            <div className="role"><div className="label">You speak</div><div className="value" lang={langOf(mine.spokenLanguage).tag}>{langOf(mine.spokenLanguage).native}</div></div>
            <div className="role"><div className="label">You hear</div><div className="value" lang={langOf(mine.listeningLanguage).tag}>{langOf(mine.listeningLanguage).native}</div></div>
          </div>
          <TranscriptPanel turns={turns} me={me} names={names} />
          {error && <p className="error" role="alert">{error}</p>}
          <CallControls micOn={micOn} onToggleMic={toggleMic} onEnd={finish} ending={ending} />
          <TranslationAudio track={track} />
        </>
      )}

      {phase === "ended" && call && (
        <>
          <h1 style={{ marginTop: 28, fontSize: "1.8rem", letterSpacing: "-0.02em" }}>
            {call.participants.map((p) => p.displayName).join(" & ")}
          </h1>
          <p className="hint">{new Date(call.startedAt).toLocaleString()}{call.status === "ended" ? "" : " · call not ended yet"}</p>
          <SummaryView call={call} />
          <h2 style={{ marginTop: 32, fontSize: "1.2rem" }}>Transcript</h2>
          <TranscriptPanel turns={turns} me={null} names={names} review />
        </>
      )}
    </main>
  );
}
