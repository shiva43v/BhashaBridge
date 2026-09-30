# Architecture

Browser (Next.js) <-> LiveKit room <-> Pipecat agent (two pipelines per call) <-> Sarvam STT / Translate / Bulbul TTS.
FastAPI issues tokens and stores calls in PostgreSQL. The agent reports finished turns to the API over the private Docker network.

Per direction: `LiveKit input -> Sarvam STT (server VAD) -> Interpreter (Sarvam Translate + browser events) -> Sarvam Bulbul TTS -> TTSTap (metrics, persistence) -> LiveKit output`.

Deviation from the spec: Pipecat's LiveKit transport publishes a single fixed audio track name, so per-listener separation
uses two agent participants (`interp-for-user-a`, `interp-for-user-b`) instead of two track names on one participant.
