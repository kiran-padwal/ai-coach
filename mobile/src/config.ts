// ─────────────────────────────────────────────────────────
//  Configuration
//  Edit BACKEND_URL to match your laptop's local IP address.
//
//  Find your IP:
//    Mac/Linux:  ifconfig | grep "inet " | grep -v 127.0.0.1
//    Windows:    ipconfig
// ─────────────────────────────────────────────────────────

export const BACKEND_URL = 'http://192.168.1.100:8000';

export const API = {
  analyze: `${BACKEND_URL}/api/coach/analyze`,
  ask: `${BACKEND_URL}/api/coach/ask`,
  health: `${BACKEND_URL}/api/coach/health`,
};

// How long to wait for a response from the backend (ms)
export const REQUEST_TIMEOUT = 120_000;

// Enable voice output by default
export const TTS_ENABLED = true;
