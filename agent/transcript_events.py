import json, aiohttp, os

API = os.getenv("API_INTERNAL_URL", "http://api:8000")

def event(kind: str, **data) -> str:
    return json.dumps({"type": kind, **data}, ensure_ascii=False)

async def persist(session: aiohttp.ClientSession, call_id: str, item: dict):
    async with session.post(f"{API}/v1/internal/calls/{call_id}/items", json=item) as r:
        r.raise_for_status()
