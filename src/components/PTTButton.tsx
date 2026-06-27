import React, { useEffect, useRef } from 'react';
import { View, Text, Animated, PanResponder, StyleSheet } from 'react-native';
import { C } from '../theme';

interface Props {
  talking:     boolean;
  disabled:    boolean;
  locked:      boolean;
  talkSeconds: number;
  onStart:     () => void;
  onStop:      () => void;
  onLock:      () => void; // swipe up → travar transmissão
}

const BTN        = 180;
const MAX_SECS   = 60;
const LOCK_PX    = 55; // pixels para cima para travar

function talkColor(secs: number): string {
  if (secs < 30) return C.green;
  if (secs < 45) return C.cyan;
  if (secs < 55) return C.orange;
  return C.red;
}

export default function PTTButton({ talking, disabled, locked, talkSeconds, onStart, onStop, onLock }: Props) {
  const scale    = useRef(new Animated.Value(1)).current;
  const glow     = useRef(new Animated.Value(0)).current;
  const ring1    = useRef(new Animated.Value(0)).current;
  const ring2    = useRef(new Animated.Value(0)).current;
  const ring3    = useRef(new Animated.Value(0)).current;
  const idleP    = useRef(new Animated.Value(1)).current;
  const lockAnim = useRef(new Animated.Value(0)).current;
  const ringLoop = useRef<Animated.CompositeAnimation | null>(null);
  const idleLoop = useRef<Animated.CompositeAnimation | null>(null);

  const activeColor   = talking ? talkColor(talkSeconds) : C.cyan;
  const lockTriggered = useRef(false);

  // Refs para evitar stale closures no PanResponder
  const disabledRef = useRef(disabled);
  const lockedRef   = useRef(locked);
  const talkingRef  = useRef(talking);
  const onStartRef  = useRef(onStart);
  const onStopRef   = useRef(onStop);
  const onLockRef   = useRef(onLock);
  useEffect(() => { disabledRef.current = disabled; }, [disabled]);
  useEffect(() => { lockedRef.current   = locked;   }, [locked]);
  useEffect(() => { talkingRef.current  = talking;  }, [talking]);
  useEffect(() => { onStartRef.current  = onStart;  }, [onStart]);
  useEffect(() => { onStopRef.current   = onStop;   }, [onStop]);
  useEffect(() => { onLockRef.current   = onLock;   }, [onLock]);

  useEffect(() => {
    if (talking) {
      idleLoop.current?.stop();
      idleP.setValue(1);
      Animated.spring(scale, { toValue: 1.06, useNativeDriver: true, speed: 18, bounciness: 4 }).start();
      Animated.timing(glow,  { toValue: 1, duration: 180, useNativeDriver: true }).start();
      ringLoop.current = Animated.loop(
        Animated.stagger(320, [pulse(ring1), pulse(ring2), pulse(ring3)])
      );
      ringLoop.current.start();
    } else {
      ringLoop.current?.stop();
      lockAnim.setValue(0);
      [ring1, ring2, ring3].forEach(r => r.setValue(0));
      Animated.spring(scale, { toValue: 1,   useNativeDriver: true, speed: 18, bounciness: 4 }).start();
      Animated.timing(glow,  { toValue: 0, duration: 200, useNativeDriver: true }).start();
      if (!disabled) {
        idleLoop.current = Animated.loop(
          Animated.sequence([
            Animated.timing(idleP, { toValue: 0.88, duration: 1800, useNativeDriver: true }),
            Animated.timing(idleP, { toValue: 1,    duration: 1800, useNativeDriver: true }),
          ])
        );
        idleLoop.current.start();
      }
    }
    return () => { idleLoop.current?.stop(); };
  }, [talking, disabled]);

  function pulse(anim: Animated.Value) {
    return Animated.sequence([
      Animated.timing(anim, { toValue: 1, duration: 900, useNativeDriver: true }),
      Animated.timing(anim, { toValue: 0, duration: 0,   useNativeDriver: true }),
    ]);
  }

  const ringStyle = (anim: Animated.Value, size: number) => ({
    position: 'absolute' as const,
    width: size, height: size, borderRadius: size / 2,
    borderWidth: 1.5, borderColor: activeColor,
    opacity: anim.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0, 0.5, 0] }),
    transform: [{ scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.75, 1.2] }) }],
  });

  const pan = useRef(PanResponder.create({
    // Prioridade máxima — captura antes dos parents (resolve o botão que falha)
    onStartShouldSetPanResponder:        () => !disabledRef.current,
    onStartShouldSetPanResponderCapture: () => !disabledRef.current,

    onPanResponderGrant: () => {
      lockTriggered.current = false;
      if (lockedRef.current) {
        onStopRef.current(); // toque destravar
      } else {
        onStartRef.current();
      }
    },

    onPanResponderMove: (_, gs) => {
      if (!lockedRef.current && !lockTriggered.current && talkingRef.current) {
        const progress = Math.min(Math.max(-gs.dy / LOCK_PX, 0), 1);
        lockAnim.setValue(progress);
        if (gs.dy < -LOCK_PX) {
          lockTriggered.current = true;
          lockAnim.setValue(1);
          onLockRef.current();
        }
      }
    },

    onPanResponderRelease: () => {
      // lockTriggered = soltar após swipe up → fica travado, não para
      if (!lockedRef.current && !lockTriggered.current) {
        onStopRef.current();
      }
      if (!lockTriggered.current) lockAnim.setValue(0);
      lockTriggered.current = false;
    },

    onPanResponderTerminate: () => {
      if (!lockedRef.current && !lockTriggered.current) {
        onStopRef.current();
      }
      lockAnim.setValue(0);
      lockTriggered.current = false;
    },
  })).current;

  const bgTint       = talking ? `${activeColor}18` : disabled ? C.surface : 'rgba(0,204,255,0.06)';
  const progressWidth = Math.min(talkSeconds / MAX_SECS, 1) * BTN;
  const progressColor = talkColor(talkSeconds);

  return (
    <View style={s.wrap}>
      {/* Pulse rings */}
      <Animated.View style={[s.ring, ringStyle(ring1, BTN + 80)]}  pointerEvents="none" />
      <Animated.View style={[s.ring, ringStyle(ring2, BTN + 130)]} pointerEvents="none" />
      <Animated.View style={[s.ring, ringStyle(ring3, BTN + 180)]} pointerEvents="none" />

      {/* Outer glow */}
      <Animated.View pointerEvents="none" style={[s.glowRing, { opacity: glow, shadowColor: activeColor }]} />

      {/* Indicador de swipe para cima (aparece enquanto arrasta) */}
      {talking && !locked && (
        <Animated.View
          pointerEvents="none"
          style={[s.lockHint, {
            opacity: lockAnim,
            transform: [{ translateY: lockAnim.interpolate({ inputRange: [0, 1], outputRange: [10, -16] }) }],
          }]}
        >
          <Text style={[s.lockHintIcon, { color: C.cyan }]}>↑ 🔒</Text>
          <Text style={[s.lockHintText, { color: C.cyan }]}>soltar para travar</Text>
        </Animated.View>
      )}

      {/* Button */}
      <Animated.View
        style={[s.btn, {
          backgroundColor: bgTint,
          borderColor:  disabled ? C.border : activeColor,
          borderWidth:  talking ? 3 : 2,
          transform:    [{ scale: Animated.multiply(scale, disabled ? new Animated.Value(1) : idleP) }],
          opacity:      disabled ? 0.38 : 1,
          shadowColor:  activeColor,
          shadowOpacity: talking ? 0.55 : 0.2,
        }]}
        {...pan.panHandlers}
      >
        {locked && !talking
          ? <Text style={{ fontSize: 36 }}>🔒</Text>
          : locked && talking
          ? <Text style={{ fontSize: 28, color: activeColor }}>🔒</Text>
          : <MicIcon color={disabled ? C.text3 : activeColor} size={44} />
        }
      </Animated.View>

      {/* 60s progress bar */}
      {talking && (
        <View style={[s.progressTrack, { width: BTN }]}>
          <View style={[s.progressFill, { width: progressWidth, backgroundColor: progressColor }]} />
        </View>
      )}

      {/* Hint estático embaixo do botão */}
      {!talking && !locked && !disabled && (
        <Text style={s.swipeHint}>↑ arrastar para travar</Text>
      )}
    </View>
  );
}

