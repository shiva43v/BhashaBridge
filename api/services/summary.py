"""Basic end-of-call summary built from the stored transcript (no LLM needed for the MVP)."""
import os, re, httpx

ACTION_HINT = re.compile(r"\b(book|call|send|remind|pay|bring|meet|schedule|appointment|tomorrow|kal|repu)\b|రేపు|कल|बुक", re.I)

async def translate(text: str, src: str, tgt: str) -> str | None:
    if src == tgt or not text: return text
    try:
        async with httpx.AsyncClient(timeout=15) as c:
            r = await c.post("https://api.sarvam.ai/translate",
                headers={"api-subscription-key": os.environ["SARVAM_API_KEY"]},
                json={"input": text[:1900], "source_language_code": src,
                      "target_language_code": tgt, "model": "sarvam-translate:v1", "mode": "formal"})
            r.raise_for_status()
            return r.json().get("translated_text")
    except Exception:
        return None

def build_summary(call) -> str:
    names = {p.livekit_identity: p.display_name for p in call.participants}
    lines, actions = [], []
    for it in call.items:
        who = names.get(it.speaker_identity, it.speaker_identity)
        lines.append(f"{who}: {it.source_text}")
        if ACTION_HINT.search(it.source_text) or ACTION_HINT.search(it.translated_text):
            actions.append(f"- {who}: {it.source_text}")
    people = " and ".join(names.values()) or "Participants"
    head = f"{people} spoke for {len(call.items)} turn(s)."
    body = "\n".join(lines[:12]) or "No speech was recorded."
    act = "\n".join(actions[:8]) or "- None detected."
    return f"{head}\n\nKey points:\n{body}\n\nAction items:\n{act}"
