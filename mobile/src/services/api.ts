import axios from 'axios';
import {API, REQUEST_TIMEOUT, TTS_ENABLED} from '../config';

const http = axios.create({timeout: REQUEST_TIMEOUT});

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

  const response = await http.post<CoachResponse>(API.analyze, form, {
    headers: {'Content-Type': 'multipart/form-data'},
  });

  return response.data;
}

/**
 * Ask a text-only question (no image).
 */
export async function askQuestion(
  question: string,
  history: HistoryEntry[] = [],
): Promise<CoachResponse> {
  const response = await http.post<CoachResponse>(API.ask, {
    question,
    history,
    tts: TTS_ENABLED,
  });

  return response.data;
}

/**
 * Check that the backend and Ollama models are reachable.
 */
export async function checkHealth(): Promise<{ok: boolean; missing?: string[]}> {
  try {
    const response = await http.get(API.health, {timeout: 5000});
    return response.data;
  } catch {
    return {ok: false};
  }
}
