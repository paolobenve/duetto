// Duetto - Signaling server
// -------------------------------------------------------------
// Modello "canale": non ci sono chiamate da fare o ricevere. Esiste un
// canale permanente per una coppia; chi entra ci resta e aspetta l'altro.
//
// Ogni telefono tiene UNA connessione sempre aperta, in uno di due stati:
//
//   listening  il telefono è raggiungibile ma non nel canale: microfono
//              chiuso, nessun media. Serve solo a poter essere avvisati.
//   active     il telefono è nel canale: si negozia il WebRTC.
//
// Compiti del server:
//  1) Tenere la coppia (max 2 presenze per stanza, nessun terzo entra).
//  2) Avvisare l'altro quando uno passa ad "active", o quando bussa:
//     è l'app stessa a mostrarsi la notifica, niente servizi esterni.
//  3) Inoltrare buste OPACHE: i payload di signaling arrivano già
//     cifrati dal client e il server non può leggerli né alterarli.
//  4) Inoltrare lo scambio di chiavi dell'accoppiamento (chiavi
//     pubbliche: non c'è nulla da nascondere, e senza il codice il
//     server non può comunque calcolare la chiave finale).
//
// La stanza si chiama `pairId` ed è un'impronta del codice di
// accoppiamento: il codice vero al server non arriva mai. Coppie diverse
// hanno pairId diversi e non si vedono fra loro.
// -------------------------------------------------------------

import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';
import { randomUUID } from 'node:crypto';

const PORT = parseInt(process.env.PORT || '8787', 10);
const HOST = process.env.HOST || '127.0.0.1'; // dietro reverse proxy: solo loopback

// Collegamento di riserva (TURN). Configurato QUI e non sui telefoni:
// così resta una cosa sola da mantenere, e cambiando password non si
// deve rimettere mano a ogni dispositivo.
const TURN_URL = process.env.TURN_URL || '';
const TURN_USER = process.env.TURN_USER || '';
const TURN_PASS = process.env.TURN_PASS || '';

/** Da mandare ai client perché sappiano come raggiungere il relay. */
function turnConfig() {
  if (!TURN_URL || !TURN_PASS) return null;
  return {
    urls: TURN_URL.split(',').map((u) => u.trim()).filter(Boolean),
    username: TURN_USER,
    credential: TURN_PASS,
  };
}
const MAX_PER_ROOM = 2;
const MAX_MESSAGE_BYTES = 256 * 1024;
const HEARTBEAT_MS = 30_000;

// Quanti ingressi al minuto per indirizzo. Non dà fastidio a nessuno
// (le riconnessioni sono poche), ma rende impraticabile provare codici
// di accoppiamento a tappeto: 100 milioni di combinazioni a questo ritmo
// richiederebbero millenni.
const JOIN_LIMIT = 30;
const JOIN_WINDOW_MS = 60_000;

/** @type {Map<string, number[]>} istanti dei tentativi recenti per IP */
const joinAttempts = new Map();

function clientIp(req) {
  // Dietro il reverse proxy l'indirizzo vero sta nell'intestazione.
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length > 0) return fwd.split(',')[0].trim();
  return req.socket?.remoteAddress || 'sconosciuto';
}

/** Vero se questo indirizzo ha già esaurito i tentativi consentiti. */
function tooManyJoins(ip) {
  const now = Date.now();
  const recent = (joinAttempts.get(ip) || []).filter((t) => now - t < JOIN_WINDOW_MS);
  recent.push(now);
  joinAttempts.set(ip, recent);
  return recent.length > JOIN_LIMIT;
}

// Ogni tanto ripuliamo, per non tenere in memoria indirizzi vecchi.
setInterval(() => {
  const now = Date.now();
  for (const [ip, times] of joinAttempts) {
    const recent = times.filter((t) => now - t < JOIN_WINDOW_MS);
    if (recent.length === 0) joinAttempts.delete(ip);
    else joinAttempts.set(ip, recent);
  }
}, JOIN_WINDOW_MS).unref?.();

const MODES = ['listening', 'active'];

/** @type {Map<string, Set<import('ws').WebSocket>>} presenze per pairId */
const rooms = new Map();

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
  // Se questa connessione è stata rimpiazzata dallo stesso dispositivo che
  // si riaggancia, l'altro non deve vedere nessuna uscita: il posto è già
  // occupato di nuovo, e annunciarla farebbe cadere il collegamento buono.
  if (!ws.replaced) {
    for (const peer of set) send(peer, { type: 'peer-left', peerId: ws.peerId });
  }
  if (set.size === 0) rooms.delete(roomId);
  ws.roomId = null;
}

/** Nome mostrato nelle notifiche dell'altro: ripulito, non ci fidiamo. */
function cleanName(raw) {
  const s = typeof raw === 'string' ? raw.trim() : '';
  if (!s) return 'Qualcuno';
  return s.replace(/[\r\n]/g, ' ').slice(0, 32);
}

const httpServer = createServer((req, res) => {
  // Accettiamo sia /healthz sia /qualsiasi/prefisso/healthz: davanti può
  // esserci un proxy che inoltra il percorso senza riscriverlo (HAProxy)
  // o che lo riscrive (Apache, nginx). Così funziona in entrambi i casi.
  if (req.url === '/healthz' || req.url.endsWith('/healthz')) {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, rooms: rooms.size, turn: !!turnConfig() }));
    return;
  }
  res.writeHead(426, { 'content-type': 'text/plain' });
  res.end('Upgrade Required: this endpoint speaks WebSocket only.\n');
});

const wss = new WebSocketServer({ server: httpServer, maxPayload: MAX_MESSAGE_BYTES });

