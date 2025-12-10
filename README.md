# Audient AI – Realtime English Transcription Demo

## 📘 Viva Preparation & Documentation
**Please read [IMPLEMENTATION_DETAILS.md](./IMPLEMENTATION_DETAILS.md) for a complete explanation of libraries, architecture, and feature implementations.**

## Requirements
- Node 18+
- Python 3.9+
- ffmpeg installed and on PATH (required by Whisper/PyDub)

## Backend (Flask + Whisper)
1) Create venv and install deps
   - cd backend
   - python -m venv .venv
   - .venv\Scripts\activate (Windows PowerShell)
   - pip install -r requirements.txt
2) Run the server
   - set WHISPER_MODEL=base (optional)
   - python app.py
   - Server runs at http://localhost:5000

## Frontend (Vite + React)
1) Install deps
   - npm install
2) Start dev server
   - npm run dev
   - App runs at http://localhost:3000

## Use the ASR Demo
- Open http://localhost:3000/asr
- Click Start Recording, speak English clearly, click Stop Recording
- The audio is sent to http://localhost:5000/transcribe and the transcribed text is displayed

## Notes
- Only single-speaker English transcription is intended for this demo
- Ensure your microphone permission is granted by the browser
- If Whisper errors on audio formats, ffmpeg is likely missing
