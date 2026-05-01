# Audient-AI — Project Overview

A medical consultation recording and AI documentation platform. Doctors record sessions (live or single-take), the platform transcribes audio, diarizes speakers, extracts structured medical fields, and generates clinical notes + patient-facing summaries.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + TypeScript + Vite, Tailwind CSS, Framer Motion, Radix UI |
| Real-time | Socket.IO (client + server) |
| Backend | Flask (Python), Flask-SocketIO |
| Database | PostgreSQL via Supabase, SQLAlchemy ORM |
| Auth | JWT (access + refresh tokens, httpOnly cookies) |
| Transcription | Groq Whisper large-v3 |
| AI/Extraction | Groq llama-3.1-8b-instant (primary), Ollama phi3:mini (offline fallback) |
| Diarization | Pyannote.audio (audio-based, optional) or Groq LLM (text-based fallback) |
| Background Jobs | Celery + Redis |
| Email | Resend API |
| PDF | ReportLab |

---

## Features Done

### 1. Live Session Recording (WebSocket + Chunked Transcription)
Real-time recording where audio is streamed to the server every 4 seconds and transcribed as it arrives.

### 2. ASR Page (Single-File Upload)
Record the full consultation first, then upload once for transcription + extraction in a single request.

### 3. Speaker Diarization
Identifies who is speaking (Doctor vs Patient) in the transcript. Two paths: audio-based (Pyannote) or text-based (Groq LLM).

### 4. Medical Field Extraction
Extracts structured fields (name, age, gender, disease, emotional state, education, notes) from the transcript text using Groq LLM, with Ollama as an offline fallback.

### 5. Patient Management
Each patient gets a code (PAT-XXXX). Multiple sessions can be linked to one patient thread.

### 6. Consultations / Second Opinions
Doctors can request peer reviews on sessions. Three modes: quick_opinion (4h), formal_consult (48h), urgent (24h). Access is granted to the reviewer automatically.

### 7. Field Reminders
After extraction, automatically flags missing critical/important/optional fields so the doctor doesn't skip them.

### 8. Vocal Prompts (Hands-Free Voice Control)
Wake-word system — say "Audient [command]" to start/stop/pause/resume recording or generate a summary without touching the screen.

### 9. PDF Generation
Clinical notes PDF (for the doctor) and a plain-language patient-facing PDF. Customizable with doctor signature, clinic logo, and specialty styling.

### 10. Session Access / Sharing
Doctors can share sessions with colleagues at read/comment/write permission levels, with optional expiry.

### 11. Session Comments
Collaborative annotations on individual sessions, scoped per conversation.

### 12. Doctor Templates
Custom clinical and patient-facing templates with full version history. Each session locks the template version used, creating an audit trail.

### 13. Notifications
In-app notification system. Created when background processing completes.

### 14. Admin Panel
System stats, user management, audit log, and ability to restore soft-deleted sessions.

### 15. Follow-up Question Generation
After extraction, Groq generates 3-5 clinical follow-up questions relevant to the patient's case for the next visit.

### 16. Patient-Facing Summary
Plain-language summary generated for patients, separate from the clinical notes.

---

## Main Audit / Transcription Architecture

There are **two recording modes** with completely different pipelines.

---

### Mode 1 — Live Session (Chunk-by-Chunk via WebSocket)

This is the primary mode. Audio is streamed to the server in small windows while recording is still in progress.

#### Frontend Side (`useLiveSession` hook)
1. User clicks "Start" → `POST /api/session/start` → server creates a session and returns a `session_id`.
2. `MediaRecorder.start(timeslice=500ms)` is called on the selected microphone(s).
3. Every 500ms the browser emits an `ondataavailable` event. The hook accumulates these blobs.
4. Every **4 seconds** (CHUNK_MS=4000) a window blob (8 sub-chunks = 4s of audio) is assembled and emitted as a WebSocket event: `audio_chunk` with `{ session_id, audio (base64), is_final: false }`.
5. If dual-channel is enabled, the patient mic runs a parallel `MediaRecorder` and emits its own chunks tagged with a forced speaker label.
6. Every **60 seconds**, the accumulated transcript text is POSTed to `POST /api/extract` to show a live preview of extracted fields on screen.
7. Every **15 seconds**, a `request_diarize` WebSocket event is emitted to re-label speakers on the current segments.

