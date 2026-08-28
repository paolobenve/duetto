/*
 * Duetto - a permanent voice and video channel for two people.
 * Copyright (C) 2026 Paolo Benvenuto
 *
 * Free software under the GNU General Public License, version 3 or any
 * later version, and with no warranty of any kind. The full text is in
 * the LICENSE file at the root of the project, and at
 * <https://www.gnu.org/licenses/>.
 */
// Smoke test of the signalling server.
// It checks presence, the listening/active states, the notifications, the
// forwarding of encrypted envelopes, the pairing exchange, "alert" and
// the limit of two.
import { spawn } from 'node:child_process';
import { WebSocket } from 'ws';
import { generateKeyPairSync, sign } from 'node:crypto';
import { tmpdir } from 'node:os';
import { unlinkSync } from 'node:fs';

const PORT = 8799;
/** The second server, the one with a list of phones. */
const PORT2 = 8798;
/** And the third, the one that hands out invitations. */
const PORT3 = 8797;
/** The list of phones lives in a file of its own, thrown away at the end. */
const LIST_FILE = `${tmpdir()}/duetto-devices-${process.pid}.json`;
// Before anything reads it: the module takes the name once, at import.
process.env.DEVICES_FILE = LIST_FILE;
const URL = `ws://127.0.0.1:${PORT}`;

// The real heartbeat is 30 seconds and 4 minutes: here everything is
// shrunk, otherwise checking it would mean sitting and watching for a
// quarter of an hour. The ratios between the times stay the same.
/** The key of the house: every join in this test carries it. */
const KEY = 'chiave-di-prova';

/**
 * Two phones with a key of their own: one written in the server's list,
 * one not. What the phones do with tweetnacl, here node does - it is
 * the same Ed25519, and the point of the test is the door, not the
 * arithmetic.
 */
const phone = () => {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const pub = publicKey.export({ format: 'der', type: 'spki' }).subarray(12);
  return {
    pub: pub.toString('base64'),
    signs: (nonce) =>
      sign(null, Buffer.from(nonce, 'base64'), privateKey).toString('base64'),
  };
};
const anna = phone();
const stranger = phone();

const HEARTBEAT_ACTIVE_MS = 400;
const HEARTBEAT_LISTENING_MS = 4000;
const ANSWER_WAIT_MS = 600;

