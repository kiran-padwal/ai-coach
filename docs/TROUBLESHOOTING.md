# Troubleshooting

## Backend Issues

### `ECONNREFUSED` connecting to Ollama

Ollama is not running. Start it:
```bash
ollama serve
```

Verify:
```bash
curl http://localhost:11434/api/tags
```

---

### `Missing Ollama models`

Pull the required models:
```bash
ollama pull llava
ollama pull codellama
```

Check what's installed:
```bash
ollama list
```

---

### Piper TTS not found

Make sure `piper` is on your `PATH`:
```bash
which piper   # Mac/Linux
where piper   # Windows
```

If not found, set the full path in `backend/.env`:
```env
PIPER_EXECUTABLE=/usr/local/bin/piper
```

---

### TTS output file not created

Check that `backend/temp/` is writable:
```bash
ls -la backend/temp/
```

Also verify the voice model path:
```bash
ls ~/piper-voices/
# Should show: en_US-lessac-medium.onnx  en_US-lessac-medium.onnx.json
```

Set the correct path in `.env`:
```env
PIPER_VOICE=/full/path/to/en_US-lessac-medium.onnx
```

---

### Requests time out

Local models are slow. The default timeout is 2 minutes. For slower machines:

In `backend/.env`:
```env
# No timeout setting yet — edit config.js REQUEST_TIMEOUT_MS
```

In `mobile/src/config.ts`:
```typescript
export const REQUEST_TIMEOUT = 180_000; // 3 minutes
```

---

## Mobile App Issues

### Cannot connect to backend

1. Confirm the backend is running: `curl http://localhost:8000`
2. Confirm both devices are on the same Wi-Fi network
3. Check the IP in `mobile/src/config.ts` matches `ipconfig` / `ifconfig` output
4. Disable any firewall on port 8000

---

### Camera shows blank / permission denied

**iOS:** Add to `ios/AICoach/Info.plist`:
```xml
<key>NSCameraUsageDescription</key>
<string>AI Coach needs the camera to see your screen</string>
<key>NSMicrophoneUsageDescription</key>
<string>AI Coach needs the microphone for voice questions</string>
```

**Android:** Add to `android/app/src/main/AndroidManifest.xml`:
```xml
<uses-permission android:name="android.permission.CAMERA" />
<uses-permission android:name="android.permission.RECORD_AUDIO" />
```

---

### Voice recognition not working

**iOS:** Add to `Info.plist`:
```xml
<key>NSSpeechRecognitionUsageDescription</key>
<string>AI Coach uses speech recognition for voice questions</string>
```

**Android:** Ensure `RECORD_AUDIO` permission is granted in device settings.

---

### `No camera found` on Android

Check that `react-native-vision-camera` is linked correctly:
```bash
cd android && ./gradlew clean && cd ..
npx react-native run-android
```

---

### Audio doesn't play

1. Ensure `react-native-sound` is linked:
   ```bash
   cd ios && pod install
   ```
2. Check device is not in silent mode
3. Verify the `audioUrl` is being returned in the API response:
   - Open backend logs and look for `TTS file created:`
   - Confirm `TTS_ENABLED = true` in `mobile/src/config.ts`

---

## Performance Tips

| Problem | Solution |
|---|---|
| LLaVA very slow | Use `llava:7b` instead of 13B; close other apps |
| High RAM usage | Use `VISION_MODEL=llava:7b-q4_0` (quantised) |
| Voice cut off early | Hold button longer; speak slowly |
| Response too long | Reduce `num_predict` in `services/ollama.js` |