#### Backend Side (`socket_handlers.py` — `handle_audio_chunk`)
1. Server receives `audio_chunk`. Base64 audio is decoded and saved to a temp WAV.
2. Silence detection: if the file is < 500 bytes, skip (no speech).
3. **Groq Whisper** transcribes the WAV file: `transcribe(audio_path, context=last_300_chars)`.
   - `context` carries the last 300 characters from the previous chunk so Whisper has continuity across chunks.
4. Segments are returned with start/end timestamps.
5. If `HF_TOKEN` is set, the chunk WAV is appended to a session-level accumulated WAV file (used later by Pyannote for full-session diarization).
6. If the chunk came from the patient mic (forced speaker), segments are labeled "Patient" directly without diarization.
7. Server emits `transcript_update` back to the client with the new segments.

#### Diarization during live session (`handle_request_diarize`)
- **Path 1 (Pyannote)**: Runs on the accumulated session WAV if `HF_TOKEN` is present. Gives audio-based speaker times → mapped to segments.
- **Path 2 (Groq LLM)**: Sends all transcript text to `llama-3.1-8b-instant` with a prompt asking it to infer Doctor vs Patient. Used when Pyannote is not available.
- Server emits `diarize_update` with relabeled segments.

#### Session Finalization
1. User clicks "Finish".
2. Frontend posts `POST /api/conversations/:id/complete` with `{ segments, language, duration }`.
3. Backend sets `Conversation.status = "processing"` and dispatches a **Celery background task**: `process_session_task(conversation_id)`.
4. Frontend polls `GET /api/conversations/:id/status` every few seconds until status flips to `complete`.

#### Background Task (`process_session_task` via Celery)
```
Phase 1 — Parallel (ThreadPoolExecutor, 2 workers):
  ├─ Full diarization (Pyannote on accumulated WAV or Groq LLM on full transcript)
  └─ Medical extraction + follow-up question generation

Phase 2 — Serial:
  ├─ Save TranscriptLines to database
  └─ Save Summary + extracted entities to database

Phase 3 — Parallel:
  ├─ Generate patient-facing plain-language summary
  └─ Generate 3-5 follow-up questions for next visit

Phase 4 — Serial:
  ├─ Generate FieldReminders (flag missing fields by severity)
  ├─ Mark Conversation.status = "complete"
  ├─ Create in-app Notification
  └─ Send email notification (if RESEND_API_KEY is configured)
```

---

### Mode 2 — ASR Page (Single Full File Upload)

Simpler path for when the doctor records everything first and processes afterwards.

1. User records the entire session. Audio stays in browser memory.
2. User clicks "Save & Extract".
3. `POST /api/transcribe` — sends the entire audio blob (multipart/form-data). Groq Whisper transcribes the full file in one call. Returns segments + detected language.
4. `POST /api/extract` — sends the full transcript text. Groq LLM extracts medical fields. Returns structured JSON.
5. `POST /api/conversations` — saves everything (segments, extraction, duration, language, title) to the database in a single request. No background task needed.
6. Frontend navigates to SessionDetailPage.

---

### Transcription Service (`services/whisper_service.py`)

Key behaviors of the Whisper integration:

- **Medical prompt biasing**: The Whisper `prompt` parameter is pre-filled with clinical terminology (drug names, conditions, anatomical terms) to steer recognition toward medical vocabulary.
- **Cross-chunk context**: The last 300 characters of the previous chunk's transcript are passed as context so Whisper doesn't start blind on each new chunk.
- **Language auto-detection**: If no language hint is given, Whisper detects it automatically and returns the detected language alongside segments.
- **Translation**: If `translate=True`, Whisper translates the audio to English during transcription (one step, not two).

---

### Extraction Service (`services/extract_service.py`)

- **Primary**: Groq `llama-3.1-8b-instant`. Prompt is specialty-aware (different prompts for cardiology vs psychiatry vs general MBBS etc.).
- **Fallback**: Ollama with `phi3:mini` if Groq is unavailable or the environment is fully offline.
- **Extracted fields**: `patient_name`, `patient_age`, `patient_gender`, `disease`, `education`, `emotional_state`, `additional_notes`, `follow_up_questions`.
- **Live preview**: During a live session the frontend calls `POST /api/extract` every 60 seconds so the doctor can see fields filling in while still recording.

