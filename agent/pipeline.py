import os, time, uuid, asyncio
import aiohttp
from livekit import api as lk
from loguru import logger

from pipecat.frames.frames import (Frame, TranscriptionFrame, TTSSpeakFrame, TTSAudioRawFrame,
                                   TTSStoppedFrame, EndFrame)
from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.runner import PipelineRunner
from pipecat.pipeline.task import PipelineParams, PipelineTask
from pipecat.processors.frame_processor import FrameDirection, FrameProcessor
from pipecat.services.sarvam.stt import SarvamSTTService
from pipecat.services.sarvam.tts import SarvamHttpTTSService
from pipecat.transcriptions.language import Language
from pipecat.transports.livekit.transport import LiveKitParams, LiveKitTransport

from participant_router import Direction
from sarvam_services import translate
from transcript_events import event, persist

SAMPLE_RATE = 24000

def agent_token(room: str, identity: str) -> str:
    return (lk.AccessToken(os.environ["LIVEKIT_API_KEY"], os.environ["LIVEKIT_API_SECRET"])
            .with_identity(identity).with_name("BhashaBridge interpreter")
            .with_grants(lk.VideoGrants(room_join=True, room=room, can_publish=True,
                                        can_subscribe=True, can_publish_data=True))
            .to_jwt())

class Turn:
    """Timing + text for one spoken turn, shared between the two processors."""
    def __init__(self, text: str):
        self.id = uuid.uuid4().hex
        self.text = text
        self.translated = ""
        self.t_final = time.monotonic()
        self.t_translated = 0.0
        self.t_tts_start = 0.0
        self.stt_ms = self.translation_ms = self.tts_ms = 0

class Interpreter(FrameProcessor):
    """Final transcript -> Sarvam Translate -> spoken by Bulbul TTS. Also emits browser events."""
    def __init__(self, d: Direction, http: aiohttp.ClientSession, transport, started_at: float, queue: asyncio.Queue):
        super().__init__()
        self.d, self.http, self.transport, self.t0, self.queue = d, http, transport, started_at, queue

    async def process_frame(self, frame: Frame, direction: FrameDirection):
        await super().process_frame(frame, direction)
        if not (isinstance(frame, TranscriptionFrame) and frame.text.strip()):
            return await self.push_frame(frame, direction)

        turn = Turn(frame.text.strip())
        turn.started_ms = int((turn.t_final - self.t0) * 1000)
        await self.transport.send_message(event(
            "transcript", turnId=turn.id, speaker=self.d.speaker, listener=self.d.listener,
            sourceLanguage=self.d.source_lang, text=turn.text))
        try:
            t = time.monotonic()
            turn.translated = await translate(self.http, turn.text, self.d.source_lang, self.d.target_lang)
            turn.translation_ms = int((time.monotonic() - t) * 1000)
        except Exception as e:
            logger.error(f"translate failed: {e}")
            await self.transport.send_message(event("error", turnId=turn.id, message="Translation failed"))
            return
        turn.t_translated = time.monotonic()
        await self.transport.send_message(event(
            "translation", turnId=turn.id, speaker=self.d.speaker, listener=self.d.listener,
            targetLanguage=self.d.target_lang, text=turn.translated))
        await self.queue.put(turn)
        await self.push_frame(TTSSpeakFrame(turn.translated, append_to_context=False))

class TTSTap(FrameProcessor):
    """Measures TTS time-to-first-audio and stores the finished turn."""
    def __init__(self, d: Direction, http, transport, queue: asyncio.Queue):
        super().__init__()
        self.d, self.http, self.transport, self.queue = d, http, transport, queue
        self.turn: Turn | None = None

    async def process_frame(self, frame: Frame, direction: FrameDirection):
        await super().process_frame(frame, direction)
        if isinstance(frame, TTSAudioRawFrame) and self.turn is None and not self.queue.empty():
            self.turn = self.queue.get_nowait()
            self.turn.t_tts_start = time.monotonic()
            self.turn.tts_ms = int((self.turn.t_tts_start - self.turn.t_translated) * 1000)
        elif isinstance(frame, TTSStoppedFrame) and self.turn:
            t, self.turn = self.turn, None
            total = int((time.monotonic() - t.t_final) * 1000)
            item = dict(speaker=self.d.speaker, listener=self.d.listener,
                        sourceLanguage=self.d.source_lang, targetLanguage=self.d.target_lang,
                        sourceText=t.text, translatedText=t.translated,
                        startedAtMs=t.started_ms, endedAtMs=int((time.monotonic() - self.t0_ref) * 1000) if hasattr(self, "t0_ref") else 0,
                        translationMs=t.translation_ms, ttsMs=t.tts_ms,
                        totalMs=t.translation_ms + t.tts_ms)
            asyncio.create_task(persist(self.http, self.d.call_id, item))
            await self.transport.send_message(event("metrics", turnId=t.id, translationMs=t.translation_ms,
                                                    ttsMs=t.tts_ms, totalMs=item["totalMs"]))
        await self.push_frame(frame, direction)

async def run_direction(d: Direction):
    """One Pipecat pipeline: speaker's audio in -> listener-specific interpreter track out."""
    t0 = time.monotonic()
    async with aiohttp.ClientSession() as http:
        transport = LiveKitTransport(
            url=os.environ["LIVEKIT_URL"], token=agent_token(d.room, d.agent_identity), room_name=d.room,
            params=LiveKitParams(audio_in_enabled=True, audio_out_enabled=True,
                                 audio_out_sample_rate=SAMPLE_RATE),
        )
        stt = SarvamSTTService(api_key=os.environ["SARVAM_API_KEY"],
            settings=SarvamSTTService.Settings(language=Language(d.source_lang), vad_signals=True))
        tts = SarvamHttpTTSService(api_key=os.environ["SARVAM_API_KEY"], aiohttp_session=http,
            sample_rate=SAMPLE_RATE, settings=SarvamHttpTTSService.Settings(language=Language(d.target_lang)))
        q: asyncio.Queue = asyncio.Queue()
        interp = Interpreter(d, http, transport, t0, q)
        tap = TTSTap(d, http, transport, q); tap.t0_ref = t0

        # Only listen to the intended speaker. Ignore the other human and the other interpreter track.
        @transport.event_handler("on_audio_track_subscribed")
        async def _sub(_t, participant_id):
            if participant_id != d.speaker:
                await transport.mute_participant(participant_id)

        @transport.event_handler("on_participant_disconnected")
        async def _left(_t, participant_id):
            if participant_id == d.speaker:
                await task.queue_frame(EndFrame())

        task = PipelineTask(Pipeline([transport.input(), stt, interp, tts, tap, transport.output()]),
                            params=PipelineParams(allow_interruptions=False))
        logger.info(f"[{d.room}] {d.speaker}({d.source_lang}) -> {d.listener}({d.target_lang}) as {d.agent_identity}")
        await PipelineRunner(handle_sigint=False).run(task)
