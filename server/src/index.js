/*
 * Duetto - a permanent voice and video channel for two people.
 * Copyright (C) 2026 Paolo Benvenuto
 *
 * Free software under the GNU General Public License, version 3 or any
 * later version, and with no warranty of any kind. The full text is in
 * the LICENSE file at the root of the project, and at
 * <https://www.gnu.org/licenses/>.
 */
// Duetto - Signaling server
// -------------------------------------------------------------
// The "channel" model: there are no calls to make or to answer. There is
// a permanent channel for one pair; whoever goes in stays there and waits
// for the other.
//
// Each phone keeps ONE connection open at all times, in one of two
// states:
//
//   listening  the phone can be reached but is not in the channel:
//              microphone closed, no media. It is only there so that one
//              can be alerted.
//   active     the phone is in the channel: WebRTC is being negotiated.
//
// What the server does:
//  1) Holds the pair (at most 2 presences per room, no third one gets in).
//  2) Alerts the other when one goes to "active", or knocks: it is the
//     app itself that shows the notification, no outside services.
//  3) Forwards OPAQUE envelopes: the signalling payloads arrive already
//     encrypted from the client and the server can neither read nor alter
//     them.
//  4) Forwards the pairing key exchange (public keys: there is nothing to
//     hide, and without the code the server cannot work out the final key
//     anyway).
//
// The room is called `pairId` and is a fingerprint of the pairing code:
// the real code never reaches the server. Different pairs have different
// pairIds and do not see one another.
// -------------------------------------------------------------

import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';
import {
  createHash, createPublicKey, randomBytes, randomUUID, timingSafeEqual, verify,
} from 'node:crypto';
import {
  addInvitation, noteGuest, noteRoom, read, remove as removePerson, roomOf, useInvitation,
} from './devices.js';

const PORT = parseInt(process.env.PORT || '8787', 10);
const HOST = process.env.HOST || '127.0.0.1'; // behind a reverse proxy: loopback only

// The fallback link (TURN). Configured HERE and not on the phones: that
// way there is one single thing to maintain, and changing the password
// does not mean going back to every device.
const TURN_URL = process.env.TURN_URL || '';
const TURN_USER = process.env.TURN_USER || '';
const TURN_PASS = process.env.TURN_PASS || '';

/** To be sent to the clients so they know how to reach the relay. */
function turnConfig() {
  if (!TURN_URL || !TURN_PASS) return null;
  return {
    urls: TURN_URL.split(',').map((u) => u.trim()).filter(Boolean),
    username: TURN_USER,
    credential: TURN_PASS,
  };
}
/**
 * The key of the house.
 *
 * Without it, anybody who learns the address can use this server: open
 * rooms of their own, and - worse - be handed the relay's credentials
 * in the very first message, which is your bandwidth paid by you. With
 * it, a stranger is turned away before being told anything at all.
 *
 * It is not an identity and it protects nothing of the conversation:
 * whoever has it can knock at this door, and no further. What keeps a
 * pair apart from anybody else is the pairing code, which never comes
 * here.
 *
 * Left empty, the server lets everybody in, as it always did: a server
 * that is already running does not lock its own owners out overnight.
 */
const SERVER_KEY = process.env.SERVER_KEY || '';

/**
 * The same key or not, told in a fixed time.
 *
 * Comparing two strings with `===` gives an answer sooner when the
 * first letter is wrong, which over enough tries says how much of a key
 * was right. Comparing the digests instead takes the same time for
 * every wrong key, and they are of equal length by construction.
 */
function keyIsRight(said) {
  if (!SERVER_KEY) return true;
  const digest = (v) => createHash('sha256').update(String(v ?? '')).digest();
  return timingSafeEqual(digest(said), digest(SERVER_KEY));
}

/**
 * The phones allowed in, by the key each of them carries.
 *
 * `AUTHORISED_KEYS=anna:BASE64,bruno:BASE64`. The secret half never
 * leaves the phone that made it: what is written here is the public
 * half, which can travel by any road, and a phone proves it holds the
 * other half by signing a number this server picks at the moment.
 *
 * That is the difference from the key of the house above: a word can be
 * repeated to anybody, a signature cannot. To take one phone away, its
 * line goes and nobody else notices; and the log says which name came
 * in, not just that somebody did.
 *
 * Set, it is the door. Empty, the server falls back on SERVER_KEY, and
 * with neither it lets everybody in, as it always did.
 */
