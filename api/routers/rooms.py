import uuid
from typing import Literal
from fastapi import APIRouter
from pydantic import BaseModel, Field
from db import Session, Call, Participant
from services.livekit_tokens import mint_token

router = APIRouter(prefix="/v1")
Lang = Literal["en-IN", "hi-IN", "te-IN"]

class Prefs(BaseModel):
    displayName: str = Field(min_length=1, max_length=60)
    spokenLanguage: Lang
    listeningLanguage: Lang

class RoomRequest(BaseModel):
    participantA: Prefs
    participantB: Prefs

@router.post("/rooms")
async def create_room(req: RoomRequest):
    call_id = uuid.uuid4()
    room = f"bb-{call_id}"
    async with Session() as s:
        s.add(Call(id=call_id, room_name=room, status="created"))
        await s.flush()
        for ident, p in (("user-a", req.participantA), ("user-b", req.participantB)):
            s.add(Participant(call_id=call_id, livekit_identity=ident, display_name=p.displayName,
                              spoken_language=p.spokenLanguage, listening_language=p.listeningLanguage))
        await s.commit()
    return {
        "callId": str(call_id), "roomName": room,
        "participants": [{"identity": i, "token": mint_token(room, i, n)}
                         for i, n in (("user-a", req.participantA.displayName),
                                      ("user-b", req.participantB.displayName))],
    }
