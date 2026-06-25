import React, { useEffect, useRef } from 'react';
import { View, Text, Animated, PanResponder, StyleSheet } from 'react-native';
import { C } from '../theme';

interface Props {
  talking:  boolean;
  disabled: boolean;
  onStart:  () => void;
  onStop:   () => void;
}

const BTN = 180;

export default function PTTButton({ talking, disabled, onStart, onStop }: Props) {
  const scale  = useRef(new Animated.Value(1)).current;
  const glow   = useRef(new Animated.Value(0)).current;
  const ring1  = useRef(new Animated.Value(0)).current;
  const ring2  = useRef(new Animated.Value(0)).current;
  const ring3  = useRef(new Animated.Value(0)).current;
  const idleP  = useRef(new Animated.Value(1)).current;
  const ringLoop = useRef<Animated.CompositeAnimation | null>(null);
  const idleLoop = useRef<Animated.CompositeAnimation | null>(null);

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
    borderWidth: 1.5,
    borderColor: C.green,
    opacity: anim.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0, 0.5, 0] }),
    transform: [{ scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.75, 1.2] }) }],
  });

  const disabledRef = useRef(disabled);
  const onStartRef  = useRef(onStart);
  const onStopRef   = useRef(onStop);
  useEffect(() => { disabledRef.current = disabled; }, [disabled]);
  useEffect(() => { onStartRef.current  = onStart;  }, [onStart]);
  useEffect(() => { onStopRef.current   = onStop;   }, [onStop]);

  const pan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => !disabledRef.current,
    onPanResponderGrant:          () => onStartRef.current(),
    onPanResponderRelease:        () => onStopRef.current(),
    onPanResponderTerminate:      () => onStopRef.current(),
  })).current;

  const color  = talking ? C.green : C.cyan;
  const bgTint = talking ? 'rgba(0,240,128,0.10)' : disabled ? C.surface : 'rgba(0,204,255,0.06)';

  return (
    <View style={s.wrap}>
      {/* Pulse rings (talking) */}
      <Animated.View style={[s.ring, ringStyle(ring1, BTN + 80)]}  pointerEvents="none" />
      <Animated.View style={[s.ring, ringStyle(ring2, BTN + 130)]} pointerEvents="none" />
      <Animated.View style={[s.ring, ringStyle(ring3, BTN + 180)]} pointerEvents="none" />

      {/* Outer glow */}
      <Animated.View pointerEvents="none" style={[s.glowRing, {
        opacity: glow,
        shadowColor: C.green,
      }]} />

      {/* Button */}
      <Animated.View
        style={[s.btn, {
          backgroundColor: bgTint,
          borderColor: disabled ? C.border : color,
          borderWidth: talking ? 3 : 2,
          transform: [{ scale: Animated.multiply(scale, disabled ? new Animated.Value(1) : idleP) }],
          opacity: disabled ? 0.38 : 1,
          shadowColor: color,
          shadowOpacity: talking ? 0.55 : 0.2,
        }]}
        {...pan.panHandlers}
      >
        <MicIcon color={disabled ? C.text3 : color} size={44} />
      </Animated.View>
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
    width:  BTN + 200,
    height: BTN + 200,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: { position: 'absolute', alignSelf: 'center' },
  glowRing: {
    position: 'absolute',
    width: BTN + 20, height: BTN + 20, borderRadius: (BTN + 20) / 2,
    shadowOffset: { width: 0, height: 0 }, shadowRadius: 40, shadowOpacity: 1,
  },
  btn: {
    width: BTN, height: BTN, borderRadius: BTN / 2,
    alignItems: 'center', justifyContent: 'center',
    shadowOffset: { width: 0, height: 6 }, shadowRadius: 24,
    elevation: 14,
  },
});
