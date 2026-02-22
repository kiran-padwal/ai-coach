const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const config = require('../config');
const ollama = require('../services/ollama');
const groq = require('../services/groq');
const tts = require('../services/tts');
const logger = require('../utils/logger');

// Use Groq if API key is configured, otherwise fall back to local Ollama
const ai = config.GROQ_API_KEY ? groq : ollama;

/**
 * Crop image to the center 75% width × 70% height.
 * This removes edges where other monitors / windows appear.
 * Returns the path to the cropped image (overwrites original).
 */
async function cropToFocus(imagePath) {
  const meta = await sharp(imagePath).metadata();
  const { width, height } = meta;

  const cropW = Math.round(width * 0.85);
  const cropH = Math.round(height * 0.80);
  const left  = Math.round((width  - cropW) / 2);
  const top   = Math.round((height - cropH) / 2);

  const croppedPath = imagePath.replace(/(\.\w+)$/, '_crop$1');
  await sharp(imagePath)
    .extract({ left, top, width: cropW, height: cropH })
    .toFile(croppedPath);

  fs.unlink(imagePath, () => {}); // delete original
  return croppedPath;
}

const router = express.Router();

// Store uploads in the temp directory, keep original extension
const storage = multer.diskStorage({
  destination: config.TEMP_DIR,
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `upload_${Date.now()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: config.MAX_IMAGE_SIZE_MB * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Only image files are accepted'));
    }
    cb(null, true);
  },
});

/**
 * POST /api/coach/analyze
 * Body: multipart/form-data
 *   - image: image file (required)
 *   - question: string (optional)
 *   - tts: "true" to include audio response (optional)
 *
 * Response: { text: string, audioUrl?: string }
 */
router.post('/analyze', upload.single('image'), async (req, res) => {
  const imagePath = req.file?.path;

  try {
    if (!imagePath) {
      return res.status(400).json({ error: 'No image provided' });
    }

    const question = req.body.question || '';
    const wantTts = req.body.tts === 'true';

    logger.info(`/analyze - question: "${question}", tts: ${wantTts}`);

    // Crop to center focus area before AI analysis
    const focusedPath = await cropToFocus(imagePath);
    const text = await ai.analyzeImage(focusedPath, question);

    let audioUrl;
    if (wantTts && config.ELEVENLABS_API_KEY) {
      try {
        const audioPath = await tts.synthesize(text);
        audioUrl = `/api/coach/audio/${path.basename(audioPath)}`;
      } catch (ttsErr) {
        logger.warn('TTS failed, skipping audio:', ttsErr.message);
      }
    }

    res.json({ text, audioUrl });
  } catch (err) {
    logger.error('/analyze error:', err.message);
    res.status(500).json({ error: err.message });
  } finally {
    // cropToFocus deletes original; also clean up cropped version
    const croppedPath = imagePath?.replace(/(\.\w+)$/, '_crop$1');
    if (croppedPath) fs.unlink(croppedPath, () => {});
  }
});

/**
 * POST /api/coach/ask
 * Body: application/json
 *   - question: string (required)
 *   - history: [{role, content}] (optional)
 *   - tts: boolean (optional)
 *
 * Response: { text: string, audioUrl?: string }
 */
router.post('/ask', express.json(), async (req, res) => {
  const { question, history = [], tts: wantTts = false } = req.body;

  if (!question) {
    return res.status(400).json({ error: 'question is required' });
  }

  try {
    logger.info(`/ask - question: "${question.slice(0, 80)}..."`);

    const text = await ai.askQuestion(question, history);

    let audioUrl;
    if (wantTts && config.ELEVENLABS_API_KEY) {
      try {
        const audioPath = await tts.synthesize(text);
        audioUrl = `/api/coach/audio/${path.basename(audioPath)}`;
      } catch (ttsErr) {
        logger.warn('TTS failed, skipping audio:', ttsErr.message);
      }
    }

    res.json({ text, audioUrl });
  } catch (err) {
    logger.error('/ask error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/coach/ask/stream
 * Streams the AI response token-by-token via Server-Sent Events.
 * Body: { question, history? }
 */
router.post('/ask/stream', express.json(), async (req, res) => {
  const { question, history = [] } = req.body;
  if (!question) return res.status(400).json({ error: 'question is required' });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders();

  try {
    logger.info(`/ask/stream - question: "${question.slice(0, 80)}"`);
    await (ollama.askQuestionStreaming)(question, history, (chunk) => {
      res.write(`data: ${JSON.stringify({ chunk })}\n\n`);
    });
    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
  } catch (err) {
    logger.error('/ask/stream error:', err.message);
    res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
  }
  res.end();
});

/**
 * GET /api/coach/audio/:filename
 * Serves a generated WAV file, then deletes it.
 */
router.get('/audio/:filename', (req, res) => {
  const filename = path.basename(req.params.filename); // prevent path traversal
  const filePath = path.join(config.TEMP_DIR, filename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Audio file not found' });
  }

  const ext = path.extname(filename).toLowerCase();
  const contentType = ext === '.mp3' ? 'audio/mpeg' : 'audio/wav';
  res.setHeader('Content-Type', contentType);
  const stream = fs.createReadStream(filePath);
  stream.pipe(res);
  stream.on('close', () => tts.cleanup(filePath));
});

/**
 * GET /api/coach/health
 * Returns Ollama model status.
 */
router.get('/health', async (_req, res) => {
  try {
    const status = await ollama.healthCheck();
    res.json(status);
  } catch (err) {
    res.status(503).json({ ok: false, error: err.message });
  }
});

module.exports = router;