---

### Diarization Service (`services/diarize_service.py`)

Two completely separate implementations:

| Method | Input | How | When |
|---|---|---|---|
| **Pyannote** (audio-based) | Accumulated session WAV | Speaker embedding model, returns speaker time segments | If `HF_TOKEN` set + torch installed |
| **Groq LLM** (text-based) | Full transcript text | LLM prompt: "assign Doctor/Patient to each line based on context" | Always available as fallback |

Pyannote output (time-based segments) is mapped onto Whisper segments by overlapping time ranges.

---

## Vocal Prompts System (`useVocalPrompts` hook)

Hands-free recording control using the browser's Web Speech API.

### Two-Phase State Machine
```
off ──[browser supports speech]──> watching
                                      │
                              [hears wake-word "Audient"]
                                      │
                                      ▼
                                  listening  ──[4s timeout]──> watching (error beep)
                                      │
                              [hears command]
                                      │
                                      ▼
                                  success ──[1.8s]──> watching (chime)
```

### Wake-Word Matching
- Accepted variants: "audient", "audience", "evident", "obvious", "audio", "audient ai", "audience ai"
- Levenshtein distance ≤ 2 for fuzzy matching (handles mishearings)

### Commands
| Command | Triggers | Action |
|---|---|---|
| `start` | "start", "begin", "record" | Start recording |
| `stop` | "stop", "end", "finish" | Stop recording |
| `pause` | "pause", "hold" | Pause recording |
| `resume` | "resume", "continue" | Resume recording |
| `generate_summary` | "summary", "generate", "extract" | Trigger extraction |

### Audio Feedback
- **Wake-word detected**: C5 → E5 → G5 ascending chime (AudioContext oscillators)
- **Command matched**: 880Hz + 1046Hz success beep
- **Timeout / no match**: 220Hz error beep
- **Voice confirmation**: Browser `SpeechSynthesis` API speaks the action back

### Fresh Instance Pattern
A new `SpeechRecognition` object is created after every `onend` event instead of restarting the same instance. This avoids a Chrome bug where the internal state accumulates silently and the recognizer stops firing events.

### Logging
Every phrase heard is logged: `POST /api/conversations/:id/vocal-commands` with `{ phrase_heard, confidence, command_matched, action_taken }`. Stored in `vocal_command_logs` table for audit.

---

## API Endpoints (All)

### Auth
| Method | Path | Purpose |
|---|---|---|
| POST | `/api/auth/register` | Create account |
| POST | `/api/auth/login` | Login, returns JWT + sets refresh cookie |
| POST | `/api/auth/refresh` | Refresh access token using httpOnly cookie |
| POST | `/api/auth/logout` | Revoke all refresh tokens |
| GET | `/api/auth/me` | Current user profile |
| POST | `/api/auth/reset-password` | Password reset |

### Transcription & Extraction
| Method | Path | Purpose |
|---|---|---|
| POST | `/api/transcribe` | Transcribe audio file via Groq Whisper (rate-limited 60/min) |
| POST | `/api/extract` | Extract medical fields from text via Groq LLM |

### Sessions
| Method | Path | Purpose |
|---|---|---|
| POST | `/api/session/start` | Create new live session, returns session_id |
| POST | `/api/session/diarize` | Run full-session speaker diarization |

### Conversations
| Method | Path | Purpose |
|---|---|---|
| GET | `/api/conversations` | List conversations (supports search by title) |
| POST | `/api/conversations` | Create conversation (ASR mode, full pipeline in-request) |
| GET | `/api/conversations/:id` | Get full conversation (transcript + summary + audio) |
| GET | `/api/conversations/:id/status` | Lightweight status poll for background task |
| PATCH | `/api/conversations/:id` | Update title or status |
| DELETE | `/api/conversations/:id` | Soft delete |
| POST | `/api/conversations/:id/complete` | Finalize live session, dispatch Celery task |
| POST | `/api/conversations/:id/audio` | Upload and store audio file |
| PATCH | `/api/conversations/:id/reminders/:rid/resolve` | Mark field reminder resolved |
| POST | `/api/conversations/:id/recommend` | Generate AI clinical insights |

