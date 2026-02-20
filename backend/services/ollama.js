const axios = require('axios');
const fs = require('fs');
const config = require('../config');
const logger = require('../utils/logger');

const client = axios.create({
  baseURL: config.OLLAMA_URL,
  timeout: config.REQUEST_TIMEOUT_MS,
});

/**
 * Analyze an image + question using the vision model (LLaVA).
 * @param {string} imagePath - Absolute path to the image file.
 * @param {string} question - User's question about the image.
 * @returns {Promise<string>} - AI response text.
 */
async function analyzeImage(imagePath, question) {
  const imageBuffer = fs.readFileSync(imagePath);
  const base64Image = imageBuffer.toString('base64');

  const prompt = question
    ? `You are an expert coding coach. Look at this screen and answer: ${question}`
    : `You are an expert coding coach. Describe what you see on this screen and provide helpful coding guidance.`;

  logger.info(`Sending image to ${config.VISION_MODEL} model...`);

  const response = await client.post('/api/generate', {
    model: config.VISION_MODEL,
    prompt,
    images: [base64Image],
    stream: false,
    options: {
      temperature: 0.7,
      num_predict: 500,
    },
  });

  return response.data.response;
}

/**
 * Ask a text-only question using the chat model (CodeLlama).
 * @param {string} question - User's question.
 * @param {string[]} [history] - Previous conversation turns.
 * @returns {Promise<string>} - AI response text.
 */
async function askQuestion(question, history = []) {
  const systemPrompt =
    'You are an expert coding coach. Give concise, practical advice. ' +
    'Focus on helping the user understand concepts and fix their code.';

  const messages = [
    { role: 'system', content: systemPrompt },
    ...history,
    { role: 'user', content: question },
  ];

  logger.info(`Sending question to ${config.CHAT_MODEL} model...`);

  const response = await client.post('/api/chat', {
    model: config.CHAT_MODEL,
    messages,
    stream: false,
    options: {
      temperature: 0.7,
      num_predict: 500,
    },
  });

  return response.data.message.content;
}

/**
 * Check that Ollama is running and required models are available.
 * @returns {Promise<{ok: boolean, models: string[]}>}
 */
async function healthCheck() {
  const response = await client.get('/api/tags');
  const models = (response.data.models || []).map((m) => m.name);
  const requiredModels = [config.VISION_MODEL, config.CHAT_MODEL];
  const missing = requiredModels.filter(
    (m) => !models.some((available) => available.startsWith(m))
  );

  if (missing.length > 0) {
    logger.warn(`Missing Ollama models: ${missing.join(', ')}`);
  }

  return { ok: missing.length === 0, models, missing };
}

module.exports = { analyzeImage, askQuestion, healthCheck };
