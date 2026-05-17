<div align="center">

```
╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║    ██████╗ ██╗   ██╗██████╗ ██╗███████╗███╗   ██╗████████╗   ║
║   ██╔══██╗██║   ██║██╔══██╗██║██╔════╝████╗  ██║╚══██╔══╝   ║
║   ███████║██║   ██║██║  ██║██║█████╗  ██╔██╗ ██║   ██║      ║
║   ██╔══██║██║   ██║██║  ██║██║██╔══╝  ██║╚██╗██║   ██║      ║
║   ██║  ██║╚██████╔╝██████╔╝██║███████╗██║ ╚████║   ██║      ║
║   ╚═╝  ╚═╝ ╚═════╝ ╚═════╝ ╚═╝╚══════╝╚═╝  ╚═══╝   ╚═╝      ║
║                                                               ║
║              A I   ·   M E D I C A L   ·   S Y S T E M       ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝
```

### *The doctor speaks. Audient listens. The record writes itself.*

<br/>

[![React](https://img.shields.io/badge/React_18-0d9488?style=for-the-badge&logo=react&logoColor=white)](https://reactjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-0891b2?style=for-the-badge&logo=typescript&logoColor=white)](https://typescriptlang.org)
[![Flask](https://img.shields.io/badge/Flask_3-0f766e?style=for-the-badge&logo=flask&logoColor=white)](https://flask.palletsprojects.com)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-0284c7?style=for-the-badge&logo=postgresql&logoColor=white)](https://supabase.com)
[![Groq](https://img.shields.io/badge/Groq_AI-06b6d4?style=for-the-badge&logo=openai&logoColor=white)](https://console.groq.com)
[![Docker](https://img.shields.io/badge/Docker-0369a1?style=for-the-badge&logo=docker&logoColor=white)](https://docker.com)

[![Build](https://img.shields.io/badge/build-passing-10b981?style=flat-square)](.)
[![Version](https://img.shields.io/badge/version-v1.0--final-0d9488?style=flat-square)](.)
[![FYP](https://img.shields.io/badge/FYP-IT22__OC__02-0891b2?style=flat-square)](.)
[![License](https://img.shields.io/badge/license-Academic-0f766e?style=flat-square)](.)

</div>

---

## What is Audient AI?

Clinicians spend **30–40% of their working time** on documentation instead of patients. Audient AI eliminates that burden entirely.

Start a session. Speak naturally. Walk away with a fully structured clinical record.

The system transcribes every word in real time, identifies who is the doctor and who is the patient, extracts seven clinical data fields automatically, flags anything missing, generates AI-powered clinical insights, and exports a professional PDF — all without the doctor writing a single note.

> **Built as a Final Year Project (FYP) — IT22\_OC\_02**

---

## Table of Contents

- [How It Works](#how-it-works)
- [Feature Overview](#feature-overview)
- [Technology Stack](#technology-stack)
- [Project Structure](#project-structure)
- [Quick Start](#quick-start)
- [Environment Variables](#environment-variables)
- [API Reference](#api-reference)
- [Deployment](#deployment)
- [Screenshots](#screenshots)
- [Contributing](#contributing)
- [Team](#team)

---

## How It Works

```
┌─────────────────────────────────────────────────────────────────────┐
│                     AUDIENT AI — LIVE PIPELINE                      │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Doctor + Patient speak                                             │
│       │                                                             │
│       ▼                                                             │
│  Browser MediaRecorder  ──── 500ms chunks ────► Socket.IO           │
│       │                                              │              │
│       │                           ┌─────────────────▼────────────┐ │
│       │                           │   Groq Whisper large-v3      │ │
│       │                           │   (every 4 seconds)          │ │
│       │                           └─────────────────┬────────────┘ │
│       │                                             │              │
│       │                           ┌─────────────────▼────────────┐ │
│       │                           │  Speaker Diarization         │ │
│       │                           │  Groq Llama-3.3-70b (text)   │ │
│       │                           │  + Pyannote audio (optional) │ │
│       │                           └─────────────────┬────────────┘ │
│       │                                             │              │
│       │                           ┌─────────────────▼────────────┐ │
│       │                           │  Medical Field Extraction    │ │
│       │                           │  Groq Llama-3.1-8b           │ │
│       │                           │  (name, age, disease, etc.)  │ │
│       │                           └─────────────────┬────────────┘ │
│       │                                             │              │
│       │                           ┌─────────────────▼────────────┐ │
│       │                           │  Supabase PostgreSQL         │ │
│       │                           │  Structured Clinical Record  │ │
│       │                           └─────────────────┬────────────┘ │
│       │                                             │              │
│       └─────────────────────────────────────────────▼────────────  │
│                            PDF Export + Approval                    │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

**Two recording modes:**
- **Live Session** — real-time streaming, transcript updates every 4 seconds
- **ASR Upload** — upload a pre-recorded audio file for batch processing

---

## Feature Overview

### Core Clinical Features

| Feature | Description |
|---|---|
| **Real-Time Transcription** | Browser mic streams to Groq Whisper large-v3 every 4 seconds via WebSocket |
| **Speaker Diarization** | Labels each line as `[DR]` Doctor or `[PT]` Patient — Groq LLM (always) + Pyannote.audio (optional) |
| **Medical Field Extraction** | Automatically extracts Name, Age, Gender, Disease, Education, Emotional State, Notes |
| **Field-Gap Alerts** | Three severity levels — Critical (red), Important (yellow), Optional (grey) — per missing field |
| **AI Clinical Recommendations** | One click generates differential diagnoses, suggested tests, treatment options, and risk flags |
| **Session Approval & Locking** | Approve a record to lock it; approved records are read-only for all non-admin users |
| **PDF / DOCX Export** | Formatted clinical document with transcript, summary, extracted fields, and doctor info |
| **Voice Commands** | Say "Audient, start recording" — wake-word detection with audio chime feedback (Chrome/Edge) |

### Patient & Session Management

| Feature | Description |
|---|---|
| **Patient EMR** | Full CRUD for patient records with auto-generated PAT-XXXX codes per clinician |
| **Session Linking** | Link any session to a patient via 300ms debounced autocomplete search |
| **Patient Thread** | View all sessions for one patient in chronological order |
| **Soft Deletion** | Sessions are never permanently deleted — `deleted_at` timestamp, admin-restorable |
| **Peer Consultation** | Request a Quick Opinion (4h), Formal Consult (48h), or Urgent Review (24h) from a colleague |
| **Session Sharing** | Grant read/comment/write access to a colleague with optional expiry |

### Platform & Administration

| Feature | Description |
|---|---|
| **Role-Based Access** | `healthcare` (clinician) and `admin` roles with route guards on frontend and backend |
| **Audit Trail** | Every sensitive action (approve, delete, restore, role change) logged to `audit_logs` |
| **Admin Panel** | Platform stats, user management, audit log viewer, and soft-delete restore |
| **Analytics Dashboard** | Completion rate, sessions by day, language distribution, top diseases |
| **Custom Templates** | Doctor-defined clinical note layouts with full version history |
| **Dark / Light Theme** | System-aware theme with user override |
| **Async Processing** | Celery + Redis handles post-session diarization, extraction, and email notifications |

---

## Technology Stack

### Frontend

| Technology | Version | Purpose |
|---|---|---|
| React | 18.3.1 | UI framework |
| TypeScript | 5.6 | Type safety |
| Vite | 5.4.9 | Build tool & dev server |
| Tailwind CSS | 3.4.13 | Utility-first styling |
| Framer Motion | 11.0 | Animations |
| Socket.IO Client | 4.8.3 | WebSocket real-time connection |
| Axios | 1.7.7 | HTTP client with auth interceptors |
| Recharts | — | Analytics charts |

### Backend

| Technology | Version | Purpose |
|---|---|---|
| Flask | 3.x | Web framework |
| Flask-SocketIO | 5.3.6+ | WebSocket server |
| SQLAlchemy | 2.x | ORM and database abstraction |
| PyJWT + bcrypt | 2.8.0+ | Authentication and password hashing |
| Celery | 5.3.0+ | Background task queue |
| Redis | 5.0.0+ | Task broker and rate limit store |
| Flask-Limiter | 4.0.0+ | API rate limiting |
| ReportLab | 4.0.0+ | PDF generation |
| Resend | 2.0.0+ | Email notifications |
| Gunicorn | — | Production WSGI server |

### AI & Machine Learning

| Model | Provider | Purpose |
|---|---|---|
| Whisper large-v3 | Groq API | Real-time speech-to-text |
| Llama-3.1-8b-instant | Groq API | Medical field extraction |
| Llama-3.3-70b-versatile | Groq API | Speaker diarization (text-based) |
| pyannote/speaker-diarization-3.1 | HuggingFace | Audio-based diarization (optional) |
| phi3:mini | Ollama (local) | Offline extraction fallback |
| Web Speech API | Browser (Chrome/Edge) | Voice command recognition |

### Infrastructure

| Component | Technology |
|---|---|
| Database | Supabase PostgreSQL (cloud-hosted, SSL enforced) |
| Containerization | Docker Compose |
| Reverse Proxy | Nginx |
| CI/CD | GitHub Actions (recommended) |

---


---

## Quick Start

### Prerequisites

| Requirement | Where to get it |
|---|---|
| Docker Desktop | [docker.com/products/docker-desktop](https://www.docker.com/products/docker-desktop/) |
| Groq API key (free) | [console.groq.com](https://console.groq.com) |
| Supabase project (free) | [supabase.com](https://supabase.com) — copy the Database Connection String |

---

### Option A — Docker Compose (Recommended)

```bash
# 1. Clone the repository
git clone https://github.com/MQ-06/audient-ai.git
cd audient-ai

# 2. Create the environment file
cp backend/.env.example backend/.env
#    Open backend/.env and fill in the three required values (see below)

# 3. Initialize the database (first time only)
docker compose run --rm backend python migrate.py

# 4. Start all services
docker compose up --build

# 5. Open in browser
#    Frontend  →  http://localhost:3000
#    API       →  http://localhost:5000
#    Health    →  http://localhost:5000/health
```

---

### Option B — Manual Setup (No Docker)

**Backend**

```bash
cd backend

# Create and activate virtual environment
python -m venv .venv
.venv\Scripts\activate          # Windows
source .venv/bin/activate       # macOS / Linux

pip install -r requirements.txt

cp .env.example .env            # Fill in required values

python migrate.py               # Create all database tables
python app.py                   # Start on http://localhost:5000
```

**Frontend**

```bash
cd frontend

npm install

# Optional: create frontend/.env with:
# VITE_API_URL=http://localhost:5000

npm run dev                     # Start on http://localhost:3000
```

---

### First-Time Admin Setup

After signing up through the UI, promote your account to admin via the Supabase SQL Editor:

```sql
UPDATE users SET role = 'admin' WHERE email = 'your@email.com';
```

---

## Environment Variables

### `backend/.env` — Required

```env
# ── DATABASE ───────────────────────────────────────────────────────
# Supabase: Project Settings → Database → Connection String → URI
DATABASE_URL=postgresql://postgres:<password>@db.<ref>.supabase.co:5432/postgres

# ── AI ─────────────────────────────────────────────────────────────
# Free at https://console.groq.com
GROQ_API_KEY=gsk_...

# ── SECURITY ───────────────────────────────────────────────────────
# Any random string, 32+ characters each
JWT_SECRET_KEY=your-random-jwt-secret-key
SECRET_KEY=your-random-flask-secret-key
```

### `backend/.env` — Optional Enhancements

```env
# ── TASK QUEUE (recommended for production) ────────────────────────
REDIS_URL=redis://localhost:6379/0

# ── SPEAKER DIARIZATION (audio-based, more accurate) ───────────────
# Accept model at: https://huggingface.co/pyannote/speaker-diarization-3.1
# Then: pip install pyannote.audio torch torchaudio
HF_TOKEN=hf_...

# ── OFFLINE FALLBACK (no internet required) ────────────────────────
# Requires Ollama running locally with phi3:mini pulled
OLLAMA_BASE_URL=http://localhost:11434/v1
OLLAMA_EXTRACT_MODEL=phi3:mini

# ── EMAIL NOTIFICATIONS ────────────────────────────────────────────
RESEND_API_KEY=re_...

# ── MODEL OVERRIDES ────────────────────────────────────────────────
GROQ_DIARIZE_MODEL=llama-3.3-70b-versatile
GROQ_EXTRACT_MODEL=llama-3.1-8b-instant

# ── SERVER ─────────────────────────────────────────────────────────
PORT=5000
FLASK_DEBUG=true
```

### `frontend/.env` (optional)

```env
VITE_API_URL=http://localhost:5000
```

---


## Deployment

### Localhost (Docker Compose)

```bash
docker compose up --build          # Start all services
docker compose down                # Stop all services
docker compose down -v             # Stop and remove volumes (fresh start)
docker compose logs -f backend     # Stream backend logs
```

Services started:

| Container | URL | Purpose |
|---|---|---|
| `audient-frontend` | http://localhost:3000 | React SPA |
| `audient-backend` | http://localhost:5000 | Flask API + Socket.IO |
| `audient-redis` | Internal port 6379 | Celery broker |
| `audient-worker` | — | Celery background worker |
| `audient-nginx` | http://localhost:80 | Reverse proxy |

---



## Screenshots

> *(Insert screenshots of the following pages in your final submission)*
---

## Contributing

This is a solo academic project. Contributions are welcome for learning or extension purposes.

1. Fork the repository
2. Create a feature branch

```bash
git checkout -b feature/your-feature-name
```

3. Commit using conventional commits

```bash
git commit -m "feat: describe what you added"
git commit -m "fix: describe what you fixed"
```

4. Open a Pull Request targeting `dev`

**Branches:**
- `main` → final production-ready code (tagged releases)
- `dev` → active development and feature merges

---

## Known Limitations

| Item | Status | Notes |
|---|---|---|
| Audio persistence | Not implemented | `AudioFile` model scaffolded; upload pipeline not built |
| Email password reset | Partial | Resend integrated for notifications, not for password reset |
| HIPAA / PDPA compliance | Not implemented | Supabase handles encryption at rest; app-layer controls not built |
| Voice commands | Chrome / Edge only | Web Speech API not available in Firefox or Safari |
| Pyannote diarization | Optional | Requires local GPU + HuggingFace token; Groq LLM fallback always works |

---

## Team

<div align="center">

| | |
|---|---|
| **Project** | Audient AI — AI-Powered Medical Consultation System |
| **Developer** | Muhammad Asif Abbas  |
| **GitHub** | github.com/masifabbas1090 |
| **Email** | masifabbas1090@gmail.com |
| **Supervisor** | Sir Adeel Nisar |
| **Institution** | Final Year Project — Information Technology |
| **Version** | v1.0-final |

</div>

---

## License

This project is developed as an academic Final Year Project. Not licensed for commercial use without explicit permission from the authors.

---

<div align="center">

*Built with purpose — because every minute a doctor spends writing is a minute not spent healing.*

[![React](https://img.shields.io/badge/React_18-0d9488?style=flat-square&logo=react&logoColor=white)](.)
[![Flask](https://img.shields.io/badge/Flask_3-0891b2?style=flat-square&logo=flask&logoColor=white)](.)
[![Groq](https://img.shields.io/badge/Groq_AI-06b6d4?style=flat-square&logo=openai&logoColor=white)](.)
[![Supabase](https://img.shields.io/badge/Supabase-0284c7?style=flat-square&logo=supabase&logoColor=white)](.)
[![Docker](https://img.shields.io/badge/Docker-0369a1?style=flat-square&logo=docker&logoColor=white)](.)

</div>
