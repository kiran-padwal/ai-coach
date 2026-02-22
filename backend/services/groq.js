const Groq = require('groq-sdk');
const fs = require('fs');
const config = require('../config');
const logger = require('../utils/logger');

const groq = new Groq({ apiKey: config.GROQ_API_KEY });

// Models
const CHAT_MODEL   = 'llama-3.3-70b-versatile';   // fast + high quality text
const VISION_MODEL = 'meta-llama/llama-4-scout-17b-16e-instruct'; // vision (Llama 4)

const SYSTEM_PROMPT =
  'You are Jarvis, an AI interview coach. Always reply in ONE short sentence only. ' +
  'When asked what you see on screen, describe the question briefly. ' +
  'When observing the user\'s code or notes, give direct feedback — correct approach or a quick nudge in the right direction. ' +
  'Be sharp and conversational, like a smart friend coaching in real time. ' +
  'No lists, no numbered steps, no long explanations.';

/**
 * Answer a text question using Groq (instant response).
 */
async function askQuestion(question, history = []) {
  logger.info(`Groq /ask - "${question.slice(0, 80)}"`);

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...history,
    { role: 'user', content: question },
  ];

  const completion = await groq.chat.completions.create({
    model: CHAT_MODEL,
    messages,
    max_tokens: 60,
    temperature: 0.7,
  });

  return completion.choices[0].message.content;
}

/**
 * Analyze an image + question using Groq vision (replaces LLaVA).
 */
async function analyzeImage(imagePath, question) {
  logger.info(`Groq /analyze - "${question?.slice(0, 80)}"`);

  const imageBuffer = fs.readFileSync(imagePath);
  const base64Image = imageBuffer.toString('base64');
  const ext = imagePath.split('.').pop() || 'jpeg';
  const mimeType = ext === 'png' ? 'image/png' : 'image/jpeg';

  const prompt = question
    ? `${SYSTEM_PROMPT}\n\nQuestion: ${question}`
    : `${SYSTEM_PROMPT}\n\nWhat do you see on screen? Confirm the question and give the user the key insight to start.`;

  const completion = await groq.chat.completions.create({
    model: VISION_MODEL,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64Image}` } },
        ],
      },
    ],
    max_tokens: 60,
    temperature: 0.7,
  });

  return completion.choices[0].message.content;
}

module.exports = { askQuestion, analyzeImage };
