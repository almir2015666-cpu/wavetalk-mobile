import React, { useEffect, useRef } from 'react';
import {
  View, Text, Animated, PanResponder, StyleSheet, Platform,
} from 'react-native';
import { C } from '../theme';

interface Props {
  talking:   boolean;
  disabled:  boolean;
  onStart:   () => void;
  onStop:    () => void;
}

export default function PTTButton({ talking, disabled, onStart, onStop }: Props) {
  const scale   = useRef(new Animated.Value(1)).current;
  const ring1   = useRef(new Animated.Value(0)).current;
  const ring2   = useRef(new Animated.Value(0)).current;
  const ring3   = useRef(new Animated.Value(0)).current;
  const glowOp  = useRef(new Animated.Value(0)).current;
  const ringAnim = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    if (talking) {
      Animated.spring(scale, { toValue: 1.08, useNativeDriver: true, speed: 14, bounciness: 6 }).start();
      Animated.timing(glowOp, { toValue: 1, duration: 200, useNativeDriver: true }).start();
      ringAnim.current = Animated.loop(
        Animated.stagger(280, [
          ringPulse(ring1, 0),
          ringPulse(ring2, 0),
          ringPulse(ring3, 0),
        ])
      );
      ringAnim.current.start();
    } else {
      ringAnim.current?.stop();
      [ring1, ring2, ring3].forEach(r => r.setValue(0));
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 14, bounciness: 6 }).start();
      Animated.timing(glowOp, { toValue: 0, duration: 200, useNativeDriver: true }).start();
    }
  }, [talking]);

  function ringPulse(anim: Animated.Value, _delay: number) {
    return Animated.sequence([
      Animated.timing(anim, { toValue: 1, duration: 1000, useNativeDriver: true }),
      Animated.timing(anim, { toValue: 0, duration: 0,    useNativeDriver: true }),
    ]);
  }

  const ringStyle = (anim: Animated.Value, size: number) => ({
    position: 'absolute' as const,
    width: size, height: size,
    borderRadius: size / 2,
    borderWidth: 1.5,
    borderColor: talking ? C.green : C.cyan,
    opacity: anim.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 0.6, 0] }),
    transform: [{ scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1.15] }) }],
  });

  const disabledRef = useRef(disabled);
  const onStartRef  = useRef(onStart);
  const onStopRef   = useRef(onStop);
  useEffect(() => { disabledRef.current = disabled; },  [disabled]);
  useEffect(() => { onStartRef.current  = onStart;  },  [onStart]);
  useEffect(() => { onStopRef.current   = onStop;   },  [onStop]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !disabledRef.current,
      onPanResponderGrant:          () => onStartRef.current(),
      onPanResponderRelease:        () => onStopRef.current(),
      onPanResponderTerminate:      () => onStopRef.current(),
    })
  ).current;

  const btnBg = talking
    ? 'rgba(0,255,136,0.08)'
    : disabled ? '#0f1623' : '#111927';

  const btnBorder = talking ? C.green : disabled ? C.border : C.border2;

  return (
    <View style={styles.wrap}>
      {/* Rings */}
      <Animated.View style={[styles.ringBase, ringStyle(ring1, 176)]} pointerEvents="none"/>
      <Animated.View style={[styles.ringBase, ringStyle(ring2, 220)]} pointerEvents="none"/>
      <Animated.View style={[styles.ringBase, ringStyle(ring3, 264)]} pointerEvents="none"/>

      {/* Glow shadow layer */}
      <Animated.View
        pointerEvents="none"
        style={[styles.glow, {
          opacity: glowOp,
          shadowColor: talking ? C.green : C.cyan,
        }]}
      />

      {/* Button */}
      <Animated.View
        style={[styles.btn, {
          backgroundColor: btnBg,
          borderColor:     btnBorder,
          transform:       [{ scale }],
          opacity:         disabled ? 0.4 : 1,
          shadowColor:     talking ? C.green : '#000',
          shadowOpacity:   talking ? 0.5 : 0.3,
        }]}
        {...panResponder.panHandlers}
      >
        {/* Mic icon */}
        <View style={[styles.micIcon, { opacity: disabled ? 0.5 : 1 }]}>
          <View style={[styles.micBody,    { backgroundColor: talking ? C.green : C.text2 }]} />
          <View style={[styles.micStand,   { borderColor:     talking ? C.green : C.text2 }]} />
          <View style={[styles.micBasePole,{ backgroundColor: talking ? C.green : C.text2 }]} />
          <View style={[styles.micBaseBar, { backgroundColor: talking ? C.green : C.text2 }]} />
        </View>

        <Text style={[styles.label, { color: talking ? C.green : disabled ? C.text3 : C.text3 }]}>
          {disabled ? 'Aguarde' : talking ? 'Falando…' : 'Segurar'}
        </Text>
      </Animated.View>
    </View>
  );
}

const BTN = 140;

const styles = StyleSheet.create({
  wrap: { width: BTN + 130, height: BTN + 130, alignItems: 'center', justifyContent: 'center' },
  ringBase: { position: 'absolute', alignSelf: 'center' },
  glow: {
    position:  'absolute',
    width: BTN + 40, height: BTN + 40,
    borderRadius: (BTN + 40) / 2,
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 40,
    shadowOpacity: 0.6,
    elevation: 0,
  },
  btn: {
    width: BTN, height: BTN, borderRadius: BTN / 2,
    borderWidth: 3,
    alignItems: 'center', justifyContent: 'center',
    gap: 8,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 20,
    elevation: 12,
  },
  micIcon: { alignItems: 'center', gap: 2 },
  micBody: {
    width: 22, height: 34, borderRadius: 11,
  },
  micStand: {
    width: 34, height: 16,
    borderBottomLeftRadius: 17, borderBottomRightRadius: 17,
    borderWidth: 3, borderTopWidth: 0,
    marginTop: 2,
  },
  micBasePole: { width: 3, height: 8 },
  micBaseBar:  { width: 22, height: 3, borderRadius: 2 },
  label: {
    fontSize: 10, fontWeight: '700', letterSpacing: 1.5, textTransform: 'uppercase',
  },
});
