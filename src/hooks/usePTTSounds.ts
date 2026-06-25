import { useRef, useEffect } from 'react';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';

// Generate a frequency-sweep WAV (8kHz, 8-bit mono) as base64
function buildChirpWav(freqStart: number, freqEnd: number, durationMs: number): string {
  const sampleRate = 8000;
  const n    = Math.floor(sampleRate * durationMs / 1000);
  const buf  = new ArrayBuffer(44 + n);
  const v    = new DataView(buf);
  const s    = (off: number, str: string) =>
    [...str].forEach((c, i) => v.setUint8(off + i, c.charCodeAt(0)));

  s(0, 'RIFF'); v.setUint32(4, 36 + n, true);
  s(8, 'WAVE'); s(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate, true); v.setUint16(32, 1, true);
  v.setUint16(34, 8, true);
  s(36, 'data'); v.setUint32(40, n, true);

  // Accumulate phase for a true frequency sweep (no phase discontinuity)
  let phase = 0;
  const fadeLen = Math.floor(sampleRate * 0.008); // 8ms fade in/out
  for (let i = 0; i < n; i++) {
    const t    = i / n;
    const freq = freqStart + (freqEnd - freqStart) * t;
    phase += (2 * Math.PI * freq) / sampleRate;
    const fadeIn  = Math.min(i / fadeLen, 1);
    const fadeOut = Math.min((n - i) / fadeLen, 1);
    const sample  = 128 + Math.round(118 * fadeIn * fadeOut * Math.sin(phase));
    v.setUint8(44 + i, Math.max(0, Math.min(255, sample)));
  }

  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

// Pre-compute at module load (sync, no I/O)
const START_WAV_B64 = buildChirpWav(650, 1050, 130); // ascending chirp  — PTT press
const STOP_WAV_B64  = buildChirpWav(1050, 580, 100); // descending squelch — PTT release

export function usePTTSounds() {
  const startUri = useRef('');
  const stopUri  = useRef('');

  useEffect(() => {
    const init = async () => {
      try {
        const base = FileSystem.cacheDirectory ?? '';
        const p1   = base + 'wt_ptt_start.wav';
        const p2   = base + 'wt_ptt_stop.wav';
        await FileSystem.writeAsStringAsync(p1, START_WAV_B64, {
          encoding: FileSystem.EncodingType.Base64,
        });
        await FileSystem.writeAsStringAsync(p2, STOP_WAV_B64, {
          encoding: FileSystem.EncodingType.Base64,
        });
        startUri.current = p1;
        stopUri.current  = p2;
      } catch (_) {}
    };
    init();
  }, []);

  const playSound = async (uri: string) => {
    if (!uri) return;
    try {
      const { sound } = await Audio.Sound.createAsync(
        { uri },
        { shouldPlay: true, volume: 1.0 }
      );
      sound.setOnPlaybackStatusUpdate(st => {
        if ('didJustFinish' in st && st.didJustFinish) {
          sound.unloadAsync().catch(() => {});
        }
      });
    } catch (_) {}
  };

  return {
    playStart: () => playSound(startUri.current),
    playStop:  () => playSound(stopUri.current),
  };
}