wss.on('connection', (ws, req) => {
  ws.ip = clientIp(req);
  ws.isAlive = true;
  ws.peerId = randomUUID();
  ws.roomId = null;
  ws.joined = false;
  ws.mode = 'listening';
  ws.side = null;      // 'A' o 'B': identifica il dispositivo
  ws.replaced = false; // rimpiazzato dallo stesso dispositivo
  ws.name = 'Qualcuno';

  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', (data, isBinary) => {
    if (isBinary) return;
    let msg;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      send(ws, { type: 'error', error: 'invalid-json' });
      return;
    }

    // --- 1) Handshake ---------------------------------------------------
    if (!ws.joined) {
      if (msg.type !== 'join') {
        send(ws, { type: 'error', error: 'expected-join' });
        return;
      }
      if (tooManyJoins(ws.ip)) {
        send(ws, { type: 'error', error: 'too-many-attempts' });
        ws.close(4004, 'too-many-attempts');
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

      // Il lato ('A' o 'B') identifica il DISPOSITIVO, non la connessione:
      // è fissato all'accoppiamento e non cambia mai. Se troviamo una
      // connessione dello stesso lato, è lo stesso telefono che si
      // riaggancia dopo un cambio di rete, e si riprende il suo posto.
      //
      // Senza questo, chi perde la rete trova i due posti occupati - uno
      // dei quali da se stesso - e viene respinto come se fosse un terzo
      // dispositivo, finché il battito non si accorge della connessione
      // morta: fino a un minuto di "coppia occupata" senza motivo.
      const side = msg.side === 'A' || msg.side === 'B' ? msg.side : null;
      if (side) {
        for (const peer of [...set]) {
          if (peer.side === side) {
            peer.replaced = true;
            send(peer, { type: 'error', error: 'replaced' });
            try { peer.close(4005, 'replaced'); } catch { /* noop */ }
            set.delete(peer);
          }
        }
      }

      if (set.size >= MAX_PER_ROOM) {
        send(ws, { type: 'error', error: 'room-full' });
        ws.close(4003, 'room-full');
        return;
      }

      ws.side = side;
      const others = peersOf(roomId, ws);
      set.add(ws);
      ws.roomId = roomId;
      ws.joined = true;
      ws.name = cleanName(msg.name);
      ws.mode = MODES.includes(msg.mode) ? msg.mode : 'listening';

      // "polite" nel senso della perfect negotiation WebRTC: chi era già
      // nella stanza cede in caso di collisione di offerte. Deterministico,
      // così i due ruoli non coincidono mai.
      const other = others[0];
      send(ws, {
        type: 'joined',
        peerId: ws.peerId,
        turn: turnConfig(),
        polite: others.length === 0,
        peerPresent: !!other,
        peerActive: other ? other.mode === 'active' : false,
        peerName: other ? other.name : '',
      });

      for (const peer of others) {
        send(peer, {
          type: 'peer-joined',
          peerId: ws.peerId,
          name: ws.name,
          mode: ws.mode,
        });
        // Se entra già nel canale mentre l'altro è solo in ascolto,
        // è il momento di farglielo sapere.
        if (ws.mode === 'active' && peer.mode === 'listening') {
          send(peer, { type: 'notify', reason: 'peer-active', name: ws.name });
        }
      }
      return;
    }

    // --- 2) Cambio di stato ---------------------------------------------
    if (msg.type === 'mode') {
      const next = MODES.includes(msg.mode) ? msg.mode : null;
      if (!next || next === ws.mode) return;
      const before = ws.mode;
      ws.mode = next;
      for (const peer of peersOf(ws.roomId, ws)) {
        send(peer, { type: 'peer-mode', mode: next, name: ws.name });
        // Notifica solo la transizione che conta: qualcuno È ENTRATO
        // nel canale mentre l'altro stava soltanto in ascolto.
        if (before === 'listening' && next === 'active' && peer.mode === 'listening') {
          send(peer, { type: 'notify', reason: 'peer-active', name: ws.name });
        }
      }
      return;
    }

    // --- 3) Inoltro delle buste cifrate ---------------------------------
    if (msg.type === 'signal') {
      for (const peer of peersOf(ws.roomId, ws)) {
        send(peer, { type: 'signal', from: ws.peerId, payload: msg.payload });
      }
      return;
    }

    // --- 4) Accoppiamento: scambio di chiavi pubbliche -------------------
    if (msg.type === 'pair') {
      for (const peer of peersOf(ws.roomId, ws)) {
        send(peer, { type: 'pair', from: ws.peerId, payload: msg.payload });
      }
      return;
    }

    // --- 5) "Avvisa": notifica esplicita all'altro -----------------------
    if (msg.type === 'knock') {
      // Nessun freno: si bussa a una persona sola, che ti ha dato il
      // codice di persona. Se non risponde, insistere è legittimo, e
      // un limite qui si sente solo quando serve davvero insistere.
      const others = peersOf(ws.roomId, ws);
      if (others.length === 0) {
        send(ws, { type: 'knock-result', ok: false, error: 'peer-offline' });
        return;
      }
      for (const peer of others) {
        send(peer, { type: 'notify', reason: 'knock', name: ws.name });
      }
      send(ws, { type: 'knock-result', ok: true });
      return;
    }

    if (msg.type === 'bye') {
      leaveRoom(ws);
      return;
    }
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
  console.log(`[duetto] signaling in ascolto su ws://${HOST}:${PORT}`);
  console.log(`[duetto] TURN di riserva: ${turnConfig() ? TURN_URL : 'non configurato (le reti diverse non si collegheranno)'}`);
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    console.log(`\n[duetto] ${sig}, chiusura...`);
    for (const ws of wss.clients) ws.close(1001, 'server-shutdown');
    httpServer.close(() => process.exit(0));
  });
}
