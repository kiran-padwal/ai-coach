# Setup Guide

## Prerequisites

| Requirement | Notes |
|---|---|
| Node.js 18+ | `node --version` to check |
| Ollama | https://ollama.ai |
| Piper TTS | See below |
| React Native CLI | `npm install -g react-native-cli` |
| Android Studio / Xcode | For running the mobile app |
| iPhone + Mac or Android phone | Both on the same Wi-Fi |

---

## 1. Install Ollama

### Mac / Linux
```bash
curl https://ollama.ai/install.sh | sh
```

### Windows
Download and run the installer from https://ollama.ai/download

### Pull required models
```bash
ollama pull llava        # Vision model — sees your screen
ollama pull codellama    # Code assistant for text questions
```

> **RAM requirements:** LLaVA 7B needs ~8 GB, 13B needs ~16 GB.

---

## 2. Install Piper TTS

### Mac
```bash
brew install piper-tts

# Download voice model
mkdir -p ~/piper-voices
cd ~/piper-voices
curl -LO https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx
curl -LO https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx.json
```

### Linux
```bash
# Download the binary from https://github.com/rhasspy/piper/releases
# Extract and add to PATH
wget https://github.com/rhasspy/piper/releases/latest/download/piper_linux_x86_64.tar.gz
tar xzf piper_linux_x86_64.tar.gz
sudo mv piper /usr/local/bin/

mkdir -p ~/piper-voices
cd ~/piper-voices
wget https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx
wget https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx.json
```

### Windows
Download from https://github.com/rhasspy/piper/releases and add to your `PATH`.

---

## 3. Start the Backend

```bash
cd backend
npm install
npm start
```

The server starts on `http://localhost:8000`.

Verify it works:
```bash
curl http://localhost:8000/api/coach/health
```

Expected response:
```json
{"ok": true, "models": ["llava:latest", "codellama:latest"], "missing": []}
```

### Optional environment variables

Create `backend/.env` to override defaults:

```env
PORT=8000
OLLAMA_URL=http://localhost:11434
VISION_MODEL=llava
CHAT_MODEL=codellama
PIPER_EXECUTABLE=piper
PIPER_VOICE=/Users/you/piper-voices/en_US-lessac-medium.onnx
```

---

## 4. Set Up the Mobile App

### 4a. Initialise React Native project (first time only)

The `mobile/` folder contains only the source files. You need to initialise the native project once:

```bash
cd mobile
npx react-native init AICoach --version 0.73 --skip-install
# Copy src/, App.tsx, package.json over the generated files
npm install
```

Or, if you want to scaffold from scratch and copy the source files in:

```bash
npx react-native init AICoach --version 0.73
cp -r /path/to/this/repo/mobile/src AICoach/
cp /path/to/this/repo/mobile/App.tsx AICoach/
```

### 4b. Configure your laptop's IP

Edit `mobile/src/config.ts`:

```typescript
export const BACKEND_URL = 'http://192.168.1.XXX:8000';
```

Find your IP:

```bash
# Mac / Linux
ifconfig | grep "inet " | grep -v 127.0.0.1

# Windows
ipconfig
```

### 4c. iOS

```bash
cd mobile
bundle exec pod install --project-directory=ios   # or: cd ios && pod install
npx react-native run-ios
```

### 4d. Android

```bash
cd mobile
npx react-native run-android
```

---

## 5. Run Everything

1. `ollama serve` (usually starts automatically)
2. `cd backend && npm start`
3. Open the iPhone/Android app
4. Point camera at your laptop screen
5. Hold the mic button, ask a question
6. AI coach responds in text + voice

---

## Upgrading Models

```bash
# Swap to a bigger vision model
ollama pull llava:13b
# Then set VISION_MODEL=llava:13b in backend/.env
```
