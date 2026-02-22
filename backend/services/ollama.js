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

  const baseInstruction = `You are an intelligent AI interview coach — sharp, conversational, and direct like Jarvis from Iron Man. You read whatever is on the screen and help the user in real time.

Rules:
- First confirm what you understood: "So the interviewer is asking you to..." or "This looks like a question about..."
- Then guide the user to think through the answer — do NOT give the full solution
- Speak in natural flowing sentences, never numbered lists or bullet points
- Keep it short — 2 to 3 sentences maximum
- Sound confident and warm, like a smart friend coaching you live`;

  const prompt = question
    ? `${baseInstruction}\n\nQuestion: ${question}`
    : `${baseInstruction}\n\nWhat do you see on screen? Confirm the question and give the user the key insight to start with.`;

  logger.info(`Sending image to ${config.VISION_MODEL} model...`);

  const response = await client.post('/api/generate', {
    model: config.VISION_MODEL,
    prompt,
    images: [base64Image],
    stream: false,
    options: {
      temperature: 0.7,
      num_predict: 200,
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
    'You are an intelligent AI interview coach — sharp, conversational, and direct like Jarvis from Iron Man. ' +
    'When the user shares a question, first confirm what you understood: ' +
    '"So the interviewer is asking you to..." or "This looks like a question about...". ' +
    'Then guide the user to think through the answer themselves — never give the full solution. ' +
    'Respond in 2-3 natural flowing sentences. Never use numbered lists, bullet points, or "Step 1/2/3". ' +
    'Be confident, warm, and helpful — like a smart friend coaching you in real time.';

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
      num_predict: 200,
    },
  });

  return response.data.message.content;
}

/**
 * Stream a question answer token by token, calling onChunk for each piece.
 * @param {string} question
 * @param {Array} history
 * @param {(chunk: string) => void} onChunk
 */
async function askQuestionStreaming(question, history = [], onChunk) {
  const systemPrompt =
    'You are an intelligent AI interview coach — sharp, conversational, and direct like Jarvis from Iron Man. ' +
    'When the user shares a question from a screen or interviewer, first confirm what you understood: ' +
    '"So the interviewer is asking you to..." or "This looks like a question about...". ' +
    'Then guide the user to think through the answer themselves — never give the full solution. ' +
    'Respond in 2-3 natural flowing sentences. Never use numbered lists, bullet points, or "Step 1/2/3". ' +
    'Be confident, warm, and helpful — like a smart friend coaching you in real time.';

  const messages = [
    { role: 'system', content: systemPrompt },
    ...history,
    { role: 'user', content: question },
  ];

  const response = await client.post('/api/chat', {
    model: config.CHAT_MODEL,
    messages,
    stream: true,
    options: { temperature: 0.7, num_predict: 150 },
  }, { responseType: 'stream' });

  return new Promise((resolve, reject) => {
    let buffer = '';
    response.data.on('data', (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop(); // keep incomplete last line
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const json = JSON.parse(line);
          if (json.message?.content) onChunk(json.message.content);
          if (json.done) resolve();
        } catch {}
      }
    });
    response.data.on('end', resolve);
    response.data.on('error', reject);
  });
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

module.exports = { analyzeImage, askQuestion, askQuestionStreaming, healthCheck };
