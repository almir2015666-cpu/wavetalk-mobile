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

app.get('/privacy', (_req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>WaveTalk – Política de Privacidade</title><style>body{font-family:-apple-system,BlinkMacSystemFont,Helvetica,sans-serif;max-width:720px;margin:40px auto;padding:0 24px;color:#1a1a2e;line-height:1.7}h1{font-size:28px;font-weight:800;margin-bottom:4px}h2{font-size:18px;font-weight:700;margin-top:36px}p,li{font-size:15px;color:#333}.date{font-size:13px;color:#888;margin-bottom:32px}</style></head><body>
<h1>Política de Privacidade – WaveTalk</h1>
<p class="date">Última atualização: junho de 2026</p>
<p>O WaveTalk é um aplicativo de comunicação push-to-talk (PTT) em tempo real. Esta política descreve como tratamos as informações dos usuários.</p>
<h2>Dados coletados</h2>
<ul>
  <li><strong>Nome de exibição:</strong> fornecido pelo próprio usuário ao entrar no app. Não é vinculado a conta, e-mail ou identidade real.</li>
  <li><strong>Áudio de voz:</strong> capturado apenas enquanto o botão PTT está pressionado. O áudio é transmitido em tempo real aos demais participantes do canal e <strong>não é armazenado</strong> em nenhum servidor.</li>
</ul>
<h2>Dados NÃO coletados</h2>
<p>O WaveTalk não coleta localização, contatos, histórico de navegação, identificadores de dispositivo, dados de saúde ou qualquer outro dado pessoal além dos listados acima.</p>
<h2>Compartilhamento de dados</h2>
<p>Nenhum dado é vendido, compartilhado ou transferido a terceiros para fins comerciais.</p>
<h2>Retenção</h2>
<p>O nome de exibição existe apenas durante a sessão ativa. Ao sair do canal, nenhuma informação é retida nos servidores.</p>
<h2>Segurança</h2>
<p>A comunicação entre o app e o servidor utiliza HTTPS/WSS (criptografia em trânsito).</p>
<h2>Menores de idade</h2>
<p>O WaveTalk não é direcionado a crianças menores de 4 anos e não coleta intencionalmente dados de menores.</p>
<h2>Contato</h2>
<p>Dúvidas sobre esta política: <a href="mailto:almir2015.666@gmail.com">almir2015.666@gmail.com</a></p>
</body></html>`);
});

/* ── In-memory state ─────────────────────────────────────────────
   channels : Map<key, Set<socketId>>
   users    : Map<socketId, { id, name, channel, talking, talkStart }>
   talking  : Map<channelKey, socketId | null>
──────────────────────────────────────────────────────────────── */
const channels    = new Map();
const users       = new Map();
const talking     = new Map();
const channelPins = new Map(); // channelKey → pin (string)
const channelMods = new Map(); // channelKey → socketId of mod
const channelMuted = new Map(); // channelKey → Set<socketId>

const DEFAULT_CHANNELS = ['geral-1', 'geral-2', 'geral-3', 'geral-4'];
const CHANNEL_MAX      = 20;

function boot() {
  DEFAULT_CHANNELS.forEach(ch => {
    channels.set(ch, new Set());
    talking.set(ch, null);
  });
}

function getOrCreate(name) {
  const k = name.toLowerCase().trim().slice(0, 30);
  if (!channels.has(k)) {
    channels.set(k, new Set());
    talking.set(k, null);
    channelMuted.set(k, new Set());
  }
  return k;
}

function channelUsers(key) {
  const modId  = channelMods.get(key);
  const muted  = channelMuted.get(key) || new Set();
  return [...(channels.get(key) || [])].map(id => {
    const u = users.get(id);
    if (!u) return null;
    return { ...u, isMod: id === modId, isMuted: muted.has(id) };
  }).filter(Boolean);
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
  channelMuted.get(key)?.delete(socket.id);
  socket.leave(key);
  if (talking.get(key) === socket.id) {
    talking.set(key, null);
    io.to(key).emit('ptt:stop', { userId: socket.id, name: users.get(socket.id)?.name, duration: '0:00' });
  }
  // Reassign mod if mod left
  if (channelMods.get(key) === socket.id) {
    const remaining = [...channels.get(key)];
    if (remaining.length > 0) channelMods.set(key, remaining[0]);
    else channelMods.delete(key);
  }
  socket.to(key).emit('webrtc:peer-left', { peerId: socket.id });
  if (channels.get(key).size === 0 && !DEFAULT_CHANNELS.includes(key)) {
    channels.delete(key); talking.delete(key); channelMuted.delete(key); channelMods.delete(key);
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
    name: k, online: s.size, max: CHANNEL_MAX,
    talking: talking.get(k) || null,
    hasPin: channelPins.has(k),
    isFull: s.size >= CHANNEL_MAX,
  })));
});

/* ── Socket.io ───────────────────────────────────────────────────── */
io.on('connection', (socket) => {
  console.log(`[+] ${socket.id} connected`);

  /* ── JOIN ── */
  socket.on('join', ({ name, channel, pin, channelPin }) => {
    const userName   = (name    || 'Anônimo').trim().slice(0, 40);
    const channelKey = getOrCreate(channel || 'geral-1');

    // Capacity check
    if (channels.get(channelKey).size >= CHANNEL_MAX) {
      socket.emit('join:rejected', { reason: 'full', channel: channelKey });
      return;
    }

    // PIN check — only for channels that have a PIN set
    if (channelPins.has(channelKey)) {
      if (pin !== channelPins.get(channelKey)) {
        socket.emit('join:rejected', { reason: 'pin', channel: channelKey });
        return;
      }
    }
    // Set PIN if creator provided one and channel is new
    if (channelPin && !channelPins.has(channelKey)) {
      channelPins.set(channelKey, String(channelPin).slice(0, 6));
    }

    const prev = users.get(socket.id);
    if (prev && prev.channel !== channelKey) leaveChannel(socket, prev.channel);

    const user = { id: socket.id, name: userName, channel: channelKey, talking: false, talkStart: null, status: 'available' };
    users.set(socket.id, user);
    channels.get(channelKey).add(socket.id);
    socket.join(channelKey);
    // First to join becomes mod
    if (!channelMods.has(channelKey)) channelMods.set(channelKey, socket.id);

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

  /* ── STATUS ── */
  socket.on('status:set', (status) => {
    const user = users.get(socket.id);
    if (!user) return;
    const allowed = ['available', 'busy', 'silent'];
    if (!allowed.includes(status)) return;
    user.status = status;
    broadcastChannel(user.channel);
  });

  /* ── MOD ACTIONS ── */
  socket.on('mod:kick', ({ userId }) => {
    const mod = users.get(socket.id);
    if (!mod || channelMods.get(mod.channel) !== socket.id) return;
    const target = users.get(userId);
    if (!target || target.channel !== mod.channel) return;
    const targetSocket = io.sockets.sockets.get(userId);
    if (targetSocket) {
      targetSocket.emit('mod:kicked', { by: mod.name });
      leaveChannel(targetSocket, mod.channel);
      users.delete(userId);
    }
    console.log(`  kick  ${mod.name} expelled ${target.name} from #${mod.channel}`);
  });

  socket.on('mod:mute', ({ userId }) => {
    const mod = users.get(socket.id);
    if (!mod || channelMods.get(mod.channel) !== socket.id) return;
    const muted = channelMuted.get(mod.channel);
    if (!muted) return;
    if (muted.has(userId)) {
      muted.delete(userId);
      io.to(userId).emit('mod:unmuted', { by: mod.name });
    } else {
      muted.add(userId);
      io.to(userId).emit('mod:muted', { by: mod.name });
      // Force stop PTT if they're talking
      if (talking.get(mod.channel) === userId) {
        const tu = users.get(userId);
        if (tu) { tu.talking = false; tu.talkStart = null; }
        talking.set(mod.channel, null);
        io.to(mod.channel).emit('ptt:stop', { userId, name: users.get(userId)?.name, duration: '0:00' });
      }
    }
    broadcastChannel(mod.channel);
  });

  /* ── PTT START ── */
  socket.on('ptt:start', () => {
    const user = users.get(socket.id);
    if (!user) return;
    const ch = user.channel;
    // Block if muted by mod
    if (channelMuted.get(ch)?.has(socket.id)) {
      socket.emit('ptt:blocked', { by: 'moderador' });
      return;
    }
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
