"""Worker: watches the API for open calls and starts one interpreter pipeline per direction."""
import asyncio, os
import aiohttp
from loguru import logger
from participant_router import build_directions
from pipeline import run_direction

API = os.getenv("API_INTERNAL_URL", "http://api:8000")

async def run_call(room: str, http: aiohttp.ClientSession):
    async with http.get(f"{API}/v1/internal/rooms/{room}") as r:
        call = await r.json()
    await asyncio.gather(*(run_direction(d) for d in build_directions(call)), return_exceptions=True)
    logger.info(f"[{room}] interpreter finished")

async def main():
    running: dict[str, asyncio.Task] = {}
    async with aiohttp.ClientSession() as http:
        while True:
            try:
                async with http.get(f"{API}/v1/internal/active-rooms") as r:
                    rooms = await r.json()
                for room in rooms:
                    if room not in running or running[room].done():
                        running[room] = asyncio.create_task(run_call(room, http))
                # Stop watching rooms whose call has ended
                for room in [k for k in running if k not in rooms]:
                    running.pop(room).cancel()
            except Exception as e:
                logger.warning(f"poll failed: {e}")
            await asyncio.sleep(2)

if __name__ == "__main__":
    asyncio.run(main())
