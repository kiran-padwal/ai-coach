const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const config = require('../config');
const ollama = require('../services/ollama');
const tts = require('../services/tts');
const logger = require('../utils/logger');

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

    const text = await ollama.analyzeImage(imagePath, question);

    let audioUrl;
    if (wantTts) {
      const audioPath = await tts.synthesize(text);
      const audioFilename = path.basename(audioPath);
      audioUrl = `/api/coach/audio/${audioFilename}`;
    }

    res.json({ text, audioUrl });
  } catch (err) {
    logger.error('/analyze error:', err.message);
    res.status(500).json({ error: err.message });
  } finally {
    // Clean up uploaded image
    if (imagePath) {
      fs.unlink(imagePath, () => {});
    }
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

    const text = await ollama.askQuestion(question, history);

    let audioUrl;
    if (wantTts) {
      const audioPath = await tts.synthesize(text);
      audioUrl = `/api/coach/audio/${path.basename(audioPath)}`;
    }

    res.json({ text, audioUrl });
  } catch (err) {
    logger.error('/ask error:', err.message);
    res.status(500).json({ error: err.message });
  }
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

  res.setHeader('Content-Type', 'audio/wav');
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
