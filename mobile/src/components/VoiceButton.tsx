import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Platform,
  PermissionsAndroid,
  Animated,
} from 'react-native';
import Voice, {
  SpeechResultsEvent,
  SpeechErrorEvent,
} from '@react-native-voice/voice';

export interface VoiceHandle {
  pauseForTts: () => void;   // call BEFORE Tts.speak() — stops mic synchronously
  resumeAfterTts: () => void; // call when TTS finishes — restarts mic
}

interface VoiceButtonProps {
  onResult: (text: string) => void;
  onPartialResult?: (text: string) => void; // fired while user is still speaking
  onSpeechStart?: () => void;
  onListeningChange?: (active: boolean) => void;
  ttsPlaying?: boolean;  // amber button when AI is speaking
  disabled?: boolean;
}

const VoiceButton = forwardRef<VoiceHandle, VoiceButtonProps>(function VoiceButton(
  {onResult, onPartialResult, onSpeechStart, onListeningChange, ttsPlaying = false, disabled},
  ref,
) {
  const [active, setActive]    = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [partial, setPartial]  = useState('');

  // Refs so Voice handlers always use latest props without re-running useEffect
  const onResultRef          = useRef(onResult);
  const onPartialResultRef   = useRef(onPartialResult);
  const onSpeechStartRef     = useRef(onSpeechStart);
  const onListeningChangeRef = useRef(onListeningChange);
  useEffect(() => { onResultRef.current          = onResult; },          [onResult]);
  useEffect(() => { onPartialResultRef.current   = onPartialResult; },   [onPartialResult]);
  useEffect(() => { onSpeechStartRef.current     = onSpeechStart; },     [onSpeechStart]);
  useEffect(() => { onListeningChangeRef.current = onListeningChange; }, [onListeningChange]);

  const activeRef  = useRef(false);
  const pausedRef  = useRef(false); // true while TTS is playing
  const latestResult    = useRef('');
  const restartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (active && !ttsPlaying) {
      Animated.loop(Animated.sequence([
        Animated.timing(pulseAnim, {toValue: 1.12, duration: 700, useNativeDriver: true}),
        Animated.timing(pulseAnim, {toValue: 1.0,  duration: 700, useNativeDriver: true}),
      ])).start();
    } else {
      pulseAnim.stopAnimation();
      pulseAnim.setValue(1);
    }
  }, [active, ttsPlaying, pulseAnim]);

  const startVoice = useCallback(async () => {
    if (!activeRef.current || pausedRef.current) return;
    try {
      await Voice.destroy();
      await Voice.start('en-US');
    } catch {
      try { await Voice.destroy(); await Voice.start('en-US'); } catch {}
    }
  }, []);

  const scheduleRestart = useCallback((delayMs = 700) => {
    if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
    restartTimerRef.current = setTimeout(() => {
      if (activeRef.current && !pausedRef.current) startVoice();
    }, delayMs);
  }, [startVoice]);

  // Expose imperative controls so App can pause/resume synchronously
  useImperativeHandle(ref, () => ({
    pauseForTts: () => {
      pausedRef.current = true;
      if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
      setSpeaking(false);
      onListeningChangeRef.current?.(false);
      Voice.destroy().catch(() => {});
    },
    resumeAfterTts: () => {
      pausedRef.current = false;
      if (activeRef.current) scheduleRestart(350);
    },
  }), [scheduleRestart]);

  // Voice event handlers — set up once, use refs for callbacks
  useEffect(() => {
    Voice.onSpeechStart = () => {
      if (pausedRef.current) return; // ignore if TTS is playing (echo)
      setSpeaking(true);
      onListeningChangeRef.current?.(true);
      onSpeechStartRef.current?.();
    };

    Voice.onSpeechPartialResults = (e: SpeechResultsEvent) => {
      const text = e.value?.[0] ?? '';
      latestResult.current = text;
      setPartial(text);
      if (text && !pausedRef.current) onPartialResultRef.current?.(text);
    };

    Voice.onSpeechResults = (e: SpeechResultsEvent) => {
      const text = e.value?.[0] ?? '';
      if (text) latestResult.current = text;
    };

    Voice.onSpeechEnd = () => {
      if (pausedRef.current) return;
      setSpeaking(false);
      onListeningChangeRef.current?.(false);
      setPartial('');
      const result = latestResult.current.trim();
      latestResult.current = '';
      if (result) onResultRef.current(result);
      scheduleRestart(400);
    };

    Voice.onSpeechError = (e: SpeechErrorEvent) => {
      if (pausedRef.current) return; // expected error when we destroyed for TTS
      setSpeaking(false);
      onListeningChangeRef.current?.(false);
      setPartial('');
      latestResult.current = '';
      scheduleRestart(String(e.error?.code) === '5' ? 700 : 350);
    };

    return () => { Voice.destroy().then(Voice.removeAllListeners); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const requestMicPermission = useCallback(async () => {
    if (Platform.OS === 'android') {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
      );
      return granted === PermissionsAndroid.RESULTS.GRANTED;
    }
    return true;
  }, []);

  // Auto-start on mount
  useEffect(() => {
    (async () => {
      const ok = await requestMicPermission();
      if (ok) {
        activeRef.current = true;
        setActive(true);
        await startVoice();
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePress = useCallback(async () => {
    if (ttsPlaying) return; // tap does nothing while AI speaks (App handles interrupt)
    if (activeRef.current) {
      activeRef.current = false;
      setActive(false);
      setSpeaking(false);
      setPartial('');
      if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
      try { await Voice.destroy(); } catch {}
    } else {
      const ok = await requestMicPermission();
      if (!ok) return;
      activeRef.current = true;
      setActive(true);
      await startVoice();
    }
  }, [ttsPlaying, requestMicPermission, startVoice]);

  const bgColor = ttsPlaying ? '#d97706'
                : speaking   ? '#dc2626'
                : active     ? '#16a34a'
                :              '#2563eb';
  const icon  = ttsPlaying ? '💬' : speaking ? '🔴' : active ? '🟢' : '🎤';
  const label = ttsPlaying ? 'Speaking…'
              : speaking   ? 'Hearing you…'
              : active     ? 'Listening…'
              :              'Tap to start';

  return (
    <View style={styles.wrapper}>
      {partial ? <Text style={styles.partial}>{partial}</Text> : null}
      <Animated.View style={{transform: [{scale: pulseAnim}]}}>
        <TouchableOpacity
          style={[styles.button, {backgroundColor: bgColor}, disabled && !ttsPlaying && styles.disabled]}
          onPress={handlePress}
          activeOpacity={0.8}>
          <Text style={styles.icon}>{icon}</Text>
          <Text style={styles.label}>{label}</Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
});

export default VoiceButton;

const styles = StyleSheet.create({
  wrapper: {alignItems: 'center', gap: 8},
  partial: {color: '#94a3b8', fontSize: 13, fontStyle: 'italic', maxWidth: 300, textAlign: 'center'},
  button: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 28, paddingVertical: 16, borderRadius: 40,
  },
  disabled: {opacity: 0.4},
  icon: {fontSize: 20},
  label: {color: '#fff', fontSize: 16, fontWeight: '600'},
});
