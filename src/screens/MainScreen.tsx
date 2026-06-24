import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, Animated,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';

import { useKeepAwake } from 'expo-keep-awake';
import { useSocket, User } from '../hooks/useSocket';
import { useAudio } from '../hooks/useAudio';
import { useBackground } from '../hooks/useBackground';
import PTTButton from '../components/PTTButton';
import Visualizer from '../components/Visualizer';
import { C, avatarColor } from '../theme';

interface LogItem { id: string; name: string; duration: string; ts: string; audio?: string }

interface Props {
  myName:    string;
  myChannel: string;
}

export default function MainScreen({ myName, myChannel: initChannel }: Props) {
  const insets     = useSafeAreaInsets();
  const [connected,  setConnected]  = useState(false);
  const [users,      setUsers]      = useState<User[]>([]);
  const [channel,    setChannel]    = useState(initChannel);
  const [talkerId,   setTalkerId]   = useState<string | null>(null);
  const [talking,    setTalking]    = useState(false);
  const [hasMic,     setHasMic]     = useState(false);
  const [log,        setLog]        = useState<LogItem[]>([]);
  const [ping,       setPing]       = useState('—');
  const [otherName,  setOtherName]  = useState('');
  const [isPlaying,  setIsPlaying]  = useState(false);
  const bannerAnim  = useRef(new Animated.Value(0)).current;
  const myId        = useRef('');
  const talkStart   = useRef(0);
  useKeepAwake(); // keep screen on so app stays active for PTT
  const audio       = useAudio(setIsPlaying);
  const { notifyIncoming } = useBackground();

  useEffect(() => { audio.requestPermission().then(ok => setHasMic(ok)); }, []);

  const showBanner = useCallback((name: string) => {
    setOtherName(name);
    Animated.spring(bannerAnim, { toValue: 1, useNativeDriver: true, speed: 16, bounciness: 6 }).start();
  }, []);

  const hideBanner = useCallback(() => {
    Animated.timing(bannerAnim, { toValue: 0, duration: 200, useNativeDriver: true }).start();
  }, []);

  const lastAudioRef = useRef<Record<string, string>>({});

  const addLog = useCallback((name: string, duration: string, audioData?: string) => {
    const ts = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    setLog(prev => [{ id: String(Date.now()), name, duration, ts, audio: audioData }, ...prev].slice(0, 50));
  }, []);

  const { join, pttStart, pttStop, sendAudio, getId } = useSocket({
    onConnect: () => {
      setConnected(true);
      myId.current = getId();
      join(myName, initChannel);
    },
    onDisconnect: () => {
      setConnected(false);
      setTalkerId(null);
      hideBanner();
    },
    onJoined: (list) => {
      myId.current = getId();
      setUsers(list);
    },
    onChannelUpdate: (list, talker) => {
      setUsers(list);
      setTalkerId(talker);
      if (talker && talker !== myId.current) {
        const u = list.find(u => u.id === talker);
        if (u) showBanner(u.name + ' está falando…');
      } else if (!talker) {
        hideBanner();
      }
    },
    onPttStart: (userId, name) => {
      if (userId !== myId.current) showBanner(name + ' está falando…');
    },
    onPttStop: (userId, name, duration) => {
      if (userId !== myId.current) {
        hideBanner();
        const saved = lastAudioRef.current[userId];
        delete lastAudioRef.current[userId];
        addLog(name, duration, saved);
      }
    },
    onPttBlocked: () => {
      setTalking(false);
    },
    onAudioRecv: (data, from, name) => {
      lastAudioRef.current[from] = data;
      notifyIncoming(name);
      audio.playAudio(data).catch(() => {});
    },
    onPing: (ms) => setPing(ms + 'ms'),
  });

  const startTalking = useCallback(async () => {
    if (talking || !connected) return;
    setTalking(true);
    talkStart.current = Date.now();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    pttStart();
    if (hasMic) await audio.startRecording();
  }, [talking, connected, hasMic]);

  const stopTalking = useCallback(async () => {
    if (!talking) return;
    setTalking(false);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    pttStop();
    if (hasMic) {
      const b64 = await audio.stopRecording();
      if (b64) sendAudio(b64);
    }
    const dur = Math.round((Date.now() - talkStart.current) / 1000);
    addLog(myName, `${Math.floor(dur / 60)}:${String(dur % 60).padStart(2, '0')}`);
  }, [talking, hasMic, myName]);


  const myInit        = (myName[0] || '?').toUpperCase();
  const myColors      = avatarColor(myName);
  const isPeerTalking = !!talkerId && talkerId !== myId.current;
  const channelBusy   = isPeerTalking || isPlaying;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <StatusBar style="light"/>

      {/* TOP BAR */}
      <View style={styles.topbar}>
        <View style={styles.tbLogo}>
          <View style={[styles.tbMicBody, { backgroundColor: C.cyan }]}/>
          <Text style={styles.tbAppName}>WaveTalk</Text>
        </View>
        <View style={styles.tbChPill}>
          <View style={styles.tbDot}/>
          <Text style={styles.tbChName}># {channel}</Text>
        </View>
        <View style={{ flex: 1 }}/>
        <View style={[styles.connBadge, { borderColor: connected ? C.green : C.orange }]}>
          <View style={[styles.connDot, { backgroundColor: connected ? C.green : C.orange }]}/>
          <Text style={[styles.connText, { color: connected ? C.green : C.orange }]}>{connected ? ping : '…'}</Text>
        </View>
        <LinearGradient colors={myColors} style={styles.tbAvatar}>
          <Text style={styles.tbAvatarText}>{myInit}</Text>
        </LinearGradient>
      </View>


      {/* BODY */}
      <View style={styles.body}>

        {/* USER LIST */}
        <View style={styles.userPanel}>
          <Text style={styles.panelLabel}>Online · {users.length}</Text>
          <ScrollView showsVerticalScrollIndicator={false}>
            {users.map(u => {
              const [c1, c2] = avatarColor(u.name);
              const isMe     = u.id === myId.current;
              const isTalker = u.id === talkerId;
              return (
                <View key={u.id} style={styles.userItem}>
                  <LinearGradient colors={[c1, c2]} style={styles.uAvatar}>
                    <Text style={styles.uAvatarText}>{u.name[0]?.toUpperCase()}</Text>
                  </LinearGradient>
                  <Text style={styles.uName} numberOfLines={1}>{u.name}{isMe ? ' ✓' : ''}</Text>
                  <Text style={{ fontSize: 9, color: isTalker ? C.green : C.text3 }}>{isTalker ? '🎙' : '●'}</Text>
                </View>
              );
            })}
          </ScrollView>
        </View>

        {/* CENTER */}
        <View style={styles.center}>
          <Visualizer active={talking || isPeerTalking} isPeer={isPeerTalking}/>

          <View style={{ alignItems: 'center', gap: 4 }}>
            <Text style={styles.chInfoName}># {channel}</Text>
            <Text style={styles.chInfoSub}>
              <Text style={{ color: C.green }}>{users.length}</Text>
              {' online · '}
              <Text style={{ color: hasMic ? C.green : '#ff4444', fontWeight: '700' }}>
                {hasMic ? 'Mic ativo' : 'SEM MIC'}
              </Text>
            </Text>
            {channelBusy && (
              <Text style={{ fontSize: 10, color: '#ffaa00', textAlign: 'center', marginTop: 4 }}>
                {isPlaying ? '🔊 Reproduzindo…' : '🎙 Canal ocupado'}
              </Text>
            )}
          </View>

          {!hasMic && (
            <TouchableOpacity
              style={{ backgroundColor: '#ff444422', borderWidth: 1, borderColor: '#ff4444', borderRadius: 8, paddingHorizontal: 16, paddingVertical: 8 }}
              onPress={() => audio.requestPermission().then(ok => setHasMic(ok))}
            >
              <Text style={{ color: '#ff4444', fontSize: 12, fontWeight: '700' }}>Tocar para ativar microfone</Text>
            </TouchableOpacity>
          )}

          <PTTButton
            talking={talking}
            disabled={!connected || channelBusy}
            onStart={startTalking}
            onStop={stopTalking}
          />

          <Animated.View style={[
            styles.banner,
            {
              opacity:   bannerAnim,
              transform: [{ translateY: bannerAnim.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }],
            },
          ]}>
            <Text style={styles.bannerText}>🎙 {otherName}</Text>
          </Animated.View>
        </View>

        {/* ACTIVITY LOG */}
        <View style={styles.logPanel}>
          <Text style={styles.panelLabel}>Atividade</Text>
          <ScrollView showsVerticalScrollIndicator={false}>
            {log.length === 0 && <Text style={styles.logEmpty}>Aguardando…</Text>}
            {log.map(item => {
              const [c1, c2] = avatarColor(item.name);
              return (
                <View key={item.id} style={styles.logItem}>
                  <LinearGradient colors={[c1, c2]} style={styles.logAvatar}>
                    <Text style={styles.logAvatarText}>{item.name[0]?.toUpperCase()}</Text>
                  </LinearGradient>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.logName} numberOfLines={1}>{item.name}</Text>
                    <Text style={styles.logDur}>🎙 {item.duration} · {item.ts}</Text>
                  </View>
                  {item.audio && (
                    <TouchableOpacity
                      onPress={() => audio.playAudio(item.audio!).catch(() => {})}
                      style={styles.replayBtn}
                    >
                      <Text style={styles.replayIcon}>▶</Text>
                    </TouchableOpacity>
                  )}
                </View>
              );
            })}
          </ScrollView>
        </View>
      </View>

      {/* BOTTOM STATUS */}
      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 4 }]}>
        <LinearGradient colors={myColors} style={styles.myAvatar}>
          <Text style={styles.myAvatarText}>{myInit}</Text>
        </LinearGradient>
        <View style={{ flex: 1 }}>
          <Text style={styles.myName}>{myName}</Text>
          <Text style={styles.myStat}>{connected ? '● Online' : '● Offline'}</Text>
        </View>
        {!hasMic && (
          <View style={[styles.badge, { borderColor: C.red }]}>
            <Text style={[styles.badgeText, { color: C.red }]}>Sem mic</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },

  topbar: {
    height: 52, flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, gap: 10,
    backgroundColor: C.surface, borderBottomWidth: 1, borderBottomColor: C.border,
  },
  tbLogo:       { flexDirection: 'row', alignItems: 'center', gap: 7 },
  tbMicBody:    { width: 8, height: 14, borderRadius: 4 },
  tbAppName:    { fontSize: 15, fontWeight: '900', color: C.cyan, letterSpacing: -0.5 },
  tbChPill:     {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 4,
    backgroundColor: C.card, borderRadius: 8, borderWidth: 1, borderColor: C.border2,
  },
  tbDot:        { width: 5, height: 5, borderRadius: 3, backgroundColor: C.green },
  tbChName:     { fontSize: 12, color: C.text2 },
  connBadge:    {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 99, borderWidth: 1,
  },
  connDot:      { width: 5, height: 5, borderRadius: 3 },
  connText:     { fontSize: 11, fontWeight: '600' },
  tbAvatar:     { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  tbAvatarText: { fontSize: 12, fontWeight: '700', color: '#fff' },

  channelBar:        { maxHeight: 48, backgroundColor: C.surface, borderBottomWidth: 1, borderBottomColor: C.border },
  channelBarContent: { paddingHorizontal: 10, paddingVertical: 8, gap: 6, flexDirection: 'row' },
  chTab:         {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 5,
    borderRadius: 20, backgroundColor: C.card, borderWidth: 1, borderColor: C.border,
  },
  chTabActive:     { backgroundColor: '#00d4ff18', borderColor: C.cyan },
  chTabIcon:       { fontSize: 13 },
  chTabText:       { fontSize: 12, color: C.text2 },
  chTabTextActive: { color: C.cyan, fontWeight: '700' },

  body: { flex: 1, flexDirection: 'row' },

  userPanel: {
    width: 90, backgroundColor: C.surface,
    borderRightWidth: 1, borderRightColor: C.border, padding: 8,
  },
  panelLabel: {
    fontSize: 9, fontWeight: '700', letterSpacing: 1.2,
    color: C.text3, textTransform: 'uppercase', marginBottom: 8,
  },
  userItem:    { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 6 },
  uAvatar:     { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  uAvatarText: { fontSize: 9, fontWeight: '700', color: '#fff' },
  uName:       { flex: 1, fontSize: 10, color: C.text2 },

  center:     { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16, gap: 16 },
  chInfoName: { fontSize: 18, fontWeight: '800', color: C.text },
  chInfoSub:  { fontSize: 12, color: C.text2 },
  banner: {
    backgroundColor: '#00ff8820', borderRadius: 12,
    borderWidth: 1, borderColor: C.green,
    paddingHorizontal: 16, paddingVertical: 8,
  },
  bannerText: { fontSize: 13, color: C.green, fontWeight: '600' },

  logPanel: {
    width: 100, backgroundColor: C.surface,
    borderLeftWidth: 1, borderLeftColor: C.border, padding: 8,
  },
  logEmpty:      { fontSize: 10, color: C.text3, textAlign: 'center', marginTop: 12, lineHeight: 16 },
  logItem:       { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 8 },
  logAvatar:     { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  logAvatarText: { fontSize: 9, fontWeight: '700', color: '#fff' },
  logName:       { fontSize: 10, color: C.text, fontWeight: '600' },
  logDur:        { fontSize: 9,  color: C.text3 },
  replayBtn:     { width: 24, height: 24, borderRadius: 12, backgroundColor: C.cyanDim, alignItems: 'center', justifyContent: 'center' },
  replayIcon:    { fontSize: 9, color: C.cyan },

  bottomBar: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 14, paddingTop: 10,
    backgroundColor: C.surface, borderTopWidth: 1, borderTopColor: C.border,
  },
  myAvatar:     { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  myAvatarText: { fontSize: 13, fontWeight: '700', color: '#fff' },
  myName:       { fontSize: 13, fontWeight: '600', color: C.text },
  myStat:       { fontSize: 11, color: C.text3 },
  badge:        { borderRadius: 99, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1 },
  badgeText:    { fontSize: 10, fontWeight: '600' },
});
