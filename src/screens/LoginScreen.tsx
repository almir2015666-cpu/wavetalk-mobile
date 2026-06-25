import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, Animated, ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C } from '../theme';

interface Props {
  onEnter:    (name: string) => void;
  loading:    boolean;
  savedName?: string;
}

export default function LoginScreen({ onEnter, loading, savedName }: Props) {
  const [name, setName] = useState(savedName ?? '');
  const insets = useSafeAreaInsets();

  const logoY    = useRef(new Animated.Value(24)).current;
  const logoOp   = useRef(new Animated.Value(0)).current;
  const formOp   = useRef(new Animated.Value(0)).current;
  const glowAnim = useRef(new Animated.Value(0)).current;
  const pulse1   = useRef(new Animated.Value(0)).current;
  const pulse2   = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.parallel([
        Animated.spring(logoY,  { toValue: 0, useNativeDriver: true, tension: 50, friction: 8 }),
        Animated.timing(logoOp, { toValue: 1, duration: 500, useNativeDriver: true }),
      ]),
      Animated.timing(formOp, { toValue: 1, duration: 400, useNativeDriver: true }),
    ]).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, { toValue: 1, duration: 3000, useNativeDriver: false }),
        Animated.timing(glowAnim, { toValue: 0, duration: 3000, useNativeDriver: false }),
      ])
    ).start();

    // Pulse rings — staggered by half a cycle
    Animated.loop(
      Animated.timing(pulse1, { toValue: 1, duration: 2000, useNativeDriver: true })
    ).start();
    setTimeout(() => {
      Animated.loop(
        Animated.timing(pulse2, { toValue: 1, duration: 2000, useNativeDriver: true })
      ).start();
    }, 1000);
  }, []);

  const canEnter = name.trim().length >= 2;

  return (
    <View style={s.root}>
      <StatusBar style="light" />

      {/* Background glows */}
      <Animated.View style={[s.glow1, {
        opacity: glowAnim.interpolate({ inputRange: [0,1], outputRange: [0.12, 0.28] }),
      }]} pointerEvents="none" />
      <Animated.View style={[s.glow2, {
        opacity: glowAnim.interpolate({ inputRange: [0,1], outputRange: [0.08, 0.18] }),
      }]} pointerEvents="none" />

      <KeyboardAvoidingView
        style={s.kav}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        {/* Logo area */}
        <Animated.View style={[s.logoArea, { paddingTop: insets.top + 40, opacity: logoOp, transform: [{ translateY: logoY }] }]}>
          <View style={{ alignItems: 'center', justifyContent: 'center' }}>
            {/* Pulse ring 1 */}
            <Animated.View style={[s.pulseRing, {
              opacity:   pulse1.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 0.55, 0] }),
              transform: [{ scale: pulse1.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1.90] }) }],
            }]} />
            {/* Pulse ring 2 */}
            <Animated.View style={[s.pulseRing, {
              opacity:   pulse2.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 0.55, 0] }),
              transform: [{ scale: pulse2.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1.90] }) }],
            }]} />
            <View style={s.iconWrap}>
              <MicSVG color={C.cyan} />
            </View>
          </View>
          <Text style={s.appName}>WaveTalk</Text>
          <Text style={s.tagline}>Fale agora. Seja ouvido.</Text>
        </Animated.View>

        {/* Form area */}
        <Animated.View style={[s.formArea, { paddingBottom: insets.bottom + 32, opacity: formOp }]}>
          <Text style={s.fieldLabel}>Como quer ser chamado?</Text>

          <TextInput
            style={s.input}
            placeholder="Ex: José Costa"
            placeholderTextColor={C.text3}
            value={name}
            onChangeText={setName}
            maxLength={24}
            autoCorrect={false}
            autoCapitalize="words"
            returnKeyType="go"
            onSubmitEditing={() => canEnter && onEnter(name.trim())}
            selectionColor={C.cyan}
          />

          <TouchableOpacity
            style={[s.btnWrap, !canEnter && s.btnDisabled]}
            onPress={() => canEnter && onEnter(name.trim())}
            disabled={loading || !canEnter}
            activeOpacity={0.82}
          >
            {canEnter ? (
              <LinearGradient
                colors={['#00d4ff', '#7c3aff']}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={s.btn}
              >
                {loading
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={s.btnText}>Escolher canal  →</Text>
                }
              </LinearGradient>
            ) : (
              <View style={[s.btn, s.btnInactive]}>
                <Text style={s.btnTextInactive}>Digite seu nome para continuar</Text>
              </View>
            )}
          </TouchableOpacity>

          <Text style={s.hint}>Sem cadastro · Sem senha · Só falar</Text>
        </Animated.View>
      </KeyboardAvoidingView>
    </View>
  );
}

function MicSVG({ color }: { color: string }) {
  return (
    <View style={{ alignItems: 'center', gap: 3 }}>
      <View style={{ width: 22, height: 34, borderRadius: 11, backgroundColor: color }} />
      <View style={{
        width: 34, height: 18,
        borderBottomLeftRadius: 17, borderBottomRightRadius: 17,
        borderWidth: 3, borderTopWidth: 0, borderColor: color,
      }} />
      <View style={{ width: 3, height: 8, backgroundColor: color, borderRadius: 2 }} />
      <View style={{ width: 20, height: 3, borderRadius: 2, backgroundColor: color }} />
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  kav:  { flex: 1, justifyContent: 'space-between' },

  glow1: {
    position: 'absolute', width: 360, height: 360, borderRadius: 180,
    backgroundColor: C.cyan, top: -80, alignSelf: 'center',
  },
  glow2: {
    position: 'absolute', width: 240, height: 240, borderRadius: 120,
    backgroundColor: C.purple, top: 60, alignSelf: 'center',
  },

  logoArea: {
    flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, paddingHorizontal: 24,
  },
  pulseRing: {
    position: 'absolute',
    width: 88, height: 88, borderRadius: 26,
    backgroundColor: C.cyan,
  },
  iconWrap: {
    width: 88, height: 88, borderRadius: 26, backgroundColor: C.card,
    borderWidth: 1.5, borderColor: C.cyan + '88',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: C.cyan, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.5, shadowRadius: 28,
    elevation: 12,
  },
  appName: { fontSize: 40, fontWeight: '900', color: C.text, letterSpacing: -1.5 },
  tagline: { fontSize: 15, color: C.text2, letterSpacing: 0.2 },

  formArea: { paddingHorizontal: 24, gap: 12 },
  fieldLabel: {
    fontSize: 11, fontWeight: '700', color: C.text3,
    letterSpacing: 1.4, textTransform: 'uppercase',
  },
  input: {
    backgroundColor: C.card, borderWidth: 1.5, borderColor: C.border2,
    borderRadius: 16, paddingHorizontal: 18, paddingVertical: 16,
    fontSize: 17, color: C.text, fontWeight: '500',
  },
  btnWrap: { borderRadius: 16, overflow: 'hidden' },
  btnDisabled: { opacity: 0.7 },
  btn: { borderRadius: 16, paddingVertical: 17, alignItems: 'center', justifyContent: 'center' },
  btnInactive: { backgroundColor: C.card, borderWidth: 1.5, borderColor: C.border2 },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '800', letterSpacing: 0.2 },
  btnTextInactive: { color: C.text3, fontSize: 15, fontWeight: '500' },
  hint: { fontSize: 12, color: C.text3, textAlign: 'center', marginTop: 4 },
});
