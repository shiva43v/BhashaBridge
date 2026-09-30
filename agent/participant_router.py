"""Decides who hears whom. One Direction = one speaker -> one listener."""
from dataclasses import dataclass

@dataclass(frozen=True)
class Direction:
    call_id: str
    room: str
    speaker: str          # LiveKit identity of the human speaking
    listener: str         # LiveKit identity of the human listening
    source_lang: str      # speaker's spoken language
    target_lang: str      # listener's listening language
    agent_identity: str   # the AI participant that publishes this listener's audio

def build_directions(call: dict) -> list[Direction]:
    people = {p["identity"]: p for p in call["participants"]}
    out = []
    for speaker, listener in (("user-a", "user-b"), ("user-b", "user-a")):
        s, l = people[speaker], people[listener]
        out.append(Direction(
            call_id=call["callId"], room=call["roomName"], speaker=speaker, listener=listener,
            source_lang=s["spokenLanguage"], target_lang=l["listeningLanguage"],
            agent_identity=f"interp-for-{listener}",   # e.g. interp-for-user-b
        ))
    return out
