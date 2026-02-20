import React, {useCallback, useEffect, useState} from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  Platform,
  PermissionsAndroid,
} from 'react-native';
import Voice, {
  SpeechResultsEvent,
  SpeechErrorEvent,
} from '@react-native-voice/voice';

interface VoiceButtonProps {
  /** Called when the user finishes speaking with the recognised transcript. */
  onResult: (text: string) => void;
  /** Disable interaction while AI is responding. */
  disabled?: boolean;
}

export default function VoiceButton({onResult, disabled}: VoiceButtonProps) {
  const [listening, setListening] = useState(false);
  const [partial, setPartial] = useState('');

  useEffect(() => {
    Voice.onSpeechResults = (e: SpeechResultsEvent) => {
      const best = e.value?.[0] ?? '';
      setPartial(best);
    };

    Voice.onSpeechEnd = async () => {
      setListening(false);
      const result = partial;
      setPartial('');
      if (result.trim()) {
        onResult(result.trim());
      }
    };

    Voice.onSpeechError = (e: SpeechErrorEvent) => {
      console.warn('Speech error:', e.error);
      setListening(false);
      setPartial('');
    };

    return () => {
      Voice.destroy().then(Voice.removeAllListeners);
    };
  }, [onResult, partial]);

  const requestMicPermission = useCallback(async () => {
    if (Platform.OS === 'android') {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
      );
      return granted === PermissionsAndroid.RESULTS.GRANTED;
    }
    return true; // iOS handles via Info.plist
  }, []);

  const startListening = useCallback(async () => {
    if (disabled || listening) {
      return;
    }
    const ok = await requestMicPermission();
    if (!ok) {
      return;
    }
    try {
      await Voice.start('en-US');
      setListening(true);
      setPartial('');
    } catch (err) {
      console.error('Voice start error:', err);
    }
  }, [disabled, listening, requestMicPermission]);

  const stopListening = useCallback(async () => {
    if (!listening) {
      return;
    }
    try {
      await Voice.stop();
    } catch (err) {
      console.error('Voice stop error:', err);
    }
  }, [listening]);

  return (
    <View style={styles.wrapper}>
      {partial ? <Text style={styles.partial}>{partial}</Text> : null}
      <Pressable
        style={[
          styles.button,
          listening && styles.buttonActive,
          disabled && styles.buttonDisabled,
        ]}
        onPressIn={startListening}
        onPressOut={stopListening}
        disabled={disabled}>
        <Text style={styles.icon}>{listening ? '🔴' : '🎤'}</Text>
        <Text style={styles.label}>
          {listening ? 'Listening…' : 'Hold to speak'}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
    gap: 8,
  },
  partial: {
    color: '#ccc',
    fontSize: 13,
    fontStyle: 'italic',
    maxWidth: 280,
    textAlign: 'center',
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 28,
    paddingVertical: 16,
    borderRadius: 40,
    backgroundColor: '#2563eb',
  },
  buttonActive: {
    backgroundColor: '#dc2626',
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  icon: {
    fontSize: 20,
  },
  label: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
