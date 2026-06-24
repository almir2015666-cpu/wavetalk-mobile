import React, { useState, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, Animated, ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { C } from '../theme';

interface Props {
  onEnter: (name: string) => void;
  loading: boolean;
}

export default function LoginScreen({ onEnter, loading }: Props) {
  const [name,    setName]    = useState('');
  const glowAnim = useRef(new Animated.Value(0.6)).current;

  React.useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, { toValue: 1,   duration: 3000, useNativeDriver: true }),
        Animated.timing(glowAnim, { toValue: 0.6, duration: 3000, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  const handleEnter = () => {
    onEnter(name.trim() || 'Visitante');
  };

  return (
    <View style={styles.root}>
      <StatusBar style="light"/>
      <Animated.View style={[styles.bgGlow, { opacity: glowAnim }]} pointerEvents="none"/>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.kav}>
        <View style={styles.card}>

          <View style={styles.logoSection}>
            <LinearGradient colors={['#00d4ff18','#7c3aff18']} style={styles.logoBox}>
              <View style={styles.logoIconWrap}>
                <View style={styles.lMicBody}/>
                <View style={styles.lMicStand}/>
                <View style={styles.lMicPole}/>
                <View style={styles.lMicBase}/>
              </View>
            </LinearGradient>
            <Text style={styles.appName}>WaveTalk</Text>
            <Text style={styles.tagline}>Fale agora. Seja ouvido.</Text>
          </View>

          <View style={styles.form}>
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>SEU NOME</Text>
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={setName}
                placeholder="Ex: José Costa"
                placeholderTextColor={C.text3}
                returnKeyType="go"
                onSubmitEditing={handleEnter}
                autoCapitalize="words"
                autoCorrect={false}
                maxLength={40}
              />
            </View>

            <TouchableOpacity onPress={handleEnter} disabled={loading} activeOpacity={0.85}>
              <LinearGradient
                colors={['#00d4ff','#7c3aff']}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={styles.btnEnter}
              >
                {loading
                  ? <ActivityIndicator color="#fff" size="small"/>
                  : <Text style={styles.btnEnterText}>Entrar →</Text>
                }
              </LinearGradient>
            </TouchableOpacity>
          </View>

          <Text style={styles.footer}>Sem cadastro. Sem senha. Só falar.</Text>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' },
  bgGlow: {
    position: 'absolute', width: 500, height: 500, borderRadius: 250,
    backgroundColor: '#00d4ff0a', top: '10%', alignSelf: 'center',
  },
  kav: { width: '100%', alignItems: 'center' },
  card: {
    width: '88%', maxWidth: 400,
    backgroundColor: C.surface, borderRadius: 24,
    borderWidth: 1, borderColor: C.border2,
    padding: 32, gap: 24,
    shadowColor: '#00d4ff', shadowOffset: { width:0, height:0 }, shadowOpacity: 0.05, shadowRadius: 30,
    elevation: 20,
  },
  logoSection: { alignItems: 'center', gap: 10 },
  logoBox: {
    width: 68, height: 68, borderRadius: 18,
    borderWidth: 1.5, borderColor: '#00d4ff55',
    alignItems: 'center', justifyContent: 'center',
  },
  logoIconWrap: { alignItems: 'center' },
  lMicBody:  { width: 18, height: 28, borderRadius: 9,  backgroundColor: C.cyan },
  lMicStand: { width: 28, height: 12, borderRadius: 14, borderWidth: 2.5, borderColor: C.purple, borderTopWidth: 0, marginTop: 2 },
  lMicPole:  { width: 2.5, height: 7, backgroundColor: C.purple },
  lMicBase:  { width: 18, height: 2.5, borderRadius: 2, backgroundColor: C.purple },
  appName:   { fontSize: 26, fontWeight: '900', letterSpacing: -1, color: C.cyan },
  tagline:   { fontSize: 11, color: C.text3, letterSpacing: 2, textTransform: 'uppercase' },
  form:      { gap: 14 },
  field:     { gap: 6 },
  fieldLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 1.2, color: C.text3, textTransform: 'uppercase' },
  input: {
    backgroundColor: C.card, borderWidth: 1, borderColor: C.border2, borderRadius: 10,
    padding: 13, color: C.text, fontSize: 14,
  },
  btnEnter:     { borderRadius: 12, padding: 15, alignItems: 'center' },
  btnEnterText: { color: '#fff', fontSize: 15, fontWeight: '800', letterSpacing: 0.3 },
  footer:       { fontSize: 12, color: C.text3, textAlign: 'center' },
});
