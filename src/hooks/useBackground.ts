import { useEffect, useRef, useState } from 'react';
import { AppState, AppStateStatus, Platform } from 'react-native';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';

async function getExpoPushToken(): Promise<string | null> {
  try {
    if (Platform.OS === 'web') return null;
    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== 'granted') return null;
    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      Constants.easConfig?.projectId;
    if (!projectId) return null;
    const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
    return data;
  } catch {
    return null;
  }
}

// Generate silent WAV (0.5s, 8kHz, mono, 16-bit) as base64 — synchronous
function buildSilentWavB64(): string {
  const sampleRate = 8000;
  const numSamples = 4000;
  const dataBytes  = numSamples * 2;
  const buf  = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buf);
  const str  = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
  };
  str(0,  'RIFF'); view.setUint32(4,  36 + dataBytes, true);
  str(8,  'WAVE'); str(12, 'fmt ');
  view.setUint32(16, 16,          true);
  view.setUint16(20, 1,           true);  // PCM
  view.setUint16(22, 1,           true);  // mono
  view.setUint32(24, sampleRate,  true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2,           true);
  view.setUint16(34, 16,          true);
  str(36, 'data'); view.setUint32(40, dataBytes, true);
  // samples are all zero (silence)
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

// Pre-compute at module load time (sync — no I/O needed)
const SILENT_WAV_B64 = buildSilentWavB64();

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge:  false,
  }),
});

export function useBackground(onNotificationTap?: () => void) {
  const silentSound = useRef<Audio.Sound | null>(null);
  const appState    = useRef<AppStateStatus>(AppState.currentState);
  const silentUri   = useRef<string>('');
  const [pushToken, setPushToken] = useState<string | null>(null);

  useEffect(() => {
    const writeSilentFile = async () => {
      try {
        const path = (FileSystem.cacheDirectory || '') + 'wt_silence.wav';
        await FileSystem.writeAsStringAsync(path, SILENT_WAV_B64, {
          encoding: FileSystem.EncodingType.Base64,
        });
        silentUri.current = path;
      } catch (_) {}
    };
    writeSilentFile();

    // Tenta obter o token de push real (app completamente fechado)
    getExpoPushToken().then(t => { if (t) setPushToken(t); });

    const sub = Notifications.addNotificationResponseReceivedListener(() => {
      onNotificationTap?.();
    });
    return () => sub.remove();
  }, []);

  const startSilent = async () => {
    if (silentSound.current) return; // already running

    try {
      // Write on-demand if not ready yet (race condition safety)
      if (!silentUri.current) {
        const path = (FileSystem.cacheDirectory || '') + 'wt_silence.wav';
        await FileSystem.writeAsStringAsync(path, SILENT_WAV_B64, {
          encoding: FileSystem.EncodingType.Base64,
        });
        silentUri.current = path;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS:         false,
        playsInSilentModeIOS:       true,
        staysActiveInBackground:    true,
        shouldDuckAndroid:          false,
        playThroughEarpieceAndroid: false,
      });

      const { sound } = await Audio.Sound.createAsync(
        { uri: silentUri.current },
        { shouldPlay: true, isLooping: true, volume: 0.001 }
      );
      silentSound.current = sound;
    } catch (_) {}
  };

  const stopSilent = async () => {
    deactivateKeepAwake();
    if (!silentSound.current) return;
    try {
      await silentSound.current.stopAsync();
      await silentSound.current.unloadAsync();
    } catch (_) {}
    silentSound.current = null;
    // Note: do NOT change audio mode here — startRecording() will set
    // allowsRecordingIOS:true when the user presses PTT in foreground.
  };

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      const prev = appState.current;
      appState.current = next;

      if (next === 'active') {
        stopSilent();
      } else if (prev === 'active' && next !== 'active') {
        // Going to background — keep screen "awake" via audio + keep-awake
        activateKeepAwakeAsync().catch(() => {});
        startSilent();
      }
    });
    return () => {
      sub.remove();
      stopSilent();
    };
  }, []);

  const notifyIncoming = async (name: string) => {
    if (appState.current !== 'active') {
      Notifications.scheduleNotificationAsync({
        content: {
          title: '📻 WaveTalk',
          body:  `${name} está falando`,
          sound: true,
        },
        trigger: null,
      }).catch(() => {});
    }
  };

  return { notifyIncoming, pushToken };
}
