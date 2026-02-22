const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const axios = require('axios');
const config = require('../config');
const logger = require('../utils/logger');

// ElevenLabs voice ID — "Adam" is the closest to Jarvis (deep, authoritative British male)
const ELEVENLABS_VOICE_ID = 'pNInz6obpgDQGcFmaJgB'; // Adam

/**
 * Convert text to speech using ElevenLabs (Jarvis-like voice).
 * Falls back to device TTS if no API key configured.
 * Returns the path to the generated MP3 file.
 */
async function synthesize(text) {
  if (!config.ELEVENLABS_API_KEY) {
    throw new Error('No ElevenLabs API key configured');
  }

  const filename = `tts_${crypto.randomBytes(8).toString('hex')}.mp3`;
  const outputPath = path.join(config.TEMP_DIR, filename);

  logger.info(`ElevenLabs TTS, voice: Adam, chars: ${text.length}`);

  const response = await axios.post(
    `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`,
    {
      text,
      model_id: 'eleven_turbo_v2', // fastest model
      voice_settings: {
        stability: 0.55,        // more consistent, authoritative
        similarity_boost: 0.80, // stays true to the voice character
        style: 0.20,            // slight style emphasis
        use_speaker_boost: true,
      },
    },
    {
      headers: {
        'xi-api-key': config.ELEVENLABS_API_KEY,
        'Content-Type': 'application/json',
        'Accept': 'audio/mpeg',
      },
      responseType: 'arraybuffer',
      timeout: 15000,
    }
  );

  fs.writeFileSync(outputPath, Buffer.from(response.data));
  logger.info(`ElevenLabs TTS file created: ${filename}`);
  return outputPath;
}

function cleanup(filePath) {
  fs.unlink(filePath, (err) => {
    if (err) logger.warn(`Could not delete temp file: ${filePath}`);
  });
}

module.exports = { synthesize, cleanup };
