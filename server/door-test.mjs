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
const FILE = `${tmpdir()}/duetto-door-${process.pid}.json`;
const FILE_K = `${tmpdir()}/duetto-door-k-${process.pid}.json`;

function phone() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const pub = publicKey.export({ format: 'der', type: 'spki' }).subarray(12);
  return {
    pub: pub.toString('base64'),
    signs: (nonce) => sign(null, Buffer.from(nonce, 'base64'), privateKey).toString('base64'),
  };
}
const start = (port, file, extra = {}) => spawn('node', ['src/index.js'], {
  env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', DEVICES_FILE: file, AUTHORISED_KEYS: '', SERVER_KEY: '', ...extra },
  stdio: ['ignore', 'pipe', 'inherit'],
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Knocks at the door and hands back the answer, keeping the socket. */
function knock(port, ph, extra = {}) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    const got = [];
    ws.on('message', (d) => {
      const m = JSON.parse(d.toString());
      if (m.type === 'hello') {
        ws.send(JSON.stringify({ type: 'door', pub: ph.pub, sig: ph.signs(m.nonce), name: 'tester', ...extra }));
        return;
      }
      got.push(m);
      if (m.type === 'door' || m.type === 'error') resolve({ ws, answer: m, got });
    });
    ws.on('error', reject);
  });
}
/** Joins a room, and hands back `joined` or the error, keeping the socket. */
function join(port, ph, room, name) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    ws.on('message', (d) => {
      const m = JSON.parse(d.toString());
      if (m.type === 'hello') {
        ws.send(JSON.stringify({ type: 'join', room, pub: ph.pub, sig: ph.signs(m.nonce), name, mode: 'listening' }));
        return;
      }
      if (m.type === 'joined' || m.type === 'error') resolve({ ws, answer: m });
    });
    ws.on('error', reject);
  });
}
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
  // A reinstalled phone (new card) with the key comes home as owner.
  const dario2 = phone();
  r = await knock(PORT_K, dario2);
  check('new card at owned keyed house: stranger, needsKey', r.answer.role === 'stranger' && r.answer.hasOwner && r.answer.needsKey, r.answer); r.ws.close();
  r = await knock(PORT_K, dario2, { key: 'sesamo' });
  check('new card with the key: owner again', r.answer.role === 'owner' && r.answer.adopted === true, r.answer); r.ws.close();
  const dario3 = phone();
  r = await knock(PORT_K, dario3, { key: 'wrong' });
  check('new card, wrong key at owned house: bad-key', r.answer.error === 'bad-key', r.answer); r.ws.close();
} finally {
  srv.kill(); srvK.kill();
  try { unlinkSync(FILE); } catch {}
  try { unlinkSync(ADMIN); unlinkSync(ADMIN_LOG); } catch {}
  try { unlinkSync(FILE_K); } catch {}
}
console.log(failed ? `\n${failed} FAILED` : '\nALL OK');
process.exit(failed ? 1 : 0);
