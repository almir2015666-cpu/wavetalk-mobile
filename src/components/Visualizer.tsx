import React, { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet } from 'react-native';
import { C } from '../theme';

const BAR_COUNT = 24;

interface Props {
  active:   boolean;
  isPeer?:  boolean;
}

export default function Visualizer({ active, isPeer }: Props) {
  const bars = useRef(
    Array.from({ length: BAR_COUNT }, () => new Animated.Value(3))
  ).current;
  const animRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (active) {
      animRef.current = setInterval(() => {
        bars.forEach((bar, i) => {
          const center = BAR_COUNT / 2;
          const dist   = Math.abs(i - center) / center;
          const base   = (1 - dist * 0.5) * 40;
          const h      = 3 + Math.random() * base;
          Animated.spring(bar, {
            toValue: h, useNativeDriver: false, speed: 40, bounciness: 0,
          }).start();
        });
      }, 90);
    } else {
      if (animRef.current) { clearInterval(animRef.current); animRef.current = null; }
      bars.forEach(bar => {
        Animated.spring(bar, { toValue: 3, useNativeDriver: false, speed: 20, bounciness: 0 }).start();
      });
    }
    return () => { if (animRef.current) clearInterval(animRef.current); };
  }, [active]);

  const barColor = isPeer ? C.green : C.cyan;

  return (
    <View style={styles.wrap}>
      {bars.map((anim, i) => (
        <Animated.View
          key={i}
          style={[
            styles.bar,
            {
              height:          anim,
              backgroundColor: barColor,
              opacity:         active ? 1 : 0.2,
            },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems:    'flex-end',
    justifyContent:'center',
    gap:           3,
    height:        56,
    width:         '100%',
  },
  bar: {
    width: 4, borderRadius: 3, minHeight: 3,
  },
});
