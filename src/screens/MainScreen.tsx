import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Animated, Modal, ActivityIndicator, Share, TextInput,
  KeyboardAvoidingView, Platform, Alert, PanResponder,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useKeepAwake } from 'expo-keep-awake';

import { useSocket, User } from '../hooks/useSocket';
import { useAudio }        from '../hooks/useAudio';
import { useBackground }   from '../hooks/useBackground';
import { usePTTSounds }    from '../hooks/usePTTSounds';
import { useHaptics }      from '../hooks/useHaptics';
import { useWatch }        from '../hooks/useWatch';
import { useApp }          from '../contexts/AppContext';
import PTTButton           from '../components/PTTButton';
import Visualizer          from '../components/Visualizer';
import SettingsModal       from '../components/SettingsModal';
import { avatarColor }     from '../theme';
import { SERVER_URL }      from '../config';

const MAX_TALK_SECS = 60;
const CHANNEL_MAX   = 20;

function fmtMs(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}min`;
  if (m > 0) return `${m}min`;
  return `${s}s`;
}

function fmtElapsed(ms: number): string {
  const m = Math.floor(ms / 60000);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}min`;
  if (m > 0) return `${m}min`;
  return 'agora';
}

interface LogItem { id: string; name: string; duration: string; ts: string; audio?: string }
interface Channel  { name: string; online: number; talking: boolean; hasPin?: boolean; isFull?: boolean }

interface Props {
  myName:          string;
  myChannel:       string;
  myPin?:          string;
  myChannelPin?:   string;
  onLogout:        () => void;
  onSwitchChannel: () => void;
}

const ICONS: Record<string, string> = {
  'geral-1': '📻', 'geral-2': '📻', 'geral-3': '📻', 'geral-4': '📻',
};

