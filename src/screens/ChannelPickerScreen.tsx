import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, ActivityIndicator, RefreshControl, Animated, Modal,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C } from '../theme';
import { SERVER_URL } from '../config';

const CHANNEL_MAX = 20;

interface Channel {
  name:    string;
  online:  number;
  talking: boolean;
  hasPin?: boolean;
  isFull?: boolean;
}

interface Props {
  myName:  string;
  onJoin:  (channel: string, pin?: string, channelPin?: string) => void;
  onBack?: () => void;
}

const ICONS: Record<string, string> = {
  'geral-1': '📻',
  'geral-2': '📻',
  'geral-3': '📻',
  'geral-4': '📻',
};

const DEFAULTS: Channel[] = [
  { name: 'geral-1', online: 0, talking: false },
  { name: 'geral-2', online: 0, talking: false },
  { name: 'geral-3', online: 0, talking: false },
  { name: 'geral-4', online: 0, talking: false },
];

export default function ChannelPickerScreen({ myName, onJoin, onBack }: Props) {
  const insets = useSafeAreaInsets();
  const [channels,    setChannels]    = useState<Channel[]>(DEFAULTS);
  const [loading,     setLoading]     = useState(true);
  const [refreshing,  setRefreshing]  = useState(false);
  const [newChannel,  setNewChannel]  = useState('');
  const [newPin,      setNewPin]      = useState('');
  const [joining,     setJoining]     = useState<string | null>(null);
  // PIN prompt for protected channels
  const [pinPrompt,   setPinPrompt]   = useState<Channel | null>(null);
  const [pinInput,    setPinInput]    = useState('');
  const [pinError,    setPinError]    = useState(false);

  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 350, useNativeDriver: true }).start();
    fetchChannels();
    const timer = setInterval(fetchChannels, 2000);
    return () => clearInterval(timer);
  }, []);

  const fetchChannels = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    try {
      const res  = await fetch(`${SERVER_URL}/api/channels`, { signal: controller.signal });
      const data = await res.json();
      // Merge API channels with defaults so known channels always appear
      const apiMap = new Map<string, Channel>(data.map((c: Channel) => [c.name, c]));
      DEFAULTS.forEach(d => { if (!apiMap.has(d.name)) apiMap.set(d.name, d); });
      setChannels([...apiMap.values()]);
    } catch {
      // Keep whatever we have; API offline
    } finally {
      clearTimeout(timeout);
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleJoin = (ch: Channel) => {
    const isFull = (ch.isFull) || (ch.online >= CHANNEL_MAX);
    if (isFull) return;
    if (ch.hasPin) {
      setPinPrompt(ch); setPinInput(''); setPinError(false);
    } else {
      setJoining(ch.name);
      setTimeout(() => onJoin(ch.name), 120);
    }
  };

  const handlePinConfirm = () => {
    if (!pinPrompt) return;
    if (pinInput.length < 1) { setPinError(true); return; }
    const ch = pinPrompt;
    setPinPrompt(null);
    setJoining(ch.name);
    setTimeout(() => onJoin(ch.name, pinInput), 120);
  };

  const canCreate = newChannel.trim().length >= 2;

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <StatusBar style="light" />

      {/* Background glows */}
      <View style={s.glow1} pointerEvents="none" />
      <View style={s.glow2} pointerEvents="none" />

      {/* Header */}
      <View style={s.header}>
        {onBack ? (
          <TouchableOpacity onPress={onBack} style={s.backBtn} activeOpacity={0.7}>
            <Text style={s.backText}>←</Text>
          </TouchableOpacity>
        ) : <View style={{ width: 44 }} />}

        <View style={s.logoRow}>
          <View style={s.logoMic} />
          <Text style={s.logoText}>WaveTalk</Text>
        </View>

        <View style={{ width: 44 }} />
      </View>

      <Animated.ScrollView
        style={{ opacity: fadeAnim }}
        contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 24 }]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => fetchChannels(true)}
            tintColor={C.cyan}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Greeting */}
        <View style={s.greetBox}>
          <Text style={s.greet}>
            Olá, <Text style={{ color: C.cyan }}>{myName}</Text>
          </Text>
          <Text style={s.greetSub}>Escolha um canal para entrar ou crie o seu</Text>
        </View>

        {/* Section label */}
        <Text style={s.sectionLabel}>CANAIS ATIVOS</Text>

        {loading ? (
          <ActivityIndicator color={C.cyan} style={{ marginTop: 32 }} />
        ) : (
          channels.map(ch => {
            const isJoining = joining === ch.name;
            const isFull    = ch.isFull || ch.online >= CHANNEL_MAX;
            return (
              <TouchableOpacity
                key={ch.name}
                style={[s.chCard, isJoining && s.chCardActive, isFull && s.chCardFull]}
                onPress={() => handleJoin(ch)}
                activeOpacity={isFull ? 1 : 0.75}
              >
                <View style={s.chIcon}>
                  <Text style={{ fontSize: 26 }}>{ICONS[ch.name] ?? '🔊'}</Text>
                </View>

                <View style={s.chInfo}>
                  <Text style={s.chName}># {ch.name}</Text>
                  <Text style={[s.chMeta, isFull && { color: C.red }]}>
                    {isFull
                      ? `Lotado (${ch.online}/${CHANNEL_MAX})`
                      : ch.online === 0
                      ? 'Vazio · Entre primeiro'
                      : `${ch.online}/${CHANNEL_MAX} online`}
                    {!isFull && ch.talking ? ' · 🎙' : ''}
                  </Text>
                </View>

                <View style={s.chRight}>
                  {ch.hasPin && !isFull && <Text style={{ fontSize: 13 }}>🔒</Text>}
                  {isFull
                    ? <Text style={{ fontSize: 16 }}>🚫</Text>
                    : ch.online > 0
                    ? (
                      <View style={[s.onlineBadge, { backgroundColor: ch.talking ? C.green : C.cyan }]}>
                        <Text style={s.onlineBadgeText}>{ch.online}</Text>
                      </View>
                    ) : null
                  }
                  {!isFull && <Text style={s.arrow}>{isJoining ? '…' : '→'}</Text>}
                </View>
              </TouchableOpacity>
            );
          })
        )}

        {/* Create new channel */}
        <Text style={[s.sectionLabel, { marginTop: 28 }]}>CRIAR CANAL PRIVADO</Text>

        <View style={s.createCard}>
          <TextInput
            style={s.createInput}
            placeholder="Nome do canal (mín. 2 letras)"
            placeholderTextColor={C.text3}
            value={newChannel}
            onChangeText={t => setNewChannel(t.toLowerCase().replace(/\s+/g, '-'))}
            maxLength={30}
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="next"
            selectionColor={C.cyan}
          />
          <TextInput
            style={[s.createInput, { marginTop: -4 }]}
            placeholder="PIN (opcional) — protege o canal"
            placeholderTextColor={C.text3}
            value={newPin}
            onChangeText={t => setNewPin(t.replace(/\D/g, '').slice(0, 6))}
            maxLength={6}
            keyboardType="number-pad"
            returnKeyType="go"
            onSubmitEditing={() => canCreate && handleJoin({ name: newChannel.trim(), online: 0, talking: false })}
            selectionColor={C.cyan}
          />

          <TouchableOpacity
            style={[s.createBtn, !canCreate && { opacity: 0.35 }]}
            onPress={() => {
              if (!canCreate) return;
              const ch: Channel = { name: newChannel.trim(), online: 0, talking: false };
              setJoining(ch.name);
              setTimeout(() => onJoin(ch.name, undefined, newPin || undefined), 120);
            }}
            disabled={!canCreate}
            activeOpacity={0.8}
          >
            {canCreate ? (
              <LinearGradient
                colors={['#00d4ff', '#7c3aff']}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={s.createBtnInner}
              >
                <Text style={s.createBtnText}>Criar e entrar</Text>
              </LinearGradient>
            ) : (
              <View style={[s.createBtnInner, { backgroundColor: C.card, borderWidth: 1, borderColor: C.border2 }]}>
                <Text style={[s.createBtnText, { color: C.text3 }]}>Criar e entrar</Text>
              </View>
            )}
          </TouchableOpacity>

          <Text style={s.createHint}>
            O canal desaparece automaticamente quando todos saem
          </Text>
        </View>
      </Animated.ScrollView>

      {/* ── PIN Prompt Modal ── */}
      <Modal
        visible={pinPrompt !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setPinPrompt(null)}
      >
        <TouchableOpacity style={s.pinOverlay} activeOpacity={1} onPress={() => setPinPrompt(null)}>
          <View style={s.pinSheet} onStartShouldSetResponder={() => true}>
            <Text style={s.pinTitle}>Canal protegido</Text>
            <Text style={s.pinSub}>Digite o PIN para entrar em #{pinPrompt?.name}</Text>
            <TextInput
              style={[s.createInput, pinError && { borderColor: '#ff4444' }]}
              placeholder="PIN"
              placeholderTextColor={C.text3}
              value={pinInput}
              onChangeText={t => { setPinInput(t.replace(/\D/g, '').slice(0, 6)); setPinError(false); }}
              keyboardType="number-pad"
              maxLength={6}
              autoFocus
              selectionColor={C.cyan}
            />
            {pinError && <Text style={s.pinError}>PIN incorreto, tente novamente</Text>}
            <TouchableOpacity style={s.pinBtn} onPress={handlePinConfirm} activeOpacity={0.85}>
              <LinearGradient
                colors={['#00d4ff', '#7c3aff']}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={s.pinBtnInner}
              >
                <Text style={s.pinBtnText}>Entrar</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },

  glow1: {
    position: 'absolute', width: 280, height: 280, borderRadius: 140,
    backgroundColor: C.cyan, opacity: 0.06, top: -60, left: -60,
  },
  glow2: {
    position: 'absolute', width: 200, height: 200, borderRadius: 100,
    backgroundColor: C.purple, opacity: 0.08, top: 80, right: -40,
  },

  header: {
    height: 54, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', paddingHorizontal: 12,
    backgroundColor: C.surface, borderBottomWidth: 1, borderBottomColor: C.border,
  },
  backBtn:  { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  backText: { fontSize: 22, color: C.cyan },
  logoRow:  { flexDirection: 'row', alignItems: 'center', gap: 7 },
  logoMic:  { width: 8, height: 14, borderRadius: 4, backgroundColor: C.cyan },
  logoText: { fontSize: 16, fontWeight: '900', color: C.cyan, letterSpacing: -0.5 },

  scroll: { paddingHorizontal: 16, paddingTop: 24 },

  greetBox: { marginBottom: 28, alignItems: 'center' },
  greet:    { fontSize: 26, fontWeight: '900', color: C.text, letterSpacing: -0.5, textAlign: 'center' },
  greetSub: { fontSize: 14, color: C.text2, marginTop: 6, textAlign: 'center' },

  sectionLabel: {
    fontSize: 10, fontWeight: '700', color: C.text3,
    letterSpacing: 1.4, textTransform: 'uppercase', marginBottom: 12,
  },

  chCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: C.card, borderWidth: 1, borderColor: C.border2,
    borderRadius: 16, padding: 14, marginBottom: 10,
  },
  chCardActive: { borderColor: C.cyan + '88', backgroundColor: C.cyanDim },
  chCardFull:   { opacity: 0.55, borderColor: C.red + '44' },

  chIcon: {
    width: 48, height: 48, borderRadius: 14,
    backgroundColor: C.surface, borderWidth: 1, borderColor: C.border,
    alignItems: 'center', justifyContent: 'center',
  },
  chInfo:  { flex: 1 },
  chName:  { fontSize: 15, fontWeight: '800', color: C.text },
  chMeta:  { fontSize: 12, color: C.text2, marginTop: 3 },
  chRight: { alignItems: 'flex-end', gap: 6 },

  onlineBadge: {
    width: 22, height: 22, borderRadius: 11,
    alignItems: 'center', justifyContent: 'center',
  },
  onlineBadgeText: { fontSize: 10, fontWeight: '800', color: '#000' },
  arrow: { fontSize: 18, color: C.text3, fontWeight: '700' },

  createCard: {
    backgroundColor: C.card, borderWidth: 1, borderColor: C.border2,
    borderRadius: 16, padding: 16, gap: 12,
  },
  createInput: {
    backgroundColor: C.surface, borderWidth: 1, borderColor: C.border2,
    borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14,
    fontSize: 15, color: C.text, fontWeight: '500',
  },
  createBtn:      { borderRadius: 12, overflow: 'hidden' },
  createBtnInner: { borderRadius: 12, paddingVertical: 15, alignItems: 'center' },
  createBtnText:  { fontSize: 15, fontWeight: '800', color: '#fff' },
  createHint: { fontSize: 11, color: C.text3, textAlign: 'center', lineHeight: 16 },

  pinOverlay:  { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', paddingHorizontal: 24 },
  pinSheet:    {
    backgroundColor: C.surface, borderRadius: 20,
    padding: 24, gap: 14, borderWidth: 1, borderColor: C.border2,
  },
  pinTitle:    { fontSize: 18, fontWeight: '900', color: C.text },
  pinSub:      { fontSize: 13, color: C.text2, lineHeight: 18 },
  pinError:    { fontSize: 12, color: '#ff4444', fontWeight: '600', marginTop: -8 },
  pinBtn:      { borderRadius: 12, overflow: 'hidden', marginTop: 4 },
  pinBtnInner: { borderRadius: 12, paddingVertical: 15, alignItems: 'center' },
  pinBtnText:  { fontSize: 15, fontWeight: '800', color: '#fff' },
});
