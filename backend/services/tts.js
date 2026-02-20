const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const config = require('../config');
const logger = require('../utils/logger');

/**
 * Convert text to speech using Piper TTS.
 * Returns the path to the generated WAV file.
 * @param {string} text - Text to synthesize.
 * @returns {Promise<string>} - Absolute path to the output WAV file.
 */
function synthesize(text) {
  return new Promise((resolve, reject) => {
    const filename = `tts_${crypto.randomBytes(8).toString('hex')}.wav`;
    const outputPath = path.join(config.TEMP_DIR, filename);

    // Sanitize text: remove special chars that could break the shell command
    const sanitizedText = text.replace(/['"\\]/g, ' ').replace(/\n/g, ' ');

    const cmd = `echo "${sanitizedText}" | ${config.PIPER_EXECUTABLE} --model "${config.PIPER_VOICE}" --output_file "${outputPath}"`;

    logger.info(`Running Piper TTS, output: ${filename}`);

    exec(cmd, { timeout: 30000 }, (error, stdout, stderr) => {
      if (error) {
        logger.error('Piper TTS error:', stderr || error.message);
        return reject(new Error(`TTS failed: ${stderr || error.message}`));
      }

      if (!fs.existsSync(outputPath)) {
        return reject(new Error('TTS completed but output file not found'));
      }

      logger.info(`TTS file created: ${filename}`);
      resolve(outputPath);
    });
  });
}

/**
 * Delete a temp audio file after it has been served.
 * @param {string} filePath
 */
function cleanup(filePath) {
  fs.unlink(filePath, (err) => {
    if (err) logger.warn(`Could not delete temp file: ${filePath}`);
  });
}

module.exports = { synthesize, cleanup };
