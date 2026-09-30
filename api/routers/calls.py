import uuid, statistics
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from db import Session, Call, TranscriptItem
from services.summary import build_summary, translate

router = APIRouter(prefix="/v1")

def serialize(c: Call):
    def med(k):
        v = [getattr(i, k) for i in c.items if getattr(i, k)]
        return int(statistics.median(v)) if v else None
    return {
        "callId": str(c.id), "roomName": c.room_name, "status": c.status,
        "startedAt": c.started_at.isoformat(), "endedAt": c.ended_at.isoformat() if c.ended_at else None,
        "participants": [{"identity": p.livekit_identity, "displayName": p.display_name,
                          "spokenLanguage": p.spoken_language, "listeningLanguage": p.listening_language}
                         for p in c.participants],
        "transcript": [{"id": str(i.id), "speaker": i.speaker_identity, "listener": i.listener_identity,
                        "sourceLanguage": i.source_language, "targetLanguage": i.target_language,
                        "sourceText": i.source_text, "translatedText": i.translated_text,
                        "startedAtMs": i.started_at_ms, "endedAtMs": i.ended_at_ms,
                        "sttMs": i.stt_latency_ms, "translationMs": i.translation_latency_ms,
                        "ttsMs": i.tts_latency_ms, "totalMs": i.total_latency_ms} for i in c.items],
        "summary": {"english": c.summary_english, "hindi": c.summary_hindi, "telugu": c.summary_telugu},
        "metrics": {"turns": len(c.items), "medianSttMs": med("stt_latency_ms"),
                    "medianTranslationMs": med("translation_latency_ms"),
                    "medianTtsMs": med("tts_latency_ms"), "medianTotalMs": med("total_latency_ms")},
    }

async def load(s, call_id: str) -> Call:
    try: cid = uuid.UUID(call_id)
    except ValueError: raise HTTPException(404, "Call not found")
    c = (await s.execute(select(Call).where(Call.id == cid))).scalar_one_or_none()
    if not c: raise HTTPException(404, "Call not found")
    return c

@router.get("/calls")
async def list_calls():
    async with Session() as s:
        rows = (await s.execute(select(Call).order_by(Call.started_at.desc()).limit(30))).scalars().all()
        return [{"callId": str(c.id), "status": c.status, "startedAt": c.started_at.isoformat(),
                 "participants": [p.display_name for p in c.participants], "turns": len(c.items)} for c in rows]

@router.get("/calls/{call_id}")
async def get_call(call_id: str):
    async with Session() as s:
        return serialize(await load(s, call_id))

@router.post("/calls/{call_id}/end")
async def end_call(call_id: str):
    async with Session() as s:
        c = await load(s, call_id)
        if c.status != "ended":
            full = build_summary(c)
            c.status, c.ended_at, c.summary_english = "ended", datetime.now(timezone.utc), full
            c.summary_hindi = await translate(full, "en-IN", "hi-IN")
            c.summary_telugu = await translate(full, "en-IN", "te-IN")
            await s.commit()
        return serialize(c)

# ---- Internal endpoints used by the agent container over the private Docker network ----
class ItemIn(BaseModel):
    speaker: str; listener: str
    sourceLanguage: str; targetLanguage: str
    sourceText: str; translatedText: str
    startedAtMs: int = 0; endedAtMs: int = 0
    sttMs: int = 0; translationMs: int = 0; ttsMs: int = 0; totalMs: int = 0

@router.get("/internal/rooms/{room_name}")
async def internal_room(room_name: str):
    async with Session() as s:
        c = (await s.execute(select(Call).where(Call.room_name == room_name))).scalar_one_or_none()
        if not c: raise HTTPException(404)
        return serialize(c)

@router.post("/internal/calls/{call_id}/items")
async def add_item(call_id: str, it: ItemIn):
    async with Session() as s:
        c = await load(s, call_id)
        if c.status == "created": c.status = "active"
        s.add(TranscriptItem(call_id=c.id, speaker_identity=it.speaker, listener_identity=it.listener,
            source_language=it.sourceLanguage, target_language=it.targetLanguage,
            source_text=it.sourceText, translated_text=it.translatedText,
            started_at_ms=it.startedAtMs, ended_at_ms=it.endedAtMs, stt_latency_ms=it.sttMs,
            translation_latency_ms=it.translationMs, tts_latency_ms=it.ttsMs, total_latency_ms=it.totalMs))
        await s.commit()
    return {"ok": True}

@router.get("/internal/active-rooms")
async def active_rooms():
    async with Session() as s:
        rows = (await s.execute(select(Call).where(Call.status.in_(["created", "active"])))).scalars().all()
        return [c.room_name for c in rows]

# ---- Invite link support: the second person fetches their own token for a call ----
from typing import Literal
from services.livekit_tokens import mint_token

class TokenReq(BaseModel):
    identity: Literal["user-a", "user-b"]

@router.post("/calls/{call_id}/token")
async def call_token(call_id: str, req: TokenReq):
    async with Session() as s:
        c = await load(s, call_id)
        if c.status == "ended": raise HTTPException(409, "This call has ended")
        p = next((p for p in c.participants if p.livekit_identity == req.identity), None)
        if not p: raise HTTPException(404, "Participant not found")
        return {"identity": req.identity, "token": mint_token(c.room_name, req.identity, p.display_name)}
