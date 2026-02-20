# AI Coach - 100% Free Local AI Coding Assistant

Personal AI coaching system that sees your screen through iPhone camera and provides real-time coding guidance.

## 🚀 Features

- 📱 iPhone camera sees your laptop screen
- 🤖 Local AI (LLaVA) analyzes what you're working on
- 🎤 Voice input - ask questions naturally
- 🔊 Voice output - AI coach talks back
- 💰 100% FREE - No API costs, runs locally
- 🔒 100% PRIVATE - Nothing leaves your laptop

## 💻 Tech Stack

**Backend (Node.js):**
- Express.js server
- Ollama (LLaVA vision model)
- Piper TTS (text-to-speech)

**Mobile (React Native):**
- React Native Camera
- Voice recognition
- Audio playback

## 📋 Prerequisites

- Node.js 18+ installed
- Ollama installed
- iPhone with camera
- Mac/Linux/Windows laptop (16GB RAM recommended)
- Both devices on same WiFi

## 🛠️ Setup

### 1. Install Ollama
```bash
# Mac/Linux
curl https://ollama.ai/install.sh | sh

# Download models
ollama pull llava
ollama pull codellama
```

### 2. Install Piper TTS
```bash
# Mac
brew install piper-tts

# Download voice model
mkdir -p ~/piper-voices
cd ~/piper-voices
wget https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx
wget https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx.json
```

### 3. Setup Backend
```bash
cd backend
npm install
npm start
```

Backend runs on `http://localhost:8000`

### 4. Setup Mobile App
```bash
cd mobile
npm install

# iOS
cd ios && pod install && cd ..
npx react-native run-ios

# Android
npx react-native run-android
```

### 5. Configure IP Address

Edit `mobile/src/config.ts`:
```typescript
export const BACKEND_URL = 'http://192.168.1.XXX:8000'; // Your laptop IP
```

Find your IP:
```bash
# Mac/Linux
ifconfig | grep "inet " | grep -v 127.0.0.1

# Windows
ipconfig
```

## 📱 Usage

1. Start backend: `cd backend && npm start`
2. Open iPhone app
3. Point camera at laptop screen
4. Hold voice button and ask questions
5. AI coach responds with guidance

## 💰 Cost

**Monthly:** $0  
**Setup time:** 2-3 hours  
**Savings vs paid APIs:** $200-500/month

## 🔧 Troubleshooting

See [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md)

## 📚 Documentation

- [Setup Guide](docs/SETUP.md)
- [Troubleshooting](docs/TROUBLESHOOTING.md)

## 📄 License

MIT License - Free for personal use

## 🤝 Contributing

This is a personal project, but feel free to fork and modify!

## ⭐ Support

If this helps you, give it a star on GitHub!