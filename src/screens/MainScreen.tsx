import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Animated, Modal, ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useKeepAwake } from 'expo-keep-awake';

import { useSocket, User } from '../hooks/useSocket';
import { useAudio }        from '../hooks/useAudio';
import { useBackground }   from '../hooks/useBackground';
import { usePTTSounds }    from '../hooks/usePTTSounds';
import PTTButton           from '../components/PTTButton';
import Visualizer          from '../components/Visualizer';
import { C, avatarColor }  from '../theme';
import { SERVER_URL }      from '../config';

interface LogItem { id: string; name: string; duration: string; ts: string; audio?: string }

interface Channel { name: string; online: number; talking: boolean }

interface Props {
  myName:          string;
  myChannel:       string;
  onLogout:        () => void;
  onSwitchChannel: () => void;
}

const ICONS: Record<string, string> = {
  geral: '📻', operações: '⚙️', 'time-1': '🏃', suporte: '🛠️',
};

export default function MainScreen({ myName, myChannel: initChannel, onLogout, onSwitchChannel }: Props) {
  const insets = useSafeAreaInsets();
  const [connected,    setConnected]    = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [users,        setUsers]        = useState<User[]>([]);
  const [channel,      setChannel]      = useState(initChannel);
  const [talkerId,     setTalkerId]     = useState<string | null>(null);
  const [talking,      setTalking]      = useState(false);
  const [muted,        setMuted]        = useState(false);
  const [hasMic,       setHasMic]       = useState(false);
  const [log,          setLog]          = useState<LogItem[]>([]);
  const [ping,         setPing]         = useState('—');
  const [speakerName,  setSpeakerName]  = useState('');
  const [isPlaying,    setIsPlaying]    = useState(false);

  // Channel switch modal
  const [chModalOpen,    setChModalOpen]    = useState(false);
  const [chModalData,    setChModalData]    = useState<Channel[]>([]);
  const [chModalLoading, setChModalLoading] = useState(false);

  const bannerAnim = useRef(new Animated.Value(0)).current;
  const myId       = useRef('');
  const talkStart  = useRef(0);

  useKeepAwake();
  const audio     = useAudio(setIsPlaying);
  const { notifyIncoming } = useBackground();
  const pttSounds = usePTTSounds();

  useEffect(() => { audio.requestPermission().then(ok => setHasMic(ok)); }, []);

  const showBanner = useCallback((name: string) => {
    setSpeakerName(name);
    Animated.spring(bannerAnim, { toValue: 1, useNativeDriver: true, speed: 18, bounciness: 5 }).start();
  }, []);

  const hideBanner = useCallback(() => {
    Animated.timing(bannerAnim, { toValue: 0, duration: 200, useNativeDriver: true }).start();
  }, []);

  // Race condition fix: pttStop can arrive before or after audioRecv
  const pendingStopRef  = useRef<Record<string, { name: string; duration: string }>>({});
  const pendingAudioRef = useRef<Record<string, string>>({});

  const addLog = useCallback((name: string, duration: string, audioData?: string) => {
    const ts = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    setLog(prev => [{ id: String(Date.now()), name, duration, ts, audio: audioData }, ...prev].slice(0, 50));
  }, []);

  const { join, pttStart, pttStop, sendAudio, getId } = useSocket({
    onConnect: () => {
      setConnected(true);
      setReconnecting(false);
      myId.current = getId();
      join(myName, channel);
    },
    onDisconnect: () => {
      setConnected(false);
      setReconnecting(true);
      setTalkerId(null);
      hideBanner();
    },
    onJoined: (list) => { myId.current = getId(); setUsers(list); },
    onChannelUpdate: (list, talker) => {
      setUsers(list); setTalkerId(talker);
      if (talker && talker !== myId.current) {
        const u = list.find(u => u.id === talker);
        if (u) showBanner(u.name);
      } else if (!talker) hideBanner();
    },
    onPttStart: (userId, name) => { if (userId !== myId.current) showBanner(name); },
    onPttStop: (userId, name, duration) => {
      if (userId !== myId.current) {
        hideBanner();
        const audioData = pendingAudioRef.current[userId];
        if (audioData) {
          delete pendingAudioRef.current[userId];
          addLog(name, duration, audioData);
        } else {
          pendingStopRef.current[userId] = { name, duration };
        }
      }
    },
    onPttBlocked: () => setTalking(false),
    onAudioRecv: (data, from, name) => {
      notifyIncoming(name);
      audio.playAudio(data).catch(() => {});
      const pending = pendingStopRef.current[from];
      if (pending) {
        delete pendingStopRef.current[from];
        addLog(pending.name, pending.duration, data);
      } else {
        pendingAudioRef.current[from] = data;
      }
    },
    onPing: (ms) => setPing(ms + 'ms'),
  });

  const startTalking = useCallback(async () => {
    if (talking || !connected) return;
    setTalking(true);
    talkStart.current = Date.now();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    pttSounds.playStart();
    pttStart();
    if (hasMic && !muted) await audio.startRecording();
  }, [talking, connected, hasMic, muted]);

  const stopTalking = useCallback(async () => {
    if (!talking) return;
    setTalking(false);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    pttSounds.playStop();
    pttStop();
    if (hasMic && !muted) {
      const b64 = await audio.stopRecording();
      if (b64) sendAudio(b64);
    }
    const dur = Math.round((Date.now() - talkStart.current) / 1000);
    addLog(myName, `${Math.floor(dur / 60)}:${String(dur % 60).padStart(2, '0')}`);
  }, [talking, hasMic, muted, myName]);

  // Channel switch modal
  const openChModal = async () => {
    setChModalOpen(true);
    setChModalLoading(true);
    try {
      const res  = await fetch(`${SERVER_URL}/api/channels`, { signal: AbortSignal.timeout(4000) });
      const data = await res.json();
      setChModalData(data);
    } catch {
      setChModalData([]);
    } finally {
      setChModalLoading(false);
    }
  };

  const switchChannel = (newCh: string) => {
    setChModalOpen(false);
    if (newCh === channel) return;
    setChannel(newCh);
    setUsers([]);
    setLog([]);
    setTalkerId(null);
    hideBanner();
    join(myName, newCh);
  };

  const myColors      = avatarColor(myName);
  const myInit        = (myName[0] || '?').toUpperCase();
  const isPeerTalking = !!talkerId && talkerId !== myId.current;
  const channelBusy   = isPeerTalking || isPlaying;

  const pttLabel = !connected
    ? 'Conectando…'
    : muted
    ? 'Microfone mutado'
    : !hasMic
    ? 'Microfone bloqueado'
    : channelBusy
    ? 'Canal ocupado'
    : talking
    ? 'Solte para enviar'
    : 'Segurar para falar';

  const pttLabelColor = !connected
    ? C.orange
    : muted
    ? C.purple
    : !hasMic
    ? C.red
    : channelBusy
    ? C.orange
    : talking
    ? C.green
    : C.text3;

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <StatusBar style="light" />

      {/* ── TOP BAR ── */}
      <View style={s.topbar}>
        {/* Logout */}
        <TouchableOpacity onPress={onLogout} style={s.topBtn} activeOpacity={0.7}>
          <Text style={s.topBtnText}>←</Text>
        </TouchableOpacity>

        {/* Channel pill — tappable to switch */}
        <TouchableOpacity onPress={openChModal} activeOpacity={0.75} style={s.chPill}>
          <View style={[s.chDot, { backgroundColor: connected ? C.green : C.orange }]} />
          <Text style={s.chName}># {channel}</Text>
          <Text style={s.chCaret}>⌄</Text>
        </TouchableOpacity>

        <View style={{ flex: 1 }} />

        <View style={[s.pingBadge, { borderColor: connected ? C.border2 : C.orange }]}>
          <Text style={[s.pingText, { color: connected ? C.text2 : C.orange }]}>
            {reconnecting ? '…' : connected ? ping : 'off'}
          </Text>
        </View>

        <LinearGradient colors={myColors} style={s.myAvatar}>
          <Text style={s.myAvatarText}>{myInit}</Text>
        </LinearGradient>
      </View>

      {/* ── RECONNECTING BANNER ── */}
      {reconnecting && (
        <View style={s.reconnBanner}>
          <ActivityIndicator size="small" color={C.orange} />
          <Text style={s.reconnText}>Reconectando…</Text>
        </View>
      )}

      {/* ── VISUALIZER ── */}
      <View style={s.vizWrap}>
        <Visualizer active={talking || isPeerTalking} isPeer={isPeerTalking} />
      </View>

      {/* ── SPEAKER BANNER ── */}
      <Animated.View
        pointerEvents="none"
        style={[s.bannerWrap, {
          opacity: bannerAnim,
          transform: [{ translateY: bannerAnim.interpolate({ inputRange: [0, 1], outputRange: [-8, 0] }) }],
        }]}
      >
        <View style={s.banner}>
          <View style={s.bannerDot} />
          <Text style={s.bannerText}>{speakerName} está falando</Text>
        </View>
      </Animated.View>

      {/* ── USERS ROW ── */}
      <View style={s.usersSection}>
        <Text style={s.sectionLabel}>{users.length} online</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.usersRow}>
          {users.map(u => {
            const [c1, c2] = avatarColor(u.name);
            const isMe     = u.id === myId.current;
            const isTalker = u.id === talkerId;
            return (
              <View key={u.id} style={[s.userPill, isMe && s.userPillMe, isTalker && s.userPillTalker]}>
                <LinearGradient colors={[c1, c2]} style={s.pillAvatar}>
                  <Text style={s.pillAvatarText}>{u.name[0]?.toUpperCase()}</Text>
                </LinearGradient>
                <Text style={s.pillName} numberOfLines={1}>{isMe ? 'Você' : u.name.split(' ')[0]}</Text>
                {isTalker && <Text style={s.pillMic}>🎙</Text>}
                {isMe && muted && <Text style={s.pillMic}>🔇</Text>}
              </View>
            );
          })}
        </ScrollView>
      </View>

      {/* ── ACTIVITY LOG ── */}
      <View style={s.logSection}>
        <Text style={s.sectionLabel}>Transmissões</Text>
        <ScrollView style={s.logScroll} showsVerticalScrollIndicator={false}>
          {log.length === 0 ? (
            <Text style={s.logEmpty}>Aguardando transmissões…</Text>
          ) : (
            log.map(item => {
              const [c1, c2] = avatarColor(item.name);
              return (
                <View key={item.id} style={s.logItem}>
                  <LinearGradient colors={[c1, c2]} style={s.logAvatar}>
                    <Text style={s.logAvatarText}>{item.name[0]?.toUpperCase()}</Text>
                  </LinearGradient>
                  <View style={s.logInfo}>
                    <Text style={s.logName}>{item.name}</Text>
                    <Text style={s.logMeta}>🎙 {item.duration}  ·  {item.ts}</Text>
                  </View>
                  {item.audio && (
                    <TouchableOpacity
                      style={s.replayBtn}
                      onPress={() => audio.playAudio(item.audio!).catch(() => {})}
                    >
                      <Text style={s.replayIcon}>▶</Text>
                    </TouchableOpacity>
                  )}
                </View>
              );
            })
          )}
        </ScrollView>
      </View>

      {/* ── PTT ZONE ── */}
      <View style={[s.pttZone, { paddingBottom: insets.bottom + 16 }]}>
        {!hasMic && (
          <TouchableOpacity
            style={s.micWarning}
            onPress={() => audio.requestPermission().then(ok => setHasMic(ok))}
          >
            <Text style={s.micWarningText}>Toque para ativar o microfone</Text>
          </TouchableOpacity>
        )}

        <View style={s.pttRow}>
          {/* Mute toggle (left) */}
          <TouchableOpacity
            style={[s.muteBtn, muted && s.muteBtnActive]}
            onPress={() => {
              setMuted(m => !m);
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
            }}
            activeOpacity={0.75}
          >
            <Text style={[s.muteBtnIcon, muted && { color: C.purple }]}>
              {muted ? '🔇' : '🎤'}
            </Text>
          </TouchableOpacity>

          {/* PTT Button (center) */}
          <PTTButton
            talking={talking}
            disabled={!connected || channelBusy}
            onStart={startTalking}
            onStop={stopTalking}
          />

          {/* Spacer to balance left button */}
          <View style={{ width: 52 }} />
        </View>

        <Text style={[s.pttLabel, { color: pttLabelColor }]}>{pttLabel}</Text>
      </View>

      {/* ── CHANNEL SWITCH MODAL ── */}
      <Modal
        visible={chModalOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setChModalOpen(false)}
      >
        <TouchableOpacity
          style={s.modalOverlay}
          activeOpacity={1}
          onPress={() => setChModalOpen(false)}
        >
          <View style={s.modalSheet} onStartShouldSetResponder={() => true}>
            <View style={s.modalHandle} />
            <Text style={s.modalTitle}>Trocar de canal</Text>

            {chModalLoading ? (
              <ActivityIndicator color={C.cyan} style={{ marginVertical: 24 }} />
            ) : (
              <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 360 }}>
                {chModalData.length === 0 ? (
                  <Text style={s.modalEmpty}>Nenhum canal encontrado</Text>
                ) : (
                  chModalData.map(ch => (
                    <TouchableOpacity
                      key={ch.name}
                      style={[s.modalChRow, ch.name === channel && s.modalChRowActive]}
                      onPress={() => switchChannel(ch.name)}
                      activeOpacity={0.75}
                    >
                      <Text style={s.modalChIcon}>{ICONS[ch.name] ?? '🔊'}</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={s.modalChName}># {ch.name}</Text>
                        <Text style={s.modalChMeta}>
                          {ch.online === 0 ? 'Vazio' : `${ch.online} online`}
                          {ch.talking ? ' · 🎙' : ''}
                        </Text>
                      </View>
                      {ch.name === channel && (
                        <Text style={{ color: C.cyan, fontWeight: '800', fontSize: 13 }}>atual</Text>
                      )}
                    </TouchableOpacity>
                  ))
                )}
              </ScrollView>
            )}

            <TouchableOpacity style={s.modalNewBtn} onPress={() => { setChModalOpen(false); onSwitchChannel(); }}>
              <Text style={s.modalNewBtnText}>+ Criar novo canal</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },

  /* Top bar */
  topbar: {
    height: 54, flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 8, gap: 8,
    backgroundColor: C.surface, borderBottomWidth: 1, borderBottomColor: C.border,
  },
  topBtn:     { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  topBtnText: { fontSize: 20, color: C.text2, fontWeight: '600' },
  chPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: C.card, paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 99, borderWidth: 1, borderColor: C.border2,
  },
  chDot:    { width: 6, height: 6, borderRadius: 3 },
  chName:   { fontSize: 13, color: C.text2, fontWeight: '600' },
  chCaret:  { fontSize: 11, color: C.text3 },
  pingBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 99, borderWidth: 1 },
  pingText:  { fontSize: 11, fontWeight: '600' },
  myAvatar:  { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  myAvatarText: { fontSize: 12, fontWeight: '800', color: '#fff' },

  /* Reconnection banner */
  reconnBanner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: C.orange + '18', borderBottomWidth: 1, borderBottomColor: C.orange + '44',
    paddingVertical: 8,
  },
  reconnText: { fontSize: 12, fontWeight: '700', color: C.orange },

  /* Visualizer */
  vizWrap: {
    height: 60, justifyContent: 'center', alignItems: 'center',
    backgroundColor: C.surface, borderBottomWidth: 1, borderBottomColor: C.border,
  },

  /* Speaker banner */
  bannerWrap: { position: 'absolute', top: 54 + 60, left: 0, right: 0, zIndex: 10, alignItems: 'center', paddingTop: 8 },
  banner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#00ff8818', borderWidth: 1, borderColor: C.green,
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 99,
  },
  bannerDot:  { width: 8, height: 8, borderRadius: 4, backgroundColor: C.green },
  bannerText: { fontSize: 13, color: C.green, fontWeight: '700' },

  /* Users row */
  usersSection: {
    paddingTop: 12, paddingBottom: 8,
    borderBottomWidth: 1, borderBottomColor: C.border,
  },
  sectionLabel: {
    fontSize: 10, fontWeight: '700', color: C.text3,
    letterSpacing: 1.2, textTransform: 'uppercase',
    paddingHorizontal: 16, marginBottom: 8,
  },
  usersRow:       { paddingHorizontal: 12, gap: 8 },
  userPill:       {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    backgroundColor: C.card, borderWidth: 1, borderColor: C.border2,
    paddingHorizontal: 10, paddingVertical: 7, borderRadius: 99,
  },
  userPillMe:     { borderColor: C.cyan + '55' },
  userPillTalker: { borderColor: C.green, backgroundColor: '#00ff8812' },
  pillAvatar:     { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  pillAvatarText: { fontSize: 10, fontWeight: '800', color: '#fff' },
  pillName:       { fontSize: 13, color: C.text2, fontWeight: '600', maxWidth: 70 },
  pillMic:        { fontSize: 11 },

  /* Activity log */
  logSection: { flex: 1, paddingTop: 12 },
  logScroll:  { flex: 1, paddingHorizontal: 16 },
  logEmpty:   { fontSize: 13, color: C.text3, textAlign: 'center', marginTop: 24, lineHeight: 20 },
  logItem: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.border,
  },
  logAvatar:     { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  logAvatarText: { fontSize: 12, fontWeight: '800', color: '#fff' },
  logInfo:       { flex: 1 },
  logName:       { fontSize: 14, fontWeight: '700', color: C.text },
  logMeta:       { fontSize: 12, color: C.text3, marginTop: 2 },
  replayBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: C.cyanDim, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: C.cyan + '44',
  },
  replayIcon: { fontSize: 10, color: C.cyan },

  /* PTT zone */
  pttZone: {
    alignItems: 'center', justifyContent: 'flex-end',
    borderTopWidth: 1, borderTopColor: C.border,
    backgroundColor: C.surface,
  },
  micWarning: {
    marginTop: 12,
    backgroundColor: C.red + '18', borderWidth: 1, borderColor: C.red + '66',
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 99,
  },
  micWarningText: { fontSize: 12, color: C.red, fontWeight: '600' },

  pttRow: {
    flexDirection: 'row', alignItems: 'center',
    width: '100%', justifyContent: 'center',
    paddingHorizontal: 32,
  },
  muteBtn: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: C.card, borderWidth: 1.5, borderColor: C.border2,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4,
  },
  muteBtnActive: { borderColor: C.purple, backgroundColor: C.purpleDim },
  muteBtnIcon:   { fontSize: 22 },

  pttLabel: {
    fontSize: 13, fontWeight: '600', letterSpacing: 0.3,
    marginTop: -20, marginBottom: 8,
  },

  /* Channel switch modal */
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: C.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingTop: 12, paddingBottom: 32, paddingHorizontal: 20,
    borderTopWidth: 1, borderTopColor: C.border2,
  },
  modalHandle: {
    width: 40, height: 4, borderRadius: 2, backgroundColor: C.border2,
    alignSelf: 'center', marginBottom: 20,
  },
  modalTitle: { fontSize: 17, fontWeight: '900', color: C.text, marginBottom: 16 },
  modalEmpty: { fontSize: 13, color: C.text3, textAlign: 'center', marginVertical: 24 },
  modalChRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: C.border,
  },
  modalChRowActive: { opacity: 0.6 },
  modalChIcon: { fontSize: 22, width: 32, textAlign: 'center' },
  modalChName: { fontSize: 14, fontWeight: '800', color: C.text },
  modalChMeta: { fontSize: 12, color: C.text2, marginTop: 2 },
  modalNewBtn: {
    marginTop: 20, paddingVertical: 14, borderRadius: 12,
    backgroundColor: C.cyanDim, borderWidth: 1, borderColor: C.cyan + '44',
    alignItems: 'center',
  },
  modalNewBtnText: { fontSize: 14, fontWeight: '800', color: C.cyan },
});
