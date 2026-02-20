import React, {useEffect, useRef} from 'react';
import {StyleSheet, View, Text} from 'react-native';
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
} from 'react-native-vision-camera';

interface CameraViewProps {
  /** Called with the local file URI of a captured JPEG frame. */
  onCapture: (uri: string) => void;
  /** When true, capture a frame immediately. */
  captureNow: boolean;
}

export default function CameraView({onCapture, captureNow}: CameraViewProps) {
  const device = useCameraDevice('back');
  const {hasPermission, requestPermission} = useCameraPermission();
  const cameraRef = useRef<Camera>(null);

  useEffect(() => {
    if (!hasPermission) {
      requestPermission();
    }
  }, [hasPermission, requestPermission]);

  useEffect(() => {
    if (captureNow) {
      capture();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [captureNow]);

  async function capture() {
    if (!cameraRef.current) {
      return;
    }
    try {
      const photo = await cameraRef.current.takePhoto({
        qualityPrioritization: 'balanced',
        skipMetadata: true,
      });
      onCapture(`file://${photo.path}`);
    } catch (err) {
      console.error('Camera capture failed:', err);
    }
  }

  if (!hasPermission) {
    return (
      <View style={styles.placeholder}>
        <Text style={styles.placeholderText}>Camera permission required</Text>
      </View>
    );
  }

  if (!device) {
    return (
      <View style={styles.placeholder}>
        <Text style={styles.placeholderText}>No camera found</Text>
      </View>
    );
  }

  return (
    <Camera
      ref={cameraRef}
      style={StyleSheet.absoluteFill}
      device={device}
      isActive
      photo
    />
  );
}

const styles = StyleSheet.create({
  placeholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#111',
  },
  placeholderText: {
    color: '#fff',
    fontSize: 16,
  },
});
