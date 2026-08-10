// DuoTalk - Signaling server
// -------------------------------------------------------------
// Ruolo: mettere in contatto ESATTAMENTE due peer che condividono
// lo stesso ROOM e inoltrare tra loro i messaggi.
//
// Proprieta' importante: il server NON conosce la chiave di cifratura
// dei due telefoni. I payload di signaling (SDP/ICE) viaggiano gia'
// cifrati dal client (secretbox/NaCl), quindi qui li trattiamo come
// buste opache. Il server non puo' leggere ne' alterare il contenuto
// senza far fallire la verifica lato client.
//
// Il server fa comunque tre cose utili:
//  1) Limita ogni stanza a 2 partecipanti (nessun terzo puo' entrare).
//  2) Richiede un ACCESS_TOKEN condiviso per accettare la connessione
//     (barriera anti-abuso; opzionale ma consigliata).
//  3) Inoltra i messaggi e notifica join/leave dell'altro peer.
// -------------------------------------------------------------

import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';
import { randomUUID, timingSafeEqual } from 'node:crypto';

const PORT = parseInt(process.env.PORT || '8787', 10);
const HOST = process.env.HOST || '127.0.0.1'; // dietro reverse proxy: solo loopback
const ACCESS_TOKEN = process.env.ACCESS_TOKEN || ''; // se vuoto, nessun controllo token
const MAX_PER_ROOM = 2;
const MAX_MESSAGE_BYTES = 256 * 1024; // le buste di signaling sono piccole
const HEARTBEAT_MS = 30_000;

/** @type {Map<string, Set<import('ws').WebSocket>>} rooms per id */
const rooms = new Map();

function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

function send(ws, obj) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj));
}

function peersOf(roomId, exclude) {
  const set = rooms.get(roomId);
  if (!set) return [];
  return [...set].filter((c) => c !== exclude);
}

function leaveRoom(ws) {
  const roomId = ws.roomId;
  if (!roomId) return;
  const set = rooms.get(roomId);
  if (!set) return;
  set.delete(ws);
  for (const peer of set) send(peer, { type: 'peer-left', peerId: ws.peerId });
  if (set.size === 0) rooms.delete(roomId);
  ws.roomId = null;
}

const httpServer = createServer((req, res) => {
  // Piccolo health-check per il reverse proxy / monitoraggio
  if (req.url === '/healthz') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, rooms: rooms.size }));
    return;
  }
  res.writeHead(426, { 'content-type': 'text/plain' });
  res.end('Upgrade Required: this endpoint speaks WebSocket only.\n');
});

const wss = new WebSocketServer({ server: httpServer, maxPayload: MAX_MESSAGE_BYTES });

wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.peerId = randomUUID();
  ws.roomId = null;
  ws.joined = false;

  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', (data, isBinary) => {
    if (isBinary) return; // usiamo solo JSON testuale
    let msg;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      send(ws, { type: 'error', error: 'invalid-json' });
      return;
    }

    // 1) Handshake: primo messaggio deve essere "join"
    if (!ws.joined) {
      if (msg.type !== 'join') {
        send(ws, { type: 'error', error: 'expected-join' });
        return;
      }
      if (ACCESS_TOKEN && !safeEqual(msg.token, ACCESS_TOKEN)) {
        send(ws, { type: 'error', error: 'bad-token' });
        ws.close(4001, 'bad-token');
        return;
      }
      const roomId = typeof msg.room === 'string' ? msg.room.trim() : '';
      if (!roomId || roomId.length > 128) {
        send(ws, { type: 'error', error: 'bad-room' });
        ws.close(4002, 'bad-room');
        return;
      }
      let set = rooms.get(roomId);
      if (!set) { set = new Set(); rooms.set(roomId, set); }
      if (set.size >= MAX_PER_ROOM) {
        send(ws, { type: 'error', error: 'room-full' });
        ws.close(4003, 'room-full');
        return;
      }
      set.add(ws);
      ws.roomId = roomId;
      ws.joined = true;

      const others = peersOf(roomId, ws);
      // Chi entra per secondo diventa "initiator" della negoziazione WebRTC.
      const initiator = others.length > 0;
      send(ws, { type: 'joined', peerId: ws.peerId, initiator, peers: others.length });
      for (const peer of others) send(peer, { type: 'peer-joined', peerId: ws.peerId });
      return;
    }

    // 2) Post-join: inoltra le buste (cifrate) all'altro peer.
    if (msg.type === 'signal') {
      for (const peer of peersOf(ws.roomId, ws)) {
        send(peer, { type: 'signal', from: ws.peerId, payload: msg.payload });
      }
      return;
    }

    if (msg.type === 'bye') {
      leaveRoom(ws);
      return;
    }

    // messaggi non riconosciuti: ignora silenziosamente
  });

  ws.on('close', () => leaveRoom(ws));
  ws.on('error', () => leaveRoom(ws));
});

// Ping/pong per chiudere connessioni morte (telefoni che perdono rete)
const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if (ws.isAlive === false) { ws.terminate(); continue; }
    ws.isAlive = false;
    try { ws.ping(); } catch { /* noop */ }
  }
}, HEARTBEAT_MS);

wss.on('close', () => clearInterval(heartbeat));

httpServer.listen(PORT, HOST, () => {
  console.log(`[duotalk] signaling in ascolto su ws://${HOST}:${PORT}`);
  console.log(`[duotalk] access token: ${ACCESS_TOKEN ? 'attivo' : 'DISATTIVATO (imposta ACCESS_TOKEN)'}`);
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    console.log(`\n[duotalk] ${sig}, chiusura...`);
    for (const ws of wss.clients) ws.close(1001, 'server-shutdown');
    httpServer.close(() => process.exit(0));
  });
}
