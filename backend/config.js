require('dotenv').config();
const path = require('path');
const os = require('os');

module.exports = {
  PORT: process.env.PORT || 8000,

  // Groq API (set GROQ_API_KEY to use Groq instead of Ollama)
  GROQ_API_KEY: process.env.GROQ_API_KEY || '',

  // ElevenLabs TTS (Jarvis voice)
  ELEVENLABS_API_KEY: process.env.ELEVENLABS_API_KEY || '',

  // Ollama settings (fallback when no Groq key)
  OLLAMA_URL: process.env.OLLAMA_URL || 'http://localhost:11434',
  VISION_MODEL: process.env.VISION_MODEL || 'llava',
  CHAT_MODEL: process.env.CHAT_MODEL || 'llama3.2:1b',

  // Piper TTS settings
  PIPER_EXECUTABLE: process.env.PIPER_EXECUTABLE || 'piper',
  PIPER_VOICE: process.env.PIPER_VOICE ||
    path.join(os.homedir(), 'piper-voices', 'en_US-lessac-medium.onnx'),

  // Temp directory for audio files
  TEMP_DIR: path.resolve(process.env.TEMP_DIR || path.join(__dirname, 'temp')),

  // Request limits
  MAX_IMAGE_SIZE_MB: 10,
  REQUEST_TIMEOUT_MS: 120000, // 2 minutes for slow local models
};
