# Audient AI — Real-time Medical Transcription & AI Extraction Platform

> An offline-first, privacy-preserving AI platform for two-person medical conversations:  
> real-time speech-to-text, speaker diarization, and structured medical data extraction.

[![Frontend](https://img.shields.io/badge/frontend-React%2018%20%2B%20Vite-blue)]()
[![Backend](https://img.shields.io/badge/backend-Flask%20%2B%20Whisper-yellow)]()
[![Status](https://img.shields.io/badge/status-MVP%20%2F%20FYP-orange)]()
[![License](https://img.shields.io/badge/license-Academic%20FYP-lightgrey)]()

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Architecture](#2-architecture)
3. [Tech Stack](#3-tech-stack)
4. [Project Structure](#4-project-structure)
5. [Current State — What Is Built](#5-current-state--what-is-built)
6. [What Is Missing / Incomplete](#6-what-is-missing--incomplete)
7. [Known Issues & Tech Debt](#7-known-issues--tech-debt)
8. [Local Development Setup](#8-local-development-setup)
9. [Environment Variables](#9-environment-variables)
10. [API Reference](#10-api-reference)
11. [Roadmap — What to Build Next](#11-roadmap--what-to-build-next)
12. [Deployment](#12-deployment)
13. [Troubleshooting](#13-troubleshooting)

---

## 1. Project Overview

**Audient AI** is a medical transcription platform built as a Final Year Project (FYP). It solves the real clinical problem of manual note-taking during patient consultations — a task that consumes 30–40% of a clinician's time and introduces transcription errors.

### Core Value Proposition

| Capability | How |
|---|---|
| Two-person transcription from one mic | Speaker diarization via `pyannote.audio` |
| Any language → English | Whisper `task=translate` (offline) |
| Structured medical record extraction | Ollama (llama3.1, offline) or OpenAI |
| Fully offline, privacy-preserving | No audio ever leaves the machine |
| Real-time feedback during recording | 3-second audio chunking pipeline |

### Who It Is For

- **Clinicians** conducting patient intake interviews
- **Medical students** practicing consultations
- **Researchers** needing transcribed, structured interview data
- **Any domain** needing two-speaker diarized transcription (Legal, HR, Journalism)

---

## 2. Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────┐
│                    Browser (React SPA)                   │
│                                                          │
│  MediaRecorder API                                       │
│  └─ useMediaRecorder hook                                │
│      ├─ 3s audio chunks  ──────────────────────────────► │
│      └─ full blob (ASR)  ──────────────────────────────► │
│                          │              │                 │
│  UI State                │              │                 │
│  ├─ Transcript lines     │              │                 │
│  ├─ Speaker labels       │              │                 │
│  └─ Extracted fields     │              │                 │
└──────────────────────────┼──────────────┼─────────────────┘
                           │              │
                    POST /api/transcribe  │
                    POST /api/session/*   │
                                         ▼
┌────────────────────────────────────────────────────────────┐
│                  Flask Backend (Python)                     │
│                                                            │
│  /api/session/start  ──► create session WAV file           │
│  /api/transcribe     ──► faster-whisper (ASR + translate)  │
│                          append chunk to session WAV       │
│                          optional: pyannote diarize chunk  │
│  /api/session/diarize ─► pyannote on full session WAV      │
│                          match timestamps to segments      │
│  /api/extract        ──► Ollama llama3.1 (offline)         │
│                          or OpenAI GPT-4 (optional)        │
└────────────────────────────────────────────────────────────┘
```

### Live Session Data Flow (Step by Step)

```
1.  User clicks "Start"
    └─ POST /api/session/start  →  { session_id: "uuid" }
    └─ Frontend stores session_id

2.  Every 3 seconds (while recording):
    └─ takeChunk() extracts last 3s of audio as WebM blob
    └─ POST /api/transcribe  { file: webm, session_id, translate: true }
        ├─ Backend converts WebM → WAV (16kHz mono)
        ├─ Appends WAV chunk to session's accumulated WAV file
        ├─ Runs faster-whisper → returns segments (no speaker yet)
        └─ Frontend appends new lines to transcript

3.  Every 12 seconds (diarization polling):
    └─ POST /api/session/diarize  { session_id, segments: [...] }
        ├─ Backend runs pyannote.audio on full accumulated WAV
        ├─ Matches pyannote speaker turns to Whisper timestamps
        └─ Returns segments enriched with Speaker 1 / Speaker 2
    └─ Frontend updates speaker labels on transcript

4.  User clicks "Stop":
    └─ Remaining audio chunk is transcribed (final pass)
    └─ UI enters review state
```

### ASR Demo Data Flow

```
1.  User records (any duration)
2.  User clicks "Stop"
3.  Single blob uploaded to POST /api/transcribe { diarize: true }
    ├─ Whisper: full transcription with timestamps
    ├─ Pyannote: full diarization
    └─ Speaker labels applied via timestamp intersection
4.  POST /api/extract { text: full_transcript }
    └─ Ollama → structured JSON: Name, Age, Gender, Disease, etc.
5.  UI displays transcript + extracted fields side-by-side
```

---

## 3. Tech Stack

### Frontend

| Tool | Version | Purpose |
|---|---|---|
| React | 18.3.1 | UI framework |
| TypeScript | 5.6.2 | Type safety |
| Vite | 5.4.9 | Build tool + dev server |
| React Router DOM | 6.26.2 | Client-side routing |
| Tailwind CSS | 3.4.13 | Utility-first styling |
| Framer Motion | 11.0.0 | Animations and transitions |
| Axios | 1.7.7 | HTTP client |
| Lucide React | 0.462.0 | Icon library |
| Radix UI Slot | latest | Headless component primitives |

### Backend

| Tool | Purpose |
|---|---|
| Flask | Web framework and API server |
| faster-whisper | Quantized Whisper (int8) for fast offline ASR |
| pyannote.audio 3.1 | Speaker diarization (requires HF token) |
| torch + torchaudio | Tensor ops and audio loading |
| soundfile | WAV file I/O |
| Ollama (llama3.1) | Local LLM for medical data extraction |
| OpenAI SDK | Optional: GPT-4 for extraction (cloud fallback) |
| flask-cors | CORS headers for browser requests |
| python-dotenv | .env file loading |
| Gunicorn | Production WSGI server |

### Infrastructure

| Service | Purpose |
|---|---|
| Vercel | Frontend hosting (static SPA) |
| Render | Backend hosting (Python web service) |
| Hugging Face Hub | Model downloads (Whisper, Pyannote) |
| Ollama | Local LLM runtime (runs on user's machine) |

---

## 4. Project Structure

```
Audient-AI/
│
├── backend/
│   ├── app.py                  # Flask application — all routes, ASR, diarization, extraction
│   ├── requirements.txt        # Python dependencies
│   ├── .env.example            # Environment variable template
│   └── .gitignore
│
├── frontend/
│   ├── index.html              # HTML entry point
│   ├── package.json
│   ├── vite.config.ts          # Vite config (aliases, proxy)
│   ├── tailwind.config.js      # Theme: indigo palette, dark mode class strategy
│   ├── tsconfig.json
│   ├── postcss.config.js
│   │
│   └── src/
│       ├── main.tsx            # React root (StrictMode + BrowserRouter + ThemeProvider)
│       ├── App.tsx             # Route definitions
│       ├── styles.css          # Global Tailwind directives + CSS variables
│       │
│       ├── pages/
│       │   ├── LandingPage.tsx         # Marketing page — hero, features, use cases, CTA
│       │   ├── DashboardPage.tsx       # Session list — search bar, session cards (mock data)
│       │   ├── LiveSessionPage.tsx     # Two-person live transcription (full pipeline)
│       │   ├── ASRPage.tsx             # Single-session ASR + extraction demo
│       │   ├── SessionDetailPage.tsx   # Session transcript viewer (mock data)
│       │   ├── SettingsPage.tsx        # User preferences (theme works; language/privacy = UI only)
│       │   └── AnalyticsPage.tsx       # Usage metrics (static placeholder)
│       │
│       ├── components/
│       │   ├── providers/
│       │   │   └── ThemeProvider.tsx   # Dark/light mode context + localStorage persistence
│       │   ├── ui/
│       │   │   ├── Button.tsx          # Variants: primary, secondary, ghost, destructive + glow
│       │   │   ├── Card.tsx            # Card, CardHeader, CardContent
│       │   │   ├── Sidebar.tsx         # Navigation sidebar with theme toggle
│       │   │   └── Toaster.tsx         # Placeholder — returns null (not implemented)
│       │   └── visual/
│       │       └── Waveform.tsx        # Animated 24-bar waveform (active/idle states)
│       │
│       ├── hooks/
│       │   └── useMediaRecorder.ts     # Microphone recording: start/stop/pause/chunk extraction
│       │
│       ├── data/
│       │   └── mock.ts                 # Mock sessions, transcript lines, summaries
│       │
│       ├── shared/
│       │   └── Input.tsx               # Reusable input with focus ring
│       │
│       └── utils/
│           └── cn.ts                   # Class name concatenation utility
│
├── documentations/
│   └── D2_IT22_OC_02.pdf       # Academic project documentation
│
└── README.md                   # This file
```

---

## 5. Current State — What Is Built

### Backend (Flask + Python)

| Feature | Status | Notes |
|---|---|---|
| Health check endpoint | Done | `GET /health` returns mode + extraction availability |
| Session creation | Done | `POST /api/session/start` returns UUID, creates WAV file |
| Audio chunk transcription | Done | `POST /api/transcribe` — WebM → WAV → Whisper |
| Any language → English | Done | Whisper `task=translate` |
| Session audio accumulation | Done | Chunks appended to session WAV for full-session diarization |
| Two-person diarization (per chunk) | Done | Pyannote on individual chunks (ASRPage) |
| Two-person diarization (session-level) | Done | Pyannote on full accumulated WAV (LiveSessionPage polling) |
| Speaker label assignment | Done | Timestamp intersection matching Pyannote ↔ Whisper |
| Medical data extraction (Ollama) | Done | Offline LLM via llama3.1, structured JSON output |
| Medical data extraction (OpenAI) | Done | Optional fallback via GPT-4 |
| Silent/empty audio detection | Done | Prevents Whisper crashes on empty chunks |
| Graceful fallback (no HF token) | Done | Returns single "Speaker 1" if diarization unavailable |
| Graceful fallback (no Ollama) | Done | Returns `{skipped: true}` if Ollama not running |
| Debug logging | Done | `_debug_log()` writes timestamped logs to file |

### Frontend (React + TypeScript)

| Feature | Status | Notes |
|---|---|---|
| Landing page | Done | Hero, feature cards, use-case carousel, CTAs |
| Dashboard page | Done | Session cards, search bar UI (mock data) |
| Live session page | Done | Full real-time pipeline: record → chunk → transcribe → diarize |
| ASR demo page | Done | Record → transcribe → extract → display |
| Session detail page | Done | Transcript + summary display (mock data) |
| Settings page | Partial | Theme toggle works; language/privacy are UI only |
| Analytics page | Placeholder | Static mock numbers only |
| Dark / light mode | Done | Class-based Tailwind, localStorage persistence |
| Responsive layout | Done | Mobile, tablet, desktop |
| Animated waveform | Done | 24-bar CSS animation, active/idle states |
| Speaker-colored transcript | Done | Speaker 1 = indigo, Speaker 2 = emerald |
| Framer Motion transitions | Done | Page entry animations, card hovers |
| useMediaRecorder hook | Done | Chunk extraction, WebM encoding, permission error handling |
| ThemeProvider | Done | React context, useTheme hook |
| Button / Card / Input / Sidebar | Done | Reusable, variant-based components |

---

## 6. What Is Missing / Incomplete

These are the gaps between the current MVP and a production-grade system. They are listed in priority order.

### Priority 1 — Critical for Real Use

| Gap | Impact | Notes |
|---|---|---|
| **Database / persistence** | Sessions are lost on backend restart | No SQL or NoSQL integration; all data is in-memory or mock |
| **Session storage** | DashboardPage shows fake data | Sessions transcribed in Live/ASR are not saved anywhere |
| **Transcript storage** | Cannot retrieve past sessions | No schema for transcripts, speakers, or extracted fields |
| **Hardcoded paths (critical bug)** | Backend crashes on any machine except the developer's | `HF_HOME` and `FFMPEG_PATH` hardcoded to `E:/Asif/...` |
| **Cross-platform compatibility** | Backend is Windows-only right now | FFmpeg path detection needs `shutil.which()` |

### Priority 2 — Core Product Features

| Gap | Impact | Notes |
|---|---|---|
| **Summary generation** | LiveSessionPage sidebar is static placeholder | Need LLM-based summarization of the transcript (key facts, decisions, action items) |
| **Export (PDF / DOCX)** | Buttons exist, nothing happens on click | Need server-side document generation from transcript |
| **Toast notifications** | `Toaster` component returns null | No user feedback for errors, success states, or copy events |
| **Search** | Search bar in Dashboard is UI-only | Need full-text search across transcripts |
| **Session cleanup** | Audio chunks accumulate in `/temp` forever | Need background cleanup of old session WAV files |

### Priority 3 — Production Requirements

| Gap | Impact | Notes |
|---|---|---|
| **User authentication** | Anyone can access all sessions | No login, no user accounts, no session scoping |
| **Input validation** | API endpoints accept anything | No schema validation on incoming requests |
| **Rate limiting** | API is vulnerable to abuse | No throttling on transcription endpoint |
| **Analytics (real)** | Dashboard shows hardcoded `32 sessions` | Need aggregation over real stored sessions |
| **Settings persistence** | Language/privacy settings not saved | Need backend settings storage per user |
| **Error boundaries** | Unhandled React errors crash the page | Need React `ErrorBoundary` components |
| **Automated tests** | Zero test coverage | No unit, integration, or e2e tests |

---

## 7. Known Issues & Tech Debt

### Critical (fix before any real deployment)

```python
# backend/app.py — MUST be removed and replaced with env vars
HF_HOME = "E:/Asif/huggingface_cache"   # Line ~15
FFMPEG_PATH = "C:/ffmpeg/bin/ffmpeg.exe" # Line ~20
```

**Fix:**
```python
import shutil, os
HF_HOME = os.getenv("HF_HOME", os.path.expanduser("~/.cache/huggingface"))
FFMPEG_PATH = os.getenv("FFMPEG_PATH", shutil.which("ffmpeg") or "ffmpeg")
```

### Non-Critical

| Issue | Location | Fix |
|---|---|---|
| `pydub` in requirements but bypassed in code | `requirements.txt` | Remove `pydub` |
| Two duplicate Vite config files | `vite.config.ts` + `vite.config.js` | Remove the `.js` version |
| Excel file in frontend folder | `frontend/New Microsoft Excel Worksheet.xlsx` | Delete it |
| Env var naming inconsistency | `HF_TOKEN` vs `HUGGINGFACE_TOKEN` | Pick one, document it clearly |
| `Toaster` returns null | `components/ui/Toaster.tsx` | Implement or remove |
| No `ErrorBoundary` | App.tsx | Wrap routes |

---

## 8. Local Development Setup

### Prerequisites

- Node.js 18+
- Python 3.9–3.11 (not 3.13 — `pydub` has issues)
- [ffmpeg](https://ffmpeg.org/download.html) installed and on your `PATH`
- [Ollama](https://ollama.ai) running locally with `llama3.1` pulled (optional, for extraction)
- Hugging Face token with `pyannote/speaker-diarization-3.1` access (optional, for diarization)

### Backend

```bash
cd backend

# Create and activate virtual environment
python -m venv .venv
source .venv/bin/activate       # macOS / Linux
.venv\Scripts\activate          # Windows

# Install dependencies
pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Edit .env — set HF_TOKEN and OLLAMA_* as needed

# Run
python app.py
# → http://localhost:5000
```

### Frontend

```bash
cd frontend

npm install
npm run dev
# → http://localhost:3000
```

### Verify Setup

```bash
# Health check
curl http://localhost:5000/health
# Expected: {"status": "ok", "mode": "offline", "extraction_available": true}
```

---

## 9. Environment Variables

### Backend (`backend/.env`)

```env
# --- Hugging Face (for speaker diarization) ---
# Create token at https://huggingface.co/settings/tokens
# Accept model at https://huggingface.co/pyannote/speaker-diarization-3.1
HF_TOKEN=hf_xxxxxxxxxxxxxxxxxxxx

# --- Whisper model size ---
# Options: base (fast), small, medium, large-v3 (most accurate)
# base ≈ 15–30s/chunk on CPU. large-v3 ≈ 2min/chunk on CPU.
WHISPER_MODEL=base

# --- Ollama (for offline medical extraction) ---
OLLAMA_BASE_URL=http://localhost:11434/v1
OLLAMA_EXTRACT_MODEL=llama3.1

# --- Optional: OpenAI (cloud extraction fallback) ---
# OPENAI_API_KEY=sk-...

# --- HF model cache directory (leave blank to use default) ---
# HF_HOME=/path/to/cache

# --- Server ---
PORT=5000
```

### Frontend (`frontend/.env`)

```env
# Backend API URL
# Development:
VITE_API_URL=http://localhost:5000
# Production (Render URL):
# VITE_API_URL=https://your-backend.onrender.com
```

---

## 10. API Reference

### `GET /health`

Returns backend status and feature availability.

**Response:**
```json
{
  "status": "ok",
  "mode": "offline",
  "extraction_available": true
}
```

---

### `POST /api/session/start`

Creates a new live transcription session. The backend allocates a WAV file for audio accumulation.

**Response:**
```json
{ "session_id": "550e8400-e29b-41d4-a716-446655440000" }
```

---

### `POST /api/transcribe`

Transcribes an audio chunk. Optionally appends to a session's accumulated WAV and/or runs diarization.

**Request:** `multipart/form-data`

| Field | Type | Required | Description |
|---|---|---|---|
| `file` | binary | Yes | Audio blob (WebM or WAV) |
| `translate` | string `"true"/"false"` | No | Translate to English (default: true) |
| `diarize` | string `"true"/"false"` | No | Run per-chunk diarization |
| `session_id` | string | No | Session ID for audio accumulation |

**Response:**
```json
{
  "segments": [
    { "start": 0.0, "end": 2.4, "text": "Hello, how are you today?", "speaker": "Speaker 1" }
  ],
  "text": "Hello, how are you today?",
  "diarization_skipped": false
}
```

---

### `POST /api/session/diarize`

Runs full diarization on a session's accumulated audio and applies speaker labels to provided segments.

**Request:**
```json
{
  "session_id": "550e8400-...",
  "segments": [
    { "start": 0.0, "end": 2.4, "text": "Hello" },
    { "start": 2.5, "end": 5.1, "text": "I'm fine thanks" }
  ]
}
```

**Response:**
```json
{
  "segments": [
    { "start": 0.0, "end": 2.4, "text": "Hello", "speaker": "Speaker 1" },
    { "start": 2.5, "end": 5.1, "text": "I'm fine thanks", "speaker": "Speaker 2" }
  ]
}
```

---

### `POST /api/extract`

Extracts structured medical information from a transcript using Ollama (offline) or OpenAI.

**Request:**
```json
{ "text": "Patient John, 34 years old, presents with type 2 diabetes..." }
```

**Response (success):**
```json
{
  "Name": "John",
  "Age": "34",
  "Gender": "Male",
  "Disease": "Type 2 Diabetes",
  "Education": null,
  "EmotionalState": "Calm",
  "AdditionalNotes": "Follow-up in 3 months"
}
```

**Response (Ollama unavailable):**
```json
{ "skipped": true }
```

---

## 11. Roadmap — What to Build Next

This is the prioritized engineering roadmap. Each item includes what to build, why, and how.

---

### Phase 1 — Foundation (Fix Before Anything Else)

**Goal:** Make the existing codebase deployable and stable on any machine.

#### 1.1 Remove hardcoded paths

- **Files:** `backend/app.py` lines ~15–25
- **Action:** Replace `HF_HOME` and `FFMPEG_PATH` with env var reads + `shutil.which()` fallback
- **Why:** Backend crashes on any machine that isn't the original developer's Windows PC

#### 1.2 Add a database layer

- **Technology:** SQLite for local dev → PostgreSQL for production (via SQLAlchemy ORM)
- **Schema (minimum viable):**
  ```
  sessions       (id, title, created_at, duration_seconds, status)
  transcript_lines (id, session_id, speaker, text, start_time, end_time)
  extracted_fields (id, session_id, name, age, gender, disease, education, emotional_state, notes)
  ```
- **Why:** Every session is currently lost on backend restart. Nothing can be retrieved, searched, or exported.

#### 1.3 Wire up DashboardPage to real data

- **Action:** Replace `mock.ts` data with `GET /api/sessions` endpoint
- **Why:** Dashboard is completely fake right now

#### 1.4 Wire up SessionDetailPage to real data

- **Action:** Implement `GET /api/sessions/:id` returning transcript + extracted fields
- **Why:** Session detail page uses hardcoded mock transcript

---

### Phase 2 — Core Product Features

**Goal:** Complete the features that are partially built or missing.

#### 2.1 Session summarization

- **Where:** LiveSessionPage summary sidebar (currently static placeholder)
- **How:**
  - After session ends, send full transcript to `/api/summarize`
  - Backend: Ollama prompt → extract `{ essence, actionItems, decisions, keyEntities }`
  - Display structured summary in the sidebar
- **Why:** This is the core clinical value — structured notes from an unstructured conversation

#### 2.2 Export to PDF / DOCX

- **Where:** SessionDetailPage "Export PDF" and "Export DOCX" buttons
- **How:**
  - Backend: `POST /api/sessions/:id/export?format=pdf` using `reportlab` (PDF) or `python-docx` (DOCX)
  - Include: session title, date, speaker-labeled transcript, extracted fields, summary
- **Why:** Clinicians need to file records in existing systems

#### 2.3 Toast notification system

- **Where:** `components/ui/Toaster.tsx` (currently returns null)
- **How:** Implement a lightweight toast using React context + CSS transitions (no extra library needed)
- **Events to toast:** transcription error, extraction complete, export success, copy to clipboard

#### 2.4 Full-text search

- **Where:** DashboardPage search bar
- **How:** `GET /api/sessions?q=diabetes` → SQL `LIKE` or FTS on transcript text
- **Why:** Core navigation feature for any session-based tool

#### 2.5 Session cleanup (backend)

- **Where:** Backend `/temp` directory fills with audio WAV chunks
- **How:** Background thread or APScheduler job that deletes session WAVs older than 24 hours
- **Why:** Disk will fill up without this on any long-running deployment

---

### Phase 3 — Production Hardening

**Goal:** Make the system reliable, secure, and testable.

#### 3.1 Input validation

- **How:** Add request schema validation to all API endpoints using `marshmallow` or `pydantic`
- **Endpoints to validate:** `/api/transcribe`, `/api/extract`, `/api/session/diarize`
- **Why:** Currently any malformed request can cause a 500

#### 3.2 Rate limiting

- **How:** `flask-limiter` — limit `/api/transcribe` to e.g. 20 requests/minute per IP
- **Why:** Without this, a single client can overload the Whisper model

#### 3.3 React ErrorBoundary

- **How:** Wrap each page route in an `<ErrorBoundary>` in `App.tsx`
- **Why:** Any unhandled React render error currently crashes the whole SPA

#### 3.4 Settings persistence

- **How:** `PATCH /api/settings` → store in DB → return on `GET /api/settings`
- **Fields:** preferred language, dark mode, privacy mode

#### 3.5 Automated tests

- **Backend:** `pytest` + `httpx` — test each API endpoint with real and edge-case inputs
- **Frontend:** `vitest` + `@testing-library/react` — test `useMediaRecorder`, `ThemeProvider`, key page renders
- **Priority order:** `/api/transcribe`, `/api/extract`, `/api/session/diarize`

---

### Phase 4 — Authentication (if multi-user)

**Goal:** Support multiple clinicians with isolated session data.

#### 4.1 Auth system

- **Option A (Recommended for FYP):** Simple JWT auth — `POST /api/auth/login` returns a token, all other endpoints require `Authorization: Bearer <token>`
- **Option B (Production-grade):** Integrate Clerk or Supabase Auth
- **DB change:** Add `user_id` foreign key to `sessions` table
- **Why:** Without auth, all sessions are visible to all users

#### 4.2 Per-user session scoping

- **How:** All session queries filter by `user_id` from JWT claims
- **Dashboard:** Shows only the authenticated user's sessions

---

### Phase 5 — Advanced Features

**Goal:** Differentiate the product beyond basic transcription.

#### 5.1 Real analytics

- Replace `AnalyticsPage` placeholder with real aggregation queries:
  - Sessions per week/month
  - Average session duration
  - Most common diseases extracted
  - Speaker balance ratio (who talks more)

#### 5.2 Confidence scores

- Whisper returns per-segment confidence — surface this in the transcript UI
- Low-confidence segments highlighted in yellow for clinician review

#### 5.3 Multi-language UI

- Complete `SettingsPage` language selector
- i18n via `react-i18next` (Arabic, French, Sinhala as target languages)

#### 5.4 Waveform playback

- On SessionDetailPage, show the audio waveform and allow scrubbing
- Library: `wavesurfer.js` — renders waveform from stored audio file

#### 5.5 FHIR / HL7 export

- Export extracted fields as FHIR-compliant JSON (Patient resource, Condition resource)
- Enables direct integration with hospital EMR systems

---

### Summary Roadmap Table

| Phase | Priority | Effort | Impact |
|---|---|---|---|
| 1. Fix hardcoded paths | Critical | 1 hour | Blocks all deployments |
| 1. Database + persistence | Critical | 3–5 days | Blocks all real use |
| 1. Wire dashboard / detail to real data | High | 1–2 days | Completes core loop |
| 2. Summarization | High | 2–3 days | Core clinical value |
| 2. Export PDF/DOCX | High | 1–2 days | Clinician workflow |
| 2. Toast system | Medium | 0.5 days | UX polish |
| 2. Search | Medium | 1 day | Navigation |
| 2. Session cleanup | Medium | 0.5 days | Prevents disk issues |
| 3. Input validation | High | 1 day | Stability |
| 3. Rate limiting | Medium | 0.5 days | Security |
| 3. Error boundaries | Medium | 0.5 days | Stability |
| 3. Tests | High | 3–5 days | Confidence |
| 4. Authentication | High (if multi-user) | 3–4 days | Security |
| 5. Real analytics | Low | 2 days | Insights |
| 5. Confidence scores | Low | 1 day | Quality |
| 5. FHIR export | Low | 3 days | Integrations |

---

## 12. Deployment

### Frontend → Vercel

```bash
cd frontend
npm run build       # Outputs to dist/

# Set environment variable in Vercel dashboard:
# VITE_API_URL = https://your-backend.onrender.com
```

### Backend → Render

1. Create a new **Web Service** on Render
2. Connect GitHub repo, set root to `backend/`
3. Build command: `pip install -r requirements.txt`
4. Start command: `gunicorn app:app`
5. Add environment variables:
   - `HF_TOKEN`
   - `WHISPER_MODEL=base`
   - `OLLAMA_BASE_URL` (if using cloud Ollama)
   - `PORT=10000`

> **Note:** Pyannote and Whisper models are downloaded on first boot (~2–5GB). Render free tier will time out. Use at least the Starter plan ($7/month) or pre-cache models.

### Offline / Local-only Mode

Both services can run entirely on a local machine with no cloud dependencies:
- Whisper runs on CPU (no GPU required)
- Pyannote runs on CPU
- Ollama runs locally
- Zero data leaves the machine

---

## 13. Troubleshooting

| Problem | Cause | Fix |
|---|---|---|
| `Backend crashes on startup` | Hardcoded `HF_HOME` path doesn't exist | Set `HF_HOME` in `.env` to a valid path |
| `Microphone not working` | Browser requires HTTPS for mic access | Use `localhost` (allowed) or serve over HTTPS |
| `Transcription returns empty` | Silent audio or too-short chunk | Speak louder; min ~1 second of audio |
| `Speaker labels not showing` | `HF_TOKEN` not set | Set `HF_TOKEN` in `backend/.env` |
| `Extraction skipped` | Ollama not running | Run `ollama serve` and `ollama pull llama3.1` |
| `CORS error in browser` | Backend URL mismatch | Ensure `VITE_API_URL` matches running backend port |
| `ffmpeg not found` | ffmpeg not on PATH | Install ffmpeg and ensure it's accessible via `ffmpeg -version` |
| `pyannote model not found` | HF model not agreed to | Accept model license at huggingface.co/pyannote/speaker-diarization-3.1 |

---

## License

Academic project — Final Year Project (FYP). Not licensed for commercial use.

---

## Contributing

This is an academic project. For questions, open a GitHub issue or refer to the project documentation in `documentations/`.
