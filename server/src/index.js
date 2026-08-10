// DuoTalk - Signaling server
// -------------------------------------------------------------
// Modello "canale": non ci sono chiamate da fare o ricevere. Esiste un
// canale permanente; chi entra ci resta e aspetta l'altro. Quando il
// secondo entra, i due si collegano da soli.
//
// Compiti del server:
//  1) Tenere il canale (max 2 presenze, nessun terzo puo' entrare).
//  2) Inoltrare buste OPACHE: i payload di signaling (SDP/ICE) arrivano
//     gia' cifrati dal client, il server non puo' leggerli ne' alterarli.
//  3) Suonare il campanello via ntfy sull'altro telefono quando qualcuno
//     entra nel canale (o preme "Bussa"), anche ad app chiusa.
//  4) Richiedere un ACCESS_TOKEN condiviso (barriera anti-abuso).
// -------------------------------------------------------------

import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { ntfyPublish, ntfyEnabled } from './ntfy.js';

const PORT = parseInt(process.env.PORT || '8787', 10);
const HOST = process.env.HOST || '127.0.0.1'; // dietro reverse proxy: solo loopback
const ACCESS_TOKEN = process.env.ACCESS_TOKEN || ''; // se vuoto, nessun controllo token
const MAX_PER_ROOM = 2;
const MAX_MESSAGE_BYTES = 256 * 1024; // le buste di signaling sono piccole
const HEARTBEAT_MS = 30_000;
const KNOCK_COOLDOWN_MS = 15_000; // anti-martellamento del pulsante "Bussa"

/** @type {Map<string, Set<import('ws').WebSocket>>} presenze per canale */
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

/** Nome mostrato nella notifica, ripulito (finisce in un push, non fidarsi). */
function cleanName(raw) {
  const s = typeof raw === 'string' ? raw.trim() : '';
  if (!s) return 'Qualcuno';
  return s.replace(/[\r\n]/g, ' ').slice(0, 32);
}

const httpServer = createServer((req, res) => {
  // Piccolo health-check per il reverse proxy / monitoraggio
  if (req.url === '/healthz') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, rooms: rooms.size, ntfy: ntfyEnabled() }));
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
  ws.peerTopic = '';   // topic ntfy da suonare = quello DELL'ALTRA persona
  ws.name = 'Qualcuno';
  ws.lastKnock = 0;

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

      const others = peersOf(roomId, ws);
      set.add(ws);
      ws.roomId = roomId;
      ws.joined = true;
      ws.peerTopic = typeof msg.peerTopic === 'string' ? msg.peerTopic.trim().slice(0, 128) : '';
      ws.name = cleanName(msg.name);

      // "polite" nel senso della perfect negotiation WebRTC: chi era gia'
      // nel canale cede in caso di collisione di offerte. Deterministico,
      // cosi' i due ruoli non coincidono mai.
      const polite = others.length === 0;
      send(ws, { type: 'joined', peerId: ws.peerId, polite, peers: others.length });
      for (const peer of others) send(peer, { type: 'peer-joined', peerId: ws.peerId, name: ws.name });

      // Campanello: solo se l'altro NON e' gia' nel canale (altrimenti
      // se ne accorge da solo e la notifica sarebbe rumore inutile).
      if (others.length === 0 && ws.peerTopic) {
        ntfyPublish(ws.peerTopic, {
          title: 'DuoTalk',
          message: `${ws.name} e' nel canale`,
          priority: 4,
          tags: ['wave'],
        });
      }
      return;
    }

    // 2) Post-join: inoltra le buste (cifrate) all'altro peer.
    if (msg.type === 'signal') {
      for (const peer of peersOf(ws.roomId, ws)) {
        send(peer, { type: 'signal', from: ws.peerId, payload: msg.payload });
      }
      return;
    }

    // 3) "Bussa": notifica esplicita all'altro ("sono qui, vieni").
    if (msg.type === 'knock') {
      const now = Date.now();
      if (now - ws.lastKnock < KNOCK_COOLDOWN_MS) {
        send(ws, { type: 'knock-result', ok: false, error: 'too-soon' });
        return;
      }
      ws.lastKnock = now;
      if (!ws.peerTopic) {
        send(ws, { type: 'knock-result', ok: false, error: 'no-topic' });
        return;
      }
      ntfyPublish(ws.peerTopic, {
        title: 'DuoTalk',
        message: `${ws.name} ti aspetta nel canale`,
        priority: 5,
        tags: ['bell'],
      }).then((ok) => send(ws, { type: 'knock-result', ok }));
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
  console.log(`[duotalk] notifiche ntfy: ${ntfyEnabled() ? 'attive' : 'disattivate (imposta NTFY_URL)'}`);
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    console.log(`\n[duotalk] ${sig}, chiusura...`);
    for (const ws of wss.clients) ws.close(1001, 'server-shutdown');
    httpServer.close(() => process.exit(0));
  });
}