/**
 * The phones written down by an invitation, alongside those in the
 * `.env`. The file is read at every knock: see src/devices.js.
 */
const listed = () => {
  try {
    return read().devices;
  } catch {
    return [];
  }
};

const AUTHORISED_KEYS = new Map(
  (process.env.AUTHORISED_KEYS || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const cut = entry.indexOf(':');
      return cut < 0
        ? [entry, entry]
        : [entry.slice(cut + 1).trim(), entry.slice(0, cut).trim()];
    }),
);

/**
 * A raw Ed25519 key, dressed as node expects to find it.
 *
 * What is written in the settings is the naked key, 32 bytes: node
 * wants it wrapped in the twelve bytes that say "this is an Ed25519
 * public key". They are always the same twelve.
 */
const SPKI = Buffer.from('302a300506032b6570032100', 'hex');
function asKey(base64) {
  const raw = Buffer.from(String(base64 || ''), 'base64');
  if (raw.length !== 32) return null;
  try {
    return createPublicKey({
      key: Buffer.concat([SPKI, raw]), format: 'der', type: 'spki',
    });
  } catch {
    return null;
  }
}

/** Whether this key really made this signature. */
function signed(pub, signature, nonce) {
  const key = asKey(pub);
  if (!key) return false;
  try {
    return verify(null, Buffer.from(nonce, 'base64'), key,
      Buffer.from(String(signature || ''), 'base64'));
  } catch {
    return false;
  }
}

/**
 * The name this phone is known by, or null.
 *
 * Two ways in, and the signature is asked for either way: written in
 * the `.env` by the owner, or written down by an invitation it used.
 * An invitation is spent here, at the first knock that carries it -
 * after that this phone is on the list like any other.
 */
/**
 * Three ways to be here, and they are not the same thing.
 *
 * `opens`: this phone may open connections of its own, and whoever it
 * pairs with is let in beside it. True for the phones in the `.env` and
 * for anybody who came in with an invitation.
 *
 * `invites`: this phone may hand out invitations and take people off
 * the list. True for the phones in the `.env` alone - the ones whose
 * owner had to be at the server to write them there. Somebody let in by
 * an invitation can talk to whoever they like and hand out nothing:
 * otherwise the first person invited could invite the world, and the
 * list would stop meaning anything.
 */
function whoIsThere(msg, nonce) {
  const pub = String(msg.pub || '');
  if (!pub || !signed(pub, msg.sig, nonce)) return null;

  const fromEnv = AUTHORISED_KEYS.get(pub);
  if (fromEnv) return { name: fromEnv, opens: true, invites: true };

  const known = listed().find((d) => d.pub === pub);
  if (known) return { name: known.name, opens: true, invites: false };

  if (msg.invite) {
    const name = useInvitation(msg.invite, pub);
    if (name) {
      console.log(`[duetto] ${name} comes in with an invitation, `
        + `phone ${pub.slice(0, 12)}…`);
      return { name, opens: true, invites: false };
    }
  }
  return null;
}

/**
 * The other half of somebody's connection.
 *
 * Whoever is on the list can talk to anybody: the person on the other
 * side has nothing to ask and nobody to ask it of - they install the
 * app, write the address, and pair. Their phone is let in here, and
 * written down for THAT room: with that key they cannot open another
 * one, so what one lets in does not let in anybody else.
 *
 * The first time, the one on the list has to be in the room at that
 * moment. It costs nothing - a pairing is made with both phones awake
 * anyway - and it means that a room's second seat cannot be taken by
 * somebody who has merely learnt its name. Afterwards the key is
 * written down and comes and goes on its own.
 */
function asGuest(msg, nonce, roomId, here) {
  const pub = String(msg.pub || '');
  if (!pub || !signed(pub, msg.sig, nonce)) return null;

  const room = roomOf(roomId);
  if (!room) return null;

  if (room.guest === pub) return { name: `${room.owner}+`, opens: false, invites: false };
  if (room.guest) return null;

  const ownerIsHere = [...here].some((peer) => peer.opens && peer.who === room.owner);
  if (!ownerIsHere) return null;

  noteGuest(roomId, pub);
  console.log(`[duetto] ${room.owner} brings somebody along in their room, `
    + `phone ${pub.slice(0, 12)}…`);
  return { name: `${room.owner}+`, opens: false, invites: false };
}

