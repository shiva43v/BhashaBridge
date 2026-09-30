import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from db import init_db
from routers import rooms, calls

@asynccontextmanager
async def lifespan(_):
    await init_db()   # tables are created by the API at startup (spec, phase 4)
    yield

app = FastAPI(title="BhashaBridge API", lifespan=lifespan)
app.add_middleware(CORSMiddleware,
    allow_origins=os.getenv("CORS_ORIGINS", "http://localhost:3000").split(","),
    allow_methods=["*"], allow_headers=["*"])
app.include_router(rooms.router)
app.include_router(calls.router)

@app.get("/health")
async def health(): return {"ok": True}
