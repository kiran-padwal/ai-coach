import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  Alert,
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
  onResult: (text: string) => void;
  disabled?: boolean;
}

export default function VoiceButton({onResult, disabled}: VoiceButtonProps) {
  const [listening, setListening] = useState(false);
  const [partial, setPartial] = useState('');
  const latestResult = useRef(''); // always holds the freshest result

  useEffect(() => {
    Voice.onSpeechPartialResults = (e: SpeechResultsEvent) => {
      const text = e.value?.[0] ?? '';
      latestResult.current = text;
      setPartial(text);
    };

    Voice.onSpeechResults = (e: SpeechResultsEvent) => {
      const text = e.value?.[0] ?? '';
      latestResult.current = text;
      setPartial(text);
    };

    Voice.onSpeechEnd = () => {
      setListening(false);
      setPartial('');
      const result = latestResult.current;
      latestResult.current = '';
      if (result.trim()) {
        onResult(result.trim());
      }
    };

    Voice.onSpeechError = (e: SpeechErrorEvent) => {
      const code = e.error?.code ?? '';
      const msg = e.error?.message ?? 'Unknown error';
      console.warn('Speech error:', e.error);
      setListening(false);
      setPartial('');
      latestResult.current = '';
      // Show error so we can debug on-device
      Alert.alert('Speech Error', `Code: ${code}\n${msg}`);
    };

    return () => {
      Voice.destroy().then(Voice.removeAllListeners);
    };
  }, [onResult]);

  const requestMicPermission = useCallback(async () => {
    if (Platform.OS === 'android') {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
      );
      return granted === PermissionsAndroid.RESULTS.GRANTED;
    }
    return true;
  }, []);

  const startListening = useCallback(async () => {
    if (disabled || listening) return;
    const ok = await requestMicPermission();
    if (!ok) return;
    try {
      latestResult.current = '';
      await Voice.start('en-US');
      setListening(true);
      setPartial('');
    } catch (err: any) {
      console.error('Voice start error:', err);
      Alert.alert(
        'Speech Recognition Failed',
        'Could not start voice input.\n\n' +
          (err?.message ?? 'Unknown error') +
          '\n\nPlease type your question instead.',
      );
    }
  }, [disabled, listening, requestMicPermission]);

  const stopListening = useCallback(async () => {
    if (!listening) return;
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
  wrapper: {alignItems: 'center', gap: 8},
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
  buttonActive: {backgroundColor: '#dc2626'},
  buttonDisabled: {opacity: 0.4},
  icon: {fontSize: 20},
  label: {color: '#fff', fontSize: 16, fontWeight: '600'},
});
