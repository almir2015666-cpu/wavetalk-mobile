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
      <Blob color={C.cyan}   size={320} fromX={-60}      fromY={60}       toX={W * 0.55} toY={200}      dur={28000} delay={0}     opacity={0.28} />
      <Blob color={C.purple} size={290} fromX={W + 40}   fromY={40}       toX={W * 0.15} toY={240}      dur={34000} delay={5000}  opacity={0.22} />
      <Blob color={C.cyan}   size={250} fromX={W * 0.05} fromY={H * 0.38} toX={W * 0.72} toY={H * 0.48} dur={30000} delay={2000}  opacity={0.20} />
      <Blob color={C.purple} size={270} fromX={W * 0.82} fromY={H * 0.52} toX={W * 0.08} toY={H * 0.60} dur={38000} delay={8000}  opacity={0.18} />
      <Blob color={C.cyan}   size={210} fromX={W * 0.25} fromY={H * 0.72} toX={W * 0.78} toY={H * 0.78} dur={32000} delay={4000}  opacity={0.16} />
      <Blob color={C.purple} size={190} fromX={W * 0.65} fromY={H * 0.84} toX={-20}      toY={H * 0.88} dur={36000} delay={11000} opacity={0.14} />
    </View>
  );
}
