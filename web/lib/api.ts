import type { LangCode } from "./languages";

const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export type Prefs = { displayName: string; spokenLanguage: LangCode; listeningLanguage: LangCode };
export type Identity = "user-a" | "user-b";

export type TranscriptItem = {
  id: string; speaker: string; listener: string; sourceLanguage: LangCode; targetLanguage: LangCode;
  sourceText: string; translatedText: string; totalMs: number; translationMs: number; ttsMs: number;
};
export type CallData = {
  callId: string; roomName: string; status: "created" | "active" | "ended" | "failed";
  startedAt: string; endedAt: string | null;
  participants: { identity: Identity; displayName: string; spokenLanguage: LangCode; listeningLanguage: LangCode }[];
  transcript: TranscriptItem[];
  summary: { english: string | null; hindi: string | null; telugu: string | null };
  metrics: { turns: number; medianTranslationMs: number | null; medianTtsMs: number | null; medianTotalMs: number | null };
};
export type CallListItem = { callId: string; status: string; startedAt: string; participants: string[]; turns: number };

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, { ...init, headers: { "Content-Type": "application/json" }, cache: "no-store" });
  } catch {
    throw new Error("Can't reach the BhashaBridge API. Check that the api container is running.");
  }
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.detail && typeof body.detail === "string" ? body.detail : `Request failed (${res.status})`);
  }
  return res.json();
}

export const createRoom = (a: Prefs, b: Prefs) =>
  req<{ callId: string; roomName: string }>("/v1/rooms", { method: "POST", body: JSON.stringify({ participantA: a, participantB: b }) });
export const getCall = (id: string) => req<CallData>(`/v1/calls/${id}`);
export const listCalls = () => req<CallListItem[]>("/v1/calls");
export const endCall = (id: string) => req<CallData>(`/v1/calls/${id}/end`, { method: "POST" });
export const getToken = (id: string, identity: Identity) =>
  req<{ token: string }>(`/v1/calls/${id}/token`, { method: "POST", body: JSON.stringify({ identity }) });
