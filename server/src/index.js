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
  addInvitation, adopt, isBroken, markBroken, noteGuest, noteRoom, mayOpen, read, refresh,
  remove as removePerson, removeInvitation, removeRoom, roomOf, useInvitation,
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
 * The STUN of the house.
 *
 * For years the phones fell back on a hardcoded public one (Google's) -
 * the single outside dependency in an otherwise self-hosted design, and
 * one nobody had chosen on purpose. There is no need for it: coturn
 * answers STUN on the relay's own port, so when the operator does not
 * name one it is derived from the relay's address, and the phones owe
 * nothing to anybody.
 */
const STUN_URL = process.env.STUN_URL || '';
function stunConfig() {
  if (STUN_URL) {
    return { urls: STUN_URL.split(',').map((u) => u.trim()).filter(Boolean) };
  }
  // Derived: turn:host:port -> stun:host:port, the plain entry only
  // (a `turns:` TLS address is a relay matter; STUN needs no secrets).
  const first = TURN_URL.split(',').map((u) => u.trim())
    .find((u) => u.startsWith('turn:'));
  if (!first) return null;
  const hostPort = first.slice('turn:'.length).split('?')[0];
  return { urls: [`stun:${hostPort}`] };
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
  // Whoever adopted the server hands out invitations like the phones
  // written in the .env: they are the owner, and the only difference
  // is that they never had to be at the server to say so.
  if (known) return { name: known.name, opens: true, invites: known.owner === true };

  if (msg.invite) {
    const name = useInvitation(msg.invite, pub, cleanModel(msg.model));
    if (name) {
      console.log(`[duetto] ${name} comes in with an invitation, `
        + `phone ${pub.slice(0, 12)}…`);
      // The owner's list has just changed: told, wherever they are.
      setTimeout(tellOwners, 0);
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
/**
 * And for everybody together: a limit per address is no limit for
 * whoever has many addresses. Well above what the phones of a small
 * server ever do in a minute, and well below what guessing needs.
 */
const JOIN_LIMIT_ALL = Number(process.env.JOIN_LIMIT_ALL || 600);
const JOIN_WINDOW_MS = 60_000;

/** @type {Map<string, number[]>} moments of the recent attempts per IP */
const joinAttempts = new Map();

function clientIp(req) {
  // Behind the reverse proxy the real address is in the header.
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length > 0) return fwd.split(',')[0].trim();
  return req.socket?.remoteAddress || 'unknown';
}

/** @type {number[]} moments of the recent attempts, from everywhere */
let allAttempts = [];

/**
 * True if this address, or everybody together, has already used up
 * the attempts allowed.
 */
function tooManyJoins(ip) {
  const now = Date.now();
  const recent = (joinAttempts.get(ip) || []).filter((t) => now - t < JOIN_WINDOW_MS);
  recent.push(now);
  joinAttempts.set(ip, recent);
  allAttempts = allAttempts.filter((t) => now - t < JOIN_WINDOW_MS);
  allAttempts.push(now);
  return recent.length > JOIN_LIMIT || allAttempts.length > JOIN_LIMIT_ALL;
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

/**
 * Departures on the point of coming back.
 *
 * A drop is usually a change of network: the same phone is back within
 * a couple of seconds, on a fresh socket. Announcing the departure the
 * instant the old socket closes made everybody downstream flinch for
 * nothing - the waiting line flicked to "disconnected", the headless
 * notification rewrote itself, and a knock in that window was refused -
 * only for the return to cancel it all a breath later. So a `dropped`
 * departure is held for a few seconds first: if the same side is back
 * in the room when the wait runs out, nobody is told anything (their
 * rejoining already announced them); if not, the departure goes out as
 * before, a little later.
 *
 * A goodbye is not held: whoever said it has really gone.
 *
 * Keyed by room and side, because the side is the device: whatever
 * socket it comes back on, it is the same phone returning.
 *
 * @type {Map<string, { timer: NodeJS.Timeout, peerId: string, knocks: string[] }>}
 */
const returning = new Map();
const GRACE_MS = ms(process.env.PEER_LEFT_GRACE_MS, 4000);

function holdDeparture(roomId, ws) {
  const key = `${roomId}\n${ws.side}`;
  const held = returning.get(key);
  if (held) clearTimeout(held.timer);
  const timer = setTimeout(() => {
    returning.delete(key);
    // Looked up now, not captured then: the room may have been emptied
    // and remade in the meantime, and whoever is in it NOW is the one
    // owed the news.
    const set = rooms.get(roomId);
    if (!set) return;
    for (const peer of set) {
      send(peer, { type: 'peer-left', peerId: ws.peerId, reason: 'dropped' });
    }
  }, GRACE_MS);
  timer.unref?.();
  returning.set(key, { timer, peerId: ws.peerId, knocks: held?.knocks ?? [] });
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
    // within seconds - so their departure is held a moment (see
    // `returning`), and only announced if they really stay away.
    if (!ws.saidBye && ws.side) {
      holdDeparture(roomId, ws);
    } else {
      const reason = ws.saidBye ? 'bye' : 'dropped';
      for (const peer of set) send(peer, { type: 'peer-left', peerId: ws.peerId, reason });
    }
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

/**
 * The name the phone gave, or nothing.
 *
 * `cleanName` fills an empty name with "Someone", which is right for
 * the notifications and wrong for the list: a phone with no name set
 * was written down as "Someone" for good. Here an empty name stays
 * empty, and the list keeps what it had.
 */
function saidName(raw) {
  const s = cleanName(raw);
  return s === 'Someone' ? '' : s;
}

/** The make and model the phone says it is, for telling two apart. */
function cleanModel(raw) {
  const s = typeof raw === 'string' ? raw.trim() : '';
  return s.replace(/[\r\n]/g, ' ').slice(0, 40);
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
    // It also forgives a pending ping: a phone busy talking may well
    // answer the pong late, and terminating a connection that is
    // actively speaking would be the one way to get this exactly wrong.
    ws.lastSeen = Date.now();
    ws.pingSentAt = null;
    if (isBinary) return;
    let msg;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      send(ws, { type: 'error', error: 'invalid-json' });
      return;
    }

    // --- 0) The door, before coming in ------------------------------------
    // A phone may show its card and ask what this server is to it,
    // without joining any room: it is how the first screen learns what
    // to ask for. And having shown it, an owner's phone may do the
    // owner's business - invite, look at the list - with no room to
    // join yet, which is exactly the case of a server just taken.
    if (!ws.joined && msg.type === 'door') {
      answerDoor(ws, msg);
      return;
    }
    if (!ws.joined && ws.atDoor && isOwnersBusiness(msg.type)) {
      ownersBusiness(ws, msg);
      return;
    }
    // And the two things anybody known may say, from the door or from
    // a room: "this pair is broken", and "I am leaving this server".
    if (msg.type === 'broken' && (ws.joined || ws.atDoor)) {
      pairBroken(ws, msg);
      return;
    }
    if (msg.type === 'leave' && (ws.joined || ws.atDoor)) {
      leaveServer(ws);
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
      // The room is looked up but not yet written down: a join that is
      // turned away at the door must leave no trace, or refused attempts
      // with made-up room names would pile up in the map forever.
      const set = rooms.get(roomId) ?? new Set();

      /**
       * The door, before anything else is said - the relay's
       * credentials included, which otherwise travel in the very first
       * message to whoever knocks.
       *
       * With a list of phones, the door is a signature; failing that, a
       * word; failing that too, it is open. The attempt has just been
       * counted, so trying keys costs JOIN_LIMIT a minute, like trying
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

      /**
       * The first phone adopts the server; the key of the server brings
       * one back.
       *
       * Setting a server up ended at a command line: the first phone's
       * card had to be copied into the `.env` by hand, and until then
       * the door stood open to anybody at all. Now a knock at a server
       * with nobody on its list writes that phone down as its owner,
       * and the door shuts behind it.
       *
       * The key of the server, when the operator has set one, does two
       * things at once: it closes that first window - only whoever
       * knows it can be adopted - and it is the way home for a phone
       * that has lost its card, which is what a reinstall does. Without
       * it the owner is locked out of their own house with no way in
       * but ssh, which is exactly the command line this is here to
       * remove. The name is provisional: the phone says what it is
       * called at the first hello.
       */
      const adopted = !known && signed(String(msg.pub || ''), msg.sig, ws.nonce)
        && keyIsRight(msg.key)
        && (!doorIsShut() || (SERVER_KEY && String(msg.key || '') !== ''))
        ? adopt(saidName(msg.name) || 'the first phone', String(msg.pub), true,
          cleanModel(msg.model))
        : null;
      if (adopted) {
        console.log(`[duetto] ${adopted} takes the server: `
          + `phone ${String(msg.pub).slice(0, 12)}…`);
      }

      if (doorIsShut() && !adopted) {
        const who = known;
        if (!who) {
          console.log(`[duetto] turned away: ${String(msg.pub || 'no key').slice(0, 12)}`
            + ` from ${ws.ip}`);
          // The same "no" as always, with the reason beside it: an
          // invitation that did not work is not a missing invitation,
          // and the app can only say so if it is told.
          send(ws, { type: 'error', error: 'not-allowed', reason: refusalReason(msg) });
          ws.close(4006, 'not-allowed');
          return;
        }
        // What the phone says of itself now, kept on the list. A guest
        // is known by their card alone: it is kept too, so that a pair
        // broken from the other side can find them.
        ws.pub = String(msg.pub || '');
        ws.who = refresh(ws.pub, saidName(msg.name), cleanModel(msg.model)) || who.name;
        ws.opens = who.opens === true;
        ws.invites = who.invites === true;
        // The room belongs to whoever may open one: it is written down
        // now, so that the other half can be let in beside them. But
        // not somebody else's room: see mayOpen.
        if (ws.opens) {
          if (!mayOpen(roomId, ws.who, ws.pub, set)) {
            console.log(`[duetto] ${ws.who} turned away from a room that is not theirs`);
            send(ws, { type: 'error', error: 'not-allowed', reason: 'taken-room' });
            ws.close(4006, 'not-allowed');
            return;
          }
          noteRoom(roomId, ws.who, ws.pub);
        }
      } else if (adopted) {
        ws.pub = String(msg.pub || '');
        ws.who = adopted;
        ws.opens = true;
        ws.invites = true;
        noteRoom(roomId, adopted, ws.pub);
      } else if (!keyIsRight(msg.key)) {
        send(ws, { type: 'error', error: 'not-allowed', reason: 'bad-key' });
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
      // Only now, past the door, does the room really exist.
      rooms.set(roomId, set);
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
        // The other side broke this pair while this phone was away:
        // said now, or it would go on waiting for somebody who is not
        // coming.
        broken: isBroken(roomId),
        // Whether this phone may invite: it is one of those written in
        // the .env. The app shows or hides a whole section on it.
        owner: ws.invites === true,
        // And whether it may open connections of its own. A phone let
        // in beside somebody else may not: telling it lets the app take
        // away a button that would only lead to a closed door.
        opens: ws.opens !== false,
        turn: turnConfig(),
        stun: stunConfig(),
        polite: others.length === 0,
        peerPresent: !!other,
        peerActive: other ? other.mode === 'active' : false,
        peerName: other ? other.name : '',
      });

      // If this side dropped moments ago, its departure is still being
      // held (see `returning`): they are back, the announcement dies
      // unsaid, and a knock that found nobody in the meantime - a cell
      // change at the wrong instant - is delivered now instead of
      // simply never having happened.
      if (side) {
        const back = returning.get(`${roomId}\n${side}`);
        if (back) {
          clearTimeout(back.timer);
          returning.delete(`${roomId}\n${side}`);
          for (const name of back.knocks) {
            send(ws, { type: 'notify', reason: 'knock', name });
          }
        }
      }

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
        // Honest with whoever knocked: right now there is nobody. But
        // if the other side dropped a breath ago and is being waited
        // for (see `returning`), the knock is left on their doormat -
        // a cell change at the wrong instant used to make it simply
        // never have happened. Only the last one: two knocks in four
        // seconds mean the same thing.
        const otherSide = ws.side === 'A' ? 'B' : ws.side === 'B' ? 'A' : null;
        if (otherSide) {
          const away = returning.get(`${ws.roomId}\n${otherSide}`);
          if (away) away.knocks = [cleanName(ws.name)];
        }
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
    if (isOwnersBusiness(msg.type)) {
      ownersBusiness(ws, msg);
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

/**
 * One side has broken a pair: the other is told, now or later.
 *
 * Now, if they are in the room; later, at their next join, from the
 * list of broken rooms. Whoever says it must be somebody - a card the
 * server recognised, at the door or in a room - and anybody may say it
 * of any room: a guest breaks a pair as much as an owner does, and
 * saying it of a room one was never in does no harm.
 */
function pairBroken(ws, msg) {
  const room = typeof msg.room === 'string' ? msg.room.trim() : '';
  if (!room || room.length > 128) return;
  markBroken(room);
  const told = tellPairBroken(room, ws);
  console.log(`[duetto] ${ws.who || ws.name} breaks a pair (${told} told now)`);
}

/** Tells the parties of a room, other than `ws`, that its pair is broken. */
function tellPairBroken(room, ws) {
  // Told now: whoever is in that room, and - since the server knows
  // who the two parties of a noted room are - the other party wherever
  // they are connected, in another room with somebody else included.
  const told = new Set();
  const here = rooms.get(room);
  if (here) for (const peer of here) if (peer !== ws) told.add(peer);
  const noted = roomOf(room);
  if (noted) {
    for (const peer of wss.clients) {
      if (peer === ws || !peer.joined) continue;
      const isOwner = peer.who && peer.who === noted.owner && peer.opens;
      const isPartner = peer.who && noted.partner && peer.who === noted.partner && peer.opens;
      const isGuest = peer.pub && peer.pub === noted.guest;
      if (isOwner || isPartner || isGuest) told.add(peer);
    }
  }
  for (const peer of told) send(peer, { type: 'pair-broken', room });
  return told.size;
}

/**
 * Leaving the server, from the app: the member's own decision.
 *
 * Being taken off the list was the owner's alone; being in a pair one
 * can break oneself, and this is the same courtesy. The owner cannot:
 * leaving the house would leave it to nobody. Their rooms go, and the
 * guests in them are told at their next knock.
 */
function leaveServer(ws) {
  if (!ws.who) { send(ws, { type: 'error', error: 'not-yours' }); return; }
  if (ws.invites) { send(ws, { type: 'error', error: 'not-for-owner' }); return; }
  // Their rooms, before they go: whoever was in a pair with them is
  // told that it is broken, wherever they are.
  const theirs = read().rooms.filter((r) => r.owner === ws.who || r.partner === ws.who);
  const gone = removePerson(ws.who);
  console.log(`[duetto] ${ws.who} leaves the server (${gone})`);
  send(ws, { type: 'left' });
  for (const r of theirs) tellPairBroken(r.room, ws);
  // And the owner is told in words, not only by a shorter list.
  for (const peer of wss.clients) {
    if (peer !== ws && peer.invites && (peer.joined || peer.atDoor)) {
      send(peer, { type: 'member-left', name: ws.who });
    }
  }
  tellOwners();
}

function isOwnersBusiness(type) {
  return type === 'invite' || type === 'people' || type === 'forget';
}

/**
 * Inviting somebody, seeing who is in, taking somebody off: the
 * owner's business, from the app.
 *
 * The one asking has already shown a card this server recognised - at
 * the door, or on joining - and the server knows whether it is one of
 * the owner's. So there is nothing new to prove, no page to expose, no
 * secret in a URL: the authority is the same key that opened the door
 * a moment ago. Somebody let in by an invitation is a guest: they can
 * talk to whoever they like, and hand out nothing.
 */
function ownersBusiness(ws, msg) {
  // Forgetting a room of one's own is anybody's who may open one; the
  // rest is the owner's.
  if (msg.type === 'forget' && msg.room) {
    if (!ws.opens) { send(ws, { type: 'error', error: 'not-yours' }); return; }
    const gone = removeRoom(String(msg.room), ws.who);
    console.log(`[duetto] ${ws.who} forgets a room of theirs (${gone})`);
    if (!ws.invites) return;
  } else if (!ws.invites) {
    send(ws, { type: 'error', error: 'not-yours' });
    return;
  }
  if (msg.type === 'invite') {
    const name = String(msg.name || '').trim().slice(0, 32);
    if (!name) { send(ws, { type: 'error', error: 'no-name' }); return; }
    const made = addInvitation(name);
    if (!made) {
      send(ws, { type: 'error', error: 'name-taken' });
      return;
    }
    console.log(`[duetto] ${ws.who} invites ${name}`);
    send(ws, { type: 'invited', name, code: made.code, days: made.days });
    // And the list right after, without being asked: the invitation
    // just made belongs in it, and one round trip is enough.
  }
  if (msg.type === 'forget') {
    if (msg.room) {
      // done above
    } else if (msg.code) {
      // An unused invitation, taken back.
      const gone = removeInvitation(msg.code);
      console.log(`[duetto] ${ws.who} takes back an invitation (${gone})`);
    } else {
      const name = String(msg.name || '').trim();
      // Their card first: whoever is connected with it is told, and
      // let go, so the phone learns at once and not at its next try.
      const pubs = read().devices.filter((d) => d.name === name).map((d) => d.pub);
      const gone = removePerson(name);
      console.log(`[duetto] ${ws.who} takes ${name} off the list (${gone})`);
      for (const peer of wss.clients) {
        if (peer !== ws && peer.pub && pubs.includes(peer.pub)) {
          send(peer, { type: 'removed' });
          try { peer.close(4006, 'removed'); } catch { /* noop */ }
        }
      }
    }
  }
  tellOwners();
}

/** The list as this socket is to see it: which row is "you" depends on who asks. */
function peopleMessage(ws) {
  const { devices: list, invitations, rooms: theirRooms } = read();
  return {
    type: 'people',
    people: list.map((d) => ({
      name: d.name,
      since: d.since,
      // Who they are on this server, on what phone, and whether it is
      // the one asking: "you, the owner, on the POCO" reads better than
      // a name one may not even have set.
      owner: d.owner === true,
      model: d.model || '',
      you: !!ws.pub && d.pub === ws.pub,
      rooms: theirRooms.filter((r) => r.owner === d.name).length,
      brought: theirRooms.filter((r) => r.owner === d.name && r.guest).length,
      // The rooms themselves, by name: the phone asking knows its own
      // by the names it gave them, and can say "the pair with Anna"
      // where a count says "1".
      theirs: theirRooms.filter((r) => r.owner === d.name)
        .map((r) => ({ room: r.room, guest: !!r.guest })),
    })),
    invitations: invitations
      .filter((i) => Date.parse(i.expires) > Date.now())
      .map((i) => ({ name: i.name, code: i.code, expires: i.expires })),
  };
}

/**
 * The list, to every phone of the owner's that is connected.
 *
 * It used to be answered only when asked - on opening the screen - and
 * then stood still: an invitation accepted, a member gone, showed only
 * on leaving the screen and coming back. Now every change sends it,
 * to whoever may see it, wherever they are.
 */
function tellOwners() {
  for (const peer of wss.clients) {
    if (peer.invites && (peer.joined || peer.atDoor)) send(peer, peopleMessage(peer));
  }
}

/**
 * Why a knock was turned away, for whoever is holding the phone.
 *
 * Three different "no"s used to be the same word, and the app could
 * only say "the key does not fit" - to somebody who had written an
 * invitation, or nothing at all.
 */
function refusalReason(msg) {
  if (msg.invite) return 'bad-invite';
  if (SERVER_KEY && String(msg.key || '') !== '') return 'bad-key';
  return 'stranger';
}

/**
 * What this server is to the phone at the door.
 *
 * The phone shows its card, signed, and says what it has - the key of
 * the server, an invitation - and is told one word: `owner`, `member`,
 * `guest` or `stranger`, with whether the house has an owner and
 * whether it asks for a key. From that word alone the first screen
 * knows what to ask for and what not to: nothing on a free server, the
 * key where one is wanted, and for a stranger at an owned house the two
 * ways in.
 *
 * It is not only a question. A free house is taken here, by the first
 * card shown - with the key, if the operator set one - and an
 * invitation carried here is spent here. A phone that comes home with
 * the key after a reinstall is written down again as the owner. What
 * the join does on its own remains, for apps that never knock first.
 */
function answerDoor(ws, msg) {
  const pub = String(msg.pub || '');
  const hasOwner = doorIsShut();
  const needsKey = !!SERVER_KEY;
  const reply = (rest) => send(ws, { type: 'door', hasOwner, needsKey, ...rest });

  if (!pub || !signed(pub, msg.sig, ws.nonce)) {
    reply({ role: 'stranger', error: 'bad-signature' });
    return;
  }
  // Knocking counts like joining: keys and invitations are not to be
  // guessed at the door any more than in the room.
  if (tooManyJoins(ws.ip)) {
    send(ws, { type: 'error', error: 'too-many-attempts' });
    ws.close(4004, 'too-many-attempts');
    return;
  }

  const known = whoIsThere(msg, ws.nonce);
  if (known) {
    ws.pub = pub;
    ws.who = refresh(pub, saidName(msg.name), cleanModel(msg.model)) || known.name;
    ws.opens = known.opens === true;
    ws.invites = known.invites === true;
    ws.atDoor = true;
    reply({ role: ws.invites ? 'owner' : 'member', name: ws.who });
    return;
  }
  // An invitation that whoIsThere did not spend is no invitation.
  if (msg.invite) {
    reply({ role: 'stranger', error: 'bad-invite' });
    return;
  }
  const keySaid = String(msg.key || '') !== '';
  if (needsKey && keySaid && !keyIsRight(msg.key)) {
    reply({ role: 'stranger', error: 'bad-key' });
    return;
  }
  // The house is taken by the first card - with the key, if one is
  // wanted - and the key brings the owner home to a house already
  // taken.
  const mayAdopt = hasOwner ? (needsKey && keySaid) : (!needsKey || keySaid);
  if (mayAdopt) {
    const name = adopt(saidName(msg.name) || 'the first phone', pub, true,
      cleanModel(msg.model));
    if (name) {
      console.log(`[duetto] ${name} takes the server at the door: `
        + `phone ${pub.slice(0, 12)}…`);
      setTimeout(tellOwners, 0);
      ws.pub = pub;
      ws.who = name;
      ws.opens = true;
      ws.invites = true;
      ws.atDoor = true;
      reply({ role: 'owner', name, adopted: true });
      return;
    }
  }
  // Somebody's guest is known in their room alone, and only there.
  const rooms = read().rooms.filter((r) => r.guest === pub).length;
  reply({ role: rooms > 0 ? 'guest' : 'stranger' });
}

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
    // A client that never finishes its close handshake would keep the
    // server hanging here until systemd loses patience and pulls the
    // plug; we leave on our own feet instead.
    setTimeout(() => process.exit(0), 3000).unref();
  });
}

// A throw anywhere in the message path would otherwise take down every
// pair at once, in an unknown state. Better to say what happened and
// leave: systemd puts us back up in seconds, and the phones rejoin by
// themselves - a clean restart beats limping on with corrupt state.
process.on('uncaughtException', (err) => {
  console.error('[duetto] uncaught exception:', err?.stack || err);
  process.exit(1);
});
process.on('unhandledRejection', (err) => {
  console.error('[duetto] unhandled rejection:', err?.stack || err);
  process.exit(1);
});