### Patients
| Method | Path | Purpose |
|---|---|---|
| GET | `/api/patients` | List patients |
| POST | `/api/patients` | Create patient |
| GET | `/api/patients/:id` | Get patient with all sessions |
| PATCH | `/api/patients/:id` | Update patient |
| DELETE | `/api/patients/:id` | Delete patient |

### Access Control
| Method | Path | Purpose |
|---|---|---|
| GET | `/api/conversations/:id/access` | List who has access |
| POST | `/api/conversations/:id/access` | Grant access to colleague |
| DELETE | `/api/conversations/:id/access/:aid` | Revoke access |
| GET | `/api/conversations/shared-with-me` | Sessions shared with current user |

### Comments
| Method | Path | Purpose |
|---|---|---|
| GET | `/api/conversations/:id/comments` | List comments |
| POST | `/api/conversations/:id/comments` | Add comment |

### Vocal Command Logs
| Method | Path | Purpose |
|---|---|---|
| POST | `/api/conversations/:id/vocal-commands` | Log voice command |
| GET | `/api/conversations/:id/vocal-commands` | Get voice command history |

### Consultations
| Method | Path | Purpose |
|---|---|---|
| POST | `/api/consults` | Request consultation |
| GET | `/api/consults/inbox` | Received consultation requests |
| GET | `/api/consults/sent` | Sent consultation requests |
| GET | `/api/consults/inbox/count` | Unread inbox count |
| PATCH | `/api/consults/:id/respond` | Accept or decline request |
| PATCH | `/api/consults/:id/resolve` | Mark resolved |
| GET | `/api/consults/:id/briefing` | Get auto-generated briefing card |

### Templates
| Method | Path | Purpose |
|---|---|---|
| GET | `/api/templates` | List user templates |
| POST | `/api/templates` | Create template |
| GET | `/api/templates/:id/versions` | Version history |
| POST | `/api/templates/:id/versions` | Create new version |

### Notifications
| Method | Path | Purpose |
|---|---|---|
| GET | `/api/notifications` | List notifications |
| PATCH | `/api/notifications/:id` | Mark as read |

### Users
| Method | Path | Purpose |
|---|---|---|
| PATCH | `/api/users/me` | Update profile |
| GET | `/api/users/list` | Search users (for consultation requests) |

### Admin
| Method | Path | Purpose |
|---|---|---|
| GET | `/api/admin/stats` | System statistics |
| GET | `/api/admin/users` | List all users |
| GET | `/api/admin/users/:id` | Get user details |
| PATCH | `/api/admin/users/:id` | Update user |
| DELETE | `/api/admin/users/:id` | Delete user |
| GET | `/api/admin/audit-log` | Full audit trail |
| POST | `/api/admin/conversations/:id/restore` | Restore soft-deleted session |

