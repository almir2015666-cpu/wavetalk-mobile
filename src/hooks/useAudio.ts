import { useRef, useCallback } from 'react';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';

const RECORDING_OPTIONS: Audio.RecordingOptions = {
  android: {
    extension: '.m4a',
    outputFormat: Audio.AndroidOutputFormat.MPEG_4,
    audioEncoder:  Audio.AndroidAudioEncoder.AAC,
    sampleRate:    44100,
    numberOfChannels: 1,
    bitRate:       128000,
  },
  ios: {
    extension: '.m4a',
    outputFormat: Audio.IOSOutputFormat.MPEG4AAC,
    audioQuality: Audio.IOSAudioQuality.MAX,
    sampleRate:    44100,
    numberOfChannels: 1,
    bitRate:       128000,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
  web: {
    mimeType: 'audio/webm',
    bitsPerSecond: 128000,
  },
};

export function useAudio(onPlayingChange?: (playing: boolean) => void) {
  const recordingRef      = useRef<Audio.Recording | null>(null);
  const soundQueue        = useRef<Audio.Sound[]>([]);
  const onPlayingChangeRef = useRef(onPlayingChange);
  onPlayingChangeRef.current = onPlayingChange;

  const requestPermission = useCallback(async (): Promise<boolean> => {
    const { status } = await Audio.requestPermissionsAsync();
    if (status === 'granted') {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS:         true,
        playsInSilentModeIOS:       true,
        staysActiveInBackground:    true,
        shouldDuckAndroid:          true,
        playThroughEarpieceAndroid: false,
      });
    }
    return status === 'granted';
  }, []);

  const startRecording = useCallback(async (): Promise<boolean> => {
    try {
      if (recordingRef.current) {
        await recordingRef.current.stopAndUnloadAsync().catch(() => {});
        recordingRef.current = null;
      }
      await Audio.setAudioModeAsync({
        allowsRecordingIOS:         true,
        playsInSilentModeIOS:       true,
        staysActiveInBackground:    true,
        shouldDuckAndroid:          true,
        playThroughEarpieceAndroid: false,
      });
      const { recording } = await Audio.Recording.createAsync(RECORDING_OPTIONS);
      recordingRef.current = recording;
      return true;
    } catch (e) {
      console.warn('[audio] startRecording error:', e);
      return false;
    }
  }, []);

  const stopRecording = useCallback(async (): Promise<string | null> => {
    const rec = recordingRef.current;
    if (!rec) return null;
    try {
      await rec.stopAndUnloadAsync();
      const uri = rec.getURI();
      recordingRef.current = null;
      if (!uri) return null;
      const b64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      await FileSystem.deleteAsync(uri, { idempotent: true });
      return b64;
    } catch (e) {
      console.warn('[audio] stopRecording error:', e);
      recordingRef.current = null;
      return null;
    }
  }, []);

  const playAudio = useCallback(async (base64: string): Promise<void> => {
    try {
      // Switch to speaker mode (main speaker, not earpiece)
      await Audio.setAudioModeAsync({
        allowsRecordingIOS:         false,
        playsInSilentModeIOS:       true,
        staysActiveInBackground:    true,  // keep app alive in background
        shouldDuckAndroid:          false,
        playThroughEarpieceAndroid: false,
      });
      await new Promise(r => setTimeout(r, 30));

      let ext = '.m4a';
      try {
        const firstBytes = atob(base64.slice(0, 8));
        if (firstBytes.slice(0, 4) === 'RIFF') ext = '.wav';
      } catch (_) {}

      const uri = (FileSystem.cacheDirectory || '') + `wt_${Date.now()}${ext}`;
      await FileSystem.writeAsStringAsync(uri, base64, {
        encoding: FileSystem.EncodingType.Base64,
      });

      const { sound } = await Audio.Sound.createAsync(
        { uri },
        { shouldPlay: true, volume: 1.0, isMuted: false }
      );

      soundQueue.current.push(sound);
      onPlayingChangeRef.current?.(true);

      sound.setOnPlaybackStatusUpdate((st) => {
        if (st.isLoaded && st.didJustFinish) {
          sound.unloadAsync().catch(() => {});
          FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
          soundQueue.current = soundQueue.current.filter(s => s !== sound);
          if (soundQueue.current.length === 0) {
            onPlayingChangeRef.current?.(false);
            // Do NOT restore audio mode here — changing it would interrupt the
            // background silent loop. startRecording() sets allowsRecordingIOS:true
            // when the user presses PTT, which is the right time to switch.
          }
        }
      });
    } catch (e) {
      onPlayingChangeRef.current?.(false);
      console.warn('[audio] playAudio error:', e);
    }
  }, []);

  const stopAllSounds = useCallback(() => {
    soundQueue.current.forEach(s => s.stopAsync().catch(() => {}));
    soundQueue.current = [];
    onPlayingChangeRef.current?.(false);
  }, []);

  return { requestPermission, startRecording, stopRecording, playAudio, stopAllSounds };
}
