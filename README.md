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
- ffmpeg (required by Whisper/PyDub)
- OpenAI API Key

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
# Edit .env and add your OPENAI_API_KEY

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

- **🎤 Real-time Audio Recording** - Browser-based audio capture
- **📝 Speech-to-Text** - OpenAI Whisper for accurate transcription
- **🤖 AI Extraction** - GPT-4 powered medical data extraction
- **📊 Structured Output** - Extracts Name, Age, Gender, Disease, Emotional State, etc.
- **🎨 Modern UI** - Beautiful, responsive interface with Tailwind CSS
- **📱 Mobile Support** - Works on desktop and mobile browsers

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
   - Click on "Live English Transcription"
   - Click "Start Recording" and speak
   - Click "Stop Recording" to see transcription and AI extraction

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
OPENAI_API_KEY=sk-...              # Your OpenAI API key
WHISPER_MODEL=base                  # base, small, medium, or large-v3
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
- Verify `OPENAI_API_KEY` is set in backend `.env`
- Check OpenAI API credits
- Review backend logs for API errors

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
- **OpenAI Whisper** - Speech-to-text
- **GPT-4** - AI extraction
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

**Made with ❤️ for FYP Project**