/** Is the door shut? It is, as soon as one phone is on the list. */
function doorIsShut() {
  return AUTHORISED_KEYS.size > 0 || listed().length > 0;
}

const MAX_PER_ROOM = 2;
const MAX_MESSAGE_BYTES = 256 * 1024;

/**
 * How often the server taps each phone on the shoulder.
 *
 * It does two things at once: it notices dead connections, and it keeps
 * the operator's NAT mapping alive, without which the phone stops being
 * reachable while believing itself connected.
 *
 * The bill, though, is paid by the phone and not by the server: every
 * packet pulls the radio out of its rest and holds it there for a few
 * seconds. At a fixed 30 seconds that was 120 wake-ups an hour, all night
 * long, to do nothing - the largest single cost of waiting.
 *
 * So: close together only where being prompt really matters, that is with
 * somebody in the channel; far apart when one is merely listening. Four
 * minutes sit comfortably inside the expiry times of mobile NAT, which in
 * practice run from ten minutes upwards.
 *
 * The times can be changed from the `.env`: the automatic test needs
 * short ones, and in the field they allow the wait to be tuned - if
 * measuring consumption shows that four minutes could be stretched -
 * without touching the code.
 */
const ms = (v, def) => (Number(v) > 0 ? Number(v) : def);
const HEARTBEAT_ACTIVE_MS = ms(process.env.HEARTBEAT_ACTIVE_MS, 30_000);
const HEARTBEAT_LISTENING_MS = ms(process.env.HEARTBEAT_LISTENING_MS, 240_000);

/** How often we look at who has run out. It costs nothing: two sockets. */
const HEARTBEAT_TICK_MS = ms(process.env.HEARTBEAT_TICK_MS, 5_000);

/**
 * How long the answer is waited for before the connection is given up for
 * dead.
 *
 * It has to sit comfortably around the waking of a phone that was asleep
 * - reconnecting the radio included - and tightly enough not to leave the
 * other person for long in front of a presence that is not there any
 * more.
 */
const ANSWER_WAIT_MS = ms(process.env.ANSWER_WAIT_MS, 20_000);

/**
 * How many knocks a minute from one address, from phones this server
 * does not know.
 *
 * It is there to make trying pairing codes wholesale impractical: a
 * hundred million combinations at this rate would take millennia.
 *
 * It counts only the knocks of whoever is NOT recognised. At home every
 * phone shares one address, and a restart brings them all back at once:
 * counting those too, the budget went in seconds and the phones locked
 * themselves out - each refusal answered by another knock half a second
 * later, which is how a brake becomes a wall. A phone that has just
 * signed for itself is not trying anything.
 *
 * Higher than it was, as well: thirty was stingy for a household behind
 * one address.
 */
const JOIN_LIMIT = Number(process.env.JOIN_LIMIT || 120);
const JOIN_WINDOW_MS = 60_000;

/** @type {Map<string, number[]>} moments of the recent attempts per IP */
const joinAttempts = new Map();

function clientIp(req) {
  // Behind the reverse proxy the real address is in the header.
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length > 0) return fwd.split(',')[0].trim();
  return req.socket?.remoteAddress || 'unknown';
}

/** True if this address has already used up the attempts allowed. */
function tooManyJoins(ip) {
  const now = Date.now();
  const recent = (joinAttempts.get(ip) || []).filter((t) => now - t < JOIN_WINDOW_MS);
  recent.push(now);
  joinAttempts.set(ip, recent);
  return recent.length > JOIN_LIMIT;
}

// Every now and then we tidy up, so as not to keep old addresses in
// memory.
setInterval(() => {
  const now = Date.now();
  for (const [ip, times] of joinAttempts) {
    const recent = times.filter((t) => now - t < JOIN_WINDOW_MS);
    if (recent.length === 0) joinAttempts.delete(ip);
    else joinAttempts.set(ip, recent);
  }
}, JOIN_WINDOW_MS).unref?.();

const MODES = ['listening', 'active'];

/** @type {Map<string, Set<import('ws').WebSocket>>} presences per pairId */
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
  // If this connection has been replaced by the same device hooking up
  // again, the other one must see no departure at all: the place is
  // taken once more, and announcing it would bring the good connection
  // down.
  if (!ws.replaced) {
    // The reason changes what the other one has to do: whoever said
    // goodbye has really gone, and their picture can disappear at once;
    // whoever dropped is most likely changing network and will be back
    // within seconds, and taking their place apart means putting it back
    // together a moment later.
    const reason = ws.saidBye ? 'bye' : 'dropped';
    for (const peer of set) send(peer, { type: 'peer-left', peerId: ws.peerId, reason });
  }
  if (set.size === 0) rooms.delete(roomId);
  ws.roomId = null;
}

