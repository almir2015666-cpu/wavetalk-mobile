import { useEffect, useRef } from 'react';
import { NativeModules, NativeEventEmitter, Platform } from 'react-native';

const { WatchBridge } = NativeModules;

interface WatchState {
  channel: string;
  speaker: string;
  talking: boolean;
  members: number;
}

export function useWatch(
  onPTTStart: () => void,
  onPTTStop:  () => void,
) {
  const startRef = useRef(onPTTStart);
  const stopRef  = useRef(onPTTStop);
  useEffect(() => { startRef.current = onPTTStart; }, [onPTTStart]);
  useEffect(() => { stopRef.current  = onPTTStop;  }, [onPTTStop]);

  useEffect(() => {
    if (Platform.OS !== 'ios' || !WatchBridge) return;
    const emitter = new NativeEventEmitter(WatchBridge);
    const s1 = emitter.addListener('watch:ptt:start', () => startRef.current());
    const s2 = emitter.addListener('watch:ptt:stop',  () => stopRef.current());
    return () => { s1.remove(); s2.remove(); };
  }, []);

  const sendToWatch = (state: WatchState) => {
    if (Platform.OS !== 'ios' || !WatchBridge) return;
    WatchBridge.sendUpdate(state);
  };

  return { sendToWatch };
}
