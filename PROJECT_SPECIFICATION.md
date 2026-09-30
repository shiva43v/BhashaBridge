# BhashaBridge: Project Specification

## 1. Project overview

BhashaBridge is a real-time, two-person voice interpretation application for English, Hindi, and Telugu. Each participant speaks in their preferred language and hears the other participant in their chosen listening language.

Example:

- User A speaks Hindi.
- User B speaks Telugu.
- User A says: `Mujhe kal doctor appointment book karni hai.`
- User B hears the Telugu interpretation.
- User B replies in Telugu.
- User A hears the Hindi interpretation.

The application also saves a bilingual transcript and produces an end-of-call summary with action items.

## 2. Goals

### MVP goals

- Support one-to-one voice conversations.
- Support English, Hindi, and Telugu.
- Translate Hindi <-> Telugu, English <-> Telugu, and English <-> Hindi.
- Deliver translated speech after each completed user turn.
- Show original and translated text in the browser.
- Store the transcript and a short summary when the call ends.

### Non-goals for version one

- Group calls with more than two people.
- Perfect simultaneous interpretation while both users speak.
- Telephone/SIP calls.
- Voice cloning.
- Authentication beyond a simple demo user or Supabase Auth.

## 3. Technology choices

| Concern | Technology | Responsibility |
| --- | --- | --- |
| Browser UI | Next.js + TypeScript | Join room, capture microphone, show transcript, play assigned translation audio |
| Realtime media | LiveKit Cloud | WebRTC room, participant audio tracks, access tokens |
| Voice-agent pipeline | Pipecat (Python) | VAD, turn handling, orchestration of STT, translation, and TTS |
| Speech to text | Sarvam streaming STT | Converts Hindi, Telugu, or English audio to source-language text |
| Translation | Sarvam Translate | Converts a completed source-language utterance to the listener's target language |
| Text to speech | Sarvam Bulbul TTS | Converts translated text into Hindi, Telugu, or English speech |
| Application API | FastAPI | Creates room tokens, starts agent sessions, saves/retrieves call records |
| Persistence | PostgreSQL in Docker | Calls, participant preferences, transcripts, translations, summaries |

Use Pipecat's LiveKit transport so the Pipecat agent joins a LiveKit room as an AI participant. Do not expose LiveKit, Sarvam, or Supabase service-role keys to the browser.

## 4. System architecture

```text
 User A web app                                      User B web app
 speak: Hindi                                        speak: Telugu
 hear: Telugu                                        hear: Hindi
      |                                                    |
      +------------------- LiveKit room -------------------+
                               |
                               v
                   Pipecat interpreter worker
                               |
              +----------------+----------------+
              |                                 |
              v                                 v
      User A speech pipeline             User B speech pipeline
      audio -> Sarvam STT                audio -> Sarvam STT
      Hindi transcript                   Telugu transcript
      -> Sarvam Translate                -> Sarvam Translate
      -> Telugu text                     -> Hindi text
      -> Sarvam Bulbul TTS               -> Sarvam Bulbul TTS
      -> track for User B                -> track for User A
              |                                 |
              +---------- LiveKit tracks --------+
                               |
                               v
                 FastAPI -> PostgreSQL
                 transcript, summary, metrics
```

## 5. Participant and audio-routing design

Each participant supplies these preferences before joining:

```json
{
  "displayName": "Ravi",
  "spokenLanguage": "hi-IN",
  "listeningLanguage": "te-IN"
}
```

Language codes:

- English: `en-IN`
- Hindi: `hi-IN`
- Telugu: `te-IN`

The agent keeps a profile for each LiveKit participant identity. When it receives an utterance from User A, it uses User B's `listeningLanguage` as the translation target.

Publish an individual translated audio track for each listener:

- `translation-for-user-a`
- `translation-for-user-b`

The frontend must subscribe only to the track intended for that participant and mute the other human participant's original remote audio. This prevents each user from hearing two languages at once.

## 6. Per-turn agent workflow

