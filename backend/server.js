const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const config = require('./config');
const logger = require('./utils/logger');
const coachRouter = require('./routes/coach');

const app = express();

// Ensure temp directory exists
if (!fs.existsSync(config.TEMP_DIR)) {
  fs.mkdirSync(config.TEMP_DIR, { recursive: true });
}

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/coach', coachRouter);

// Root health check
app.get('/', (_req, res) => {
  res.json({ status: 'AI Coach backend running', version: '1.0.0' });
});

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Error handler
app.use((err, _req, res, _next) => {
  logger.error('Unhandled error:', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(config.PORT, () => {
  logger.info(`AI Coach backend listening on http://localhost:${config.PORT}`);
  logger.info(`Ollama URL: ${config.OLLAMA_URL}`);
  logger.info(`Vision model: ${config.VISION_MODEL}`);
  logger.info(`Chat model:   ${config.CHAT_MODEL}`);
});
