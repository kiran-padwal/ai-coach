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
import VoiceButton from './src/components/VoiceButton';
import ResponseDisplay, {Status} from './src/components/ResponseDisplay';
import {analyzeFrame, askWithContext, checkHealth, HistoryEntry} from './src/services/api';

export default function App() {
  const [status, setStatus] = useState<Status>('idle');
  const [responseText, setResponseText] = useState('');
  const [audioUrl, setAudioUrl] = useState<string | undefined>();
  const [errorMsg, setErrorMsg] = useState('');
  const [captureNow, setCaptureNow] = useState(false);
  const [pendingQuestion, setPendingQuestion] = useState('');
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [typedQuestion, setTypedQuestion] = useState('');
  const [mode, setMode] = useState<'code' | 'visual'>('code');

  // Latest OCR text from the continuous camera reader
  const detectedTextRef = useRef('');

  // Init TTS on mount
  useEffect(() => {
    Tts.setDefaultLanguage('en-US');
    Tts.setDefaultRate(0.5);
    return () => { Tts.stop(); };
  }, []);

  // Check backend connectivity on mount
  useEffect(() => {
    checkHealth().then(result => {
      if (!result.ok) {
        Alert.alert(
          'Backend not reachable',
          result.missing?.length
            ? `Missing Ollama models: ${result.missing.join(', ')}`
            : 'Make sure the backend server is running and your IP is correct in config.ts.',
        );
      }
    });
  }, []);

  // Called by CameraView every 2s with fresh OCR text
  const handleTextDetected = useCallback((text: string) => {
    detectedTextRef.current = text;
  }, []);

  // Triggered when the user asks a question (voice or typed)
  const handleVoiceResult = useCallback((question: string) => {
    setPendingQuestion(question);
    if (mode === 'code' && detectedTextRef.current.length > 5) {
      // We already have screen text — skip camera capture, go straight to Codellama
      handleAskWithText(question, detectedTextRef.current);
    } else {
      // Visual mode or no text found — capture image and send to LLaVA
      setCaptureNow(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // Fast path: use OCR text + Codellama (no image needed)
  const handleAskWithText = useCallback(
    async (question: string, screenText: string) => {
      setStatus('thinking');
      setResponseText('');
      setAudioUrl(undefined);
      setErrorMsg('');

      try {
        const result = await askWithContext(question, screenText, history);

        const newHistory: HistoryEntry[] = [
          ...history,
          {role: 'user', content: question},
          {role: 'assistant', content: result.text},
        ].slice(-10);
        setHistory(newHistory);

        setResponseText(result.text);
        setStatus('idle');
        Tts.stop();
        Tts.speak(result.text);
      } catch (err: any) {
        setErrorMsg(err.message ?? 'Request failed');
        setStatus('error');
      } finally {
        setPendingQuestion('');
      }
    },
    [history],
  );

  // Slow path: camera snapshot → LLaVA (for cooking, driving, visual scenes)
  const handleCapture = useCallback(
    async (uri: string) => {
      setCaptureNow(false);
      setStatus('thinking');
      setResponseText('');
      setAudioUrl(undefined);
      setErrorMsg('');

      try {
        const result = await analyzeFrame(uri, pendingQuestion);

        const newHistory: HistoryEntry[] = [
          ...history,
          {role: 'user', content: pendingQuestion},
          {role: 'assistant', content: result.text},
        ].slice(-10);
        setHistory(newHistory);

        setResponseText(result.text);
        setAudioUrl(result.audioUrl);
        setStatus('idle');
        Tts.stop();
        Tts.speak(result.text);
      } catch (err: any) {
        setErrorMsg(err.message ?? 'Request failed');
        setStatus('error');
      } finally {
        setPendingQuestion('');
      }
    },
    [history, pendingQuestion],
  );

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor="#0f172a" />

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.title}>AI Coach</Text>
            <Text style={styles.subtitle}>Local · Private · Free</Text>
          </View>
          {/* Mode toggle */}
          <View style={styles.modeRow}>
            <TouchableOpacity
              style={[styles.modeBtn, mode === 'code' && styles.modeBtnActive]}
              onPress={() => setMode('code')}>
              <Text style={styles.modeBtnText}>💻 Code</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modeBtn, mode === 'visual' && styles.modeBtnActive]}
              onPress={() => setMode('visual')}>
              <Text style={styles.modeBtnText}>👁️ Visual</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Camera preview with live OCR overlay */}
      <View style={styles.cameraContainer}>
        <CameraView
          onCapture={handleCapture}
          captureNow={captureNow}
          onTextDetected={handleTextDetected}
        />
      </View>

      {/* Response area */}
      <View style={styles.responseContainer}>
        <ResponseDisplay
          status={status}
          text={responseText}
          audioUrl={audioUrl}
          error={errorMsg}
        />
      </View>

      {/* Controls */}
      <View style={styles.controls}>
        <VoiceButton
          onResult={handleVoiceResult}
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
  root: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    color: '#f1f5f9',
    fontSize: 20,
    fontWeight: '700',
  },
  subtitle: {
    color: '#64748b',
    fontSize: 12,
    marginTop: 2,
  },
  modeRow: {
    flexDirection: 'row',
    gap: 6,
  },
  modeBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#1e293b',
  },
  modeBtnActive: {
    backgroundColor: '#2563eb',
  },
  modeBtnText: {
    color: '#f1f5f9',
    fontSize: 12,
    fontWeight: '600',
  },
  cameraContainer: {
    height: 260,
    backgroundColor: '#111',
    overflow: 'hidden',
  },
  responseContainer: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  controls: {
    padding: 16,
    alignItems: 'center',
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
  },
  textRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    width: '100%',
  },
  textInput: {
    flex: 1,
    backgroundColor: '#1e293b',
    color: '#f1f5f9',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
  },
  sendBtn: {
    backgroundColor: '#2563eb',
    borderRadius: 12,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  sendBtnDisabled: {opacity: 0.4},
  sendBtnText: {color: '#fff', fontWeight: '700', fontSize: 14},
});
