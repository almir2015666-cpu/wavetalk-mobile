import React, { useEffect, useRef } from 'react';
import { View, Animated, Easing, StyleSheet, Dimensions } from 'react-native';
import { C } from '../theme';

const { width: W, height: H } = Dimensions.get('window');

interface BlobProps {
  color:   string;
  size:    number;
  fromX:   number;
  fromY:   number;
  toX:     number;
  toY:     number;
  dur:     number;
  delay:   number;
  opacity: number;
}

function Blob({ color, size, fromX, fromY, toX, toY, dur, delay, opacity }: BlobProps) {
  const x  = useRef(new Animated.Value(fromX - size / 2)).current;
  const y  = useRef(new Animated.Value(fromY - size / 2)).current;
  const sc = useRef(new Animated.Value(0.9)).current;

  useEffect(() => {
    const move = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.parallel([
          Animated.timing(x, { toValue: toX - size / 2, duration: dur, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(y, { toValue: toY - size / 2, duration: dur, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(x, { toValue: fromX - size / 2, duration: dur, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(y, { toValue: fromY - size / 2, duration: dur, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        ]),
      ])
    );

    const breathe = Animated.loop(
      Animated.sequence([
        Animated.timing(sc, { toValue: 1.25, duration: dur * 0.45, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(sc, { toValue: 0.80, duration: dur * 0.45, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(sc, { toValue: 0.90, duration: dur * 0.10, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])
    );

    move.start();
    breathe.start();
    return () => { move.stop(); breathe.stop(); };
  }, []);

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position:        'absolute',
        width:           size,
        height:          size,
        borderRadius:    size / 2,
        backgroundColor: color,
        opacity,
        transform: [{ translateX: x }, { translateY: y }, { scale: sc }],
      }}
    />
  );
}

export default function LiveBackground() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Blob color={C.cyan}   size={320} fromX={-40}   fromY={80}     toX={W * 0.6}  toY={180}     dur={9000}  delay={0}    opacity={0.30} />
      <Blob color={C.purple} size={280} fromX={W + 40} fromY={60}    toX={W * 0.2}  toY={220}     dur={11000} delay={1500} opacity={0.25} />
      <Blob color={C.cyan}   size={240} fromX={W * 0.1} fromY={H * 0.4} toX={W * 0.7} toY={H * 0.5} dur={13000} delay={500}  opacity={0.22} />
      <Blob color={C.purple} size={260} fromX={W * 0.8} fromY={H * 0.55} toX={W * 0.1} toY={H * 0.6} dur={10000} delay={3000} opacity={0.20} />
      <Blob color={C.cyan}   size={200} fromX={W * 0.3} fromY={H * 0.75} toX={W * 0.8} toY={H * 0.8} dur={12000} delay={2000} opacity={0.18} />
      <Blob color={C.purple} size={180} fromX={W * 0.6} fromY={H * 0.85} toX={-20}    toY={H * 0.9} dur={14000} delay={4000} opacity={0.16} />
    </View>
  );
}
