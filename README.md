# BhashaBridge

BhashaBridge is a two-person, real-time voice interpreter for English, Hindi, and Telugu. It uses LiveKit for WebRTC rooms, Pipecat for voice-agent orchestration, Sarvam AI for speech and language services, and PostgreSQL for durable conversation data.

## What it does

- Creates a private two-person voice room.
- Lets each participant choose what they speak and what they hear.
- Runs two directional Pipecat interpreter streams: User A to User B and User B to User A.
- Transcribes speech with Sarvam STT, translates with Sarvam Translate, and speaks the translation with Sarvam Bulbul TTS.
- Plays only the listener's intended interpreter audio track.
- Stores source text, translated text, speaker, listener, and latency in PostgreSQL.
- Provides a polished demo mode when LiveKit and Sarvam credentials are not configured.

## Architecture

```text
Browser A                 LiveKit Cloud                 Browser B
Hindi microphone  ->  Pipecat stream A-to-B  ->  Telugu interpreter audio
Telugu microphone ->  Pipecat stream B-to-A  ->  Hindi interpreter audio
                               |
                  Sarvam STT -> Translate -> Bulbul TTS
                               |
                         FastAPI -> PostgreSQL
```

LiveKit carries real-time media. Pipecat joins the LiveKit room as two AI participants, each dedicated to one listener. The web app attaches only the translated audio track for the current listener and keeps raw remote audio muted.

## Stack

| Layer | Technology |
| --- | --- |
| Web application | Next.js, TypeScript, LiveKit client, Lucide icons |
| API | FastAPI, SQLAlchemy async |
| Voice worker | Pipecat with LiveKit transport |
| Speech and language | Sarvam Saaras STT, Sarvam Translate, Bulbul TTS |
| Database | PostgreSQL 16 in Docker |
| Deployment | Docker Compose |

## Quick start

### 1. Prerequisites

- Docker Desktop
- A [LiveKit Cloud](https://cloud.livekit.io/) project
- A [Sarvam AI](https://dashboard.sarvam.ai/) API key

For a UI-only demo, Docker Desktop is enough. The application automatically uses demo mode when LiveKit credentials are blank.

### 2. Configure environment variables

Copy `.env.example` to `.env`, then fill in:

```text
LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=...
LIVEKIT_API_SECRET=...
SARVAM_API_KEY=...
POSTGRES_PASSWORD=use-a-strong-password
NEXT_PUBLIC_LIVEKIT_URL=wss://your-project.livekit.cloud
```

`NEXT_PUBLIC_LIVEKIT_URL` is safe to expose because it is only the WebRTC endpoint. Never expose `LIVEKIT_API_SECRET`, `SARVAM_API_KEY`, or PostgreSQL credentials to the web application.

### 3. Start all services

```bash
docker compose up --build
```

Open `http://localhost:3000`.

| Service | Local address |
| --- | --- |
| Web app | `http://localhost:3000` |
| API docs | `http://localhost:8000/docs` |
| Pipecat agent health | `http://localhost:8001/health` |
| PostgreSQL | `localhost:5432` |

## Using the app

1. Enter your name and your speaking/listening languages.
2. Create the voice room.
3. Copy the partner invitation from the call header and open it in another browser or device.
4. Allow microphone access for both participants.
5. Speak one turn at a time in the MVP.
6. End the call to save the transcript and generated summary.

In demo mode, the interface opens normally and displays sample Hindi/Telugu transcript turns without connecting to LiveKit or Sarvam.

## Deployment

This repository is container-ready. Deploy the four services as one Docker Compose application on a VM, or deploy them independently:

- `web`: any Next.js-compatible container host.
- `api`: a Python container host with a public HTTPS URL.
- `agent`: a Python container host able to make outbound connections to LiveKit and Sarvam.
- `db`: managed PostgreSQL is recommended in production; set `DATABASE_URL` to its asyncpg connection string.

For a single-server deployment:

```bash
docker compose -f docker-compose.yml up -d --build
```

Put a reverse proxy such as Caddy, Nginx, or Traefik in front of `web` and `api` for HTTPS. Set these production variables before deploying:

```text
DATABASE_URL=postgresql+asyncpg://user:password@managed-postgres-host:5432/bhashabridge
NEXT_PUBLIC_API_URL=https://api.your-domain.example
NEXT_PUBLIC_LIVEKIT_URL=wss://your-project.livekit.cloud
CORS_ORIGINS=https://your-domain.example
AGENT_URL=http://agent:8001
```

The API creates PostgreSQL tables on startup. For production schema evolution, add Alembic migrations before supporting multiple released versions.

## Project structure

```text
api/          FastAPI API, LiveKit token minting, PostgreSQL persistence
agent/        Pipecat plus Sarvam directional interpreter worker
web/          Next.js voice-room UI and demo mode
docker-compose.yml
PROJECT_SPECIFICATION.md
```

## API endpoints

| Method | Route | Purpose |
| --- | --- | --- |
| `POST` | `/v1/rooms` | Create a call and two LiveKit participant tokens |
| `GET` | `/v1/calls/{id}/join/{a|b}` | Fetch a role-specific join token |
| `POST` | `/v1/calls/{id}/start` | Mark the call active |
| `POST` | `/v1/calls/{id}/transcript-items` | Persist a completed interpreted turn |
| `GET` | `/v1/calls/{id}` | Fetch call, participants, and transcript |
| `POST` | `/v1/calls/{id}/end` | End the call and produce its summary |

## Technical notes

- The live translation path deliberately uses dedicated translation rather than a general-purpose LLM: `STT -> Translate -> TTS`. This makes short speech turns faster and less likely to include invented commentary.
- Post-call summaries are currently deterministic from the saved transcript, keeping the MVP within the agreed stack. A later version can use Sarvam's chat API for richer summaries.
- The application is built for turn-based interaction first. Full overlap handling, interruption cancellation, glossary management, and call analytics are the next engineering milestones.

## References

- [Pipecat LiveKit transport example](https://github.com/pipecat-ai/pipecat/blob/main/examples/transports/transports-livekit.py)
- [Sarvam API documentation](https://docs.sarvam.ai/)
- [LiveKit documentation](https://docs.livekit.io/)
