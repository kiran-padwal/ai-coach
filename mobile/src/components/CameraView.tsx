import React, {useEffect, useRef, useState} from 'react';
import {StyleSheet, View, Text} from 'react-native';
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
  useFrameProcessor,
  VisionCameraProxy,
} from 'react-native-vision-camera';
import {useSharedValue, runOnJS} from 'react-native-worklets-core';

// The targeting frame covers center 85% width × 80% height
const FRAME_W = 0.85;
const FRAME_H = 0.80;

// Stabilization delay before LLaVA capture (ms)
const STABILIZE_MS = 1500;

// Load the native text scanner plugin registered in TextScannerPlugin.kt
const scanTextPlugin = VisionCameraProxy.initFrameProcessorPlugin('scanText', {});

interface TextBlock {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface ScanResult {
  text: string;
  blocks: TextBlock[];
  frameWidth: number;
  frameHeight: number;
}

interface CameraViewProps {
  onCapture: (uri: string) => void;
  captureNow: boolean;
  onTextDetected?: (text: string) => void;
}

export default function CameraView({
  onCapture,
  captureNow,
  onTextDetected,
}: CameraViewProps) {
  const device = useCameraDevice('back');
  const {hasPermission, requestPermission} = useCameraPermission();
  const cameraRef = useRef<Camera>(null);
  const [liveText, setLiveText] = useState('');
  const [textBlocks, setTextBlocks] = useState<TextBlock[]>([]);
  const [stabilizing, setStabilizing] = useState(false);
  const [viewSize, setViewSize] = useState({width: 1, height: 1});
  const [frameSize, setFrameSize] = useState({width: 1, height: 1});
  const isCapturingRef = useRef(false);

  useEffect(() => {
    if (!hasPermission) requestPermission();
  }, [hasPermission, requestPermission]);

  // Called from worklet thread → runs on JS thread via runOnJS
  const handleScanResult = (result: ScanResult | null) => {
    if (!result) return;

    const fw = result.frameWidth || 1;
    const fh = result.frameHeight || 1;
    setFrameSize({width: fw, height: fh});

    // Filter blocks to center focus area only
    const frameLeft   = fw * ((1 - FRAME_W) / 2);
    const frameTop    = fh * ((1 - FRAME_H) / 2);
    const frameRight  = frameLeft + fw * FRAME_W;
    const frameBottom = frameTop  + fh * FRAME_H;

    const filtered = result.blocks.filter(b => {
      const cx = b.x + b.width / 2;
      const cy = b.y + b.height / 2;
      return cx >= frameLeft && cx <= frameRight &&
             cy >= frameTop  && cy <= frameBottom;
    });

    const text = filtered.map(b => b.text).join('\n').trim();
    setLiveText(text);
    setTextBlocks(filtered);
    if (onTextDetected) onTextDetected(text);
  };

  // TRUE AR: runs on every camera frame via VisionCamera worklet
  const frameProcessor = useFrameProcessor(frame => {
    'worklet';
    if (!scanTextPlugin) return;
    const result = scanTextPlugin.call(frame) as ScanResult | null;
    runOnJS(handleScanResult)(result);
  }, []);

  // Capture with stabilization delay (for LLaVA fallback / visual mode)
  useEffect(() => {
    if (!captureNow) return;
    setStabilizing(true);
    const timer = setTimeout(async () => {
      setStabilizing(false);
      if (!cameraRef.current) return;
      try {
        const photo = await cameraRef.current.takePhoto({
          qualityPrioritization: 'balanced',
          skipMetadata: true,
        });
        onCapture(`file://${photo.path}`);
      } catch (err) {
        console.error('Capture failed:', err);
      }
    }, STABILIZE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [captureNow]);

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

  // Scale factor: map frame pixel coords → view pixel coords
  const scaleX = viewSize.width  / (frameSize.width  || 1);
  const scaleY = viewSize.height / (frameSize.height || 1);

  return (
    <View
      style={styles.container}
      onLayout={e => {
        const {width, height} = e.nativeEvent.layout;
        setViewSize({width, height});
      }}>

      <Camera
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        device={device}
        isActive
        photo
        frameProcessor={frameProcessor}
      />

      {/* AR text block overlays — drawn exactly where text is on screen */}
      {textBlocks.map((block, i) => (
        <View
          key={i}
          style={[
            styles.textOverlay,
            {
              left:   block.x * scaleX,
              top:    block.y * scaleY,
              width:  block.width  * scaleX,
              height: block.height * scaleY,
            },
          ]}
        />
      ))}

      {/* Dimmed edges — outside the targeting frame */}
      <View style={[styles.dim, {top: 0, left: 0, right: 0, height: viewSize.height * ((1 - FRAME_H) / 2)}]} />
      <View style={[styles.dim, {bottom: 0, left: 0, right: 0, height: viewSize.height * ((1 - FRAME_H) / 2)}]} />
      <View style={[styles.dim, {
        top:    viewSize.height * ((1 - FRAME_H) / 2),
        bottom: viewSize.height * ((1 - FRAME_H) / 2),
        left: 0, width: viewSize.width * ((1 - FRAME_W) / 2),
      }]} />
      <View style={[styles.dim, {
        top:    viewSize.height * ((1 - FRAME_H) / 2),
        bottom: viewSize.height * ((1 - FRAME_H) / 2),
        right: 0, width: viewSize.width * ((1 - FRAME_W) / 2),
      }]} />

      {/* Targeting frame border + corner markers */}
      <View style={[styles.targetFrame, {
        left:   viewSize.width  * ((1 - FRAME_W) / 2),
        top:    viewSize.height * ((1 - FRAME_H) / 2),
        width:  viewSize.width  * FRAME_W,
        height: viewSize.height * FRAME_H,
      }]}>
        <View style={[styles.corner, styles.cornerTL]} />
        <View style={[styles.corner, styles.cornerTR]} />
        <View style={[styles.corner, styles.cornerBL]} />
        <View style={[styles.corner, styles.cornerBR]} />
        <Text style={styles.targetLabel}>
          {stabilizing
            ? '⏳ Hold steady…'
            : liveText
              ? `✅ ${textBlocks.length} text block${textBlocks.length !== 1 ? 's' : ''} detected`
              : '📷 Aim at screen'}
        </Text>
      </View>

      {/* Live text strip */}
      {liveText.length > 0 && (
        <View style={styles.ocrOverlay}>
          <Text style={styles.ocrLabel}>Reading (AR)</Text>
          <Text style={styles.ocrText} numberOfLines={3}>
            {liveText.slice(0, 150)}
          </Text>
        </View>
      )}
    </View>
  );
}

const CORNER = 16;
const THICK = 3;

const styles = StyleSheet.create({
  container: {flex: 1},
  placeholder: {flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#111'},
  placeholderText: {color: '#fff', fontSize: 16},
  dim: {position: 'absolute', backgroundColor: 'rgba(0,0,0,0.45)'},
  textOverlay: {
    position: 'absolute',
    borderWidth: 1.5,
    borderColor: '#22d3ee',
    backgroundColor: 'rgba(34,211,238,0.08)',
    borderRadius: 2,
  },
  targetFrame: {
    position: 'absolute',
    borderWidth: 1,
    borderColor: 'rgba(34,211,238,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  targetLabel: {
    color: '#22d3ee',
    fontSize: 11,
    fontWeight: '700',
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    overflow: 'hidden',
  },
  corner: {position: 'absolute', width: CORNER, height: CORNER, borderColor: '#22d3ee'},
  cornerTL: {top: 0, left: 0, borderTopWidth: THICK, borderLeftWidth: THICK},
  cornerTR: {top: 0, right: 0, borderTopWidth: THICK, borderRightWidth: THICK},
  cornerBL: {bottom: 0, left: 0, borderBottomWidth: THICK, borderLeftWidth: THICK},
  cornerBR: {bottom: 0, right: 0, borderBottomWidth: THICK, borderRightWidth: THICK},
  ocrOverlay: {
    position: 'absolute', bottom: 8, left: 8, right: 8,
    backgroundColor: 'rgba(0,0,0,0.7)', borderRadius: 8, padding: 8,
  },
  ocrLabel: {
    color: '#22d3ee', fontSize: 10, fontWeight: '700',
    marginBottom: 2, textTransform: 'uppercase', letterSpacing: 1,
  },
  ocrText: {color: '#f1f5f9', fontSize: 11, fontFamily: 'monospace', lineHeight: 16},
});
