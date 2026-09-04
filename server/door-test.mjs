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
function ask(ws, obj) {
  return new Promise((resolve) => {
    ws.once('message', (d) => resolve(JSON.parse(d.toString())));
    ws.send(JSON.stringify(obj));
  });
}
let failed = 0;
const check = (label, ok, detail) => { console.log(`${ok ? 'OK ' : 'FAIL'} ${label}${ok ? '' : ' -> ' + JSON.stringify(detail)}`); if (!ok) failed++; };

const srv = start(PORT, FILE);
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
  try { unlinkSync(FILE_K); } catch {}
}
console.log(failed ? `\n${failed} FAILED` : '\nALL OK');
process.exit(failed ? 1 : 0);
