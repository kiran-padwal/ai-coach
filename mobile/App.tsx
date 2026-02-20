import React, {useCallback, useEffect, useState} from 'react';
import {
  Alert,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import CameraView from './src/components/CameraView';
import VoiceButton from './src/components/VoiceButton';
import ResponseDisplay, {Status} from './src/components/ResponseDisplay';
import {analyzeFrame, checkHealth, HistoryEntry} from './src/services/api';

export default function App() {
  const [status, setStatus] = useState<Status>('idle');
  const [responseText, setResponseText] = useState('');
  const [audioUrl, setAudioUrl] = useState<string | undefined>();
  const [errorMsg, setErrorMsg] = useState('');
  const [captureNow, setCaptureNow] = useState(false);
  const [pendingQuestion, setPendingQuestion] = useState('');
  const [history, setHistory] = useState<HistoryEntry[]>([]);

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

  // Triggered when the user finishes speaking
  const handleVoiceResult = useCallback((question: string) => {
    setPendingQuestion(question);
    setCaptureNow(true); // trigger camera capture
  }, []);

  // Triggered when the camera captures a frame
  const handleCapture = useCallback(
    async (uri: string) => {
      setCaptureNow(false);
      setStatus('thinking');
      setResponseText('');
      setAudioUrl(undefined);
      setErrorMsg('');

      try {
        const result = await analyzeFrame(uri, pendingQuestion);

        // Update conversation history
        const newHistory: HistoryEntry[] = [
          ...history,
          {role: 'user', content: pendingQuestion},
          {role: 'assistant', content: result.text},
        ].slice(-10); // keep last 5 pairs
        setHistory(newHistory);

        setResponseText(result.text);
        setAudioUrl(result.audioUrl);
        setStatus(result.audioUrl ? 'speaking' : 'idle');
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
        <Text style={styles.title}>AI Coach</Text>
        <Text style={styles.subtitle}>Local · Private · Free</Text>
      </View>

      {/* Camera preview (upper half) */}
      <View style={styles.cameraContainer}>
        <CameraView onCapture={handleCapture} captureNow={captureNow} />
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

      {/* Voice button */}
      <View style={styles.controls}>
        <VoiceButton
          onResult={handleVoiceResult}
          disabled={status === 'thinking'}
        />
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
    padding: 20,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
  },
});
