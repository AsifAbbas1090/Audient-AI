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

<br/>

**[▶ Watch Demo](https://drive.google.com/drive/folders/1pwymVvb0XccAb3O1VTZRP35NO0pCOolq)** &nbsp;·&nbsp; **[🌐 Live App](https://13.210.144.218/)**

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

**Frontend**

![React](https://img.shields.io/badge/React_18-0d9488?style=flat-square&logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript_5.6-0891b2?style=flat-square&logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite_5-0f766e?style=flat-square&logo=vite&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-0284c7?style=flat-square&logo=tailwindcss&logoColor=white)
![Framer Motion](https://img.shields.io/badge/Framer_Motion-06b6d4?style=flat-square&logo=framer&logoColor=white)
![Socket.IO](https://img.shields.io/badge/Socket.IO_4-0369a1?style=flat-square&logo=socketdotio&logoColor=white)
![Axios](https://img.shields.io/badge/Axios-0891b2?style=flat-square&logo=axios&logoColor=white)
![Recharts](https://img.shields.io/badge/Recharts-0d9488?style=flat-square&logo=chartdotjs&logoColor=white)

**Backend**

![Flask](https://img.shields.io/badge/Flask_3-0f766e?style=flat-square&logo=flask&logoColor=white)
![Python](https://img.shields.io/badge/Python_3.12-0284c7?style=flat-square&logo=python&logoColor=white)
![SQLAlchemy](https://img.shields.io/badge/SQLAlchemy_2-0d9488?style=flat-square&logo=sqlalchemy&logoColor=white)
![Celery](https://img.shields.io/badge/Celery_5-0891b2?style=flat-square&logo=celery&logoColor=white)
![Redis](https://img.shields.io/badge/Redis_7-06b6d4?style=flat-square&logo=redis&logoColor=white)
![JWT](https://img.shields.io/badge/PyJWT-0369a1?style=flat-square&logo=jsonwebtokens&logoColor=white)
![ReportLab](https://img.shields.io/badge/ReportLab-0f766e?style=flat-square&logo=adobeacrobatreader&logoColor=white)
![Gunicorn](https://img.shields.io/badge/Gunicorn-0284c7?style=flat-square&logo=gunicorn&logoColor=white)

**AI & Machine Learning**

![Groq Whisper](https://img.shields.io/badge/Whisper_large--v3-06b6d4?style=flat-square&logo=openai&logoColor=white)
![Llama 3.1](https://img.shields.io/badge/Llama_3.1_8b-0d9488?style=flat-square&logo=meta&logoColor=white)
![Llama 3.3](https://img.shields.io/badge/Llama_3.3_70b-0891b2?style=flat-square&logo=meta&logoColor=white)
![Pyannote](https://img.shields.io/badge/Pyannote_Audio-0284c7?style=flat-square&logo=huggingface&logoColor=white)
![Ollama](https://img.shields.io/badge/Ollama_phi3:mini-0f766e?style=flat-square&logo=ollama&logoColor=white)
![Web Speech API](https://img.shields.io/badge/Web_Speech_API-06b6d4?style=flat-square&logo=googlechrome&logoColor=white)

**Infrastructure**

![PostgreSQL](https://img.shields.io/badge/Supabase_PostgreSQL-0369a1?style=flat-square&logo=postgresql&logoColor=white)
![Docker](https://img.shields.io/badge/Docker_Compose-0284c7?style=flat-square&logo=docker&logoColor=white)
![Nginx](https://img.shields.io/badge/Nginx-0d9488?style=flat-square&logo=nginx&logoColor=white)
![AWS EC2](https://img.shields.io/badge/AWS_EC2-0891b2?style=flat-square&logo=amazonec2&logoColor=white)

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
git clone https://github.com/AsifAbbas1090/Audient-AI.git
cd Audient-AI

# 2. Create the environment file
cp backend/.env.example backend/.env
#    Open backend/.env and fill in the three required values (see below)

# 3. Initialize the database (first time only)
docker compose run --rm backend python migrate.py

# 4. Start all services
docker compose up --build

# 5. Open in browser
#    Frontend  →  http://localhost:80
#    API       →  http://localhost:5000
#    Health    →  http://localhost:5000/health
```

---

### Option B — Manual Setup (No Docker)

**Backend**

```bash
cd backend

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

## Environment Variables

### `backend/.env` — Required

```env
# ── DATABASE ───────────────────────────────────────────────────────
DATABASE_URL=postgresql://postgres:<password>@db.<ref>.supabase.co:5432/postgres

# ── AI ─────────────────────────────────────────────────────────────
GROQ_API_KEY=gsk_...

# ── SECURITY ───────────────────────────────────────────────────────
JWT_SECRET_KEY=your-random-jwt-secret-key
SECRET_KEY=your-random-flask-secret-key
```

### `backend/.env` — Optional Enhancements

```env
REDIS_URL=redis://localhost:6379/0

HF_TOKEN=hf_...                          # Pyannote speaker diarization

OLLAMA_BASE_URL=http://localhost:11434/v1 # Offline fallback
OLLAMA_EXTRACT_MODEL=phi3:mini

RESEND_API_KEY=re_...                    # Email notifications

GROQ_DIARIZE_MODEL=llama-3.3-70b-versatile
GROQ_EXTRACT_MODEL=llama-3.1-8b-instant

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

| Container | URL | Purpose |
|---|---|---|
| `audient-frontend` | http://localhost:80 | React SPA served by Nginx |
| `audient-backend` | Internal port 5000 | Flask API + Socket.IO |
| `audient-redis` | Internal port 6379 | Celery broker |
| `audient-worker` | — | Celery background worker |

### AWS EC2 (Production)

The live deployment runs on AWS EC2 (Ubuntu) using Docker Compose behind Nginx (inside the `web` container).

```bash
# On the EC2 instance — one command deploys everything
./deploy.sh
```

`deploy.sh` runs: `git pull` → `docker compose down` → `docker compose build --no-cache` → `python migrate.py` → `docker compose up -d` → health check.

> **Live at → [https://13.210.144.218/](https://13.210.144.218/)**

---

## Screenshots

<table>
<tr>
<td align="center" width="50%">

**Landing Page**
![Landing Page](screenshots/Screenshot%202026-05-18%20011701.png)

</td>
<td align="center" width="50%">

**Live Session Recording**
![Live Session](screenshots/Screenshot%202026-05-18%20011318.png)

</td>
</tr>
<tr>
<td align="center" width="50%">

**Consultation — Transcript + Medical Extraction**
![Consultation View](screenshots/Screenshot%202026-05-18%20010947.png)

</td>
<td align="center" width="50%">

**Analytics Dashboard**
![Analytics](screenshots/Screenshot%202026-05-18%20011630.png)

</td>
</tr>
<tr>
<td align="center" width="50%">

**Template Builder**
![Templates](screenshots/Screenshot%202026-05-18%20011610.png)

</td>
<td align="center" width="50%">

**Admin Dashboard**
![Admin Panel](screenshots/Screenshot%202026-05-18%20010138.png)

</td>
</tr>
<tr>
<td align="center" width="50%">

**Registration**
![Registration](screenshots/Screenshot%202026-05-18%20010407.png)

</td>
<td align="center" width="50%">

**User Management**
![Users](screenshots/Screenshot%202026-05-18%20010149.png)

</td>
</tr>
</table>

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
- `main` → production-ready code (tagged releases)
- `dev` → active development and feature merges

---

## Team

<div align="center">

| | |
|---|---|
| **Project** | Audient AI — AI-Powered Medical Consultation System |
| **Developer** | Muhammad Asif Abbas |
| **GitHub** | [github.com/AsifAbbas1090](https://github.com/AsifAbbas1090) |
| **Email** | masifabbas1090@gmail.com |
| **Supervisor** | Sir Adeel Nisar |
| **Institution** | Final Year Project — Information Technology |
| **Version** | v1.0-final |

</div>

---

## License

This project is developed as an academic Final Year Project. Not licensed for commercial use without explicit permission from the author.

---

<div align="center">

*Built with purpose — because every minute a doctor spends writing is a minute not spent healing.*

[![React](https://img.shields.io/badge/React_18-0d9488?style=flat-square&logo=react&logoColor=white)](.)
[![Flask](https://img.shields.io/badge/Flask_3-0891b2?style=flat-square&logo=flask&logoColor=white)](.)
[![Groq](https://img.shields.io/badge/Groq_AI-06b6d4?style=flat-square&logo=openai&logoColor=white)](.)
[![Supabase](https://img.shields.io/badge/Supabase-0284c7?style=flat-square&logo=supabase&logoColor=white)](.)
[![Docker](https://img.shields.io/badge/Docker-0369a1?style=flat-square&logo=docker&logoColor=white)](.)

</div>
