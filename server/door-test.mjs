// The door: what a server is to the phone that knocks.
//
// A free house taken by the first card, the key that lets one take it
// and brings the owner home, invitations made at the door and spent
// once, the guest known in one room, and the strangers turned away with
// a reason. Run from this directory: `npm run test:door`.
import { spawn } from 'node:child_process';
import { WebSocket } from 'ws';
import { generateKeyPairSync, sign } from 'node:crypto';
import { tmpdir } from 'node:os';
import { unlinkSync } from 'node:fs';

const PORT = 8791;
const PORT_K = 8792;
const PORT_B = 8793;
/** Two servers with names: the signature bound to them, and the bare number refused. */
const PORT_H = 8794;
const PORT_O = 8790;
/** One owner: the house taken with the key and the claim. */
const PORT_C = 8789;
const FILE = `${tmpdir()}/duetto-door-${process.pid}.json`;
const FILE_K = `${tmpdir()}/duetto-door-k-${process.pid}.json`;
const FILE_B = `${tmpdir()}/duetto-door-b-${process.pid}.json`;
const FILE_H = `${tmpdir()}/duetto-door-h-${process.pid}.json`;
const FILE_O = `${tmpdir()}/duetto-door-o-${process.pid}.json`;
const FILE_C = `${tmpdir()}/duetto-door-c-${process.pid}.json`;

function phone() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const pub = publicKey.export({ format: 'der', type: 'spki' }).subarray(12);
  return {
    pub: pub.toString('base64'),
    signs: (nonce) => sign(null, Buffer.from(nonce, 'base64'), privateKey).toString('base64'),
    /** the new way: the server's name inside, as the phone dialed it */
    signs2: (nonce, host) => sign(null, Buffer.from(`duetto-door-v2|${host}|${nonce}`, 'utf8'), privateKey)
      .toString('base64'),
  };
}
/** The card and its signature, the bare number or - with a name - the new way. */
const cardFor = (ph, nonce, host) => (host
  ? { pub: ph.pub, sig: ph.signs2(nonce, host), sigv: 2, host }
  : { pub: ph.pub, sig: ph.signs(nonce) });
const start = (port, file, extra = {}) => spawn('node', ['src/index.js'], {
  env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', DEVICES_FILE: file, AUTHORISED_KEYS: '', SERVER_KEY: '', ...extra },
  stdio: ['ignore', 'pipe', 'inherit'],
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Knocks at the door and hands back the answer, keeping the socket.
 * `headers`: what a proxy in front would add, X-Forwarded-For.
 */
function knock(port, ph, extra = {}, headers = {}) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`, { headers });
    const got = [];
    let hello = null;
    ws.on('message', (d) => {
      const m = JSON.parse(d.toString());
      if (m.type === 'hello') {
        hello = m;
        const { v2, ...rest } = extra;
        ws.send(JSON.stringify({ type: 'door', ...cardFor(ph, m.nonce, v2), name: 'tester', ...rest }));
        return;
      }
      got.push(m);
      if (m.type === 'door' || m.type === 'error') resolve({ ws, answer: m, got, hello });
    });
    ws.on('error', reject);
  });
}
/** Joins a room, and hands back `joined` or the error, keeping the socket. */
function join(port, ph, room, name, headers = {}, v2 = '') {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`, { headers });
    ws.on('message', (d) => {
      const m = JSON.parse(d.toString());
      if (m.type === 'hello') {
        ws.send(JSON.stringify({ type: 'join', room, ...cardFor(ph, m.nonce, v2), name, mode: 'listening' }));
        return;
      }
      if (m.type === 'joined' || m.type === 'error') resolve({ ws, answer: m });
    });
    ws.on('error', reject);
  });
}
/** Says something and waits for the answer of that type: other words may come first. */
function askFor(ws, obj, type, ms = 3000) {
  return new Promise((resolve) => {
    const on = (d) => {
      const m = JSON.parse(d.toString());
      if (m.type === type) { ws.off('message', on); clearTimeout(t); resolve(m); }
    };
    // No answer is an answer too: a test that hangs says nothing.
    const t = setTimeout(() => { ws.off('message', on); resolve({}); }, ms);
    ws.on('message', on);
    ws.send(JSON.stringify(obj));
  });
}
/** A join with more said, and everything heard before the answer. */
function joinWith(port, ph, room, extra = {}) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    const got = [];
    ws.on('message', (d) => {
      const m = JSON.parse(d.toString());
      if (m.type === 'hello') {
        ws.send(JSON.stringify({ type: 'join', room, ...cardFor(ph, m.nonce), name: 'tester', mode: 'listening', ...extra }));
        return;
      }
      got.push(m);
      if (m.type === 'joined' || m.type === 'error') resolve({ ws, answer: m, got });
    });
    ws.on('error', reject);
  });
}
/** The first word of this type said on a socket, or null after a while. */
function heard(ws, type, ms = 3000) {
  return new Promise((resolve) => {
    const on = (d) => {
      const m = JSON.parse(d.toString());
      if (m.type === type) { ws.off('message', on); clearTimeout(t); resolve(m); }
    };
    const t = setTimeout(() => { ws.off('message', on); resolve(null); }, ms);
    ws.on('message', on);
  });
}
/** The code a socket is closed with, or null after a while. */
const closedWith = (ws, ms = 3000) => new Promise((resolve) => {
  const t = setTimeout(() => resolve(null), ms);
  ws.once('close', (code) => { clearTimeout(t); resolve(code); });
});
function ask(ws, obj) {
  return new Promise((resolve) => {
    ws.once('message', (d) => resolve(JSON.parse(d.toString())));
    ws.send(JSON.stringify(obj));
  });
}
let failed = 0;
const check = (label, ok, detail) => { console.log(`${ok ? 'OK ' : 'FAIL'} ${label}${ok ? '' : ' -> ' + JSON.stringify(detail)}`); if (!ok) failed++; };

