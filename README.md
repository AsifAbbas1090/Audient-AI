# Audient AI – Real-time Medical Transcription & AI Extraction

> **AI-powered speech-to-text with intelligent medical data extraction**

[![Deploy Status](https://img.shields.io/badge/status-ready-brightgreen)]()
[![Frontend](https://img.shields.io/badge/frontend-Vite%20%2B%20React-blue)]()
[![Backend](https://img.shields.io/badge/backend-Flask%20%2B%20Whisper-yellow)]()

---

## 🚀 Quick Start - Deployment

**Want to deploy this project?** Follow these guides:

1. **📋 [DEPLOYMENT_CHECKLIST.md](./DEPLOYMENT_CHECKLIST.md)** - Quick 15-minute checklist
2. **📖 [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md)** - Detailed step-by-step guide
3. **🏗️ [DEPLOYMENT_ARCHITECTURE.md](./DEPLOYMENT_ARCHITECTURE.md)** - Architecture & technical details

### Deployment Summary
- **Frontend**: Deploy to Vercel (5 minutes)
- **Backend**: Deploy to Render (10 minutes)
- **Total Time**: ~15 minutes
- **Cost**: Free tier available, ~$5-20/month for production

---

## 📘 Documentation

- **[IMPLEMENTATION_DETAILS.md](./IMPLEMENTATION_DETAILS.md)** - Complete technical documentation
- **[DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md)** - Production deployment guide
- **[DEPLOYMENT_ARCHITECTURE.md](./DEPLOYMENT_ARCHITECTURE.md)** - System architecture

---

## 🛠️ Local Development Setup

### Requirements
- Node.js 18+
- Python 3.9+
- ffmpeg (required by Whisper/WhisperX/PyDub)
- **Optional**: OpenAI API Key (only for medical data extraction)
- **Optional**: Hugging Face token (for two-person speaker diarization; one-time model agreement required)

### Backend Setup (Flask + Whisper)

```bash
# Navigate to backend folder
cd backend

# Create virtual environment
python -m venv .venv

# Activate virtual environment
.venv\Scripts\activate  # Windows PowerShell
# source .venv/bin/activate  # macOS/Linux

# Install dependencies
pip install -r requirements.txt

# Create .env file (copy from .env.example)
cp .env.example .env
# Edit .env: OPENAI_API_KEY optional (for extraction); HF_TOKEN optional (for two-person diarization)

# Run the server
python app.py
# Server runs at http://localhost:5000
```

### Frontend Setup (Vite + React)

```bash
# Navigate to frontend folder
cd frontend

# Install dependencies
npm install

# Start dev server
npm run dev
# App runs at http://localhost:3000
```

---

## 🎯 Features

- **🎤 Two-person, one-mic** - Speaker diarization (Speaker 1 / Speaker 2) from a single microphone
- **📝 Runtime transcription** - Live transcription every ~5 seconds while recording (chunked uploads)
- **🌐 Any language → English** - Voice in any language is transcribed and translated to English (offline via Whisper)
- **📡 Fully offline** - Transcription and diarization run locally (Whisper + WhisperX/pyannote); no cloud STT required
- **🤖 Optional AI extraction** - When `OPENAI_API_KEY` is set, GPT-4 extracts medical data (Name, Age, Disease, etc.); otherwise skipped
- **🎨 Modern UI** - Responsive interface with Tailwind CSS
- **📱 Mobile support** - Works on desktop and mobile browsers

---

## 🧪 Testing the Application

### Local Testing

1. **Start Backend**:
   ```bash
   cd backend
   python app.py
   ```

2. **Start Frontend** (in new terminal):
   ```bash
   cd frontend
   npm run dev
   ```

3. **Open Browser**:
   - Navigate to `http://localhost:3000`
   - **Live session (two-person, runtime)**: Click "Live" or "Start New Session" → Start, speak (any language); transcription updates every ~5s with Speaker 1 / Speaker 2. Requires `HF_TOKEN` in backend for diarization.
   - **ASR Demo**: Click "ASR Demo" → Start Recording, speak → Stop to see transcription (any language → English) and optional medical extraction if `OPENAI_API_KEY` is set.

### Test Health Endpoint

```bash
curl http://localhost:5000/health
# Should return: {"status": "ok"}
```

---

## 📁 Project Structure

```
Audient-AI/
├── frontend/              # React + Vite frontend
│   ├── src/
│   │   ├── components/   # UI components
│   │   ├── pages/        # Page components
│   │   ├── hooks/        # Custom React hooks
│   │   └── styles.css    # Global styles
│   ├── package.json
│   └── vite.config.ts
│
├── backend/              # Flask + Whisper backend
│   ├── app.py           # Main Flask application
│   ├── requirements.txt # Python dependencies
│   └── .env.example     # Environment variables template
│
├── DEPLOYMENT_GUIDE.md          # Deployment instructions
├── DEPLOYMENT_CHECKLIST.md      # Quick deployment checklist
├── DEPLOYMENT_ARCHITECTURE.md   # Architecture documentation
└── README.md                    # This file
```

---

## 🔧 Environment Variables

### Frontend (.env)
```env
VITE_API_URL=http://localhost:5000  # Backend URL
```

### Backend (.env)
```env
OPENAI_API_KEY=sk-...               # Optional: for medical data extraction (GPT-4)
HF_TOKEN=hf_...                     # Optional: for two-person diarization (accept pyannote model on Hugging Face first)
WHISPER_MODEL=base                  # base, small, medium, large-v2, or large-v3
PORT=5000                           # Server port
```

---

## 🐛 Troubleshooting

### Common Issues

**Microphone not working**
- Ensure browser has microphone permissions
- Check browser console for errors
- Try HTTPS (required for some browsers)

**Transcription fails**
- Verify backend is running (`http://localhost:5000/health`)
- Check ffmpeg is installed: `ffmpeg -version`
- Review backend logs for errors

**AI extraction not working**
- Extraction is optional; if no key is set, the app shows "Extraction unavailable."
- When using extraction: set `OPENAI_API_KEY` in backend `.env`, check OpenAI API credits and backend logs.

**Two-person diarization (Speaker 1 / Speaker 2) not working**
- Set `HF_TOKEN` (or `HUGGINGFACE_TOKEN`) in backend `.env`.
- Create a token at [Hugging Face](https://huggingface.co/settings/tokens) and accept the agreement for `pyannote/speaker-diarization` (or community) model. After first run, models are cached and work offline.

**CORS errors**
- Ensure backend is running on port 5000
- Check `flask-cors` is installed
- Verify API URLs don't have trailing slashes

---

## 📊 Technology Stack

### Frontend
- **React 18** - UI framework
- **Vite** - Build tool
- **TypeScript** - Type safety
- **Tailwind CSS** - Styling
- **Framer Motion** - Animations
- **Axios** - HTTP client

### Backend
- **Flask** - Web framework
- **OpenAI Whisper** - Speech-to-text (any language → English with `task=translate`)
- **WhisperX** - Diarization (Speaker 1 / Speaker 2) when `diarize=true`
- **GPT-4** - Optional medical extraction (when `OPENAI_API_KEY` set)
- **Flask-CORS** - CORS handling
- **Gunicorn** - Production server

---

## 📝 License

This project is for educational purposes as part of an FYP (Final Year Project).

---

## 🤝 Contributing

This is an academic project, but suggestions and feedback are welcome!

---

## 📞 Support

For deployment help, see:
- [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md)
- [DEPLOYMENT_CHECKLIST.md](./DEPLOYMENT_CHECKLIST.md)

For technical details, see:
- [IMPLEMENTATION_DETAILS.md](./IMPLEMENTATION_DETAILS.md)
- [DEPLOYMENT_ARCHITECTURE.md](./DEPLOYMENT_ARCHITECTURE.md)

---

