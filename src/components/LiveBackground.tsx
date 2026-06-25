import React, { useEffect, useRef } from 'react';
import { View, Animated, Easing, StyleSheet, Dimensions } from 'react-native';
import { C } from '../theme';

const { width: W, height: H } = Dimensions.get('window');

interface Blob {
  color:  string;
  size:   number;
  points: Array<{ x: number; y: number }>;
  dur:    number;
  delay:  number;
  opacity: number;
}

const BLOBS: Blob[] = [
  {
    color:   C.cyan,
    size:    260,
    points:  [{ x: -60, y: 40 }, { x: W * 0.3, y: 120 }, { x: W * 0.6, y: 20 }, { x: W - 40, y: 200 }, { x: W * 0.4, y: 300 }],
    dur:     14000,
    delay:   0,
    opacity: 0.18,
  },
  {
    color:   C.purple,
    size:    220,
    points:  [{ x: W - 40, y: 100 }, { x: W * 0.5, y: 60 }, { x: 20, y: 180 }, { x: W * 0.3, y: 320 }, { x: W * 0.7, y: 250 }],
    dur:     18000,
    delay:   3000,
    opacity: 0.15,
  },
  {
    color:   C.green,
    size:    180,
    points:  [{ x: W * 0.2, y: H * 0.5 }, { x: W * 0.7, y: H * 0.4 }, { x: W * 0.1, y: H * 0.6 }, { x: W * 0.8, y: H * 0.55 }],
    dur:     22000,
    delay:   6000,
    opacity: 0.12,
  },
  {
    color:   C.cyan,
    size:    200,
    points:  [{ x: W * 0.6, y: H * 0.6 }, { x: W * 0.1, y: H * 0.7 }, { x: W * 0.8, y: H * 0.8 }, { x: W * 0.3, y: H * 0.65 }],
    dur:     16000,
    delay:   9000,
    opacity: 0.14,
  },
  {
    color:   C.purple,
    size:    160,
    points:  [{ x: W * 0.4, y: H * 0.8 }, { x: W * 0.9, y: H * 0.7 }, { x: W * 0.2, y: H * 0.85 }, { x: W * 0.6, y: H * 0.9 }],
    dur:     20000,
    delay:   2000,
    opacity: 0.13,
  },
  {
    color:   C.orange,
    size:    140,
    points:  [{ x: -20, y: H * 0.4 }, { x: W * 0.5, y: H * 0.35 }, { x: W + 20, y: H * 0.5 }, { x: W * 0.3, y: H * 0.45 }],
    dur:     25000,
    delay:   12000,
    opacity: 0.10,
  },
];

function BlobAnim({ blob }: { blob: Blob }) {
  const x    = useRef(new Animated.Value(blob.points[0].x)).current;
  const y    = useRef(new Animated.Value(blob.points[0].y)).current;
  const sc   = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const segDur = blob.dur / blob.points.length;

    const buildLoop = () => {
      const steps = [...blob.points, blob.points[0]];
      const xAnims = steps.map((p, i) =>
        Animated.timing(x, { toValue: p.x, duration: segDur, easing: Easing.inOut(Easing.sin), useNativeDriver: true, delay: i === 0 ? blob.delay : 0 })
      );
      const yAnims = steps.map((p, i) =>
        Animated.timing(y, { toValue: p.y, duration: segDur, easing: Easing.inOut(Easing.sin), useNativeDriver: true, delay: i === 0 ? blob.delay : 0 })
      );
      return Animated.loop(
        Animated.parallel([
          Animated.sequence(xAnims),
          Animated.sequence(yAnims),
        ])
      );
    };

    const scaleLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(sc, { toValue: 1.18, duration: blob.dur * 0.4, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(sc, { toValue: 0.88, duration: blob.dur * 0.4, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(sc, { toValue: 1.0,  duration: blob.dur * 0.2, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])
    );

    const loop = buildLoop();
    loop.start();
    scaleLoop.start();
    return () => { loop.stop(); scaleLoop.stop(); };
  }, []);

  const half = blob.size / 2;

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        s.blob,
        {
          width:         blob.size,
          height:        blob.size,
          borderRadius:  blob.size / 2,
          backgroundColor: blob.color,
          opacity:       blob.opacity,
          transform: [
            { translateX: Animated.add(x, new Animated.Value(-half)) },
            { translateY: Animated.add(y, new Animated.Value(-half)) },
            { scale: sc },
          ],
        },
      ]}
    />
  );
}

export default function LiveBackground() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {BLOBS.map((blob, i) => <BlobAnim key={i} blob={blob} />)}
    </View>
  );
}

const s = StyleSheet.create({
  blob: { position: 'absolute' },
});