### Health
| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` | Service status + config summary |

---

## Database Schema

### Core Tables

**`users`** — Doctor accounts
- `id`, `email`, `password_hash`, `role` (healthcare / admin)
- `specialty` (general_mbbs, cardiology, psychiatry, paediatrics, general_practice)
- `doctor_title`, `clinic_name`, `license_number`
- `signature_url`, `logo_url` (for PDF generation)
- `token_version` (for JWT invalidation on logout)

**`conversations`** — A recording session
- `id`, `user_id` (FK → users), `title`, `status` (processing / complete / failed / approved)
- `duration` (seconds), `language`
- `is_offline` (bool), `parent_id` (FK → self, for continuation sessions)
- `patient_id` (FK → patients)
- `template_version_id`, `patient_template_version_id` (locked at session creation for audit trail)
- `deleted_at` (soft delete), `approved_at`, `created_at`

**`audio_files`** — One per conversation
- `conversation_id`, `file_url`, `storage_type` (local / s3 / supabase), `format`, `size_mb`, `duration_seconds`

**`transcripts`** — One per conversation
- `conversation_id`, `raw_text`, `english_script`, `language_detected`, `confidence_score`

**`transcript_lines`** — Many per transcript (individual speaker turns)
- `transcript_id`, `speaker`, `text`, `start_time`, `end_time`, `line_order`

**`summaries`** — One per conversation
- `conversation_id`, `summary_text`, `extracted_entities` (JSON)
- Individual fields: `patient_name`, `patient_age`, `patient_gender`, `disease`, `education`, `emotional_state`, `additional_notes`
- `follow_up_questions` (JSON), `patient_facing_summary`
- `key_points` (JSON)

**`field_reminders`** — Many per summary
- `summary_id`, `field_name`, `severity` (critical / important / optional), `is_resolved`, `resolved_at`

**`patients`** — Doctor's patient list
- `patient_code` (PAT-XXXX, scoped per doctor), `name`, `age`, `gender`, `contact`, `medical_history`
- `created_by` (FK → users)

**`doctor_templates`** — Custom clinical / patient-facing templates
- `user_id`, `purpose` (clinical / patient_facing), `name`, `specialty_base`
- `schema_json`, `active_version_id`

**`doctor_template_versions`** — Template version history
- `template_id`, `version_number`, `schema_json`, `branding_snapshot_json`

**`session_access`** — Who can see a session
- `session_id`, `granted_by_id`, `grantee_id`, `permission` (read / comment / write), `expires_at`, `revoked_at`

**`session_comments`** — Annotations on sessions
- `session_id`, `author_id`, `body`, `created_at`

**`consult_requests`** — Doctor-to-doctor consultation
- `session_id`, `patient_thread_id`, `requester_id`, `reviewer_id`
- `mode` (quick_opinion / formal_consult / urgent)
- `access_id` (FK → session_access, auto-created)
- `status` (pending / accepted / declined / expired / resolved)
- `briefing_json` (snapshot of session data for reviewer)
- `expires_at` (auto-calculated from mode)

**`vocal_command_logs`** — Voice command audit trail
- `session_id`, `phrase_heard`, `confidence`, `command_matched`, `action_taken`, `triggered_at`

**`notifications`** — In-app notifications
- `user_id`, `type`, `payload_json`, `read_at`, `created_at`

**`audit_logs`** — Compliance audit trail
- `user_id`, `action`, `resource_type`, `resource_id`, `changes_json`, `created_at`

---

## Frontend Key Files

| File | Role |
|---|---|
| `src/hooks/useLiveSession.ts` | WebSocket connection, MediaRecorder management, chunked audio assembly, incremental extraction trigger |
| `src/hooks/useVocalPrompts.ts` | Wake-word detection, command matching, audio feedback, voice command logging |
| `src/hooks/useVoiceCommands.ts` | Simpler alternative voice control (continuous listen, basic pattern match) |
| `src/hooks/useMediaRecorder.ts` | Wraps browser MediaRecorder, handles permissions |
| `src/hooks/useAuth.ts` | JWT management, login/logout/refresh, token queue for race conditions |
| `src/lib/api.ts` | Axios instance with request interceptor (attach JWT), response interceptor (401 → refresh retry), request queue during refresh |
| `src/pages/LiveSessionPage.tsx` | Real-time recording UI, waveform, dual-channel selector, live extraction panel, vocal prompts indicator |
| `src/pages/ASRPage.tsx` | Record-then-upload workflow, full extraction form |
| `src/pages/SessionDetailPage.tsx` | View completed session, field reminders, PDF export, share, comments |
| `src/pages/PatientThreadPage.tsx` | All sessions for a patient, patient history |
| `src/pages/ConsultInboxPage.tsx` | Incoming consultation requests, accept/decline, briefing cards |

---

## AI Services Summary

| Service | Model | Used For | Availability |
|---|---|---|---|
| **Groq Whisper** | `whisper-large-v3` | Speech-to-text transcription | Online, free tier |
| **Groq LLM** | `llama-3.1-8b-instant` | Medical extraction, diarization, follow-up questions, patient summaries | Online, free tier |
| **Ollama** | `phi3:mini` | Medical extraction offline fallback | Local, no API key needed |
| **Pyannote** | `speaker-diarization-3.1` | Audio-based speaker diarization | Local, requires HuggingFace token + ~3GB model download |
| **Resend** | — | Email notifications | Online, free tier (3k/month) |
