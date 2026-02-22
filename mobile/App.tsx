import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  Alert,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import Tts from 'react-native-tts';
import CameraView from './src/components/CameraView';
import VoiceButton, {VoiceHandle} from './src/components/VoiceButton';
import ResponseDisplay, {Status} from './src/components/ResponseDisplay';
import {analyzeFrame, askWithContextStream, checkHealth, HistoryEntry} from './src/services/api';

const STABLE_DELAY_MS = 1500;

// ── Mode ──────────────────────────────────────────────────────────────────────
// sleeping  : only "Hey Jarvis" wakes the app
// active    : awake, waiting for a command
// confirming: described screen, waiting for "yes" / "no"
type AppMode = 'sleeping' | 'active' | 'confirming';

// ── Phrase helpers ────────────────────────────────────────────────────────────
const LOCK_PHRASES = ['yes', 'yeah', 'yep', 'yup', 'correct', 'confirm',
  'that\'s it', 'lock it', 'lock', 'right', 'exactly', 'that\'s the one'];

function isLockPhrase(text: string) {
  const lower = text.toLowerCase().trim();
  return lower.length < 30 && LOCK_PHRASES.some(p => lower === p || lower.startsWith(p + ' '));
}

function isNoPhrase(text: string) {
  const lower = text.toLowerCase().trim();
  return lower === 'no' || lower === 'nope' || lower === 'nah' || lower === 'skip' ||
         lower === 'not that' || lower === 'something else' || lower === 'next' ||
         lower.startsWith('no ') || lower.startsWith('not that');
}

function isWakeWord(text: string) {
  const lower = text.toLowerCase().trim();
  // Also catches STT mishearings like "hey travis", "hey tarvis", "hey travis"
  return lower.includes('jarvis') || lower.includes('travis') ||
         lower === 'hey' || lower === 'activate' || lower === 'wake up';
}