const srv = spawn('node', ['src/index.js'], {
  env: {
    ...process.env, PORT: String(PORT), HOST: '127.0.0.1',
    // The relay is told to the phones by the server: here we check that
    // it really arrives in the joining message.
    TURN_URL: 'turn:example.org:3478', TURN_USER: 'duo', TURN_PASS: 'secret',
    SERVER_KEY: KEY,
    HEARTBEAT_ACTIVE_MS: String(HEARTBEAT_ACTIVE_MS),
    HEARTBEAT_LISTENING_MS: String(HEARTBEAT_LISTENING_MS),
    HEARTBEAT_TICK_MS: '50',
    ANSWER_WAIT_MS: String(ANSWER_WAIT_MS),
  },
  stdio: ['ignore', 'ignore', 'inherit'],
});

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** A client with a queue of messages, to wait for one specific type. */
function client(port = PORT) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`);
  const queue = [];
  const waiters = [];
  let nonce = null;
  ws.on('message', (d) => {
    const msg = JSON.parse(d.toString());
    if (msg.type === 'hello') { nonce = msg.nonce; return; }
    const i = waiters.findIndex((x) => x.type === msg.type);
    if (i !== -1) waiters.splice(i, 1)[0].resolve(msg);
    else queue.push(msg);
  });
  // The heartbeat is not a message: they are the protocol's ping frames,
  // which the library does not show among the messages. Here they are
  // counted.
  let pings = 0;
  ws.on('ping', () => { pings++; });
  return {
    // With a limit: a server that does not come up would otherwise
    // leave the whole test waiting for ever, saying nothing.
    open: () => new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('the server does not open')), 3000);
      ws.once('open', () => { clearTimeout(t); resolve(); });
    }),
    /** The number the server greeted us with, to be signed. */
    nonce: () => nonce,
    send: (o) => ws.send(JSON.stringify(o)),
    pings: () => pings,
    /** Stops reading: from here on it no longer answers the pings. */
    die: () => ws.pause(),
    closed: (ms) => new Promise((r) => {
      const t = setTimeout(() => r(false), ms);
      ws.once('close', () => { clearTimeout(t); r(true); });
    }),
    expect(type) {
      const i = queue.findIndex((m) => m.type === type);
      if (i !== -1) return Promise.resolve(queue.splice(i, 1)[0]);
      return new Promise((resolve, reject) => {
        waiters.push({ type, resolve });
        setTimeout(() => reject(new Error(`timeout on "${type}"`)), 3000);
      });
    },
    /** true if NO message of that type arrives within ms */
    async expectNone(type, ms = 400) {
      await wait(ms);
      return !queue.some((m) => m.type === type);
    },
    close: () => ws.close(),
  };
}

let failures = 0;
const check = (cond, name) => {
  console.log(`${cond ? 'OK  ' : 'FAIL'}  ${name}`);
  if (!cond) failures++;
};

try {
  await wait(500);

  // --- A connects, only listening ---------------------------------------
  const a = client();
  await a.open();
  a.send({ type: 'join', key: KEY, room: 'pair1', name: 'Anna', mode: 'listening', side: 'A' });
  const aJoined = await a.expect('joined');
  check(aJoined.polite === true, 'first connected: the polite role');
  check(aJoined.peerPresent === false, 'first connected: the other is not there');
  check(aJoined.turn?.urls?.[0] === 'turn:example.org:3478',
    'the server tells the relay: it is not configured on the phones');
  check(aJoined.turn?.credential === 'secret', 'with the credentials to use it');

  // --- B connects, listening as well -------------------------------------
  const b = client();
  await b.open();
  b.send({ type: 'join', key: KEY, room: 'pair1', name: 'Bruno', mode: 'listening', side: 'B' });
  const bJoined = await b.expect('joined');
  check(bJoined.polite === false, 'second connected: the impolite role (roles kept apart)');
  check(bJoined.peerPresent === true, 'second connected: sees the other');
  check(bJoined.peerActive === false, 'second connected: the other is only listening');

  const aPeer = await a.expect('peer-joined');
  check(aPeer.name === 'Bruno', 'A knows who has connected');

  // No notification if both are merely listening: it would be noise.
  check(await a.expectNone('notify'), 'two listening: no notification');

  // --- B comes into the channel ------------------------------------------
  b.send({ type: 'mode', mode: 'active' });
  const aNotify = await a.expect('notify');
  check(aNotify.reason === 'peer-active', 'A alerted that the other has come in');
  check(aNotify.name === 'Bruno', 'the notification carries the name');

  // --- A comes in too: now no notification to B --------------------------
  a.send({ type: 'mode', mode: 'active' });
  const bMode = await b.expect('peer-mode');
  check(bMode.mode === 'active', 'B sees that A has come in as well');
  check(await b.expectNone('notify'), 'whoever is already in the channel is not notified');

  // --- forwarding an encrypted envelope ----------------------------------
  const payload = 'OPAQUE_ENVELOPE_BASE64==';
  b.send({ type: 'signal', payload });
  const aSignal = await a.expect('signal');
  check(aSignal.payload === payload, 'signalling envelope forwarded whole');

  // --- forwarding the pairing --------------------------------------------
  b.send({ type: 'pair', payload: { kind: 'pubkey', pub: 'PUBLIC_KEY' } });
  const aPair = await a.expect('pair');
  check(aPair.payload?.pub === 'PUBLIC_KEY', 'pairing exchange forwarded');

  // --- alert --------------------------------------------------------------
  a.send({ type: 'knock' });
  const knock = await a.expect('knock-result');
  check(knock.ok === true, 'alert accepted');
  const bNotify = await b.expect('notify');
  check(bNotify.reason === 'knock' && bNotify.name === 'Anna', 'B receives the alert');

  // Insisting is legitimate: if the first alert gets no answer, the second
  // has to go through, and really reach the other.
  a.send({ type: 'knock' });
  const knock2 = await a.expect('knock-result');
  check(knock2.ok === true, 'a second alert right away: accepted');
  const bNotify2 = await b.expect('notify');
  check(bNotify2.reason === 'knock', 'the second alert reaches B too');

  // --- leaving ------------------------------------------------------------
  b.close();
  const left = await a.expect('peer-left');
  check(left.type === 'peer-left', 'A alerted of the disconnection');

  // --- alerting when the other is offline ---------------------------------
  await wait(100);
  const c0 = client();
  await c0.open();
  c0.send({ type: 'join', key: KEY, room: 'alone', name: 'Carla', mode: 'active' });
  await c0.expect('joined');
  c0.send({ type: 'knock' });
  const k3 = await c0.expect('knock-result');
  check(k3.ok === false && k3.error === 'peer-offline', 'alert to somebody absent: reported');


  // --- hooking up again after a dip in the network ------------------------
  // The phone loses the wifi: the server does not notice at once, the dead
  // connection stays in the room. Reconnecting, the phone has to take its
  // OWN place back, not find "pair full".
  await wait(100);
  const r1 = client();
  await r1.open();
  r1.send({ type: 'join', key: KEY, room: 'rehook', name: 'Anna', side: 'A' });
  await r1.expect('joined');
  const r2 = client();
  await r2.open();
  r2.send({ type: 'join', key: KEY, room: 'rehook', name: 'Bruno', side: 'B' });
  await r2.expect('joined');

  // Anna reappears without the old connection having been declared dead
  const r1bis = client();
  await r1bis.open();
  r1bis.send({ type: 'join', key: KEY, room: 'rehook', name: 'Anna', side: 'A' });
  const again = await r1bis.expect('joined');
  check(again.type === 'joined', 'hooking up again one takes one’s own place back');
  check(again.peerPresent === true, 'and finds the other still there');
  const kicked = await r1.expect('error');
  check(kicked.error === 'replaced', 'the old connection is dismissed');
  check(await r2.expectNone('peer-left'), 'to the other nobody has left');

  // A real third device stays out all the same
  const r3 = client();
  await r3.open();
  r3.send({ type: 'join', key: KEY, room: 'rehook', name: 'Cip', side: null });
  const r3res = await r3.expect('error');
  check(r3res.error === 'room-full', 'a real third device stays out');
  r1bis.close(); r2.close(); r3.close();

  // --- third device --------------------------------------------------------
  const d = client();
  await d.open();
  d.send({ type: 'join', key: KEY, room: 'pair1', name: 'X', mode: 'listening' });
  await d.expect('joined');
  const e = client();
  await e.open();
  e.send({ type: 'join', key: KEY, room: 'pair1', name: 'Y', mode: 'listening' });
  const eRes = await e.expect('error');
  check(eRes.error === 'room-full', 'the third device is turned away');

  // --- pairs that do not see each other ------------------------------------
  const f = client();
  await f.open();
  f.send({ type: 'join', key: KEY, room: 'pair2', name: 'Z', mode: 'listening' });
  const fRes = await f.expect('joined');
  check(fRes.peerPresent === false, 'another pair does not see the first');

  // --- heartbeat: close together only where it is needed -------------------
  // The periodic tap costs the phone, not the server: every packet wakes
  // its radio. It has to be rare while one is merely listening, close
  // together in the channel, and immediate when the other's presence is
  // about to be taken as good.
  const h1 = client();
  await h1.open();
  h1.send({ type: 'join', key: KEY, room: 'heartbeat', name: 'H1', side: 'A', mode: 'listening' });
  await h1.expect('joined');

  const listeningBefore = h1.pings();
  await wait(HEARTBEAT_ACTIVE_MS * 3);
  check(h1.pings() === listeningBefore, 'listening, no taps arrive');

  h1.send({ type: 'mode', mode: 'active' });
  await wait(HEARTBEAT_ACTIVE_MS * 3);
  check(h1.pings() >= 2, 'in the channel the heartbeat gets closer together');

  const h2 = client();
  await h2.open();
  h2.send({ type: 'join', key: KEY, room: 'heartbeat', name: 'H2', side: 'B', mode: 'listening' });
  const h2Joined = await h2.expect('joined');
  // On this field depends whether whoever arrives hooks up to the other at
  // once: get it wrong and both would be left in front of a waiting screen.
  check(h2Joined.peerActive === true, 'whoever arrives knows the other is already in the channel');
  await h1.expect('peer-joined');
  await wait(100);

  const knockBefore = h2.pings();
  h1.send({ type: 'knock' });
  await h1.expect('knock-result');
  await wait(150);
  check(h2.pings() > knockBefore, 'knocking, the other is asked at once');

  // And if they no longer answer, their departure reaches whoever knocked
  // instead of leaving them with an "alerted" addressed to nobody.
  h2.die();
  h1.send({ type: 'knock' });
  const dismissed = await h1.expect('peer-left').then((m) => m, () => null);
  check(!!dismissed, 'whoever stops answering is dismissed, and the other knows');
  // The reason tells a drop from a departure: whoever drops will most
  // likely be back, and the other had better keep their place a while
  // longer.
  check(dismissed?.reason === 'dropped', 'a dead connection is announced as a drop');

  h1.close(); h2.close();

  // --- "still there?": the other's state on request -------------------------
  // Whoever waits looks at a line saying "waiting" or "cannot be reached".
  // The announcements tell the changes, but the drop of somebody who is
  // merely listening is found out by the server at its leisure: with no
  // way of asking, that line would go on saying something no longer true.
  const p1 = client();
  await p1.open();
  p1.send({ type: 'join', key: KEY, room: 'ask', name: 'P1', side: 'A', mode: 'active' });
  await p1.expect('joined');

  p1.send({ type: 'presence' });
  const alone = await p1.expect('presence');
  check(alone.peerPresent === false, 'on one’s own: the other is absent');

  const p2 = client();
  await p2.open();
  p2.send({ type: 'join', key: KEY, room: 'ask', name: 'P2', side: 'B', mode: 'listening' });
  await p2.expect('joined');
  await p1.expect('peer-joined');

  p1.send({ type: 'presence' });
  const listening = await p1.expect('presence');
  check(listening.peerPresent === true && listening.peerActive === false,
    'the other listening: present but not in the channel');
  check(listening.peerName === 'P2', 'the answer also says what they are called');

  p2.send({ type: 'mode', mode: 'active' });
  await p1.expect('peer-mode');
  p1.send({ type: 'presence' });
  const inChannel = await p1.expect('presence');
  check(inChannel.peerActive === true, 'the other in the channel: the answer says so');

  // Asking also makes that presence be checked. It is watched with the
  // other LISTENING, where the ordinary heartbeat is slow: that way a tap
  // arriving at once can only be the one asked for from here, and not the
  // ordinary round that would have gone by anyway.
  p2.send({ type: 'mode', mode: 'listening' });
  await p1.expect('peer-mode');
  await wait(100);
  const beforeAsking = p2.pings();
  p1.send({ type: 'presence' });
  await p1.expect('presence');
  await wait(150);
  check(p2.pings() > beforeAsking, 'asking questions the other');

  // And if that presence is a ghost, the dismissal comes within seconds
  // instead of at the next round of the slow heartbeat.
  p2.die();
  p1.send({ type: 'presence' });
  await p1.expect('presence');
  const ghost = await p1.expect('peer-left').then((m) => m, () => null);
  check(!!ghost, 'a dead presence is unmasked by the question');

  p1.close(); p2.close();

  // Whoever has not gone into any room has nobody to ask about: they are
  // reminded to introduce themselves, instead of being answered "not
  // there", which would be true by accident.
  const p3 = client();
  await p3.open();
  p3.send({ type: 'presence' });
  const withoutRoom = await p3.expect('error');
  check(withoutRoom.error === 'expected-join', 'with no room one is asked to join first');
  p3.close();

  // --- the key of the house --------------------------------------------------
  // Whoever does not have it is turned away at the door, before being
  // told anything: the relay's credentials travel in the very first
  // message, and they are not for strangers.
  const k1 = client();
  await k1.open();
  k1.send({ type: 'join', room: 'pair1', name: 'X', side: 'A' });
  const noKey = await k1.expect('error');
  check(noKey.error === 'not-allowed', 'with no key one does not get in');
  check(await k1.closed(1000), 'and the door is closed');

  const k2 = client();
  await k2.open();
  k2.send({ type: 'join', room: 'pair1', key: 'sbagliata', name: 'X', side: 'A' });
  const badKey = await k2.expect('error');
  check(badKey.error === 'not-allowed', 'with the wrong key, the same');

  const kOk = client();
  await kOk.open();
  kOk.send({ type: 'join', room: 'chiave', key: KEY, name: 'X', side: 'A' });
  const good = await kOk.expect('joined');
  check(good.type === 'joined', 'with the right key one gets in');
  check(!!good.turn, 'and only then are the relay credentials handed over');
  kOk.close();

  // --- a wanted departure ---------------------------------------------------
  const v1 = client();
  await v1.open();
  v1.send({ type: 'join', key: KEY, room: 'goodbyes', name: 'V1', side: 'A', mode: 'listening' });
  await v1.expect('joined');
  const v2 = client();
  await v2.open();
  v2.send({ type: 'join', key: KEY, room: 'goodbyes', name: 'V2', side: 'B', mode: 'listening' });
  await v2.expect('joined');
  await v1.expect('peer-joined');

  v2.send({ type: 'bye' });
  const saidBye = await v1.expect('peer-left');
  check(saidBye.reason === 'bye', 'whoever says goodbye is announced as gone, not as dropped');

  v1.close(); v2.close();

  // --- a phone with a key of its own ------------------------------------------
  // The server is restarted with a list of allowed phones: from that
  // moment the door is a signature, and the word of the house counts
  // for nothing.
  srv.kill('SIGTERM');
  await wait(300);
  const srv2 = spawn('node', ['src/index.js'], {
    env: {
      ...process.env, PORT: String(PORT2), HOST: '127.0.0.1',
      AUTHORISED_KEYS: `anna:${anna.pub}`,
      HEARTBEAT_TICK_MS: '50',
    },
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  await wait(600);

  const s1 = client(PORT2);
  await s1.open();
  await wait(150);
  check(!!s1.nonce(), 'the server says a number to sign, as soon as one connects');
  s1.send({ type: 'join', room: 'firme', name: 'Anna', side: 'A',
    pub: anna.pub, sig: anna.signs(s1.nonce()) });
  const signedIn = await s1.expect('joined');
  check(signedIn.type === 'joined', 'the phone on the list signs and gets in');

  const s2 = client(PORT2);
  await s2.open();
  await wait(150);
  s2.send({ type: 'join', room: 'firme', name: 'X', side: 'B',
    pub: stranger.pub, sig: stranger.signs(s2.nonce()) });
  const notOnList = await s2.expect('error');
  check(notOnList.error === 'not-allowed', 'a phone that is not on the list does not');

  const s3 = client(PORT2);
  await s3.open();
  await wait(150);
  // Anna's key, and a signature made for another connection: the number
  // is picked afresh every time, so a stolen signature is worth nothing.
  s3.send({ type: 'join', room: 'firme', name: 'X', side: 'B',
    pub: anna.pub, sig: anna.signs(s1.nonce()) });
  const replayed = await s3.expect('error');
  check(replayed.error === 'not-allowed', 'and neither does a signature made for another');

  const s4 = client(PORT2);
  await s4.open();
  await wait(150);
  s4.send({ type: 'join', room: 'firme', key: KEY, name: 'X', side: 'B' });
  const wordOnly = await s4.expect('error');
  check(wordOnly.error === 'not-allowed', 'with the list up, the word of the house is not enough');

  s1.close(); s2.close(); s3.close(); s4.close();
  srv2.kill('SIGTERM');
  await wait(200);

  // --- an invitation ----------------------------------------------------------
  // A code made for one person, spent by the first phone that uses it:
  // from then on that phone is on the list like any other, and the code
  // is worth nothing to anybody else.
  const invited = phone();
  const late = phone();
  const srv3 = spawn('node', ['src/index.js'], {
    env: {
      ...process.env, PORT: String(PORT3), HOST: '127.0.0.1',
      AUTHORISED_KEYS: `anna:${anna.pub}`,
      DEVICES_FILE: LIST_FILE,
      HEARTBEAT_TICK_MS: '50',
    },
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  await wait(600);

  const { addInvitation } = await import('./src/devices.js');
  const { code } = addInvitation('bruno');

  const i1 = client(PORT3);
  await i1.open();
  await wait(150);
  i1.send({ type: 'join', room: 'inviti', name: 'Bruno', side: 'A',
    pub: invited.pub, sig: invited.signs(i1.nonce()), invite: code });
  const enrolled = await i1.expect('joined');
  check(enrolled.type === 'joined', 'an invitation lets a phone in');
  i1.close();

  // The same phone, with no invitation: it is on the list now.
  const i2 = client(PORT3);
  await i2.open();
  await wait(150);
  i2.send({ type: 'join', room: 'inviti', name: 'Bruno', side: 'A',
    pub: invited.pub, sig: invited.signs(i2.nonce()) });
  const remembered = await i2.expect('joined');
  check(remembered.type === 'joined', 'and from then on it needs none');
  i2.close();

  // Somebody else with the same code: it was spent.
  const i3 = client(PORT3);
  await i3.open();
  await wait(150);
  i3.send({ type: 'join', room: 'inviti', name: 'X', side: 'B',
    pub: late.pub, sig: late.signs(i3.nonce()), invite: code });
  const spent = await i3.expect('error');
  check(spent.error === 'not-allowed', 'a code passed on is worth nothing: it is spent');
  i3.close();

  // Taken off the list, and out at the next knock without a restart.
  const { remove } = await import('./src/devices.js');
  remove('bruno');
  const i4 = client(PORT3);
  await i4.open();
  await wait(150);
  i4.send({ type: 'join', room: 'inviti', name: 'Bruno', side: 'A',
    pub: invited.pub, sig: invited.signs(i4.nonce()) });
  const revoked = await i4.expect('error');
  check(revoked.error === 'not-allowed', 'taken off the list, it is out at once');
  i4.close();

  srv3.kill('SIGTERM');
  await wait(200);
  try { unlinkSync(LIST_FILE); } catch { /* it was never written */ }

  a.close(); c0.close(); d.close(); e.close(); f.close();
} catch (err) {
  console.error('Error in the test:', err.message);
  failures++;
} finally {
  srv.kill('SIGTERM');
  await wait(200);
  console.log(failures === 0 ? '\nALL OK' : `\n${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
}