/** The name shown in the other's notifications: cleaned, we do not trust it. */
function cleanName(raw) {
  const s = typeof raw === 'string' ? raw.trim() : '';
  if (!s) return 'Someone';
  return s.replace(/[\r\n]/g, ' ').slice(0, 32);
}

const httpServer = createServer((req, res) => {
  // We accept both /healthz and /any/prefix/healthz: in front there may
  // be a proxy that forwards the path without rewriting it (HAProxy) or
  // one that rewrites it (Apache, nginx). This way it works either way.
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
  /** The last proof that they are there: now, having just arrived. */
  ws.lastSeen = Date.now();
  /** When a tap was sent to them with no answer yet. */
  ws.pingSentAt = null;
  /**
   * A number picked now, for this connection alone.
   *
   * The phone signs it to show it holds the secret half of its key. A
   * signature made for one connection is worth nothing on the next, so
   * there is nothing to steal by listening - and nothing to replay.
   */
  ws.nonce = randomBytes(16).toString('base64');
  send(ws, { type: 'hello', nonce: ws.nonce });
  ws.peerId = randomUUID();
  ws.roomId = null;
  ws.joined = false;
  ws.mode = 'listening';
  ws.side = null;     // 'A' or 'B': it identifies the device
  ws.replaced = false; // replaced by the same device
  ws.saidBye = false;  // said "bye": a wanted exit, not a drop
  ws.name = 'Someone';

  ws.on('pong', () => {
    ws.pingSentAt = null;
    ws.lastSeen = Date.now();
  });

  ws.on('message', (data, isBinary) => {
    // A message is proof enough that they are there, and it has just
    // refreshed the NAT mapping: we push the next tap further ahead.
    ws.lastSeen = Date.now();
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
      const roomId = typeof msg.room === 'string' ? msg.room.trim() : '';
      if (!roomId || roomId.length > 128) {
        send(ws, { type: 'error', error: 'bad-room' });
        ws.close(4002, 'bad-room');
        return;
      }
      let set = rooms.get(roomId);
      if (!set) { set = new Set(); rooms.set(roomId, set); }

      /**
       * The door, before anything else is said - the relay's
       * credentials included, which otherwise travel in the very first
       * message to whoever knocks.
       *
       * With a list of phones, the door is a signature; failing that, a
       * word; failing that too, it is open. The attempt has just been
       * counted, so trying keys costs thirty a minute, like trying
       * pairing codes.
       */
      const known = doorIsShut()
        ? whoIsThere(msg, ws.nonce) || asGuest(msg, ws.nonce, roomId, set)
        : null;

      // The brake, for whoever is not recognised: see JOIN_LIMIT.
      if (!known && tooManyJoins(ws.ip)) {
        send(ws, { type: 'error', error: 'too-many-attempts' });
        ws.close(4004, 'too-many-attempts');
        return;
      }

      if (doorIsShut()) {
        const who = known;
        if (!who) {
          console.log(`[duetto] turned away: ${String(msg.pub || 'no key').slice(0, 12)}`
            + ` from ${ws.ip}`);
          send(ws, { type: 'error', error: 'not-allowed' });
          ws.close(4006, 'not-allowed');
          return;
        }
        ws.who = who.name;
        ws.opens = who.opens === true;
        ws.invites = who.invites === true;
        // The room belongs to whoever may open one: it is written down
        // now, so that the other half can be let in beside them.
        if (ws.opens) noteRoom(roomId, who.name);
      } else if (!keyIsRight(msg.key)) {
        send(ws, { type: 'error', error: 'not-allowed' });
        ws.close(4006, 'not-allowed');
        return;
      } else {
        // An open door: everybody may open connections, as always.
        ws.opens = true;
      }

      // The side ('A' or 'B') identifies the DEVICE, not the connection:
      // it is fixed at pairing and never changes. If we find a connection
      // of the same side, it is the same phone hooking up again after a
      // change of network, and it takes its place back.
      //
      // Without this, whoever loses the network finds both places taken -
      // one of them by themselves - and is turned away as though they
      // were a third device, until the heartbeat notices the dead
      // connection: up to a minute of "pair full" for no reason.
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

      // "polite" in the sense of WebRTC's perfect negotiation: whoever
      // was in the room already gives way if the offers collide.
      // Deterministic, so the two roles never coincide.
      const other = others[0];
      send(ws, {
        type: 'joined',
        peerId: ws.peerId,
        // Whether this phone may invite: it is one of those written in
        // the .env. The app shows or hides a whole section on it.
        owner: ws.invites === true,
        // And whether it may open connections of its own. A phone let
        // in beside somebody else may not: telling it lets the app take
        // away a button that would only lead to a closed door.
        opens: ws.opens !== false,
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
        // Having just told whoever comes in that the other is there, it
        // is worth making sure it is true, instead of waiting for the
        // heartbeat's next round.
        checkPresence(peer);
        // If they come straight into the channel while the other is only
        // listening, this is the moment to let them know.
        if (ws.mode === 'active' && peer.mode === 'listening') {
          send(peer, { type: 'notify', reason: 'peer-active', name: ws.name });
        }
      }
      return;
    }

    // --- 2) Change of state ---------------------------------------------
    if (msg.type === 'mode') {
      const next = MODES.includes(msg.mode) ? msg.mode : null;
      if (!next || next === ws.mode) return;
      const before = ws.mode;
      ws.mode = next;
      for (const peer of peersOf(ws.roomId, ws)) {
        send(peer, { type: 'peer-mode', mode: next, name: ws.name });
        if (next === 'active') checkPresence(peer);
        // Only the transition that counts is notified: somebody HAS COME
        // INTO the channel while the other was merely listening.
        if (before === 'listening' && next === 'active' && peer.mode === 'listening') {
          send(peer, { type: 'notify', reason: 'peer-active', name: ws.name });
        }
      }
      return;
    }

    // --- 3) Forwarding the encrypted envelopes --------------------------
    if (msg.type === 'signal') {
      for (const peer of peersOf(ws.roomId, ws)) {
        send(peer, { type: 'signal', from: ws.peerId, payload: msg.payload });
      }
      return;
    }

    // --- 4) Pairing: the exchange of public keys -------------------------
    if (msg.type === 'pair') {
      for (const peer of peersOf(ws.roomId, ws)) {
        send(peer, { type: 'pair', from: ws.peerId, payload: msg.payload });
      }
      return;
    }

    // --- 5) "Alert": an explicit notification to the other ---------------
    if (msg.type === 'knock') {
      // No brake: one knocks at a single person, who gave you the code in
      // person. If they do not answer, insisting is legitimate, and a
      // limit here would be felt exactly when insisting is what is
      // needed.
      const others = peersOf(ws.roomId, ws);
      if (others.length === 0) {
        send(ws, { type: 'knock-result', ok: false, error: 'peer-offline' });
        return;
      }
      for (const peer of others) {
        send(peer, { type: 'notify', reason: 'knock', name: ws.name });
        // Knocking is the moment when knowing whether they are really
        // there matters most: if they do not answer, within seconds their
        // departure reaches whoever knocked, instead of leaving them
        // "alerted" for nothing.
        checkPresence(peer);
      }
      send(ws, { type: 'knock-result', ok: true });
      return;
    }

    // --- 6) "Still there?": the other's state on request -----------------
    //
    // The channel is made of announcements: who comes in, who goes out,
    // who drops. But the announcement of a drop only arrives when the
    // server notices, and with the slow heartbeat of somebody who is
    // merely listening that can take minutes. Whoever is waiting for
    // somebody looks at that line - "listening" or "disconnected" - and
    // deserves to be able to refresh it.
    //
    // The answer is what the server knows right now; along with it a tap
    // goes out to the other, so that if that presence is a ghost the
    // `peer-left` arrives within seconds and the line corrects itself.
    if (msg.type === 'presence') {
      const other = peersOf(ws.roomId, ws)[0];
      send(ws, {
        type: 'presence',
        peerPresent: !!other,
        peerActive: other ? other.mode === 'active' : false,
        peerName: other ? other.name : '',
      });
      if (other) checkPresence(other);
      return;
    }

    /**
     * Inviting somebody, and seeing who is in, from the app.
     *
     * The one asking is already at the other end of a connection this
     * server let in by signature: it knows which phone it is and
     * whether it is one of the owner's. So there is nothing new to
     * prove, no page to expose, no secret in a URL - the authority is
     * the same key that opened the door a moment ago.
     *
     * Only the phones written in the .env may do this. Somebody let in
     * by an invitation is a guest: they can talk to whoever they like,
     * and hand out nothing.
     */
    if (msg.type === 'invite' || msg.type === 'people' || msg.type === 'forget') {
      if (!ws.invites) {
        send(ws, { type: 'error', error: 'not-yours' });
        return;
      }
      if (msg.type === 'invite') {
        const name = String(msg.name || '').trim().slice(0, 32);
        if (!name) { send(ws, { type: 'error', error: 'no-name' }); return; }
        const made = addInvitation(name);
        console.log(`[duetto] ${ws.who} invites ${name}`);
        send(ws, { type: 'invited', name, code: made.code, days: made.days });
        // And the list right after, without being asked: the invitation
        // just made belongs in it, and one round trip is enough.
      }
      if (msg.type === 'forget') {
        const name = String(msg.name || '').trim();
        const gone = removePerson(name);
        console.log(`[duetto] ${ws.who} takes ${name} off the list (${gone})`);
      }
      const { devices: list, invitations, rooms: theirRooms } = read();
      send(ws, {
        type: 'people',
        people: list.map((d) => ({
          name: d.name,
          since: d.since,
          rooms: theirRooms.filter((r) => r.owner === d.name).length,
          brought: theirRooms.filter((r) => r.owner === d.name && r.guest).length,
        })),
        invitations: invitations
          .filter((i) => Date.parse(i.expires) > Date.now())
          .map((i) => ({ name: i.name, code: i.code, expires: i.expires })),
      });
      return;
    }

    if (msg.type === 'bye') {
      ws.saidBye = true;
      leaveRoom(ws);
      return;
    }
  });

  ws.on('close', () => leaveRoom(ws));
  ws.on('error', () => leaveRoom(ws));
});