```text
1. Receive a participant's LiveKit audio track.
2. Use Pipecat voice activity detection to identify a completed speech turn.
3. Send the audio stream to Sarvam STT with the participant's expected language.
4. Receive final source transcript.
5. Store original transcript with timestamps and speaker identity.
6. Send source text to Sarvam Translate using the other participant's listening language.
7. Validate the translation:
   - preserve names, dates, numbers, money, phone numbers, and addresses
   - preserve medical, legal, or product terms when possible
   - do not add advice or explanations
8. Send translated text to Sarvam Bulbul TTS with the listener's target language.
9. Publish the synthesized audio on the listener-specific LiveKit track.
10. Send transcript and translation events to both browsers using LiveKit data messages.
11. Persist the final translation and latency metrics.
```

### Translation instruction

Use this behavior for the translation stage:

```text
Translate faithfully from the source language to the requested target language.
Return only the translation. Preserve personal names, dates, numbers, currency,
addresses, phone numbers, and specialized terms. Do not summarize, explain, or
add politeness not present in the source.
```

Sarvam Translate is the primary translation service. It is more suitable than a general-purpose LLM in the live path because translation needs predictable, faithful output and low latency.

## 7. API specification

### `POST /v1/rooms`

Creates a call record, a LiveKit room, and two participant tokens.

Request:

```json
{
  "participantA": {
    "displayName": "Ravi",
    "spokenLanguage": "hi-IN",
    "listeningLanguage": "te-IN"
  },
  "participantB": {
    "displayName": "Suresh",
    "spokenLanguage": "te-IN",
    "listeningLanguage": "hi-IN"
  }
}
```

Response:

```json
{
  "callId": "uuid",
  "roomName": "bb-uuid",
  "participants": [
    { "identity": "user-a", "token": "livekit-jwt" },
    { "identity": "user-b", "token": "livekit-jwt" }
  ]
}
```

### `POST /v1/calls/{callId}/end`

Marks a call complete, creates a basic bilingual summary from the stored transcript, and returns the saved call data.

### `GET /v1/calls/{callId}`

Returns participant language choices, transcript items, summary, and per-turn latency metrics.

## 8. Data model

### `calls`

| Field | Type | Notes |
| --- | --- | --- |
| `id` | UUID | Primary key |
| `room_name` | text | Unique LiveKit room name |
| `status` | text | `created`, `active`, `ended`, or `failed` |
| `started_at` | timestamp | Call start time |
| `ended_at` | timestamp | Call end time |
| `summary_english` | text | End-of-call summary |
| `summary_hindi` | text | Optional translated summary |
| `summary_telugu` | text | Optional translated summary |

### `participants`

| Field | Type | Notes |
| --- | --- | --- |
| `id` | UUID | Primary key |
| `call_id` | UUID | References `calls.id` |
| `livekit_identity` | text | LiveKit participant ID |
| `display_name` | text | User-selected name |
| `spoken_language` | text | `en-IN`, `hi-IN`, or `te-IN` |
| `listening_language` | text | `en-IN`, `hi-IN`, or `te-IN` |

### `transcript_items`

| Field | Type | Notes |
| --- | --- | --- |
| `id` | UUID | Primary key |
| `call_id` | UUID | References `calls.id` |
| `speaker_identity` | text | Speaker who created the utterance |
| `listener_identity` | text | Participant receiving the translation |
| `source_language` | text | Language of spoken audio |
| `target_language` | text | Language of translated audio |
| `source_text` | text | Final STT transcript |
| `translated_text` | text | Final translated text |
| `started_at_ms` | integer | Turn start relative to call |
| `ended_at_ms` | integer | Turn end relative to call |
| `stt_latency_ms` | integer | STT time |
| `translation_latency_ms` | integer | Translation time |
| `tts_latency_ms` | integer | TTS time |
| `total_latency_ms` | integer | End-to-end time |

## 9. Repository layout

```text
bhashabridge/
  web/
    app/
      page.tsx
      call/[callId]/page.tsx
    components/
      JoinForm.tsx
      CallControls.tsx
      TranscriptPanel.tsx
      TranslationAudio.tsx
    lib/
      livekit.ts
      api.ts
  agent/
    main.py
    pipeline.py
    participant_router.py
    sarvam_services.py
    transcript_events.py
  api/
    main.py
    routers/
      rooms.py
      calls.py
    services/
      livekit_tokens.py
      summary.py
      repository.py
  db/
    migrations/
  docs/
    architecture.md
    evaluation.md
    demo-script.md
```

