import os, uuid
from datetime import datetime, timezone
from sqlalchemy import ForeignKey, Integer, Text, DateTime, Uuid
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

engine = create_async_engine(os.environ["DATABASE_URL"], pool_pre_ping=True)
Session = async_sessionmaker(engine, expire_on_commit=False)

def now(): return datetime.now(timezone.utc)

class Base(DeclarativeBase): pass

class Call(Base):
    __tablename__ = "calls"
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    room_name: Mapped[str] = mapped_column(Text, unique=True)
    status: Mapped[str] = mapped_column(Text, default="created")
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    summary_english: Mapped[str | None] = mapped_column(Text, nullable=True)
    summary_hindi: Mapped[str | None] = mapped_column(Text, nullable=True)
    summary_telugu: Mapped[str | None] = mapped_column(Text, nullable=True)
    participants: Mapped[list["Participant"]] = relationship(lazy="selectin", order_by="Participant.livekit_identity")
    items: Mapped[list["TranscriptItem"]] = relationship(lazy="selectin", order_by="TranscriptItem.started_at_ms")

class Participant(Base):
    __tablename__ = "participants"
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    call_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("calls.id", ondelete="CASCADE"))
    livekit_identity: Mapped[str] = mapped_column(Text)
    display_name: Mapped[str] = mapped_column(Text)
    spoken_language: Mapped[str] = mapped_column(Text)
    listening_language: Mapped[str] = mapped_column(Text)

class TranscriptItem(Base):
    __tablename__ = "transcript_items"
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    call_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("calls.id", ondelete="CASCADE"))
    speaker_identity: Mapped[str] = mapped_column(Text)
    listener_identity: Mapped[str] = mapped_column(Text)
    source_language: Mapped[str] = mapped_column(Text)
    target_language: Mapped[str] = mapped_column(Text)
    source_text: Mapped[str] = mapped_column(Text)
    translated_text: Mapped[str] = mapped_column(Text)
    started_at_ms: Mapped[int] = mapped_column(Integer, default=0)
    ended_at_ms: Mapped[int] = mapped_column(Integer, default=0)
    stt_latency_ms: Mapped[int] = mapped_column(Integer, default=0)
    translation_latency_ms: Mapped[int] = mapped_column(Integer, default=0)
    tts_latency_ms: Mapped[int] = mapped_column(Integer, default=0)
    total_latency_ms: Mapped[int] = mapped_column(Integer, default=0)

async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
