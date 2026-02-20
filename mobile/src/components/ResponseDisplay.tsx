import React, {useEffect, useRef} from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
  ActivityIndicator,
} from 'react-native';
import Sound from 'react-native-sound';
import {BACKEND_URL} from '../config';

Sound.setCategory('Playback');

export type Status = 'idle' | 'thinking' | 'speaking' | 'error';

interface ResponseDisplayProps {
  status: Status;
  text: string;
  audioUrl?: string;
  error?: string;
}

export default function ResponseDisplay({
  status,
  text,
  audioUrl,
  error,
}: ResponseDisplayProps) {
  const soundRef = useRef<Sound | null>(null);

  // Play audio whenever a new audioUrl arrives
  useEffect(() => {
    if (!audioUrl) {
      return;
    }

    const fullUrl = `${BACKEND_URL}${audioUrl}`;

    // Release previous sound
    soundRef.current?.release();

    const sound = new Sound(fullUrl, '', err => {
      if (err) {
        console.warn('Sound load error:', err);
        return;
      }
      sound.play(() => sound.release());
    });

    soundRef.current = sound;

    return () => {
      soundRef.current?.release();
      soundRef.current = null;
    };
  }, [audioUrl]);

  return (
    <View style={styles.container}>
      {status === 'thinking' && (
        <View style={styles.thinkingRow}>
          <ActivityIndicator color="#60a5fa" />
          <Text style={styles.thinkingText}>Coach is thinking…</Text>
        </View>
      )}

      {status === 'error' && (
        <Text style={styles.errorText}>{error ?? 'Something went wrong'}</Text>
      )}

      {text ? (
        <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
          <Text style={styles.responseText}>{text}</Text>
        </ScrollView>
      ) : status === 'idle' ? (
        <Text style={styles.hint}>
          Point camera at your screen, then hold the mic button and ask a
          question.
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  thinkingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  thinkingText: {
    color: '#60a5fa',
    fontSize: 15,
  },
  errorText: {
    color: '#f87171',
    fontSize: 14,
    marginBottom: 8,
  },
  scroll: {
    flex: 1,
  },
  responseText: {
    color: '#f1f5f9',
    fontSize: 15,
    lineHeight: 22,
  },
  hint: {
    color: '#64748b',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 32,
    lineHeight: 22,
  },
});