export default function MainScreen({ myName, myChannel: initChannel, myPin, myChannelPin, onLogout, onSwitchChannel }: Props) {
  const insets   = useSafeAreaInsets();
  const { C, soundTheme } = useApp();
  const haptics  = useHaptics();

  // Dynamic styles
  const s = useMemo(() => makeStyles(C), [C]);

  const [connected,    setConnected]    = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [users,        setUsers]        = useState<User[]>([]);
  const [channel,      setChannel]      = useState(initChannel);
  const [talkerId,     setTalkerId]     = useState<string | null>(null);
  const [talking,      setTalking]      = useState(false);
  const [locked,       setLocked]       = useState(false);
  const [talkSeconds,  setTalkSeconds]  = useState(0);
  const [muted,        setMuted]        = useState(false);
  const [hasMic,       setHasMic]       = useState(false);
  const [log,          setLog]          = useState<LogItem[]>([]);
  const [ping,         setPing]         = useState('—');
  const [speakerName,  setSpeakerName]  = useState('');
  const [isPlaying,    setIsPlaying]    = useState(false);
  const [channelTime,  setChannelTime]  = useState('agora');
  const [fullBanner,   setFullBanner]   = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Swipe channel list
  const channelListRef = useRef<string[]>([]);

  // Channel switch modal
  const [chModalOpen,    setChModalOpen]    = useState(false);
  const [chModalData,    setChModalData]    = useState<Channel[]>([]);
  const [chModalLoading, setChModalLoading] = useState(false);

  // Session stats modal
  const [statsOpen,   setStatsOpen]   = useState(false);
  const [pendingExit, setPendingExit] = useState<'logout' | 'switch' | null>(null);

  // Log expanded modal
  const [logExpanded, setLogExpanded] = useState(false);
  const [playingId,   setPlayingId]   = useState<string | null>(null);

  // PIN prompt when join:rejected reason=pin
  const [pinModal,  setPinModal]  = useState(false);
  const [pinChannel, setPinChannel] = useState('');
  const [pinInput,  setPinInput]  = useState('');
  const [pinError,  setPinError]  = useState(false);

  // User status
  type UserStatus = 'available' | 'busy' | 'silent';
  const [myStatus,    setMyStatus]    = useState<UserStatus>('available');
  const [statusModal, setStatusModal] = useState(false);
  const myStatusRef = useRef<UserStatus>('available');

  // Moderator
  const [iAmMod,    setIAmMod]    = useState(false);
  const [modTarget, setModTarget] = useState<User | null>(null);
  const [mutedByMod, setMutedByMod] = useState(false);

  // Swipe hint
  const [swipeHint, setSwipeHint] = useState(false);
  const swipeHintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const bannerAnim = useRef(new Animated.Value(0)).current;
  const myId       = useRef('');
  const talkStart  = useRef(0);
  const talkTimer  = useRef<ReturnType<typeof setInterval> | null>(null);
  const joinTimeRef = useRef(0);
  const clockTimer  = useRef<ReturnType<typeof setInterval> | null>(null);

  const sessionTxCount = useRef(0);
  const sessionTalkMs  = useRef(0);

  useKeepAwake();
  const audio     = useAudio(setIsPlaying);
  const { notifyIncoming } = useBackground();
  const pttSounds = usePTTSounds();

  useEffect(() => { audio.requestPermission().then(ok => setHasMic(ok)); }, []);

  // Fetch channel list for swipe navigation
  const refreshChannelList = useCallback(async () => {
    try {
      const res  = await fetch(`${SERVER_URL}/api/channels`);
      const data = await res.json() as Channel[];
      channelListRef.current = data.map(c => c.name);
    } catch {}
  }, []);

  useEffect(() => { refreshChannelList(); }, [channel]);

  // ── Swipe PanResponder ────────────────────────────────────────────
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gs) =>
        Math.abs(gs.dx) > 10 && Math.abs(gs.dx) > Math.abs(gs.dy) * 1.2,
      onPanResponderRelease: (_, gs) => {
        if (Math.abs(gs.dx) < 55) return;
        const list = channelListRef.current;
        const idx  = list.indexOf(channel);
        if (gs.dx < 0) {
          // swipe left → next channel
          if (idx < list.length - 1) switchChannel(list[idx + 1]);
        } else {
          // swipe right → previous channel, or back to channel list
          if (idx > 0) switchChannel(list[idx - 1]);
          else onSwitchChannel();
        }
      },
    })
  ).current;

  // ── Channel time clock ────────────────────────────────────────────
  const startClock = useCallback(() => {
    joinTimeRef.current = Date.now();
    setChannelTime('agora');
    if (clockTimer.current) clearInterval(clockTimer.current);
    clockTimer.current = setInterval(() => {
      setChannelTime(fmtElapsed(Date.now() - joinTimeRef.current));
    }, 30_000);
  }, []);

  useEffect(() => () => { if (clockTimer.current) clearInterval(clockTimer.current); }, []);

  // ── Banner helpers ────────────────────────────────────────────────
  const showBanner = useCallback((name: string) => {
    setSpeakerName(name);
    Animated.spring(bannerAnim, { toValue: 1, useNativeDriver: true, speed: 18, bounciness: 5 }).start();
  }, []);

  const hideBanner = useCallback(() => {
    Animated.timing(bannerAnim, { toValue: 0, duration: 200, useNativeDriver: true }).start();
  }, []);

  const pendingStopRef  = useRef<Record<string, { name: string; duration: string }>>({});
  const pendingAudioRef = useRef<Record<string, string>>({});

  const addLog = useCallback((name: string, duration: string, audioData?: string) => {
    const ts = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    setLog(prev => [{ id: String(Date.now()), name, duration, ts, audio: audioData }, ...prev].slice(0, 50));
  }, []);

  const { join, pttStart, pttStop, sendAudio, getId, setStatus, modKick, modMute } = useSocket({
    onConnect: () => {
      setConnected(true); setReconnecting(false); setFullBanner(false);
      myId.current = getId();
      join(myName, channel, myPin, myChannelPin);
      startClock();
    },
    onDisconnect: () => {
      setConnected(false); setReconnecting(true);
      setTalkerId(null); hideBanner();
    },
    onJoined:        (list) => { myId.current = getId(); setUsers(list); },
    onChannelUpdate: (list, talker) => {
      setUsers(list); setTalkerId(talker);
      const me = list.find(u => u.id === myId.current);
      if (me) setIAmMod(!!me.isMod);
      if (talker && talker !== myId.current) {
        const u = list.find(u => u.id === talker);
        if (u) { showBanner(u.name); haptics.impact('Medium'); }
      } else if (!talker) hideBanner();
    },
    onPttStart: (userId, name) => {
      if (userId !== myId.current) {
        showBanner(name);
        haptics.impact('Medium');
      }
    },
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
    onPttBlocked: () => {
      setTalking(false); setLocked(false); clearTalkTimer();
      haptics.notification('Warning');
    },
    onAudioRecv: (data, from, name) => {
      if (myStatusRef.current === 'busy') return;
      haptics.impact('Heavy');
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
    onPing:       (ms) => setPing(ms + 'ms'),
    onJoinRejected: (reason, ch) => {
      if (reason === 'full') {
        setFullBanner(true);
        haptics.notification('Error');
      } else if (reason === 'pin') {
        setPinChannel(ch);
        setPinInput('');
        setPinError(false);
        setPinModal(true);
        haptics.notification('Warning');
      }
    },
    onKicked: (by) => {
      haptics.notification('Error');
      Alert.alert('Expulso do canal', `${by} removeu você do canal.`, [
        { text: 'OK', onPress: onLogout },
      ]);
    },
    onMuted: (by) => {
      setMutedByMod(true);
      setMuted(true);
      haptics.notification('Warning');
      Alert.alert('Microfone bloqueado', `${by} silenciou você neste canal.`);
    },
    onUnmuted: (by) => {
      setMutedByMod(false);
      setMuted(false);
      Alert.alert('Microfone liberado', `${by} desmutou você.`);
    },
  });

  // ── 60s talk timer ────────────────────────────────────────────────
  const clearTalkTimer = useCallback(() => {
    if (talkTimer.current) { clearInterval(talkTimer.current); talkTimer.current = null; }
    setTalkSeconds(0);
  }, []);

  const startTalkTimer = useCallback(() => {
    clearTalkTimer();
    setTalkSeconds(0);
    talkTimer.current = setInterval(() => {
      setTalkSeconds(prev => {
        if (prev + 1 >= MAX_TALK_SECS) { stopTalking(); return MAX_TALK_SECS; }
        return prev + 1;
      });
    }, 1000);
  }, []);

  // ── PTT actions ───────────────────────────────────────────────────
  const startTalking = useCallback(async () => {
    if (talking || !connected) return;
    setTalking(true);
    talkStart.current = Date.now();
    sessionTxCount.current += 1;
    haptics.notification('Success');
    if (soundTheme !== 'minimal') pttSounds.playStart();
    pttStart();
    startTalkTimer();
    if (hasMic && !muted) {
      await new Promise(r => setTimeout(r, 160));
      await audio.startRecording();
    }
  }, [talking, connected, hasMic, muted, soundTheme]);

  const stopTalking = useCallback(async () => {
    if (!talking) return;
    setTalking(false);
    setLocked(false);
    clearTalkTimer();
    const dur = Date.now() - talkStart.current;
    sessionTalkMs.current += dur;
    haptics.notification('Warning');
    if (soundTheme !== 'minimal') pttSounds.playStop();
    pttStop();
    if (hasMic && !muted) {
      const b64 = await audio.stopRecording();
      if (b64) sendAudio(b64);
    }
    const durS = Math.round(dur / 1000);
    addLog(myName, `${Math.floor(durS / 60)}:${String(durS % 60).padStart(2, '0')}`);
  }, [talking, hasMic, muted, myName, soundTheme]);

  const toggleLock = useCallback(async () => {
    if (locked) { setLocked(false); await stopTalking(); }
    else        { setLocked(true);  await startTalking(); }
  }, [locked, talking, connected]);

  // Ativado pelo swipe para cima no PTTButton (já está transmitindo)
  const activateLock = useCallback(() => {
    setLocked(true);
  }, []);

  // ── Apple Watch bridge ────────────────────────────────────────────
  const { sendToWatch } = useWatch(startTalking, stopTalking);

  // Envia estado atual para o Watch sempre que muda
  useEffect(() => {
    const speaker = talkerId && talkerId !== myId.current
      ? (users.find(u => u.id === talkerId)?.name ?? '')
      : talking ? myName : '';
    sendToWatch({
      channel,
      speaker,
      talking: !!talkerId,
      members: users.length,
    });
  }, [channel, talkerId, talking, users]);

  const STATUS_CONFIG = {
    available: { label: 'Disponível', color: C.green,  icon: '●' },
    busy:      { label: 'Ocupado',    color: C.red,    icon: '●' },
    silent:    { label: 'Silencioso', color: C.text3,  icon: '🔇' },
  } as const;

  const changeStatus = (st: UserStatus) => {
    myStatusRef.current = st;
    setMyStatus(st);
    setStatus(st);
    setStatusModal(false);
    if (st === 'silent') setMuted(true);
    else if (myStatus === 'silent') setMuted(false);
  };

  const shareChannel = useCallback(() => {
    Share.share({
      message: `Entre no canal "${channel}" no WaveTalk! Baixe o app e escolha o canal "${channel}" para falar comigo.`,
      title:   `Canal ${channel} - WaveTalk`,
    }).catch(() => {});
  }, [channel]);

  // ── Swipe channel switch ──────────────────────────────────────────
  const switchChannel = useCallback((newCh: string) => {
    if (newCh === channel) return;
    setChannel(newCh); setUsers([]); setLog([]); setTalkerId(null); hideBanner();
    sessionTxCount.current = 0; sessionTalkMs.current = 0;
    join(myName, newCh);
    startClock();
    // Brief swipe hint
    setSwipeHint(true);
    if (swipeHintTimer.current) clearTimeout(swipeHintTimer.current);
    swipeHintTimer.current = setTimeout(() => setSwipeHint(false), 1800);
  }, [channel, myName]);

  // ── Exit with stats ───────────────────────────────────────────────
  const requestExit = useCallback((type: 'logout' | 'switch') => {
    const hasStats = sessionTxCount.current > 0 || (Date.now() - joinTimeRef.current) > 60_000;
    if (hasStats) { setPendingExit(type); setStatsOpen(true); }
    else { type === 'logout' ? onLogout() : onSwitchChannel(); }
  }, [onLogout, onSwitchChannel]);

  const confirmExit = useCallback(() => {
    setStatsOpen(false);
    if (pendingExit === 'logout') onLogout();
    if (pendingExit === 'switch') onSwitchChannel();
    setPendingExit(null);
  }, [pendingExit, onLogout, onSwitchChannel]);

  // Channel switch modal
  const openChModal = async () => {
    setChModalOpen(true);
    setChModalLoading(true);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    try {
      const res  = await fetch(`${SERVER_URL}/api/channels`, { signal: controller.signal });
      setChModalData(await res.json());
    } catch { setChModalData([]); }
    finally { clearTimeout(timeout); setChModalLoading(false); }
  };

  const switchChannelModal = (newCh: string, isFull?: boolean) => {
    if (isFull) return;
    setChModalOpen(false);
    switchChannel(newCh);
  };

  const myColors      = avatarColor(myName);
  const myInit        = (myName[0] || '?').toUpperCase();
  const isPeerTalking = !!talkerId && talkerId !== myId.current;
  const channelBusy   = isPeerTalking || isPlaying;

  const pttLabel = !connected
    ? 'Conectando…'
    : fullBanner
    ? 'Canal lotado'
    : locked
    ? 'Toque para parar'
    : muted
    ? 'Microfone mutado'
    : !hasMic
    ? 'Microfone bloqueado'
    : channelBusy
    ? 'Canal ocupado'
    : talking
    ? 'Solte para enviar'
    : 'Segurar para falar';

  const pttLabelColor = !connected ? C.orange
    : fullBanner ? C.red
    : locked     ? C.green
    : muted      ? C.purple
    : !hasMic    ? C.red
    : channelBusy ? C.orange
    : talking    ? C.green : C.text3;

  const sessionTimeLabel = fmtElapsed(Date.now() - joinTimeRef.current);
  const talkTimeLabel    = fmtMs(sessionTalkMs.current);

  return (
    <View style={[s.root, { paddingTop: insets.top }]} {...panResponder.panHandlers}>
      <StatusBar style={C.bg === '#07090f' ? 'light' : 'dark'} />

      {/* ── TOP BAR ── */}
      <View style={s.topbar}>
        <TouchableOpacity onPress={() => requestExit('logout')} style={s.topBtn} activeOpacity={0.7}>
          <Text style={s.topBtnText}>←</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={openChModal} activeOpacity={0.75} style={s.chPill}>
          <View style={[s.chDot, { backgroundColor: connected ? C.green : C.orange }]} />
          <View>
            <Text style={s.chName}># {channel}</Text>
            <Text style={s.chTimer}>{channelTime} no canal</Text>
          </View>
          <Text style={s.chCaret}>⌄</Text>
        </TouchableOpacity>

        <View style={{ flex: 1 }} />

        <TouchableOpacity onPress={shareChannel} style={s.topBtn} activeOpacity={0.7}>
          <Text style={s.topBtnText}>⬆</Text>
        </TouchableOpacity>

        <View style={[s.pingBadge, { borderColor: connected ? C.border2 : C.orange }]}>
          <Text style={[s.pingText, { color: connected ? C.text2 : C.orange }]}>
            {reconnecting ? '…' : connected ? ping : 'off'}
          </Text>
        </View>

        {/* Settings button */}
        <TouchableOpacity onPress={() => setSettingsOpen(true)} style={s.topBtn} activeOpacity={0.7}>
          <Text style={[s.topBtnText, { fontSize: 16 }]}>⚙️</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => setStatusModal(true)} activeOpacity={0.8} style={{ position: 'relative' }}>
          <LinearGradient colors={myColors} style={s.myAvatar}>
            <Text style={s.myAvatarText}>{myInit}</Text>
          </LinearGradient>
          <View style={[s.statusDot, { backgroundColor: STATUS_CONFIG[myStatus].color }]} />
        </TouchableOpacity>
      </View>

      {/* ── FULL CHANNEL BANNER ── */}
      {fullBanner && (
        <View style={s.fullBanner}>
          <Text style={s.fullBannerText}>Canal lotado ({CHANNEL_MAX}/{CHANNEL_MAX}) — tente outro canal</Text>
        </View>
      )}

      {/* ── RECONNECTING BANNER ── */}
      {reconnecting && !fullBanner && (
        <View style={s.reconnBanner}>
          <ActivityIndicator size="small" color={C.orange} />
          <Text style={s.reconnText}>Reconectando…</Text>
        </View>
      )}

      {/* ── MUTED BY MOD BANNER ── */}
      {mutedByMod && (
        <View style={[s.reconnBanner, { backgroundColor: C.red + '18', borderBottomColor: C.red + '44' }]}>
          <Text style={{ fontSize: 14 }}>🔇</Text>
          <Text style={[s.reconnText, { color: C.red }]}>Silenciado pelo moderador</Text>
        </View>
      )}

      {/* ── SWIPE HINT ── */}
      {swipeHint && (
        <View style={s.swipeHint}>
          <Text style={s.swipeHintText}>← deslize para trocar de canal →</Text>
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
            const uStatus  = (isMe ? myStatus : (u.status ?? 'available')) as UserStatus;
            const sCfg     = STATUS_CONFIG[uStatus];
            const canMod   = iAmMod && !isMe;
            return (
              <TouchableOpacity
                key={u.id}
                style={[s.userPill, isMe && s.userPillMe, isTalker && s.userPillTalker]}
                onPress={() => canMod ? setModTarget(u) : undefined}
                activeOpacity={canMod ? 0.7 : 1}
              >
                <View style={{ position: 'relative' }}>
                  <LinearGradient colors={[c1, c2]} style={s.pillAvatar}>
                    <Text style={s.pillAvatarText}>{u.name[0]?.toUpperCase()}</Text>
                  </LinearGradient>
                  <View style={[s.pillStatusDot, { backgroundColor: sCfg.color }]} />
                </View>
                <Text style={s.pillName} numberOfLines={1}>
                  {isMe ? 'Você' : u.name.split(' ')[0]}
                </Text>
                {u.isMod  && <Text style={s.pillMic}>👑</Text>}
                {isTalker && <Text style={s.pillMic}>🎙</Text>}
                {(isMe ? muted : u.isMuted) && <Text style={s.pillMic}>🔇</Text>}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* ── ACTIVITY LOG ── */}
      <View style={s.logSection}>
        <View style={s.logHeader}>
          <Text style={s.sectionLabel}>Transmissões {log.length > 0 ? `(${log.length})` : ''}</Text>
          {log.length > 0 && (
            <TouchableOpacity onPress={() => setLogExpanded(true)} style={s.logExpandBtn} activeOpacity={0.7}>
              <Text style={s.logExpandText}>Ver tudo ↗</Text>
            </TouchableOpacity>
          )}
        </View>
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
                    <TouchableOpacity style={s.replayBtn} onPress={() => audio.playAudio(item.audio!).catch(() => {})}>
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
          <TouchableOpacity style={s.micWarning} onPress={() => audio.requestPermission().then(ok => setHasMic(ok))}>
            <Text style={s.micWarningText}>Toque para ativar o microfone</Text>
          </TouchableOpacity>
        )}

        <PTTButton
          talking={talking}
          disabled={!connected || fullBanner || (channelBusy && !talking)}
          locked={locked}
          talkSeconds={talkSeconds}
          onStart={startTalking}
          onStop={stopTalking}
          onLock={activateLock}
        />

        <TouchableOpacity
          style={[s.muteBar, muted && s.muteBarActive]}
          onPress={() => { setMuted(m => !m); haptics.impact('Medium'); }}
          activeOpacity={0.75}
        >
          <Text style={s.muteBarIcon}>{muted ? '🔇' : '🎤'}</Text>
          <Text style={[s.muteBarLabel, muted && s.muteBarLabelActive]}>
            {muted ? 'MUTADO — toque para ativar' : 'Microfone ativo — toque para mutar'}
          </Text>
        </TouchableOpacity>

        <View style={s.pttBottom}>
          <Text style={[s.pttLabel, { color: pttLabelColor, flex: 1, textAlign: 'center' }]}>{pttLabel}</Text>
          <TouchableOpacity
            style={[s.ctrlBtn, locked && s.ctrlBtnGreen]}
            onPress={toggleLock}
            disabled={!connected || fullBanner || (channelBusy && !locked)}
            activeOpacity={0.75}
          >
            <Text style={s.ctrlBtnIcon}>{locked ? '🔒' : '🔓'}</Text>
          </TouchableOpacity>
        </View>

        {talking && talkSeconds >= 50 && (
          <Text style={s.timerWarn}>{MAX_TALK_SECS - talkSeconds}s restantes</Text>
        )}
      </View>

      {/* ── CHANNEL SWITCH MODAL ── */}
      <Modal visible={chModalOpen} transparent animationType="slide" onRequestClose={() => setChModalOpen(false)}>
        <TouchableOpacity style={s.modalOverlay} activeOpacity={1} onPress={() => setChModalOpen(false)}>
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
                  chModalData.map(ch => {
                    const isFull = ch.online >= CHANNEL_MAX;
                    return (
                      <TouchableOpacity
                        key={ch.name}
                        style={[s.modalChRow, ch.name === channel && s.modalChRowActive, isFull && s.modalChRowFull]}
                        onPress={() => switchChannelModal(ch.name, isFull)}
                        activeOpacity={isFull ? 1 : 0.75}
                      >
                        <Text style={s.modalChIcon}>{ICONS[ch.name] ?? '🔊'}</Text>
                        <View style={{ flex: 1 }}>
                          <Text style={s.modalChName}># {ch.name}</Text>
                          <Text style={[s.modalChMeta, isFull && { color: C.red }]}>
                            {isFull ? `Lotado (${ch.online}/${CHANNEL_MAX})` : ch.online === 0 ? 'Vazio' : `${ch.online}/${CHANNEL_MAX} online`}
                            {!isFull && ch.talking ? ' · 🎙' : ''}
                          </Text>
                        </View>
                        {ch.name === channel
                          ? <Text style={{ color: C.cyan, fontWeight: '800', fontSize: 13 }}>atual</Text>
                          : isFull
                          ? <Text style={{ color: C.red, fontSize: 13 }}>🚫</Text>
                          : null
                        }
                      </TouchableOpacity>
                    );
                  })
                )}
              </ScrollView>
            )}
            <TouchableOpacity style={s.modalNewBtn} onPress={() => { setChModalOpen(false); requestExit('switch'); }}>
              <Text style={s.modalNewBtnText}>+ Criar novo canal</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── LOG EXPANDED MODAL ── */}
      <Modal visible={logExpanded} transparent animationType="slide" onRequestClose={() => setLogExpanded(false)}>
        <View style={s.logModalOverlay}>
          <View style={[s.logModalSheet, { paddingBottom: insets.bottom + 16 }]}>
            <View style={s.logModalHeader}>
              <View style={s.modalHandle} />
              <View style={s.logModalTitleRow}>
                <Text style={s.modalTitle}>Transmissões</Text>
                <TouchableOpacity onPress={() => setLogExpanded(false)} style={s.logModalClose}>
                  <Text style={s.logModalCloseText}>✕</Text>
                </TouchableOpacity>
              </View>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.logModalScroll}>
              {log.length === 0 ? (
                <Text style={s.logEmpty}>Nenhuma transmissão ainda</Text>
              ) : (
                log.map(item => {
                  const [c1, c2] = avatarColor(item.name);
                  const isActive = playingId === item.id;
                  return (
                    <View key={item.id} style={s.logModalItem}>
                      <LinearGradient colors={[c1, c2]} style={s.logModalAvatar}>
                        <Text style={s.logModalAvatarText}>{item.name[0]?.toUpperCase()}</Text>
                      </LinearGradient>
                      <View style={s.logModalInfo}>
                        <Text style={s.logModalName}>{item.name}</Text>
                        <Text style={s.logModalMeta}>🎙 {item.duration}  ·  {item.ts}</Text>
                      </View>
                      {item.audio ? (
                        <TouchableOpacity
                          style={[s.replayBtnLarge, isActive && s.replayBtnLargeActive]}
                          activeOpacity={0.75}
                          onPress={async () => {
                            setPlayingId(item.id);
                            haptics.impact('Light');
                            await audio.playAudio(item.audio!).catch(() => {});
                            setPlayingId(null);
                          }}
                        >
                          <Text style={[s.replayBtnLargeIcon, isActive && { color: C.bg }]}>
                            {isActive ? '■' : '▶'}
                          </Text>
                          <Text style={[s.replayBtnLargeLabel, isActive && { color: C.bg }]}>
                            {isActive ? 'tocando' : 'ouvir'}
                          </Text>
                        </TouchableOpacity>
                      ) : (
                        <View style={s.replayBtnNoAudio}>
                          <Text style={s.replayBtnNoAudioText}>sem áudio</Text>
                        </View>
                      )}
                    </View>
                  );
                })
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ── PIN PROMPT MODAL ── */}
      <Modal visible={pinModal} transparent animationType="fade" onRequestClose={() => setPinModal(false)}>
        <KeyboardAvoidingView
          style={s.statsOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
        >
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setPinModal(false)} />
          <View style={s.statsSheet}>
            <Text style={s.statsTitle}>Canal protegido 🔒</Text>
            <Text style={s.statsSub}>Digite o PIN para entrar em #{pinChannel}</Text>
            <TextInput
              style={[s.pinInput, pinError && { borderColor: C.red }]}
              placeholder="PIN do canal"
              placeholderTextColor={C.text3}
              value={pinInput}
              onChangeText={t => { setPinInput(t.replace(/\D/g, '').slice(0, 6)); setPinError(false); }}
              keyboardType="number-pad"
              maxLength={6}
              autoFocus
              selectionColor={C.cyan}
            />
            {pinError && <Text style={s.pinErrorText}>PIN incorreto</Text>}
            <View style={s.statsActions}>
              <TouchableOpacity style={s.statsStay} onPress={() => setPinModal(false)} activeOpacity={0.8}>
                <Text style={s.statsStayText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.statsLeave, { backgroundColor: C.cyan + '22', borderColor: C.cyan + '55' }]}
                onPress={() => {
                  if (pinInput.length < 1) { setPinError(true); return; }
                  setPinModal(false);
                  join(myName, pinChannel, pinInput);
                }}
                activeOpacity={0.8}
              >
                <Text style={[s.statsLeaveText, { color: C.cyan }]}>Entrar</Text>
              </TouchableOpacity>
            </View>
          </View>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setPinModal(false)} />
        </KeyboardAvoidingView>
      </Modal>

      {/* ── MOD ACTION MODAL ── */}
      <Modal visible={modTarget !== null} transparent animationType="fade" onRequestClose={() => setModTarget(null)}>
        <TouchableOpacity style={s.statsOverlay} activeOpacity={1} onPress={() => setModTarget(null)}>
          <View style={[s.statsSheet, { paddingVertical: 20 }]}>
            <Text style={[s.statsTitle, { marginBottom: 4 }]}>Moderar</Text>
            <Text style={[s.statsSub, { marginBottom: 16 }]}>{modTarget?.name}</Text>
            <TouchableOpacity
              style={[s.statusOption, { backgroundColor: C.card }]}
              activeOpacity={0.75}
              onPress={() => { if (!modTarget) return; modMute(modTarget.id); setModTarget(null); }}
            >
              <Text style={{ fontSize: 20 }}>{modTarget?.isMuted ? '🔊' : '🔇'}</Text>
              <Text style={s.statusOptionLabel}>{modTarget?.isMuted ? 'Desmutar' : 'Silenciar microfone'}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.statusOption, { backgroundColor: C.red + '18', marginTop: 6 }]}
              activeOpacity={0.75}
              onPress={() => {
                if (!modTarget) return;
                const t = modTarget;
                setModTarget(null);
                Alert.alert('Expulsar usuário', `Tem certeza que quer expulsar ${t.name} do canal?`, [
                  { text: 'Cancelar', style: 'cancel' },
                  { text: 'Expulsar', style: 'destructive', onPress: () => modKick(t.id) },
                ]);
              }}
            >
              <Text style={{ fontSize: 20 }}>🚫</Text>
              <Text style={[s.statusOptionLabel, { color: C.red }]}>Expulsar do canal</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── STATUS MODAL ── */}
      <Modal visible={statusModal} transparent animationType="fade" onRequestClose={() => setStatusModal(false)}>
        <TouchableOpacity style={s.statsOverlay} activeOpacity={1} onPress={() => setStatusModal(false)}>
          <View style={[s.statsSheet, { paddingVertical: 20 }]}>
            <Text style={[s.statsTitle, { marginBottom: 16 }]}>Meu status</Text>
            {(['available', 'busy', 'silent'] as UserStatus[]).map(s2 => {
              const cfg = STATUS_CONFIG[s2];
              const isActive = myStatus === s2;
              return (
                <TouchableOpacity
                  key={s2}
                  style={[s.statusOption, isActive && s.statusOptionActive]}
                  onPress={() => changeStatus(s2)}
                  activeOpacity={0.75}
                >
                  <View style={[s.statusOptionDot, { backgroundColor: cfg.color }]} />
                  <Text style={[s.statusOptionLabel, isActive && { color: C.text }]}>{cfg.label}</Text>
                  {isActive && <Text style={{ marginLeft: 'auto', color: C.cyan, fontSize: 16 }}>✓</Text>}
                </TouchableOpacity>
              );
            })}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── SESSION STATS MODAL ── */}
      <Modal visible={statsOpen} transparent animationType="fade" onRequestClose={() => setStatsOpen(false)}>
        <View style={s.statsOverlay}>
          <View style={s.statsSheet}>
            <Text style={s.statsTitle}>Resumo da sessão</Text>
            <Text style={s.statsSub}># {channel}</Text>
            <View style={s.statsGrid}>
              <View style={s.statBox}>
                <Text style={s.statVal}>{sessionTimeLabel}</Text>
                <Text style={s.statKey}>no canal</Text>
              </View>
              <View style={[s.statBox, s.statBoxMid]}>
                <Text style={s.statVal}>{sessionTxCount.current}</Text>
                <Text style={s.statKey}>{sessionTxCount.current === 1 ? 'transmissão' : 'transmissões'}</Text>
              </View>
              <View style={s.statBox}>
                <Text style={s.statVal}>{sessionTalkMs.current < 1000 ? '—' : talkTimeLabel}</Text>
                <Text style={s.statKey}>no ar</Text>
              </View>
            </View>
            <View style={s.statsActions}>
              <TouchableOpacity style={s.statsStay} onPress={() => { setStatsOpen(false); setPendingExit(null); }} activeOpacity={0.8}>
                <Text style={s.statsStayText}>Ficar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.statsLeave} onPress={confirmExit} activeOpacity={0.8}>
                <Text style={s.statsLeaveText}>Sair</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── SETTINGS MODAL ── */}
      <SettingsModal visible={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </View>
  );
}

