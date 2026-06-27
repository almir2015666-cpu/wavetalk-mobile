import React from 'react';
import {
  View, Text, TouchableOpacity, Modal, StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp, ThemeMode, HapticLevel, SoundTheme } from '../contexts/AppContext';

interface Props {
  visible: boolean;
  onClose: () => void;
}

export default function SettingsModal({ visible, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const { C, themeMode, setThemeMode, hapticLevel, setHapticLevel, soundTheme, setSoundTheme } = useApp();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={s.overlay} activeOpacity={1} onPress={onClose}>
        <View
          style={[
            s.sheet,
            {
              paddingBottom:   insets.bottom + 24,
              backgroundColor: C.surface,
              borderTopColor:  C.border2,
            },
          ]}
          onStartShouldSetResponder={() => true}
        >
          {/* Handle */}
          <View style={[s.handle, { backgroundColor: C.border2 }]} />
          <Text style={[s.title, { color: C.text }]}>Configurações</Text>

          {/* ── TEMA ── */}
          <Text style={[s.sectionLabel, { color: C.text3 }]}>TEMA</Text>
          <View style={[s.optRow, { backgroundColor: C.card, borderColor: C.border2 }]}>
            {([
              { key: 'dark',  label: 'Escuro', icon: '🌙' },
              { key: 'light', label: 'Claro',  icon: '☀️' },
            ] as { key: ThemeMode; label: string; icon: string }[]).map(opt => {
              const active = themeMode === opt.key;
              return (
                <TouchableOpacity
                  key={opt.key}
                  style={[
                    s.optBtn,
                    active && { backgroundColor: C.cyan + '22', borderColor: C.cyan },
                  ]}
                  onPress={() => setThemeMode(opt.key)}
                  activeOpacity={0.75}
                >
                  <Text style={{ fontSize: 24 }}>{opt.icon}</Text>
                  <Text style={[s.optLabel, { color: active ? C.cyan : C.text2 }]}>{opt.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* ── HAPTICS ── */}
          <Text style={[s.sectionLabel, { color: C.text3 }]}>VIBRAÇÃO (HAPTICS)</Text>
          <View style={[s.optRow, { backgroundColor: C.card, borderColor: C.border2 }]}>
            {([
              { key: 'off',    label: 'Off',   icon: '○' },
              { key: 'light',  label: 'Leve',  icon: '◎' },
              { key: 'medium', label: 'Média', icon: '◉' },
              { key: 'heavy',  label: 'Forte', icon: '●' },
            ] as { key: HapticLevel; label: string; icon: string }[]).map(opt => {
              const active = hapticLevel === opt.key;
              return (
                <TouchableOpacity
                  key={opt.key}
                  style={[
                    s.optBtn,
                    active && { backgroundColor: C.cyan + '22', borderColor: C.cyan },
                  ]}
                  onPress={() => setHapticLevel(opt.key)}
                  activeOpacity={0.75}
                >
                  <Text style={[s.hapticIcon, { color: active ? C.cyan : C.text3 }]}>{opt.icon}</Text>
                  <Text style={[s.optLabel, { color: active ? C.cyan : C.text2 }]}>{opt.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* ── SONS PTT ── */}
          <Text style={[s.sectionLabel, { color: C.text3 }]}>SONS DO PTT</Text>
          <View style={[s.optRow, { backgroundColor: C.card, borderColor: C.border2 }]}>
            {([
              { key: 'default',  label: 'Padrão',     icon: '🔊' },
              { key: 'military', label: 'Militar',     icon: '📡' },
              { key: 'minimal',  label: 'Silencioso',  icon: '🔇' },
            ] as { key: SoundTheme; label: string; icon: string }[]).map(opt => {
              const active = soundTheme === opt.key;
              return (
                <TouchableOpacity
                  key={opt.key}
                  style={[
                    s.optBtn,
                    active && { backgroundColor: C.cyan + '22', borderColor: C.cyan },
                  ]}
                  onPress={() => setSoundTheme(opt.key)}
                  activeOpacity={0.75}
                >
                  <Text style={{ fontSize: 22 }}>{opt.icon}</Text>
                  <Text style={[s.optLabel, { color: active ? C.cyan : C.text2 }]}>{opt.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={[s.version, { color: C.text3 }]}>WaveTalk v2.0</Text>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingTop: 12, paddingHorizontal: 20,
    borderTopWidth: 1,
  },
  handle:       { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
  title:        { fontSize: 18, fontWeight: '900', marginBottom: 24 },
  sectionLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 1.4, marginBottom: 10, marginTop: 4 },

  optRow: {
    flexDirection: 'row', borderRadius: 16, borderWidth: 1,
    padding: 4, gap: 4, marginBottom: 20,
  },
  optBtn: {
    flex: 1, alignItems: 'center', paddingVertical: 14, gap: 5,
    borderWidth: 1.5, borderColor: 'transparent', borderRadius: 12,
  },
  hapticIcon: { fontSize: 18, fontWeight: '900' },
  optLabel:   { fontSize: 11, fontWeight: '700' },
  version:    { fontSize: 11, textAlign: 'center', marginTop: 4 },
});
