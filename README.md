# Audient AI — AI-Powered Medical Consultation System

An end-to-end clinical documentation platform. Doctors conduct consultations naturally while the system handles real-time transcription, speaker identification (Doctor vs Patient), structured data extraction, field-gap alerts, AI clinical recommendations, and record approval — eliminating manual note-taking.

[![Frontend](https://img.shields.io/badge/frontend-React%2018%20%2B%20Vite-blue)]()
[![Backend](https://img.shields.io/badge/backend-Flask%20%2B%20Groq-yellow)]()
[![DB](https://img.shields.io/badge/database-Supabase%20PostgreSQL-green)]()
[![Status](https://img.shields.io/badge/status-FYP%20MVP-orange)]()

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Tech Stack](#2-tech-stack)
3. [Architecture](#3-architecture)
4. [Features](#4-features)
5. [Audio & Data Storage](#5-audio--data-storage)
6. [PRD Compliance — Done vs Left](#6-prd-compliance--done-vs-left)
7. [Setup & Running](#7-setup--running)
8. [Environment Variables](#8-environment-variables)
9. [API Reference](#9-api-reference)
10. [Efficiency Enhancements](#10-efficiency-enhancements)

---

## 1. Project Overview

**Audient AI** is an AI-powered medical consultation platform built as a Final Year Project. It solves the real clinical problem of manual documentation — a task that consumes 30–40% of a clinician's time and introduces transcription errors.

The doctor starts a session, speaks naturally with their patient, and the platform handles everything: real-time transcription, speaker separation, medical data extraction, missing-field alerts, AI clinical recommendations, patient record linking, and final record approval.

**User roles:** `healthcare` (clinician) · `admin` (clinic administrator)

---

## 2. Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, Framer Motion |
| Backend | Flask 3, SQLAlchemy 2, PyJWT, bcrypt |
| Database | Supabase PostgreSQL |
| Transcription | Groq Whisper API (`whisper-large-v3`) |
| AI Extraction & Diarization | Groq LLM (`llama-3.1-8b-instant`) |
| Speaker Diarization (offline) | pyannote.audio 3.1 (optional — requires `HF_TOKEN`) |
| Offline Extraction Fallback | Ollama (`phi3:mini`) |
| Voice Commands | Web Speech API (Chrome / Edge only) |

---

## 3. Architecture

```
Browser (React SPA)
  │
  ├── MediaRecorder → 5s WebM chunks → POST /api/transcribe ─► Groq whisper-large-v3
  │                                                                    │
  ├── poll /api/session/diarize every 12s ◄── segments + labels ──────┘
  │
  ├── POST /api/conversations/:id/complete
  │       └── saves transcript → Groq extraction → field reminders
  │
  └── REST: sessions · patients · admin
              └── Flask → SQLAlchemy → Supabase PostgreSQL
```

**Audio lifecycle:**
```
Browser mic → MediaRecorder chunk (WebM)
  → POST multipart to /api/transcribe
      → saved as temp/<uuid>.webm
      → sent to Groq Whisper API
      → response returned
      → temp file deleted immediately   ← audio never persisted long-term
```

---

## 4. Features

### Authentication & Roles
- JWT-based auth (7-day tokens stored in `localStorage`)
- Two roles: `healthcare` and `admin` with route guards on both frontend and backend
- Register, login, logout, offline password reset (no email token — suitable for clinic-local deployments)
- Sessions recorded anonymously before login are auto-claimed when the user signs in

### Live Recording Session
- Browser `MediaRecorder` records in 5-second WebM chunks posted to `/api/transcribe`
- Transcript grows in real time as each chunk returns text
- Speaker diarization polls `/api/session/diarize` every 12 seconds and re-labels Doctor / Patient segments
- Waveform animation, recording duration timer, visual session state indicator

### Vocal Commands (Chrome / Edge)
- Web Speech API listens continuously while enabled
- Commands: **"start recording"**, **"stop recording"**, **"end session"**, **"pause"**, **"resume"**, **"clear"**
- Toggle button in session header with pulse animation; command flash pill on detection
- Gracefully disabled (no crash) on unsupported browsers

### Speaker Diarization
- **Online (default):** Groq LLM reads the full transcript and assigns `Doctor` / `Patient` labels
- **Offline (optional):** Set `HF_TOKEN` and install `pyannote.audio` for audio-based diarization — more accurate
- Frontend renders Doctor as `[DR]` and Patient as `[PT]` with distinct colours

### Automatic Data Extraction
After a session ends, the transcript is sent to Groq `llama-3.1-8b-instant` which extracts:
- Patient Name, Age, Gender
- Disease / Chief Complaint
- Education, Emotional State, Additional Notes

Extracted fields auto-fill the summary form on the Session Detail page.

### Field Alert Reminders
After saving a summary the backend checks for gaps and creates `FieldReminder` records at three severity levels:
- **Critical** — Name, Age, Gender, Disease
- **Important** — Symptoms, Medical history
- **Optional** — Education, Emotional state, Notes

Each alert can be individually dismissed.

### AI Clinical Recommendations
One-click button on Session Detail sends the transcript + summary to Groq and returns:
- Differential diagnosis
- Suggested diagnostic tests
- Treatment suggestions
- Follow-up notes
- Risk flags

Results are shown in a Clinical Insights card and are never auto-saved.

### Patient Management (EMR)
- Full CRUD for patient records (name, age, gender, contact, medical history)
- Link any conversation to an existing patient via 300ms debounced search dropdown
- Create a new patient record directly from the session detail page
- Linked patient name shown on session cards and in analytics

### Session Approval Workflow
- Status lifecycle: `processing → complete → approved`
- **Approve** locks the record and writes `approved_at` timestamp
- Approved records cannot be edited by regular users; admins can still modify
- Admin can soft-delete sessions (`deleted_at` timestamp); records are hidden but restorable

### Dashboard
- Session grid with live search and status filter pills (All / Complete / Approved / Processing / Failed)
- Stats row: total sessions, completed, average duration, this week count
- Skeleton loading states, empty state CTA

### Analytics
- Completion rate over time (area chart)
- Sessions by day of week (bar chart)
- Session status breakdown with counts and colour-coded badges
- Language distribution

### Admin Panel
- Platform-wide stats (users, conversations by status, soft-delete aware)
- User management: list, update role/process mode, delete accounts
- Audit log: last 50 events colour-coded by action (session created, approved, deleted, restored, role changed)
- Restore soft-deleted conversations

### Record & Extract (ASR Page)
- Upload a pre-recorded audio file (WAV, MP3, WebM, M4A)
- Transcription + diarization in one pass
- Extraction form auto-filled from result
- Download transcript as plain text

---

## 5. Audio & Data Storage

### Where does audio go?

| Stage | Location | Persisted? |
|---|---|---|
| Browser recording | Browser memory (MediaRecorder blob) | No |
| Each chunk upload | `backend/temp/<uuid>.webm` | Temp — deleted immediately after Groq returns |
| Session WAV accumulation | `backend/temp/sessions/<id>.wav` | No-op in online mode — file created but empty |
| Long-term audio storage | `audio_files` DB table (`file_url` column) | **Not implemented** — model scaffolded, upload pipeline not built |

**In plain terms: audio is never stored permanently in the current build.** It is transcribed on-the-fly and discarded. The `AudioFile` model and `file_url` column are ready for a future Supabase Storage / S3 integration.

### Where does structured data go?

| Data | Table | Notes |
|---|---|---|
| Session metadata | `conversations` | title, language, duration, status, soft-delete timestamp, patient FK |
| Full transcript | `transcripts` + `transcript_segments` | Speaker label, start/end timestamps per segment |
| Extracted summary | `summaries` | Name, Age, Gender, Disease, Education, EmotionalState, Notes |
| Field gap alerts | `field_reminders` | Severity, field name, resolved flag |
| Patient records | `patients` | Name, age, gender, contact, medical history |
| Audit events | `audit_logs` | Action, resource type, user, timestamp |
| Users | `users` | Name, email, password_hash, role, last_login_at |

All data lives in **Supabase PostgreSQL** with SSL. Nothing is stored locally on the server between requests.

---

## 6. PRD Compliance — Done vs Left

### Implemented

| PRD Feature | How |
|---|---|
| AI Vocal Prompts | Web Speech API — toggle button, pulse animation, command flash pill |
| Speaker Diarization | Groq LLM text-based (online) + pyannote.audio (offline optional) |
| Auto Data Extraction | Post-session Groq extraction, 7 structured fields |
| Inline Editing | Full inline editor on Session Detail page |
| Smart Field Alerts | FieldReminder model, 3 severity levels, per-field dismiss |
| Symptom Recommendations | Groq AI: differential diagnosis, tests, treatment, risk flags |
| EMR Patient Linking | Patient CRUD, search autocomplete, link/unlink from session |
| Patient Autocomplete | 300ms debounced search with dropdown |
| Soft Record Deletion | `deleted_at` timestamp, admin restore |
| Session Approval / Lock | `approved` status, `approved_at` timestamp, edit lock for non-admins |
| Audit Log | Key actions logged; visible in Admin panel |
| Role-Based Access Control | `healthcare` / `admin`, route guards frontend + backend |
| JWT Authentication | Register, login, logout, password reset, 7-day expiry |
| Session Ownership Linking | Orphaned sessions auto-claimed on login |

### Not Yet Implemented

| PRD Feature | Gap | Notes |
|---|---|---|
| Real-time field extraction during live session | Extraction runs post-session, not mid-conversation | Needs streaming + incremental NLP |
| Dedicated dual-channel microphone | Only single shared mic supported | Requires `getUserMedia` with `deviceId` + two MediaRecorder streams |
| Audio persistence (Supabase Storage / S3) | Audio deleted after transcription | `AudioFile` model ready; upload pipeline not built |
| Email-based password reset | Offline reset only (no verification email sent) | Needs an email provider (Resend, SendGrid) |
| HIPAA / PDPA compliance controls | No data residency, audit controls minimal | Supabase handles encryption at rest; app-layer controls not implemented |

---

## 7. Setup & Running

### Prerequisites

- Python 3.11+
- Node.js 18+
- A Supabase project (free tier works — grab the `DATABASE_URL` from Project Settings → Database)
- A Groq API key — free at [console.groq.com](https://console.groq.com)

### 1. Clone

```bash
git clone <repo-url>
cd Audient-AI
```

### 2. Backend

```bash
cd backend

python -m venv .venv
# Windows:
.venv\Scripts\activate
# macOS / Linux:
source .venv/bin/activate

pip install -r requirements.txt

# Create .env (see section 8 below)

python migrate.py     # creates all tables in Supabase
python app.py         # starts on http://localhost:5000
```

### 3. Frontend

```bash
cd frontend
npm install
npm run dev           # starts on http://localhost:5173
```

### 4. Verify

```bash
curl http://localhost:5000/health
# → { "status": "ok", "mode": "online", "groq": true }
```

---

## 8. Environment Variables

### `backend/.env`

```env
# Supabase PostgreSQL (Project Settings → Database → Connection string → URI)
DATABASE_URL=postgresql://postgres:<password>@db.<project-ref>.supabase.co:5432/postgres

# Groq API key — free at https://console.groq.com
GROQ_API_KEY=gsk_...

# JWT secrets — change both to random strings in production
JWT_SECRET_KEY=your-random-jwt-secret
SECRET_KEY=your-random-flask-secret

# Optional: pyannote audio-based diarization (more accurate than LLM text-based)
# Requires: pip install pyannote.audio torch torchaudio
# Accept model at: https://huggingface.co/pyannote/speaker-diarization-3.1
HF_TOKEN=hf_...

# Optional: offline LLM extraction fallback (no internet needed)
# Requires: Ollama running locally with phi3:mini pulled
OLLAMA_BASE_URL=http://localhost:11434/v1
OLLAMA_EXTRACT_MODEL=phi3:mini

# Server
PORT=5000
FLASK_DEBUG=true
```

### `frontend/.env` (optional — defaults to localhost:5000)

```env
VITE_API_URL=http://localhost:5000
```

---

## 9. API Reference

### Auth

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/register` | None | Create account |
| POST | `/api/auth/login` | None | Sign in, returns JWT + user |
| GET | `/api/auth/me` | Required | Current user from token |
| POST | `/api/auth/logout` | None | Client-side token discard |
| POST | `/api/auth/reset-password` | None | Offline password reset |

### Live Session

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/session/start` | Optional | Create session, returns `session_id` |
| POST | `/api/session/diarize` | None | Assign Doctor/Patient labels to segments |

### Transcription

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/transcribe` | None | Transcribe audio chunk via Groq Whisper |

### Conversations

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/conversations` | Required | List user's sessions |
| GET | `/api/conversations/:id` | Required | Session detail with transcript + summary |
| POST | `/api/conversations/:id/complete` | Required | Finalise session, trigger AI extraction |
| PATCH | `/api/conversations/:id` | Required | Update title / approve session |
| DELETE | `/api/conversations/:id` | Required | Soft delete |
| PUT | `/api/conversations/:id/summary` | Required | Save summary fields, generate reminders |
| PATCH | `/api/conversations/:id/reminders/:rid/resolve` | Required | Dismiss a field reminder |
| POST | `/api/conversations/:id/recommend` | Required | Generate AI clinical recommendations |
| PATCH | `/api/conversations/:id/patient` | Required | Link / unlink patient |

### Patients

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/patients` | Required | Search patients (`?q=name`) |
| POST | `/api/patients` | Required | Create patient |
| GET | `/api/patients/:id` | Required | Patient detail + recent sessions |
| PATCH | `/api/patients/:id` | Required | Update patient fields |
| DELETE | `/api/patients/:id` | Required | Delete patient |

### Admin (admin role only)

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/admin/stats` | Admin | Platform-wide statistics |
| GET | `/api/admin/users` | Admin | List all users |
| GET | `/api/admin/users/:id` | Admin | User detail |
| PATCH | `/api/admin/users/:id` | Admin | Update role / process mode |
| DELETE | `/api/admin/users/:id` | Admin | Delete user account |
| GET | `/api/admin/audit-log` | Admin | Recent audit events |
| POST | `/api/admin/conversations/:id/restore` | Admin | Restore soft-deleted session |

---

## 10. Efficiency Enhancements

### High Impact

**1. WebSocket live transcription**
Replace the 5-second HTTP chunk loop with a persistent WebSocket (`flask-sock`). Browser streams audio; server pushes transcript deltas back. Latency drops from ~5s to ~1s.

**2. Celery task queue**
Move the `/complete` pipeline (extract → diarize → generate reminders) to a Celery + Redis worker. The API returns `202 Accepted` immediately; frontend polls status. Prevents Groq timeout errors on long sessions.

**3. Audio persistence + playback**
Store each session's `.webm` to Supabase Storage (one extra API call in `transcribe_audio()`). The `AudioFile` model is already scaffolded. Add an audio player to Session Detail for doctor review.

### Medium Impact

**4. Refresh tokens**
Add short-lived access token (15 min) + long-lived refresh token in `httpOnly` cookie. Current 7-day JWT has no revocation mechanism.

**5. pyannote.audio diarization**
Set `HF_TOKEN` and `pip install pyannote.audio torch torchaudio`. The code already routes to pyannote automatically when the token is present. Produces much better Doctor/Patient separation than text-only LLM inference.

**6. Incremental extraction**
Call the extraction endpoint every 60 seconds during a live session (not just at end) and merge results. Fields populate while the patient is still talking.

### Low Impact / Polish

**7. PDF export** — `pdfkit` or `reportlab` backend endpoint; renders summary + transcript as a clinical note PDF.

**8. Rate limiting** — `Flask-Limiter`: 10 req/min on `/api/auth/login`, 60 req/min on `/api/transcribe`.

**9. Full-text search index** — PostgreSQL `tsvector` index on `conversations.title` and `patients.name` for fast search as data grows.

**10. Email notifications** — Integrate Resend or SendGrid for password-reset emails and optional "session approved" notifications.

---

## License

Academic project — Final Year Project (FYP). Not licensed for commercial use.