// A relay admin that only writes down what it is asked: the users are
// made and dropped through it.
import { writeFileSync, readFileSync, chmodSync } from 'node:fs';
const ADMIN = `${tmpdir()}/duetto-turnadmin-${process.pid}.sh`;
const ADMIN_LOG = `${ADMIN}.log`;
writeFileSync(ADMIN, `#!/bin/sh\necho "$@" >> ${ADMIN_LOG}\n`); chmodSync(ADMIN, 0o755);
const srv = start(PORT, FILE, { TURN_URL: 'turn:relay.test:3478', TURN_USER: 'shared', TURN_PASS: 'shared', TURN_ADMIN_CMD: ADMIN });
const srvK = start(PORT_K, FILE_K, { SERVER_KEY: 'sesamo' });
// A brake of three knocks a minute, and its log read: who it counts.
const srvB = start(PORT_B, FILE_B, { JOIN_LIMIT: '3' });
const srvH = start(PORT_H, FILE_H, { HOST_NAMES: 'duetto.test, WWW.duetto.test' });
const srvO = start(PORT_O, FILE_O, { HOST_NAMES: 'duetto.test', OLD_SIGNATURES: 'off' });
const srvC = start(PORT_C, FILE_C, { SERVER_KEY: 'apriti' });
let logB = '';
srvB.stdout.on('data', (d) => { logB += d; });
await sleep(700);
try {
  const anna = phone(), bruno = phone(), carla = phone(), dario = phone();

  // A free house: the first card takes it.
  let r = await knock(PORT, anna);
  check('free house: first phone becomes owner', r.answer.role === 'owner' && r.answer.adopted === true && r.answer.hasOwner === false, r.answer);
  const annaWs = r.ws;
  // Same phone again: still the owner, no second adoption.
  r = await knock(PORT, anna); check('owner knocks again: owner', r.answer.role === 'owner' && !r.answer.adopted, r.answer); r.ws.close();
  // The name follows the phone: said later, it is written down.
  r = await knock(PORT, anna, { name: 'anna', model: 'POCO F5' });
  check('the name follows the phone', r.answer.name === 'anna', r.answer);
  const list = await ask(r.ws, { type: 'people' });
  check('the list says who, on what, and that it is you',
    list.type === 'people' && list.people[0].name === 'anna' && list.people[0].model === 'POCO F5' && list.people[0].you === true && list.people[0].owner === true, list);
  r.ws.close();
  // A stranger at an owned house.
  r = await knock(PORT, bruno);
  check('stranger at owned house', r.answer.role === 'stranger' && r.answer.hasOwner === true && r.answer.needsKey === false && !r.answer.error, r.answer); r.ws.close();
  // The owner invites from the door socket, with no room joined.
  const inv = await ask(annaWs, { type: 'invite', name: 'bruno' });
  check('owner invites at the door', inv.type === 'invited' && /^[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(inv.code), inv);
  // A wrong invitation.
  r = await knock(PORT, carla, { invite: 'ZZZZ-ZZZZ' });
  check('wrong invitation: bad-invite', r.answer.role === 'stranger' && r.answer.error === 'bad-invite', r.answer); r.ws.close();
  // The right one: member, spent.
  r = await knock(PORT, bruno, { invite: inv.code });
  check('invitation: member', r.answer.role === 'member' && r.answer.name === 'bruno', r.answer);
  const memberBiz = await ask(r.ws, { type: 'people' });
  check('a member may not do the owner business', memberBiz.type === 'error' && memberBiz.error === 'not-yours', memberBiz); r.ws.close();
  r = await knock(PORT, carla, { invite: inv.code });
  check('a spent invitation: bad-invite', r.answer.error === 'bad-invite', r.answer); r.ws.close();
  // Bruno knocks again: member by his card.
  r = await knock(PORT, bruno); check('member knocks again: member', r.answer.role === 'member', r.answer); r.ws.close();
  // A member leaves by themselves; the owner may not.
  r = await knock(PORT, bruno);
  const left = await ask(r.ws, { type: 'leave' });
  check('a member leaves the server', left.type === 'left', left); r.ws.close();
  r = await knock(PORT, bruno); check('gone: a stranger again', r.answer.role === 'stranger', r.answer); r.ws.close();
  r = await knock(PORT, anna);
  const notLeft = await ask(r.ws, { type: 'leave' });
  check('the owner may not leave', notLeft.type === 'error' && notLeft.error === 'not-for-owner', notLeft); r.ws.close();

  // Rooms are the two phones that made them. Anna opens one; Bruno,
  // back on the list, takes the second seat while she is in; Carla, on
  // the list too, may not sit in it when one of them is away.
  const inv2 = await ask(annaWs, { type: 'invite', name: 'bruno' });
  r = await knock(PORT, bruno, { invite: inv2.code }); r.ws.close();
  const inv3 = await ask(annaWs, { type: 'invite', name: 'carla' });
  r = await knock(PORT, carla, { invite: inv3.code }); r.ws.close();
  let a = await join(PORT, anna, '11112222', 'anna');
  check('owner opens a room', a.answer.type === 'joined', a.answer);
  let c = await join(PORT, carla, '11112222', 'carla');
  check('second seat while the owner is in: a partner', c.answer.type === 'joined', c.answer);
  c.ws.close(); await sleep(200);
  let b = await join(PORT, bruno, '11112222', 'bruno');
  check('a third phone on the list: not their room', b.answer.type === 'error' && b.answer.reason === 'taken-room', b.answer);
  a.ws.close(); await sleep(200);
  c = await join(PORT, carla, '11112222', 'carla');
  check('the partner comes back alone', c.answer.type === 'joined', c.answer); c.ws.close();
  b = await join(PORT, bruno, '11112222', 'bruno');
  check('owner away, partner away: still not their room', b.answer.type === 'error' && b.answer.reason === 'taken-room', b.answer);
  // One name, one phone: the owner's own name, or a member's, cannot
  // be given away again.
  const inv4 = await ask(annaWs, { type: 'invite', name: 'anna' });
  check('inviting under the owner\'s name: name-taken', inv4.type === 'error' && inv4.error === 'name-taken', inv4);
  const inv5 = await ask(annaWs, { type: 'invite', name: 'carla' });
  check('inviting under a member\'s name: name-taken', inv5.type === 'error' && inv5.error === 'name-taken', inv5);
  a = await join(PORT, anna, '11112222', 'anna');
  check('the owner comes back', a.answer.type === 'joined', a.answer); a.ws.close(); await sleep(200);
  b = await join(PORT, bruno, '33334444', 'bruno');
  check('a fresh room: anybody on the list opens it', b.answer.type === 'joined', b.answer); b.ws.close(); await sleep(200);
  // The relay: the first time the shared credential, while the phone's
  // own user is being made; from then on its own, and dropped when it goes.
  check('first join: the shared relay credential', b.answer.turn && b.answer.turn.username === 'shared', b.answer.turn);
  await sleep(300);
  b = await join(PORT, bruno, '33334444', 'bruno');
  const own = b.answer.turn && b.answer.turn.username;
  check('then a relay user of its own', /^[0-9a-f]{12}$/.test(own || '') && b.answer.turn.credential !== 'shared', b.answer.turn);
  check('made through the admin', readFileSync(ADMIN_LOG, 'utf8').includes(`add ${own} `), readFileSync(ADMIN_LOG, 'utf8'));
  b.ws.close(); await sleep(200);
  r = await knock(PORT, bruno); await ask(r.ws, { type: 'leave' }); r.ws.close();
  await sleep(300);
  check('leaving drops the relay user', readFileSync(ADMIN_LOG, 'utf8').includes(`del ${own}`), readFileSync(ADMIN_LOG, 'utf8'));
  r = await knock(PORT, carla); await ask(r.ws, { type: 'leave' }); r.ws.close();

  // A stranger at the door cannot do the owner business.
  r = await knock(PORT, carla);
  const biz = await ask(r.ws, { type: 'invite', name: 'x' });
  check('stranger may not invite', biz.type === 'error' && biz.error === 'expected-join', biz); r.ws.close();
  // Unsigned: refused.
  r = await knock(PORT, { pub: anna.pub, signs: () => 'AAAA' });
  check('bad signature', r.answer.error === 'bad-signature', r.answer); r.ws.close();
  annaWs.close();

  // A house with a key.
  r = await knock(PORT_K, dario);
  check('keyed free house, no key said: stranger + needsKey', r.answer.role === 'stranger' && r.answer.needsKey === true && r.answer.hasOwner === false && !r.answer.error, r.answer); r.ws.close();
  r = await knock(PORT_K, dario, { key: 'wrong' });
  check('keyed house, wrong key: bad-key', r.answer.error === 'bad-key', r.answer); r.ws.close();
  r = await knock(PORT_K, dario, { key: 'sesamo' });
  check('keyed house, right key: owner', r.answer.role === 'owner' && r.answer.adopted === true, r.answer); r.ws.close();
  // A reinstalled phone, a new card. The key alone - as the apps before
  // the claim sent it, at every knock - takes nothing.
  const dario2 = phone();
  r = await knock(PORT_K, dario2);
  check('new card at owned keyed house: stranger, needsKey', r.answer.role === 'stranger' && r.answer.hasOwner && r.answer.needsKey, r.answer); r.ws.close();
  r = await knock(PORT_K, dario2, { key: 'sesamo' });
  check('new card with the key alone: still a stranger', r.answer.role === 'stranger' && !r.answer.adopted && !r.answer.error, r.answer); r.ws.close();
  // The key and the claim: the owner's place, and the old card out.
  r = await knock(PORT_K, dario2, { key: 'sesamo', claim: true });
  check('new card with the key, claimed: owner, in place of the old card', r.answer.role === 'owner' && r.answer.adopted === true && r.answer.replaced === 1, r.answer); r.ws.close();
  r = await knock(PORT_K, dario, { key: 'sesamo' });
  check('the old card, with the key it kept: a stranger', r.answer.role === 'stranger' && !r.answer.adopted, r.answer); r.ws.close();
  const dario3 = phone();
  r = await knock(PORT_K, dario3, { key: 'wrong', claim: true });
  check('new card, wrong key at owned house: bad-key', r.answer.error === 'bad-key', r.answer); r.ws.close();

  // One owner. Whoever took the house has a room with a guest in it, a
  // member, and a thread at the door; a new phone comes with the key.
  const paolo = phone(), edge = phone(), moto = phone(), newPhone = phone();
  r = await knock(PORT_C, paolo, { key: 'apriti', name: 'paolo', model: 'POCO' });
  check('one owner: the first phone takes the house with the key', r.answer.role === 'owner' && r.answer.adopted === true, r.answer);
  const paoloDoor = r.ws;
  const invMoto = await askFor(paoloDoor, { type: 'invite', name: 'moto' }, 'invited');
  r = await knock(PORT_C, moto, { invite: invMoto.code }); r.ws.close();
  let o = await join(PORT_C, paolo, 'room0001', 'paolo');
  const e = await join(PORT_C, edge, 'room0001', 'edge');
  check('the owner\'s room has its guest', e.answer.type === 'joined', e.answer);
  e.ws.close(); o.ws.close(); await sleep(200);
  const notMe = await askFor(paoloDoor, { type: 'forget', name: 'paolo' }, 'error');
  check('"take away" never takes the phone asking', notMe.error === 'not-yourself', notMe);
  // A join that carries the key, from a card nobody knows: the way the
  // apps before took a house again, and not a way any more.
  o = await joinWith(PORT_C, newPhone, 'room0002', { key: 'apriti' });
  check('a join with the key does not take a taken house', o.answer.type === 'error' && o.answer.error === 'not-allowed', o.answer);
  o.ws.close();
  // The claim, with the name of the member: the old owner, at the door,
  // is told why and let go.
  const told = heard(paoloDoor, 'removed');
  const shut = closedWith(paoloDoor);
  r = await knock(PORT_C, newPhone, { key: 'apriti', claim: true, name: 'moto', model: 'Pixel' });
  check('the claim: the owner, one card replaced', r.answer.role === 'owner' && r.answer.adopted === true && r.answer.replaced === 1, r.answer);
  check('a name a member has: told apart by the model', r.answer.name === 'moto (Pixel)', r.answer);
  const why = await told;
  const code = await shut;
  check('the old owner is told why, and let go', why?.why === 'new-owner' && code === 4006, { why, code });
  const people = await askFor(r.ws, { type: 'people' }, 'people');
  const owners = (people.people || []).filter((x) => x.owner);
  check('one owner on the list, and the member as before',
    owners.length === 1 && owners[0].you === true && people.people.some((x) => x.name === 'moto' && !x.owner)
      && !people.people.some((x) => x.name === 'paolo'), people);
  r.ws.close();
  r = await knock(PORT_C, newPhone, { name: 'moto', model: 'Pixel' });
  check('and the member\'s name is not taken at the next knock either', r.answer.role === 'owner' && r.answer.name === 'moto (Pixel)', r.answer); r.ws.close();
  r = await knock(PORT_C, moto);
  check('the member is still a member', r.answer.role === 'member' && r.answer.name === 'moto', r.answer); r.ws.close();
  // The guest of the old owner's room: told the pair is broken.
  o = await joinWith(PORT_C, edge, 'room0001');
  check('the guest of the old room: pair broken, and not let in',
    o.got.some((m) => m.type === 'pair-broken' && m.room === 'room0001') && o.answer.error === 'not-allowed', o.got);
  o.ws.close();
  // The old owner, back with the key it kept: nothing, at the door or in a room.
  r = await knock(PORT_C, paolo, { key: 'apriti', name: 'paolo' });
  check('the old owner, back with the key it kept: a stranger', r.answer.role === 'stranger' && !r.answer.adopted, r.answer); r.ws.close();
  o = await joinWith(PORT_C, paolo, 'room0001', { key: 'apriti' });
  check('nor in a room', o.answer.type === 'error' && o.answer.error === 'not-allowed', o.answer); o.ws.close();

  // A code that waits: the maker leaves, the other half comes in alone
  // and leaves its key, the maker finds it at the door of any room.
  const gino = phone();
  const ugo = phone();
  const ROOM = 'waitroom1';
  const nextMsg = (ws, ms = 1500) => new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), ms);
    ws.once('message', (d) => { clearTimeout(timer); resolve(JSON.parse(d.toString())); });
  });
  let ma = await join(PORT, anna, ROOM, 'anna');
  check('maker opens the code room', ma.answer.type === 'joined', ma.answer);
  let mw = await ask(ma.ws, { type: 'await-room', until: Date.now() + 3600_000 });
  check('the room waits', mw.type === 'awaiting' && mw.room === ROOM && !!mw.until, mw);
  ma.ws.close(); await sleep(100);
  let mg = await join(PORT, gino, ROOM, 'gino');
  check('other half comes in alone while the room waits', mg.answer.type === 'joined', mg.answer);
  let pm = await ask(mg.ws, { type: 'pair-mail', payload: { kind: 'pubkey', pub: 'GINO', name: 'gino' } });
  check('mail left', pm.type === 'pair-mail-result' && pm.ok === true, pm);
  mg.ws.close(); await sleep(100);
  ma = await join(PORT, anna, 'someotherroom', 'anna');
  check('maker back, elsewhere', ma.answer.type === 'joined', ma.answer);
  let mail = await nextMsg(ma.ws);
  check('mail handed over at the door', mail?.type === 'mail' && mail.items?.[0]?.room === ROOM
    && mail.items[0].payload?.pub === 'GINO', mail);
  ma.ws.close(); await sleep(100);
  ma = await join(PORT, anna, 'someotherroom', 'anna');
  mail = await nextMsg(ma.ws, 400);
  check('taken, it is gone', mail === null, mail);
  ma.ws.close(); await sleep(100);
  mg = await join(PORT, gino, ROOM, 'gino');
  check('the other half is the room\'s guest from here on', mg.answer.type === 'joined', mg.answer);
  mg.ws.close();
  let mu = await join(PORT, ugo, 'nowait', 'ugo');
  check('a stranger at an empty room that does not wait: turned away', mu.answer.type === 'error' && mu.answer.error === 'not-allowed', mu.answer);
  mu.ws.close();
  mu = await join(PORT, ugo, ROOM, 'ugo');
  check('a third phone at the taken room: turned away', mu.answer.type === 'error', mu.answer);
  mu.ws.close();

  // The page behind a link: bounces into the app, names host and code.
  const KEY = 'A'.repeat(43);
  // fetch does not let the Host header be set: the page names the one it was asked at.
  const HOST = `127.0.0.1:${PORT}`;
  let page = await (await fetch(`http://${HOST}/duetto/p/12345678/${KEY}`)).text();
  check('pairing link page bounces into the app', page.includes(`href="duetto://${HOST}/pair/12345678/${KEY}"`)
    && page.includes(`intent://${HOST}/pair/12345678/`) && page.includes('1234 5678'), page.slice(-400));
  page = await (await fetch(`http://${HOST}/duetto/i/ABCD-2345`)).text();
  check('invitation link page bounces into the app', page.includes(`href="duetto://${HOST}/invite/ABCD-2345"`), page.slice(-400));
  page = await (await fetch(`http://${HOST}/duetto/p/12345678?stay=1`)).text();
  check('with stay=1 the page does not bounce', !page.includes('location.replace'), page.slice(-200));
  const r404 = await fetch(`http://127.0.0.1:${PORT}/duetto/x/12345678`);
  check('an unknown path is not a page', r404.status === 426, r404.status);

  // The address is the one the proxy wrote, the last in X-Forwarded-For:
  // what the client puts before it neither escapes the brake nor gets
  // somebody else named in the refusals that fail2ban reads.
  const host = phone(), knocker = phone();
  r = await knock(PORT_B, host, {}, { 'X-Forwarded-For': '10.0.0.1' });
  check('braked house: taken', r.answer.role === 'owner', r.answer); r.ws.close();
  for (let i = 1; i <= 3; i += 1) {
    r = await knock(PORT_B, knocker, {}, { 'X-Forwarded-For': `${i}.${i}.${i}.${i}, 10.0.0.9` });
    r.ws.close();
  }
  check('three knocks, each with a new address before the proxy\'s: let through', r.answer.role === 'stranger', r.answer);
  r = await knock(PORT_B, knocker, {}, { 'X-Forwarded-For': '4.4.4.4, 10.0.0.9' });
  check('the fourth is braked: counted on the proxy\'s address', r.answer.error === 'too-many-attempts', r.answer);
  r.ws.close();
  r = await knock(PORT_B, knocker, {}, { 'X-Forwarded-For': '10.0.0.10' });
  check('another address is not braked with it', r.answer.role === 'stranger', r.answer); r.ws.close();
  const turned = await join(PORT_B, phone(), 'room-of-nobody', 'x', { 'X-Forwarded-For': '6.6.6.6, 10.0.0.11' });
  turned.ws.close();
  await sleep(100);
  check('a refusal names the proxy\'s address, not the client\'s writing',
    /turned away: .* from 10\.0\.0\.11,/.test(logB) && !logB.includes('6.6.6.6'), logB.split('\n').filter((l) => l.includes('turned away')));

  // And fail2ban reads that line with the filter in deploy/: it has to
  // find it, and that address in it. It stopped finding anything when
  // the line grew a room and an app after the address, and nothing said
  // so. Of fail2ban's own words, what these lines need: the prefix is
  // the journal's, not here, and <HOST> is an address.
  const filter = readFileSync(new URL('./deploy/fail2ban/duetto-door.conf', import.meta.url), 'utf8');
  const failregex = new RegExp(/^failregex = (.+)$/m.exec(filter)[1]
    .replace('^%(__prefix_line)s', '^')
    .replace('<HOST>', '(?<host>[0-9A-Fa-f.:]*[0-9A-Fa-f])'));
  const banned = (line) => failregex.exec(line)?.groups.host ?? null;
  const lines = logB.split('\n').filter(Boolean);
  const refusals = lines.filter((l) => l.includes('turned away'));
  check('fail2ban\'s filter finds the refusal, and the proxy\'s address in it',
    refusals.length === 1 && banned(refusals[0]) === '10.0.0.11', refusals);
  check('and no other line of the server', lines.filter((l) => !l.includes('turned away')).every((l) => banned(l) === null),
    lines.filter((l) => !l.includes('turned away') && banned(l) !== null));
  // The card in the line is the client's writing: a "from" in it names nobody.
  const forged = await join(PORT_B, { pub: 'x from 6.6.6', signs: () => 'x' }, 'room-of-nobody', 'x',
    { 'X-Forwarded-For': '10.0.0.12' });
  forged.ws.close();
  await sleep(100);
  const forgedLine = logB.split('\n').find((l) => l.includes('turned away: x from 6.6.6'));
  check('a "from" written in the card gets nobody else banned', !!forgedLine && banned(forgedLine) === '10.0.0.12', forgedLine);
  // --- the signature bound to the server's name ------------------------
  // A server could hand a phone the number another server had just
  // picked, and walk in there with the signature: as that phone. With
  // HOST_NAMES the phone signs the name it dialed too, and a card seen
  // doing so is not let in any more on the bare number.
  const H = 'duetto.test';
  const hOwner = phone(), hOld = phone();
  r = await knock(PORT_H, hOwner, { v2: H });
  check('a server with names says door 2 in its hello', r.hello?.door === 2, r.hello);
  check('a card signed for its name takes the free house', r.answer.role === 'owner', r.answer);
  const hInv = await askFor(r.ws, { type: 'invite', name: 'old-phone' }, 'invited');
  r.ws.close();
  r = await knock(PORT_H, hOwner, { v2: 'www.DUETTO.test' });
  check('another of its names, written any way: the owner', r.answer.role === 'owner', r.answer); r.ws.close();
  r = await knock(PORT_H, hOwner);
  check('the same card with the bare number - what another server could carry here: refused',
    r.answer.error === 'bad-signature', r.answer); r.ws.close();
  r = await knock(PORT_H, hOwner, { v2: 'evil.test' });
  check('a signature made for another name: no good here', r.answer.error === 'bad-signature', r.answer); r.ws.close();
  r = await knock(PORT_H, hOld, { invite: hInv.code });
  check('an app from before, with the bare number: still let in', r.answer.role === 'member', r.answer); r.ws.close();
  r = await knock(PORT_H, hOld, { v2: H });
  check('the same phone updated: in the new way', r.answer.role === 'member', r.answer); r.ws.close();
  r = await knock(PORT_H, hOld);
  check('and from then on its bare number is refused', r.answer.error === 'bad-signature', r.answer); r.ws.close();
  let hj = await join(PORT_H, hOwner, 'h-room', 'owner', {}, H);
  check('into a room the new way', hj.answer.type === 'joined', hj.answer); hj.ws.close();
  await sleep(100);
  hj = await join(PORT_H, hOwner, 'h-room', 'owner');
  check('into a room with the bare number, from a card that has moved: refused',
    hj.answer.type === 'error' && hj.answer.error === 'not-allowed', hj.answer); hj.ws.close();
  r = await knock(PORT_B, phone(), {}, { 'X-Forwarded-For': '10.0.0.20' });
  check('a server without names says nothing new', r.hello && r.hello.door === undefined, r.hello); r.ws.close();
  r = await knock(PORT_O, phone());
  check('OLD_SIGNATURES=off: the bare number refused to everybody', r.answer.error === 'bad-signature', r.answer);
  r.ws.close();
  r = await knock(PORT_O, phone(), { v2: H });
  check('and the new way takes the house', r.answer.role === 'owner', r.answer); r.ws.close();
} finally {
  srv.kill(); srvK.kill(); srvB.kill(); srvH.kill(); srvO.kill(); srvC.kill();
  try { unlinkSync(FILE_C); } catch {}
  try { unlinkSync(FILE_H); } catch {}
  try { unlinkSync(FILE_O); } catch {}
  try { unlinkSync(FILE_B); } catch {}
  try { unlinkSync(FILE); } catch {}
  try { unlinkSync(ADMIN); unlinkSync(ADMIN_LOG); } catch {}
  try { unlinkSync(FILE_K); } catch {}
}
console.log(failed ? `\n${failed} FAILED` : '\nALL OK');
process.exit(failed ? 1 : 0);
