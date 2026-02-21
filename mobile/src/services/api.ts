import {API, REQUEST_TIMEOUT, TTS_ENABLED} from '../config';

export interface CoachResponse {
  text: string;
  audioUrl?: string;
}

export interface HistoryEntry {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * Send a camera frame + optional question to the backend for vision analysis.
 *
 * @param imageUri  - Local file URI of the captured frame (file:// path).
 * @param question  - Optional spoken question from the user.
 */
export async function analyzeFrame(
  imageUri: string,
  question?: string,
): Promise<CoachResponse> {
  const form = new FormData();

  // React Native FormData accepts {uri, type, name}
  form.append('image', {
    uri: imageUri,
    type: 'image/jpeg',
    name: 'frame.jpg',
  } as any);

  if (question) {
    form.append('question', question);
  }

  form.append('tts', String(TTS_ENABLED));

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

  try {
    const response = await fetch(API.analyze, {
      method: 'POST',
      body: form,
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Server error: ${response.status}`);
    }

    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Ask a text-only question (no image).
 */
export async function askQuestion(
  question: string,
  history: HistoryEntry[] = [],
): Promise<CoachResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

  try {
    const response = await fetch(API.ask, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({question, history, tts: TTS_ENABLED}),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Server error: ${response.status}`);
    }

    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fast path: send OCR-detected screen text + question to Codellama.
 * Skips LLaVA entirely — much faster (~10s vs ~60s).
 *
 * @param question   - User's question.
 * @param screenText - Text extracted from the screen by MLKit OCR.
 * @param history    - Conversation history.
 */
export async function askWithContext(
  question: string,
  screenText: string,
  history: HistoryEntry[] = [],
): Promise<CoachResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

  // Prepend screen content to the question so the model sees both
  const questionWithContext =
    `[Screen content]\n${screenText.slice(0, 1500)}\n\n[Question]\n${question}`;

  try {
    const response = await fetch(API.ask, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        question: questionWithContext,
        history,
        tts: TTS_ENABLED,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Server error: ${response.status}`);
    }

    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Check that the backend and Ollama models are reachable.
 */
export async function checkHealth(): Promise<{ok: boolean; missing?: string[]}> {
  try {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 5000);

    const response = await fetch(API.health, {signal: controller.signal});
    return await response.json();
  } catch {
    return {ok: false};
  }
}