function isWhatDoYouSee(text: string) {
  const lower = text.toLowerCase();
  return lower.includes('what do you see') || lower.includes('what can you see') ||
         lower.includes('what\'s on the screen') || lower.includes('what is on screen') ||
         lower.includes('describe the screen') || lower.includes('what question') ||
         lower.includes('look at the screen') || lower.includes('check the screen');
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function App() {
  const [mode, setMode]               = useState<AppMode>('sleeping');
  const [status, setStatus]           = useState<Status>('idle');
  const [responseText, setResponseText] = useState('');
  const [audioUrl, setAudioUrl]       = useState<string | undefined>();
  const [stopAudio, setStopAudio]     = useState(false);
  const [errorMsg, setErrorMsg]       = useState('');
  const [captureNow, setCaptureNow]   = useState(false);
  const [pendingQuestion, setPendingQuestion] = useState('');
  const [history, setHistory]         = useState<HistoryEntry[]>([]);
  const [typedQuestion, setTypedQuestion] = useState('');
  const [lockedContext, setLockedContext] = useState('');
  const [ttsPlaying, setTtsPlaying]   = useState(false);
  const [heardText, setHeardText]     = useState(''); // debug: shows what STT heard
  const heardTimerRef                 = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Refs
  const voiceRef           = useRef<VoiceHandle>(null);
  const ttsPlayingRef      = useRef(false);
  const detectedTextRef    = useRef('');
  const isListeningRef     = useRef(false);
  const statusRef          = useRef<Status>('idle');
  const stableTimerRef     = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lockedContextRef   = useRef('');
  const modeRef            = useRef<AppMode>('sleeping');
  const confirmingTextRef  = useRef('');  // OCR text being confirmed
  const pendingSpeakRef      = useRef(false);
  const wakeWordFiredRef     = useRef(false); // prevents duplicate wake on partials
  const lastAnalyzedKeyRef   = useRef('');
  const lastAnalyzedTimeRef = useRef(0);
  const handleAskRef       = useRef<(q: string, t: string) => void>(() => {});
  const [stableText, setStableText] = useState('');

  // Keep refs in sync
  useEffect(() => { statusRef.current       = status; },        [status]);
  useEffect(() => { lockedContextRef.current = lockedContext; }, [lockedContext]);
  useEffect(() => { modeRef.current          = mode; },          [mode]);

  // ── TTS init ────────────────────────────────────────────────────────────────
  useEffect(() => {
    Tts.setDefaultLanguage('en-US');
    Tts.setDefaultRate(0.48);
    Tts.setDefaultPitch(0.85);
    const preferredMale = [
      'en-us-x-iom-local', 'en-us-x-iob-local', 'en-us-x-iog-local',
      'en-us-x-sfg-local',  'en-us-x-tpd-local', 'en-us-x-tpf-local',
    ];
    Tts.voices().then((voices: any[]) => {
      const ids = voices.map((v: any) => v.id ?? v.name);
      const pick = preferredMale.find(id => ids.includes(id)) ??
        voices.find((v: any) =>
          v.language?.startsWith('en') &&
          (v.name?.toLowerCase().includes('male') || v.id?.toLowerCase().includes('male'))
        )?.id;
      if (pick) Tts.setDefaultVoice(pick);
    }).catch(() => {});
    return () => { Tts.stop(); };
  }, []);

  // ── TTS event handlers ──────────────────────────────────────────────────────
  const handleTtsEnd = useCallback(() => {
    ttsPlayingRef.current = false;
    setTtsPlaying(false);
    voiceRef.current?.resumeAfterTts();
  }, []);

  const handleTtsCancel = useCallback(() => {
    if (pendingSpeakRef.current) return; // spurious cancel from our own Tts.stop()
    ttsPlayingRef.current = false;
    setTtsPlaying(false);
    voiceRef.current?.resumeAfterTts();
  }, []);

  useEffect(() => {
    const onFinish = Tts.addEventListener('tts-finish', handleTtsEnd);
    const onCancel = Tts.addEventListener('tts-cancel', handleTtsCancel);
    const onError  = Tts.addEventListener('tts-error',  handleTtsEnd);
    return () => { onFinish.remove(); onCancel.remove(); onError.remove(); };
  }, [handleTtsEnd, handleTtsCancel]);

  // ── Speak helper ────────────────────────────────────────────────────────────
  // Pauses mic BEFORE speaking (avoids TTS echo killing itself).
  // 100 ms gap is sufficient for Voice.destroy() to release Android audio focus.
  const speakText = useCallback((text: string) => {
    ttsPlayingRef.current = true;
    setTtsPlaying(true);
    voiceRef.current?.pauseForTts();
    pendingSpeakRef.current = true;
    Tts.stop();
    setTimeout(() => {
      pendingSpeakRef.current = false;
      Tts.speak(text);
    }, 100);
  }, []);

  // ── OCR text detection ───────────────────────────────────────────────────────
  const handleTextDetected = useCallback((text: string) => {
    detectedTextRef.current = text;
    if (stableTimerRef.current) clearTimeout(stableTimerRef.current);
    if (!text) { setStableText(''); return; }
    stableTimerRef.current = setTimeout(() => setStableText(text), 1500);
  }, []);

  // ── Mic helpers ──────────────────────────────────────────────────────────────
  const handleSpeechStart = useCallback(() => {
    if (ttsPlayingRef.current) return; // echo from TTS — ignore
    Tts.stop();
    setStopAudio(true);
  }, []);

  const handleListeningChange = useCallback((val: boolean) => {
    isListeningRef.current = val;
  }, []);

  // ── Backend health check ─────────────────────────────────────────────────────
  useEffect(() => {
    checkHealth().then(result => {
      if (!result.ok) {
        Alert.alert(
          'Backend not reachable',
          'Make sure the backend server is running and your IP is correct in config.ts.',
        );
      }
    });
  }, []);

  // ── Core AI call ─────────────────────────────────────────────────────────────
  const handleAskWithText = useCallback(
    async (question: string, screenText: string) => {
      setStatus('thinking');
      setResponseText('');
      setAudioUrl(undefined);
      setStopAudio(false);
      setErrorMsg('');

      try {
        const result = await askWithContextStream(
          question, screenText, history,
          (partial) => { setResponseText(partial); setStatus('idle'); },
        );

        setHistory(prev => [
          ...prev,
          {role: 'user', content: question},
          {role: 'assistant', content: result.text},
        ].slice(-10) as HistoryEntry[]);

        setResponseText(result.text);
        setAudioUrl(result.audioUrl);
        setStopAudio(false);
        setStatus('idle');
        if (!result.audioUrl) {
          speakText(result.text);
        }
      } catch (err: any) {
        setErrorMsg(err.message ?? 'Request failed');
        setStatus('error');
      } finally {
        setPendingQuestion('');
      }
    },
    [history, speakText],
  );

  useEffect(() => { handleAskRef.current = handleAskWithText; }, [handleAskWithText]);

  // ── Locked-mode proactive hints ───────────────────────────────────────────────
  // Only fires when a question is locked AND the user's screen content changes.
  // Jarvis watches the approach and gives the next actionable step.
  useEffect(() => {
    if (!stableText || stableText.length < 20) return;
    if (!lockedContextRef.current) return;          // only when locked
    if (modeRef.current !== 'active') return;        // not while sleeping/confirming
    if (isListeningRef.current) return;              // user is speaking
    if (statusRef.current === 'thinking') return;    // already processing

    const textKey = stableText.trim().slice(0, 50);
    if (textKey === lastAnalyzedKeyRef.current) return;

    const now = Date.now();
    if (now - lastAnalyzedTimeRef.current < 10000) return; // 10s cooldown

    lastAnalyzedKeyRef.current = textKey;
    lastAnalyzedTimeRef.current = now;

    handleAskRef.current(
      'Look at the user\'s current approach and give ONE specific next step they should take right now. Be direct and actionable.',
      `Interview question: ${lockedContextRef.current.slice(0, 300)}\n\nUser\'s current work on screen:\n${stableText.slice(0, 800)}`,
    );
  }, [stableText]);

  // ── Camera capture path ───────────────────────────────────────────────────────
  const handleCapture = useCallback(
    async (uri: string) => {
      setCaptureNow(false);
      setStatus('thinking');
      setResponseText('');
      setAudioUrl(undefined);
      setStopAudio(false);
      setErrorMsg('');

      try {
        const result = await analyzeFrame(uri, pendingQuestion);
        setHistory(prev => [
          ...prev,
          {role: 'user', content: pendingQuestion},
          {role: 'assistant', content: result.text},
        ].slice(-10) as HistoryEntry[]);

        setResponseText(result.text);
        setAudioUrl(result.audioUrl);
        setStopAudio(false);
        setStatus('idle');
        if (!result.audioUrl) { speakText(result.text); }
      } catch (err: any) {
        setErrorMsg(err.message ?? 'Request failed');
        setStatus('error');
      } finally {
        setPendingQuestion('');
      }
    },
    [history, pendingQuestion, speakText],
  );

  // ── Describe screen (no Groq — reads OCR directly) ────────────────────────────
  const describeAndConfirm = useCallback(() => {
    const raw = detectedTextRef.current;
    if (raw.length < 15) {
      const msg = 'I can\'t see any text clearly. Point the camera at the screen and try again.';
      setResponseText(msg);
      speakText(msg);
      return;
    }
    // Clean up OCR noise: collapse whitespace/newlines, take first 160 chars
    const preview = raw.replace(/\s+/g, ' ').trim().slice(0, 160);
    confirmingTextRef.current = raw;
    modeRef.current = 'confirming';
    setMode('confirming');
    const msg = `I'm looking at the screen. I can see: "${preview}". Is that what you want me to focus on?`;
    setResponseText(msg);
    speakText(msg);
  }, [speakText]);

  // ── Partial result handler — detects wake word WHILE user is still speaking ───
  // This makes "Hey Jarvis" feel instant instead of waiting for STT to finalize.
  const handlePartialResult = useCallback((text: string) => {
    if (modeRef.current !== 'sleeping') return;
    if (wakeWordFiredRef.current) return; // already triggered this utterance
    if (!isWakeWord(text)) return;
    wakeWordFiredRef.current = true; // lock so onSpeechEnd doesn't fire it again
    modeRef.current = 'active';
    setMode('active');
    setHistory([]);
    const msg = 'Hey Kiran, how can I help you sir?';
    setResponseText(msg);
    speakText(msg);
  }, [speakText]);

  // ── Main voice handler ────────────────────────────────────────────────────────
  const handleVoiceResult = useCallback((question: string) => {
    setStopAudio(false);
    // Always show what STT heard (helps debug wake word issues)
    if (heardTimerRef.current) clearTimeout(heardTimerRef.current);
    setHeardText(question);
    heardTimerRef.current = setTimeout(() => setHeardText(''), 4000);

    const lower = question.toLowerCase().trim();

    // Reset partial-wake guard so next utterance works
    wakeWordFiredRef.current = false;

    // ── Wake word — already handled by partial handler; just guard here ────────
    if (isWakeWord(question)) {
      if (modeRef.current === 'sleeping') {
        // partial handler didn't fire (slow STT) — handle it now
        modeRef.current = 'active';
        setMode('active');
        setHistory([]);
        const msg = 'Hey Kiran, how can I help you sir?';
        setResponseText(msg);
        speakText(msg);
      }
      return;
    }

    // ── Sleeping — ignore everything except wake word ──────────────────────────
    if (modeRef.current === 'sleeping') {
      return;
    }

    // ── Confirming mode — waiting for yes / no ────────────────────────────────
    if (modeRef.current === 'confirming') {
      if (isLockPhrase(question)) {
        const ctx = confirmingTextRef.current;
        confirmingTextRef.current = '';
        modeRef.current = 'active';
        setMode('active');
        setLockedContext(ctx);
        const msg = 'Locked. Ask me anything about it.';
        setResponseText(msg);
        speakText(msg);
        return;
      }

      if (isNoPhrase(question)) {
        confirmingTextRef.current = '';
        modeRef.current = 'active';
        setMode('active');
        const msg = 'OK, navigate to the right screen and say "what do you see".';
        setResponseText(msg);
        speakText(msg);
        return;
      }

      // User asked a question instead of yes/no — answer with pending context
      const ctx = confirmingTextRef.current || detectedTextRef.current;
      confirmingTextRef.current = '';
      modeRef.current = 'active';
      setMode('active');
      setPendingQuestion(question);
      if (ctx.length > 5) {
        handleAskWithText(question, ctx);
      }
      return;
    }

    // ── Active mode ────────────────────────────────────────────────────────────

    // "What do you see?" — describe screen without calling Groq, then confirm
    if (isWhatDoYouSee(question)) {
      describeAndConfirm();
      return;
    }

    // Unlock / next question
    if (lower === 'unlock' || lower === 'next question' || lower === 'next') {
      setLockedContext('');
      confirmingTextRef.current = '';
      modeRef.current = 'active';
      setMode('active');
      const msg = 'Unlocked. Say "what do you see" when you\'re on the next question.';
      setResponseText(msg);
      speakText(msg);
      return;
    }

    // Spontaneous lock (user says "yes" while not in confirming mode)
    if (isLockPhrase(question) && lockedContextRef.current === '' && detectedTextRef.current.length > 10) {
      setLockedContext(detectedTextRef.current);
      const msg = 'Got it, locked on the current screen.';
      setResponseText(msg);
      speakText(msg);
      return;
    }

    // Regular question — only call Groq when user explicitly asks
    const context = lockedContextRef.current || detectedTextRef.current;
    if (context.length > 5) {
      setPendingQuestion(question);
      handleAskWithText(question, context);
    } else {
      // No context at all — take a photo
      setPendingQuestion(question);
      setCaptureNow(true);
    }
  }, [handleAskWithText, describeAndConfirm, speakText]);

  // ── UI helpers ────────────────────────────────────────────────────────────────
  const modeLabel = () => {
    if (ttsPlaying)               return '💬 Speaking…';
    if (mode === 'sleeping')      return 'Say "Hey Jarvis" to start';
    if (mode === 'confirming')    return '❓ Say "yes" to lock · "no" to skip';
    if (lockedContext)            return '🔒 Locked — ask me anything';
    return '🟢 Listening';
  };

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor="#0f172a" />

      <View style={styles.header}>
        <Text style={styles.title}>AI Coach</Text>
        <Text style={styles.subtitle}>{modeLabel()}</Text>
      </View>

      <View style={styles.cameraContainer}>
        <CameraView
          onCapture={handleCapture}
          captureNow={captureNow}
          onTextDetected={handleTextDetected}
        />
      </View>

      {/* Status bar */}
      {lockedContext ? (
        <View style={styles.lockedBar}>
          <View style={styles.lockedLeft}>
            <Text style={styles.lockedIcon}>🔒</Text>
            <Text style={styles.lockedPreview} numberOfLines={1}>
              {lockedContext.replace(/\s+/g, ' ').slice(0, 70)}
            </Text>
          </View>
          <TouchableOpacity onPress={() => {
            setLockedContext('');
            confirmingTextRef.current = '';
          }}>
            <Text style={styles.unlockBtn}>Unlock</Text>
          </TouchableOpacity>
        </View>
      ) : mode === 'confirming' ? (
        <View style={styles.pendingBar}>
          <Text style={styles.pendingText}>❓ Say "yes" to lock · "no" to look elsewhere</Text>
        </View>
      ) : mode === 'sleeping' ? (
        <View style={styles.sleepingBar}>
          <Text style={styles.sleepingText}>💤 Say "Hey Jarvis" or tap below to activate</Text>
          <TouchableOpacity style={styles.wakeBtn} onPress={() => handleVoiceResult('hey jarvis')}>
            <Text style={styles.wakeBtnText}>Tap to Activate</Text>
          </TouchableOpacity>
          {heardText ? (
            <Text style={styles.heardText}>STT heard: "{heardText}"</Text>
          ) : null}
        </View>
      ) : null}
      {/* Show STT debug text in non-sleeping modes too */}
      {mode !== 'sleeping' && heardText ? (
        <View style={styles.heardBar}>
          <Text style={styles.heardBarText}>Heard: "{heardText}"</Text>
        </View>
      ) : null}

      <View style={styles.responseContainer}>
        <ResponseDisplay
          status={status}
          text={responseText}
          audioUrl={audioUrl}
          error={errorMsg}
          stopAudio={stopAudio}
        />
      </View>

      <View style={styles.controls}>
        <VoiceButton
          ref={voiceRef}
          onResult={handleVoiceResult}
          onPartialResult={handlePartialResult}
          onSpeechStart={handleSpeechStart}
          onListeningChange={handleListeningChange}
          ttsPlaying={ttsPlaying}
          disabled={status === 'thinking'}
        />
        <View style={styles.textRow}>
          <TextInput
            style={styles.textInput}
            placeholder="Or type a question…"
            placeholderTextColor="#475569"
            value={typedQuestion}
            onChangeText={setTypedQuestion}
            editable={status !== 'thinking'}
          />
          <TouchableOpacity
            style={[styles.sendBtn, status === 'thinking' && styles.sendBtnDisabled]}
            disabled={status === 'thinking' || !typedQuestion.trim()}
            onPress={() => {
              if (typedQuestion.trim()) {
                handleVoiceResult(typedQuestion.trim());
                setTypedQuestion('');
              }
            }}>
            <Text style={styles.sendBtnText}>Ask</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: '#0f172a'},
  header: {paddingHorizontal: 20, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#1e293b'},
  title: {color: '#f1f5f9', fontSize: 18, fontWeight: '700'},
  subtitle: {color: '#64748b', fontSize: 11, marginTop: 1},
  cameraContainer: {height: 240, backgroundColor: '#111', overflow: 'hidden'},
  lockedBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginHorizontal: 12, marginTop: 6, backgroundColor: '#1e3a5f',
    borderWidth: 1, borderColor: '#3b82f6', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6,
  },
  lockedLeft: {flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1},
  lockedIcon: {fontSize: 13},
  lockedPreview: {color: '#93c5fd', fontSize: 12, flex: 1},
  unlockBtn: {color: '#60a5fa', fontSize: 12, fontWeight: '600', paddingLeft: 8},
  pendingBar: {
    marginHorizontal: 12, marginTop: 6, backgroundColor: '#1c1917',
    borderWidth: 1, borderColor: '#f59e0b', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6,
  },
  pendingText: {color: '#fcd34d', fontSize: 12, textAlign: 'center'},
  sleepingBar: {paddingHorizontal: 14, paddingVertical: 6, alignItems: 'center', gap: 6},
  sleepingText: {color: '#475569', fontSize: 11, textAlign: 'center'},
  wakeBtn: {backgroundColor: '#1e293b', borderRadius: 8, paddingHorizontal: 20, paddingVertical: 8, borderWidth: 1, borderColor: '#334155'},
  wakeBtnText: {color: '#94a3b8', fontSize: 13, fontWeight: '600'},
  heardText: {color: '#f59e0b', fontSize: 11, fontStyle: 'italic'},
  heardBar: {paddingHorizontal: 14, paddingVertical: 2},
  heardBarText: {color: '#64748b', fontSize: 10, fontStyle: 'italic'},
  responseContainer: {flex: 1, backgroundColor: '#0f172a'},
  controls: {padding: 14, alignItems: 'center', gap: 10, borderTopWidth: 1, borderTopColor: '#1e293b'},
  textRow: {flexDirection: 'row', alignItems: 'center', gap: 8, width: '100%'},
  textInput: {flex: 1, backgroundColor: '#1e293b', color: '#f1f5f9', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14},
  sendBtn: {backgroundColor: '#2563eb', borderRadius: 12, paddingHorizontal: 18, paddingVertical: 10},
  sendBtnDisabled: {opacity: 0.4},
  sendBtnText: {color: '#fff', fontWeight: '700', fontSize: 14},
});