## 10. Environment variables

Create a local `.env` file. Never commit it.

```text
LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=
LIVEKIT_API_SECRET=

SARVAM_API_KEY=

POSTGRES_DB=bhashabridge
POSTGRES_USER=bhasha
POSTGRES_PASSWORD=choose-a-local-password
DATABASE_URL=postgresql+asyncpg://bhasha:choose-a-local-password@db:5432/bhashabridge

NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_LIVEKIT_URL=wss://your-project.livekit.cloud
```

Only `NEXT_PUBLIC_*` values are allowed in the browser. Sarvam, LiveKit API secret, and PostgreSQL credentials must remain server-only.

## 11. Implementation phases

### Phase 1: Voice room

1. Create a LiveKit project or run LiveKit locally.
2. Create the Next.js join screen.
3. Create FastAPI endpoint that mints a LiveKit token.
4. Confirm two browser windows can join one room and hear each other.

Success condition: two users can talk through LiveKit without any AI.

### Phase 2: One-way interpreter

1. Add a Pipecat worker using `LiveKitTransport`.
2. Receive User A's audio.
3. Stream it through Sarvam STT.
4. Translate Hindi to Telugu with Sarvam Translate.
5. Generate Telugu speech using Sarvam Bulbul TTS.
6. Publish the result to a test output track.

Success condition: a Hindi sentence is heard as Telugu speech by User B.

### Phase 3: Two-way language routing

1. Load both participant language profiles.
2. Route each speaker to the other user's listening language.
3. Publish listener-specific tracks.
4. Add the browser-side subscription and original-audio muting rules.

Success condition: Hindi <-> Telugu works in both directions with no duplicate audio.

### Phase 4: Transcript and persistence

1. Send completed transcript events to both browsers.
2. Start the Dockerized PostgreSQL database; tables are created by the API service at startup.
3. Save source text, translation, speaker, timestamps, and latency.
4. Add a call-history screen.

Success condition: the full bilingual conversation remains available after reloading the page.

### Phase 5: Agent features and polish

1. Add a terminology glossary per call.
2. Add uncertainty handling for names, dates, and low-confidence speech.
3. Generate an end-of-call bilingual summary and action-item list.
4. Add metrics dashboard: median STT, translation, TTS, and total latency.

Success condition: a recorded demo clearly shows translation plus meaningful agent behavior.

## 12. Testing and evaluation

Prepare at least 20 spoken test utterances:

- 5 Hindi -> Telugu
- 5 Telugu -> Hindi
- 5 English -> Telugu
- 5 code-mixed Hindi-English or Telugu-English phrases

Include names, dates, prices, phone numbers, medical appointments, and local place names.

For every test record:

| Test ID | Spoken text | Expected meaning | Actual transcript | Actual translation | Total latency | Pass/Fail |
| --- | --- | --- | --- | --- | --- | --- |

Target metrics for the demo:

- A final translation should begin playing within roughly 2-4 seconds after a user finishes speaking.
- Names, numbers, and dates should be preserved in at least 18 out of 20 prepared tests.
- No listener should hear both the original remote speech and their translated speech.
- The transcript must identify the correct speaker.

## 13. Demo script

1. Open two browser windows and select Hindi for User A and Telugu for User B.
2. Show that both users join the same LiveKit room.
3. User A speaks Hindi about a doctor appointment.
4. Show Hindi original text and Telugu translated text appear in both UIs.
5. Let User B hear the Telugu synthesized speech.
6. User B replies in Telugu and User A receives Hindi speech.
7. End the call and show the bilingual transcript, summary, action items, and latency metrics.

## 14. Portfolio statement

Built BhashaBridge, a real-time Hindi, Telugu, and English voice interpreter using LiveKit, Pipecat, and Sarvam AI. Designed listener-specific translated audio tracks, low-latency STT -> translation -> TTS pipelines, bilingual transcript storage, and post-call action summaries.
