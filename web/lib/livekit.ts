import { Room, RoomEvent, RemoteAudioTrack, RemoteTrack, RemoteTrackPublication, RemoteParticipant, Track } from "livekit-client";
import type { Identity } from "./api";

export const LIVEKIT_URL = process.env.NEXT_PUBLIC_LIVEKIT_URL || "";

/** Each person hears only this participant: the interpreter track published for them. */
export const interpreterFor = (me: Identity) => `interp-for-${me}`;
export const otherOf = (me: Identity): Identity => (me === "user-a" ? "user-b" : "user-a");

export type LiveEvent =
  | { type: "transcript"; turnId: string; speaker: string; listener: string; sourceLanguage: string; text: string }
  | { type: "translation"; turnId: string; speaker: string; listener: string; targetLanguage: string; text: string }
  | { type: "metrics"; turnId: string; translationMs: number; ttsMs: number; totalMs: number }
  | { type: "error"; turnId: string; message: string };

export type RoomHandlers = {
  onInterpreterTrack: (t: RemoteAudioTrack | null) => void;
  onPresence: (p: { interpreter: boolean; other: boolean }) => void;
  onSpeaking: (s: { interpreter: boolean; other: boolean }) => void;
  onEvent: (e: LiveEvent) => void;
  onDisconnected: () => void;
};

export async function joinRoom(token: string, me: Identity, h: RoomHandlers): Promise<Room> {
  const room = new Room({ adaptiveStream: false, dynacast: true });
  const dec = new TextDecoder();
  const interp = interpreterFor(me), other = otherOf(me);

  const presence = () => {
    const ids = new Set(Array.from(room.remoteParticipants.values()).map((p) => p.identity));
    h.onPresence({ interpreter: ids.has(interp), other: ids.has(other) });
  };

  // Audio routing: subscribe ONLY to our interpreter track. The other person's original voice
  // and the other listener's interpreter track are never played.
  room.on(RoomEvent.TrackPublished, (pub: RemoteTrackPublication, p: RemoteParticipant) => {
    if (pub.kind === Track.Kind.Audio && p.identity !== interp) pub.setSubscribed(false);
  });
  room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack, pub: RemoteTrackPublication, p: RemoteParticipant) => {
    if (track.kind !== Track.Kind.Audio) return;
    if (p.identity === interp) h.onInterpreterTrack(track as RemoteAudioTrack);
    else pub.setSubscribed(false);
  });
  room.on(RoomEvent.TrackUnsubscribed, (_t, _pub, p) => { if (p.identity === interp) h.onInterpreterTrack(null); });
  room.on(RoomEvent.ParticipantConnected, (p: RemoteParticipant) => {
    p.trackPublications.forEach((pub) => { if (pub.kind === Track.Kind.Audio && p.identity !== interp) pub.setSubscribed(false); });
    presence();
  });
  room.on(RoomEvent.ParticipantDisconnected, presence);
  room.on(RoomEvent.ActiveSpeakersChanged, (sp) => {
    const ids = new Set(sp.map((s) => s.identity));
    h.onSpeaking({ interpreter: ids.has(interp), other: ids.has(other) });
  });
  room.on(RoomEvent.DataReceived, (payload) => {
    try { h.onEvent(JSON.parse(dec.decode(payload))); } catch { /* ignore malformed */ }
  });
  room.on(RoomEvent.Disconnected, h.onDisconnected);

  await room.connect(LIVEKIT_URL, token, { autoSubscribe: true });
  await room.localParticipant.setMicrophoneEnabled(true);
  presence();
  return room;
}