// Styles factory — recreated when theme changes
import { ThemeColors } from '../theme';

function makeStyles(C: ThemeColors) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: C.bg },

    topbar: {
      height: 58, flexDirection: 'row', alignItems: 'center',
      paddingHorizontal: 8, gap: 8,
      backgroundColor: C.surface, borderBottomWidth: 1, borderBottomColor: C.border,
    },
    topBtn:     { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
    topBtnText: { fontSize: 18, color: C.text2, fontWeight: '600' },
    chPill: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      backgroundColor: C.card, paddingHorizontal: 10, paddingVertical: 6,
      borderRadius: 99, borderWidth: 1, borderColor: C.border2,
    },
    chDot:   { width: 6, height: 6, borderRadius: 3 },
    chName:  { fontSize: 13, color: C.text2, fontWeight: '700', lineHeight: 16 },
    chTimer: { fontSize: 9,  color: C.text3, fontWeight: '500', lineHeight: 12 },
    chCaret: { fontSize: 11, color: C.text3 },

    pingBadge:    { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 99, borderWidth: 1 },
    pingText:     { fontSize: 11, fontWeight: '600' },
    myAvatar:     { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
    myAvatarText: { fontSize: 12, fontWeight: '800', color: '#fff' },

    fullBanner: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
      backgroundColor: C.red + '18', borderBottomWidth: 1, borderBottomColor: C.red + '44',
      paddingVertical: 8, paddingHorizontal: 16,
    },
    fullBannerText: { fontSize: 12, fontWeight: '700', color: C.red, textAlign: 'center' },

    reconnBanner: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
      backgroundColor: C.orange + '18', borderBottomWidth: 1, borderBottomColor: C.orange + '44',
      paddingVertical: 8,
    },
    reconnText: { fontSize: 12, fontWeight: '700', color: C.orange },

    swipeHint: {
      backgroundColor: C.cyan + '22', borderBottomWidth: 1, borderBottomColor: C.cyan + '44',
      paddingVertical: 6, alignItems: 'center',
    },
    swipeHintText: { fontSize: 11, color: C.cyan, fontWeight: '600' },

    vizWrap: {
      height: 60, justifyContent: 'center', alignItems: 'center',
      backgroundColor: C.surface, borderBottomWidth: 1, borderBottomColor: C.border,
    },

    bannerWrap: { position: 'absolute', top: 58 + 60, left: 0, right: 0, zIndex: 10, alignItems: 'center', paddingTop: 8 },
    banner: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      backgroundColor: '#00ff8818', borderWidth: 1, borderColor: C.green,
      paddingHorizontal: 16, paddingVertical: 8, borderRadius: 99,
    },
    bannerDot:  { width: 8, height: 8, borderRadius: 4, backgroundColor: C.green },
    bannerText: { fontSize: 13, color: C.green, fontWeight: '700' },

    usersSection: { paddingTop: 12, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: C.border },
    sectionLabel: {
      fontSize: 10, fontWeight: '700', color: C.text3,
      letterSpacing: 1.2, textTransform: 'uppercase', paddingHorizontal: 16, marginBottom: 8,
    },
    usersRow: { paddingHorizontal: 12, gap: 8 },
    userPill: {
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

    pttZone: {
      alignItems: 'center', justifyContent: 'flex-end',
      borderTopWidth: 1, borderTopColor: C.border, backgroundColor: C.surface,
    },
    micWarning: {
      marginTop: 12, backgroundColor: C.red + '18', borderWidth: 1, borderColor: C.red + '66',
      paddingHorizontal: 16, paddingVertical: 8, borderRadius: 99,
    },
    micWarningText: { fontSize: 12, color: C.red, fontWeight: '600' },

    muteBar: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      marginTop: -12, marginHorizontal: 20, marginBottom: 4,
      backgroundColor: C.card, borderWidth: 1.5, borderColor: C.border2,
      borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10,
    },
    muteBarActive:      { backgroundColor: C.purple + '22', borderColor: C.purple },
    muteBarIcon:        { fontSize: 20 },
    muteBarLabel:       { fontSize: 12, fontWeight: '700', color: C.text2, flex: 1 },
    muteBarLabelActive: { color: C.purple },

    pttBottom: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, marginBottom: 8 },
    ctrlBtn: {
      width: 40, height: 40, borderRadius: 20,
      backgroundColor: C.card, borderWidth: 1.5, borderColor: C.border2,
      alignItems: 'center', justifyContent: 'center',
    },
    ctrlBtnGreen: { borderColor: C.green, backgroundColor: C.greenDim },
    ctrlBtnIcon:  { fontSize: 18 },

    pttLabel:  { fontSize: 13, fontWeight: '600', letterSpacing: 0.3 },
    timerWarn: { fontSize: 11, color: C.red, fontWeight: '700', marginBottom: 4, marginTop: -4 },

    // Channel modal
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
    modalSheet: {
      backgroundColor: C.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24,
      paddingTop: 12, paddingBottom: 32, paddingHorizontal: 20,
      borderTopWidth: 1, borderTopColor: C.border2,
    },
    modalHandle:      { width: 40, height: 4, borderRadius: 2, backgroundColor: C.border2, alignSelf: 'center', marginBottom: 20 },
    modalTitle:       { fontSize: 17, fontWeight: '900', color: C.text, marginBottom: 16 },
    modalEmpty:       { fontSize: 13, color: C.text3, textAlign: 'center', marginVertical: 24 },
    modalChRow:       { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: C.border },
    modalChRowActive: { opacity: 0.6 },
    modalChRowFull:   { opacity: 0.5 },
    modalChIcon:      { fontSize: 22, width: 32, textAlign: 'center' },
    modalChName:      { fontSize: 14, fontWeight: '800', color: C.text },
    modalChMeta:      { fontSize: 12, color: C.text2, marginTop: 2 },
    modalNewBtn:      { marginTop: 20, paddingVertical: 14, borderRadius: 12, backgroundColor: C.cyanDim, borderWidth: 1, borderColor: C.cyan + '44', alignItems: 'center' },
    modalNewBtnText:  { fontSize: 14, fontWeight: '800', color: C.cyan },

    // Stats / general modal
    statsOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'center', paddingHorizontal: 24 },
    statsSheet: {
      backgroundColor: C.surface, borderRadius: 24,
      paddingTop: 28, paddingBottom: 24, paddingHorizontal: 24,
      borderWidth: 1, borderColor: C.border2,
    },
    statsTitle: { fontSize: 20, fontWeight: '900', color: C.text, textAlign: 'center' },
    statsSub:   { fontSize: 13, color: C.text3, textAlign: 'center', marginTop: 4, marginBottom: 24 },
    statsGrid:  { flexDirection: 'row', gap: 1, marginBottom: 28 },
    statBox:    { flex: 1, alignItems: 'center', gap: 4 },
    statBoxMid: { borderLeftWidth: 1, borderRightWidth: 1, borderColor: C.border },
    statVal:    { fontSize: 22, fontWeight: '900', color: C.cyan },
    statKey:    { fontSize: 10, color: C.text3, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.8, textAlign: 'center' },
    statsActions:  { flexDirection: 'row', gap: 12 },
    statsStay:     { flex: 1, paddingVertical: 14, borderRadius: 12, backgroundColor: C.card, borderWidth: 1, borderColor: C.border2, alignItems: 'center' },
    statsStayText: { fontSize: 14, fontWeight: '700', color: C.text2 },
    statsLeave:    { flex: 1, paddingVertical: 14, borderRadius: 12, backgroundColor: C.red + '22', borderWidth: 1, borderColor: C.red + '55', alignItems: 'center' },
    statsLeaveText: { fontSize: 14, fontWeight: '800', color: C.red },

    pinInput: {
      backgroundColor: C.card, borderWidth: 1.5, borderColor: C.border2,
      borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14,
      fontSize: 22, fontWeight: '700', color: C.text, textAlign: 'center',
      letterSpacing: 6, marginVertical: 8,
    },
    pinErrorText: { fontSize: 12, color: C.red, fontWeight: '600', textAlign: 'center', marginTop: -4 },

    // Log section extras
    logHeader:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, marginBottom: 8 },
    logExpandBtn: { paddingVertical: 2, paddingHorizontal: 4 },
    logExpandText: { fontSize: 11, fontWeight: '700', color: C.cyan, letterSpacing: 0.3 },

    // Log expanded modal
    logModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
    logModalSheet:   {
      backgroundColor: C.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24,
      maxHeight: '85%', borderTopWidth: 1, borderTopColor: C.border2,
    },
    logModalHeader:    { paddingTop: 12, paddingHorizontal: 20 },
    logModalTitleRow:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
    logModalClose:     { width: 32, height: 32, borderRadius: 16, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center' },
    logModalCloseText: { fontSize: 14, color: C.text2, fontWeight: '700' },
    logModalScroll:    { paddingHorizontal: 20, paddingBottom: 8 },
    logModalItem:      {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.border,
    },
    logModalAvatar:     { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
    logModalAvatarText: { fontSize: 16, fontWeight: '800', color: '#fff' },
    logModalInfo:       { flex: 1 },
    logModalName:       { fontSize: 15, fontWeight: '800', color: C.text },
    logModalMeta:       { fontSize: 13, color: C.text3, marginTop: 3 },
    replayBtnLarge: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      backgroundColor: C.cyanDim, borderWidth: 1.5, borderColor: C.cyan + '66',
      borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, minWidth: 80,
    },
    replayBtnLargeActive: { backgroundColor: C.cyan, borderColor: C.cyan },
    replayBtnLargeIcon:   { fontSize: 14, color: C.cyan, fontWeight: '800' },
    replayBtnLargeLabel:  { fontSize: 12, color: C.cyan, fontWeight: '700' },
    replayBtnNoAudio:     { paddingHorizontal: 10, paddingVertical: 10 },
    replayBtnNoAudioText: { fontSize: 11, color: C.text3 },

    // Status
    statusDot: {
      position: 'absolute', bottom: 0, right: 0,
      width: 10, height: 10, borderRadius: 5,
      borderWidth: 2, borderColor: C.surface,
    },
    pillStatusDot: {
      position: 'absolute', bottom: 0, right: 0,
      width: 8, height: 8, borderRadius: 4,
      borderWidth: 1.5, borderColor: C.surface,
    },
    statusOption: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      paddingHorizontal: 20, paddingVertical: 14,
      borderRadius: 12, marginHorizontal: 4,
    },
    statusOptionActive:  { backgroundColor: C.card },
    statusOptionDot:     { width: 12, height: 12, borderRadius: 6 },
    statusOptionLabel:   { fontSize: 16, color: C.text2, fontWeight: '600' },
  });
}
