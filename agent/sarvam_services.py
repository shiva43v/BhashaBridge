"""Sarvam Translate (REST). STT and Bulbul TTS come from Pipecat's Sarvam services."""
import os, aiohttp

TRANSLATE_URL = "https://api.sarvam.ai/translate"

async def translate(session: aiohttp.ClientSession, text: str, source: str, target: str) -> str:
    """Faithful translation. Returns the source text unchanged when languages match."""
    if source == target:
        return text
    async with session.post(
        TRANSLATE_URL,
        headers={"api-subscription-key": os.environ["SARVAM_API_KEY"]},
        json={"input": text, "source_language_code": source, "target_language_code": target,
              "model": "sarvam-translate:v1", "mode": "formal", "numerals_format": "international"},
        timeout=aiohttp.ClientTimeout(total=10),
    ) as r:
        r.raise_for_status()
        return (await r.json())["translated_text"]
