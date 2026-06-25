const express = require('express');
const http    = require('http');
const path    = require('path');
const { Server } = require('socket.io');
const cors    = require('cors');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
    allowedHeaders: ['bypass-tunnel-reminder'],
  },
  allowEIO3: true,
});

/* ── Serve frontend from parent directory ──────────────────────── */
const FRONTEND_DIR = path.join(__dirname, '..');
app.use(cors());
app.use(express.json());
app.use(express.static(FRONTEND_DIR));

app.get('/', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.sendFile(path.join(FRONTEND_DIR, 'index.html'));
});

/* ── In-memory state ─────────────────────────────────────────────
   channels : Map<key, Set<socketId>>
   users    : Map<socketId, { id, name, channel, talking, talkStart }>
   talking  : Map<channelKey, socketId | null>
──────────────────────────────────────────────────────────────── */
const channels = new Map();
const users    = new Map();
const talking  = new Map();

const DEFAULT_CHANNELS = ['geral', 'operações', 'time-1', 'suporte'];

function boot() {
  DEFAULT_CHANNELS.forEach(ch => {
    channels.set(ch, new Set());
    talking.set(ch, null);
  });
}

function getOrCreate(name) {
  const k = name.toLowerCase().trim().slice(0, 30);
  if (!channels.has(k)) { channels.set(k, new Set()); talking.set(k, null); }
  return k;
}

function channelUsers(key) {
  return [...(channels.get(key) || [])].map(id => users.get(id)).filter(Boolean);
}

function broadcastChannel(key) {
  io.to(key).emit('channel:update', {
    channel : key,
    users   : channelUsers(key),
    talking : talking.get(key) || null,
  });
}

function leaveChannel(socket, key) {
  if (!key || !channels.has(key)) return;
  channels.get(key).delete(socket.id);
  socket.leave(key);
  if (talking.get(key) === socket.id) {
    talking.set(key, null);
    io.to(key).emit('ptt:stop', { userId: socket.id, name: users.get(socket.id)?.name, duration: '0:00' });
  }
  // Notify remaining peers to tear down WebRTC connection
  socket.to(key).emit('webrtc:peer-left', { peerId: socket.id });
  if (channels.get(key).size === 0 && !DEFAULT_CHANNELS.includes(key)) {
    channels.delete(key); talking.delete(key);
  } else {
    broadcastChannel(key);
  }
}

/* ── REST API ────────────────────────────────────────────────────── */
app.get('/api/stats', (_req, res) => {
  res.json({
    totalChannels : channels.size,
    totalUsers    : users.size,
    channels      : [...channels.entries()].map(([k, s]) => ({
      name: k, online: s.size, talking: !!talking.get(k),
    })),
  });
});

app.get('/api/channels', (_req, res) => {
  res.json([...channels.entries()].map(([k, s]) => ({
    name: k, online: s.size, talking: talking.get(k) || null,
  })));
});

/* ── Socket.io ───────────────────────────────────────────────────── */
io.on('connection', (socket) => {
  console.log(`[+] ${socket.id} connected`);

  /* ── JOIN ── */
  socket.on('join', ({ name, channel }) => {
    const userName   = (name    || 'Anônimo').trim().slice(0, 40);
    const channelKey = getOrCreate(channel || 'geral');

    const prev = users.get(socket.id);
    if (prev && prev.channel !== channelKey) leaveChannel(socket, prev.channel);

    const user = { id: socket.id, name: userName, channel: channelKey, talking: false, talkStart: null };
    users.set(socket.id, user);
    channels.get(channelKey).add(socket.id);
    socket.join(channelKey);

    // Peers already in channel (excluding self)
    const existingPeerIds = [...channels.get(channelKey)].filter(id => id !== socket.id);

    // Tell new user about existing peers → new user will initiate offers
    socket.emit('joined', {
      user,
      channel      : channelKey,
      users        : channelUsers(channelKey),
      existingPeers: existingPeerIds.map(id => ({ id, name: users.get(id)?.name || '?' })),
    });

    // Tell existing peers a new user joined → they wait for offer
    existingPeerIds.forEach(peerId => {
      io.to(peerId).emit('webrtc:peer-joined', { peerId: socket.id, name: userName });
    });

    broadcastChannel(channelKey);
    console.log(`  join  ${userName} → #${channelKey} (${channels.get(channelKey).size} online)`);
  });

  /* ── WebRTC SIGNALING (pure relay) ── */
  socket.on('webrtc:offer', ({ to, offer }) => {
    io.to(to).emit('webrtc:offer', { from: socket.id, offer });
  });
  socket.on('webrtc:answer', ({ to, answer }) => {
    io.to(to).emit('webrtc:answer', { from: socket.id, answer });
  });
  socket.on('webrtc:ice', ({ to, candidate }) => {
    io.to(to).emit('webrtc:ice', { from: socket.id, candidate });
  });

  /* ── PTT START ── */
  socket.on('ptt:start', () => {
    const user = users.get(socket.id);
    if (!user) return;
    const ch = user.channel;
    const cur = talking.get(ch);
    if (cur && cur !== socket.id) {
      socket.emit('ptt:blocked', { by: users.get(cur)?.name || 'alguém' });
      return;
    }
    user.talking = true; user.talkStart = Date.now();
    talking.set(ch, socket.id);
    io.to(ch).emit('ptt:start', { userId: socket.id, name: user.name });
    broadcastChannel(ch);
    console.log(`  ptt+  ${user.name} @ #${ch}`);
  });

  /* ── PTT STOP ── */
  socket.on('ptt:stop', () => {
    const user = users.get(socket.id);
    if (!user) return;
    const ch  = user.channel;
    const dur = user.talkStart ? Math.round((Date.now() - user.talkStart) / 1000) : 0;
    user.talking = false; user.talkStart = null;
    if (talking.get(ch) === socket.id) talking.set(ch, null);
    const label = `${Math.floor(dur / 60)}:${String(dur % 60).padStart(2, '0')}`;
    io.to(ch).emit('ptt:stop', { userId: socket.id, name: user.name, duration: label });
    broadcastChannel(ch);
    console.log(`  ptt-  ${user.name} @ #${ch} (${label})`);
  });

  /* ── AUDIO RELAY ── */
  socket.on('audio:send', ({ data }) => {
    const user = users.get(socket.id);
    console.log(`  audio:send from ${user?.name} size=${data?.length} channel=${user?.channel}`);
    if (!user || !data) return;
    const room = io.sockets.adapter.rooms.get(user.channel);
    console.log(`  relay → ${user.channel} (${room?.size ?? 0} sockets)`);
    socket.to(user.channel).emit('audio:recv', {
      data,
      from: socket.id,
      name: user.name,
    });
  });

  /* ── PING ── */
  socket.on('ping:client', (ts) => socket.emit('pong:server', ts));

  /* ── DISCONNECT ── */
  socket.on('disconnect', () => {
    const user = users.get(socket.id);
    if (!user) return;
    leaveChannel(socket, user.channel);
    users.delete(socket.id);
    console.log(`[-] ${user.name} left`);
  });
});

/* ── Start ───────────────────────────────────────────────────────── */
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  boot();
  console.log('\n  ╔══════════════════════════════════════════╗');
  console.log(`  ║  WaveTalk Server  →  http://localhost:${PORT}  ║`);
  console.log('  ║  WebSocket  +  WebRTC Signaling  +  REST  ║');
  console.log('  ╚══════════════════════════════════════════╝\n');
});