/** How often this phone is to be asked. */
function heartbeatInterval(ws) {
  // Whoever has not joined yet is taking up a place without saying who
  // they are: they get checked quickly, like whoever is in the channel.
  if (!ws.joined || ws.mode === 'active') return HEARTBEAT_ACTIVE_MS;
  return HEARTBEAT_LISTENING_MS;
}

/**
 * Asks this phone at once, outside the normal round.
 *
 * It is used at the moments when the other's presence is about to be
 * taken as good - somebody knocks, comes in, or looks into the channel -
 * because with the slow heartbeat a dead connection could stay on its
 * feet for minutes, and the other would see present somebody who is gone.
 *
 * It does not settle the request under way, which goes out regardless: it
 * makes sure that within seconds the truth comes out by itself, with the
 * `peer-left` that follows the closing.
 */
function checkPresence(ws) {
  if (!ws || ws.pingSentAt) return;   // already waiting for an answer
  ws.pingSentAt = Date.now();
  try { ws.ping(); } catch { /* noop */ }
}

// Ping/pong to close dead connections (phones that lose the network)
const heartbeat = setInterval(() => {
  const now = Date.now();
  for (const ws of wss.clients) {
    if (ws.pingSentAt) {
      // Asked and still silent: past the wait they are given up for dead.
      if (now - ws.pingSentAt > ANSWER_WAIT_MS) ws.terminate();
      continue;
    }
    if (now - (ws.lastSeen ?? 0) < heartbeatInterval(ws)) continue;
    checkPresence(ws);
  }
}, HEARTBEAT_TICK_MS);

wss.on('close', () => clearInterval(heartbeat));

httpServer.listen(PORT, HOST, () => {
  console.log(`[duetto] signalling listening on ws://${HOST}:${PORT}`);
  const onTheList = AUTHORISED_KEYS.size + listed().length;
  console.log(`[duetto] door: ${onTheList > 0
    ? `${onTheList} phone(s) allowed in, by signature`
    : SERVER_KEY
      ? 'a key is asked for'
      : 'open - anybody who knows the address can use this server'}`);
  console.log(`[duetto] TURN fallback: ${turnConfig() ? TURN_URL : 'not configured (different networks will not connect)'}`);
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    console.log(`\n[duetto] ${sig}, shutting down...`);
    for (const ws of wss.clients) ws.close(1001, 'server-shutdown');
    httpServer.close(() => process.exit(0));
  });
}