function MicIcon({ color, size }: { color: string; size: number }) {
  const w = size * 0.44;
  const h = size * 0.64;
  return (
    <View style={{ alignItems: 'center', gap: 3 }}>
      <View style={{ width: w, height: h, borderRadius: w / 2, backgroundColor: color }} />
      <View style={{
        width: w * 1.55, height: h * 0.42,
        borderBottomLeftRadius: w, borderBottomRightRadius: w,
        borderWidth: 3, borderTopWidth: 0, borderColor: color,
      }} />
      <View style={{ width: 3, height: h * 0.22, backgroundColor: color, borderRadius: 2 }} />
      <View style={{ width: w * 1.1, height: 3, borderRadius: 2, backgroundColor: color }} />
    </View>
  );
}

const s = StyleSheet.create({
  wrap: {
    width: BTN + 200, height: BTN + 200,
    alignItems: 'center', justifyContent: 'center',
  },
  ring:    { position: 'absolute', alignSelf: 'center' },
  glowRing: {
    position: 'absolute',
    width: BTN + 20, height: BTN + 20, borderRadius: (BTN + 20) / 2,
    shadowOffset: { width: 0, height: 0 }, shadowRadius: 40, shadowOpacity: 1,
  },
  btn: {
    width: BTN, height: BTN, borderRadius: BTN / 2,
    alignItems: 'center', justifyContent: 'center',
    shadowOffset: { width: 0, height: 6 }, shadowRadius: 24, elevation: 14,
  },
  lockHint: {
    position: 'absolute',
    top: (BTN + 200) / 2 - BTN / 2 - 52,
    alignItems: 'center', gap: 2,
  },
  lockHintIcon: { fontSize: 18, fontWeight: '800' },
  lockHintText: { fontSize: 11, fontWeight: '700' },
  swipeHint: {
    position: 'absolute',
    bottom: (BTN + 200) / 2 - BTN / 2 - 28,
    fontSize: 10, color: C.text3, fontWeight: '600', letterSpacing: 0.3,
  },
  progressTrack: {
    position: 'absolute',
    bottom: (BTN + 200) / 2 - BTN / 2 - 8,
    height: 3, borderRadius: 2,
    backgroundColor: C.border2, overflow: 'hidden',
  },
  progressFill: { height: 3, borderRadius: 2 },
});
