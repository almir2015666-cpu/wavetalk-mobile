import React, { useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Dimensions, ScrollView, Animated,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C } from '../theme';

const { width } = Dimensions.get('window');

interface Slide {
  icon:    string;
  title:   string;
  body:    string;
  color:   string;
}

const SLIDES: Slide[] = [
  {
    icon:  '📻',
    title: 'Walkie-talkie no bolso',
    body:  'Fale com qualquer pessoa em tempo real, sem ligação e sem espera. Segure o botão e transmita.',
    color: C.cyan,
  },
  {
    icon:  '🎙',
    title: 'Segure para falar',
    body:  'Pressione e segure o botão central para transmitir. Solte para enviar. Simples assim.',
    color: C.green,
  },
  {
    icon:  '📡',
    title: 'Canais separados',
    body:  'Entre em canais públicos ou crie o seu com PIN secreto. Cada canal é uma conversa independente.',
    color: C.purple,
  },
  {
    icon:  '🟢',
    title: 'Seu status, suas regras',
    body:  'Disponível · Ocupado · Silencioso\n\nOcupado bloqueia áudios recebidos. Silencioso desliga seu microfone. Troque tocando no seu avatar.',
    color: C.green,
  },
  {
    icon:  '🚀',
    title: 'Pronto para transmitir',
    body:  'Sem cadastro, sem senha. Só escolha seu nome e comece a falar.',
    color: C.orange,
  },
];

interface Props {
  onDone: () => void;
}

export default function OnboardingScreen({ onDone }: Props) {
  const insets  = useSafeAreaInsets();
  const [page,  setPage]  = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const fadeAnim  = useRef(new Animated.Value(1)).current;

  const goTo = (next: number) => {
    Animated.sequence([
      Animated.timing(fadeAnim, { toValue: 0, duration: 120, useNativeDriver: true }),
      Animated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start();
    setPage(next);
    scrollRef.current?.scrollTo({ x: next * width, animated: true });
  };

  const isLast = page === SLIDES.length - 1;
  const slide  = SLIDES[page];

  return (
    <View style={[s.root, { paddingTop: insets.top, paddingBottom: insets.bottom + 24 }]}>
      <StatusBar style="light" />

      {/* Background glow */}
      <View style={[s.glow, { backgroundColor: slide.color }]} pointerEvents="none" />

      {/* Skip */}
      <TouchableOpacity style={s.skipBtn} onPress={onDone} activeOpacity={0.7}>
        <Text style={s.skipText}>Pular</Text>
      </TouchableOpacity>

      {/* Content */}
      <Animated.View style={[s.center, { opacity: fadeAnim }]}>
        <View style={[s.iconBox, { borderColor: slide.color + '55', shadowColor: slide.color }]}>
          <Text style={s.icon}>{slide.icon}</Text>
        </View>
        <Text style={[s.title, { color: slide.color }]}>{slide.title}</Text>
        <Text style={s.body}>{slide.body}</Text>
      </Animated.View>

      {/* Dots */}
      <View style={s.dots}>
        {SLIDES.map((_, i) => (
          <View
            key={i}
            style={[s.dot, {
              backgroundColor: i === page ? slide.color : C.border2,
              width: i === page ? 20 : 6,
            }]}
          />
        ))}
      </View>

      {/* CTA */}
      {isLast ? (
        <TouchableOpacity onPress={onDone} activeOpacity={0.85} style={s.ctaWrap}>
          <LinearGradient
            colors={['#00d4ff', '#7c3aff']}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
            style={s.cta}
          >
            <Text style={s.ctaText}>Começar  →</Text>
          </LinearGradient>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity onPress={() => goTo(page + 1)} activeOpacity={0.85} style={s.ctaWrap}>
          <View style={[s.cta, { backgroundColor: slide.color + '22', borderWidth: 1, borderColor: slide.color + '55' }]}>
            <Text style={[s.ctaText, { color: slide.color }]}>Próximo  →</Text>
          </View>
        </TouchableOpacity>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },

  glow: {
    position: 'absolute', width: 300, height: 300, borderRadius: 150,
    opacity: 0.07, top: 60, alignSelf: 'center',
  },

  skipBtn: { alignSelf: 'flex-end', paddingHorizontal: 20, paddingVertical: 12 },
  skipText: { fontSize: 14, color: C.text3, fontWeight: '600' },

  center: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 36, gap: 24,
  },

  iconBox: {
    width: 120, height: 120, borderRadius: 36,
    backgroundColor: C.card, borderWidth: 1.5,
    alignItems: 'center', justifyContent: 'center',
    shadowOffset: { width: 0, height: 0 }, shadowRadius: 30, shadowOpacity: 0.4, elevation: 8,
  },
  icon:  { fontSize: 56 },
  title: { fontSize: 28, fontWeight: '900', letterSpacing: -0.5, textAlign: 'center' },
  body:  { fontSize: 16, color: C.text2, lineHeight: 24, textAlign: 'center' },

  dots: { flexDirection: 'row', gap: 6, alignSelf: 'center', marginBottom: 24 },
  dot:  { height: 6, borderRadius: 3, backgroundColor: C.border2 },

  ctaWrap: { marginHorizontal: 24, borderRadius: 16, overflow: 'hidden' },
  cta:     { paddingVertical: 17, alignItems: 'center', borderRadius: 16 },
  ctaText: { fontSize: 16, fontWeight: '800', color: '#fff', letterSpacing: 0.2 },
});
