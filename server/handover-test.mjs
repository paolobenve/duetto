// The hand-over: a phone gives its place to another phone.
//
// The meeting at the door - opened by a card that sits somewhere, joined
// by one card that sits nowhere, the envelopes between them passed as
// they are - and then the place itself: the line on the list, the seats
// in the rooms, the codes waiting, the relay user, and the other side of
// each room told that a new phone sits opposite. Run from this
// directory: `npm run test:handover`.
import { spawn } from 'node:child_process';
import { WebSocket } from 'ws';
import { generateKeyPairSync, sign, createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { unlinkSync, writeFileSync, readFileSync, chmodSync } from 'node:fs';

const PORT = 8781;
/** A card written in the settings: the operator's to move. */
const PORT_E = 8782;
/** A code that waits a second and a half, and no more. */
const PORT_W = 8783;
const FILE = `${tmpdir()}/duetto-handover-${process.pid}.json`;
const FILE_E = `${tmpdir()}/duetto-handover-e-${process.pid}.json`;
const FILE_W = `${tmpdir()}/duetto-handover-w-${process.pid}.json`;

function phone() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const pub = publicKey.export({ format: 'der', type: 'spki' }).subarray(12);
  return {
    pub: pub.toString('base64'),
    signs: (nonce) => sign(null, Buffer.from(nonce, 'base64'), privateKey).toString('base64'),
  };
}
const start = (port, file, extra = {}) => spawn('node', ['src/index.js'], {
  env: {
    ...process.env, PORT: String(port), HOST: '127.0.0.1', DEVICES_FILE: file,
    AUTHORISED_KEYS: '', SERVER_KEY: '', HOST_NAMES: '', ...extra,
  },
  stdio: ['ignore', 'pipe', 'inherit'],
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** A meeting's name: the fingerprint of a secret only the phones know. */
const meeting = () => createHash('sha256').update(String(Math.random())).digest('hex');

/** Knocks at the door, keeping the socket. */
function knock(port, ph, extra = {}) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    ws.on('message', (d) => {
      const m = JSON.parse(d.toString());
      if (m.type === 'hello') {
        ws.send(JSON.stringify({ type: 'door', pub: ph.pub, sig: ph.signs(m.nonce), name: 'tester', ...extra }));
        return;
      }
      if (m.type === 'door' || m.type === 'error') resolve({ ws, answer: m });
    });
    ws.on('error', reject);
  });
}
/** Joins a room, keeping the socket. */
function join(port, ph, room, name, side) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    ws.on('message', (d) => {
      const m = JSON.parse(d.toString());
      if (m.type === 'hello') {
        ws.send(JSON.stringify({
          type: 'join', room, pub: ph.pub, sig: ph.signs(m.nonce), name, mode: 'listening', side,
        }));
        return;
      }
      if (m.type === 'joined' || m.type === 'error') resolve({ ws, answer: m });
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
/** Says something and waits for one of these words. */
function askFor(ws, obj, types, ms = 3000) {
  const wanted = [].concat(types);
  return new Promise((resolve) => {
    const on = (d) => {
      const m = JSON.parse(d.toString());
      if (wanted.includes(m.type)) { ws.off('message', on); clearTimeout(t); resolve(m); }
    };
    const t = setTimeout(() => { ws.off('message', on); resolve({}); }, ms);
    ws.on('message', on);
    ws.send(JSON.stringify(obj));
  });
}
const closedWith = (ws, ms = 3000) => new Promise((resolve) => {
  const t = setTimeout(() => resolve(null), ms);
  ws.once('close', (code) => { clearTimeout(t); resolve(code); });
});
const list = () => JSON.parse(readFileSync(FILE, 'utf8'));
const today = new Date().toISOString().slice(0, 10);

let failed = 0;
const check = (label, ok, detail) => {
  console.log(`${ok ? 'OK ' : 'FAIL'} ${label}${ok ? '' : ` -> ${JSON.stringify(detail)}`}`);
  if (!ok) failed++;
};

// A relay admin that writes down what it is asked.
const ADMIN = `${tmpdir()}/duetto-handover-admin-${process.pid}.sh`;
const ADMIN_LOG = `${ADMIN}.log`;
writeFileSync(ADMIN, `#!/bin/sh\necho "$@" >> ${ADMIN_LOG}\n`);
chmodSync(ADMIN, 0o755);
const relayUser = (pub) => createHash('sha256').update(pub).digest('hex').slice(0, 12);

const fixed = phone();
const srv = start(PORT, FILE, {
  TURN_URL: 'turn:relay.test:3478', TURN_USER: 'shared', TURN_PASS: 'shared', TURN_ADMIN_CMD: ADMIN,
});
const srvE = start(PORT_E, FILE_E, { AUTHORISED_KEYS: `fisso:${fixed.pub}` });
const srvW = start(PORT_W, FILE_W, { HANDOVER_WAIT_MS: '1500' });
await sleep(700);
try {
  const anna = phone(), bruno = phone(), gio = phone(), nova = phone();
  const R1 = 'room-with-a-guest', R2 = 'room-of-two-members', R3 = 'room-that-waits';

  // The house: anna owns it, bruno is invited; anna has a guest in R1,
  // shares R2 with bruno, and has a code waiting in R3.
  let r = await knock(PORT, anna, { name: 'anna' });
  check('anna takes the house', r.answer.role === 'owner', r.answer);
  const inv = await askFor(r.ws, { type: 'invite', name: 'bruno' }, 'invited');
  r.ws.close();
  r = await knock(PORT, bruno, { invite: inv.code });
  check('bruno comes in with an invitation', r.answer.role === 'member', r.answer);
  r.ws.close();
  const a1 = await join(PORT, anna, R1, 'anna', 'A');
  const g1 = await join(PORT, gio, R1, 'gio', 'B');
  check('gio sits in R1 as the guest', g1.answer.type === 'joined', g1.answer);
  const a2 = await join(PORT, anna, R2, 'anna', 'A');
  const b2 = await join(PORT, bruno, R2, 'bruno', 'B');
  check('bruno sits in R2 as the second party', b2.answer.type === 'joined', b2.answer);
  const a3 = await join(PORT, anna, R3, 'anna', 'A');
  const waits = await askFor(a3.ws, { type: 'await-room', until: Date.now() + 3600_000 }, 'awaiting');
  check('R3 waits for its other half', !!waits.until, waits);
  a3.ws.close();
  // The relay user of anna's card, made at her joins.
  await sleep(300);
  check('anna has a relay user', readFileSync(ADMIN_LOG, 'utf8').includes(`add ${relayUser(anna.pub)} `),
    readFileSync(ADMIN_LOG, 'utf8'));

  // --- The meeting -----------------------------------------------------
  const stranger = phone();
  r = await knock(PORT, stranger);
  let m = await askFor(r.ws, { type: 'handover-open', id: meeting() }, 'handover-error');
  check('a card that sits nowhere opens nothing', m.error === 'no-place', m);
  r.ws.close();
  const old = await knock(PORT, anna, { name: 'anna' });
  m = await askFor(old.ws, { type: 'handover-open', id: 'not-a-fingerprint' }, 'handover-error');
  check('a meeting needs a fingerprint for a name', m.error === 'bad-id', m);
  const ID = meeting();
  m = await askFor(old.ws, { type: 'handover-open', id: ID }, 'handover-opened');
  check('the owner opens a meeting', m.type === 'handover-opened' && m.until > Date.now(), m);

  r = await knock(PORT, bruno);
  m = await askFor(r.ws, { type: 'handover-join', id: ID }, 'handover-error');
  check('a card that sits here already joins nothing', m.error === 'has-place', m);
  r.ws.close();
  const fresh = await knock(PORT, nova);
  check('the new phone is a stranger at the door', fresh.answer.role === 'stranger', fresh.answer);
  m = await askFor(fresh.ws, { type: 'handover-join', id: meeting() }, 'handover-error');
  check('a meeting nobody opened: unknown', m.error === 'unknown', m);
  const arrived = heard(old.ws, 'handover-arrived');
  m = await askFor(fresh.ws, { type: 'handover-join', id: ID }, ['handover-joined', 'handover-error']);
  check('the new phone joins the meeting', m.type === 'handover-joined', m);
  check('and the old one hears it has come', !!(await arrived));
  r = await knock(PORT, phone());
  m = await askFor(r.ws, { type: 'handover-join', id: ID }, 'handover-error');
  check('a second new phone finds it taken', m.error === 'taken', m);
  r.ws.close();

  // The envelopes go across as they are, both ways.
  let got = heard(old.ws, 'handover-msg');
  fresh.ws.send(JSON.stringify({ type: 'handover-msg', payload: 'sealed-by-the-new-one' }));
  check('new to old, as it was', (await got)?.payload === 'sealed-by-the-new-one');
  got = heard(fresh.ws, 'handover-msg');
  old.ws.send(JSON.stringify({ type: 'handover-msg', payload: 'sealed-by-the-old-one' }));
  check('old to new, as it was', (await got)?.payload === 'sealed-by-the-old-one');

  // --- The place ---------------------------------------------------------
  m = await askFor(old.ws, { type: 'handover', to: 'not a card' }, 'handover-error');
  check('a place goes to a card, or nowhere', m.error === 'bad-card', m);
  m = await askFor(old.ws, { type: 'handover', to: bruno.pub }, 'handover-error');
  check('not to a card that sits here already: the places do not grow', m.error === 'has-place', m);

  const guestTold = heard(g1.ws, 'peer-new-phone');
  const partnerTold = heard(b2.ws, 'peer-new-phone');
  const oldRoomClosed = closedWith(a1.ws);
  const oldRoomWord = heard(a1.ws, 'removed');
  const done = heard(fresh.ws, 'handover-done');
  m = await askFor(old.ws, { type: 'handover', to: nova.pub }, ['handed-over', 'handover-error']);
  check('the owner hands the place over', m.type === 'handed-over' && m.owner === true && m.rooms === 3, m);
  check('the new phone hears it at the meeting', !!(await done));
  check('the old card\'s rooms are let go, and told why',
    (await oldRoomWord)?.why === 'handed-over' && (await oldRoomClosed) === 4006);
  const gt = await guestTold;
  check('the guest of R1 is told: a new phone opposite', gt?.room === R1 && gt?.day === today, gt);
  const pt = await partnerTold;
  check('the second party of R2 is told too', pt?.room === R2 && pt?.day === today, pt);
  let file = list();
  const row = file.devices.find((d) => d.name === 'anna');
  check('the line of the list is the new card\'s, owner and named as before',
    row?.pub === nova.pub && row?.owner === true && row?.newPhone === today && !row?.model, row);
  check('the seats in the rooms are the new card\'s',
    file.rooms.filter((x) => x.ownerPub === nova.pub).length === 3
    && !file.rooms.some((x) => x.ownerPub === anna.pub), file.rooms);
  check('and the code that waits waits for the new card',
    file.pending.some((x) => x.room === R3 && x.ownerPub === nova.pub), file.pending);
  await sleep(300);
  check('the old relay user is dropped', readFileSync(ADMIN_LOG, 'utf8').includes(`del ${relayUser(anna.pub)}`),
    readFileSync(ADMIN_LOG, 'utf8'));
  m = await askFor(old.ws, { type: 'handover', to: phone().pub }, 'handover-error');
  check('handed over, the old socket can hand nothing else', m.error === 'not-yours', m);
  // The last word, after the place, still goes across.
  got = heard(fresh.ws, 'handover-msg');
  old.ws.send(JSON.stringify({ type: 'handover-msg', payload: 'done' }));
  check('the old phone\'s last word still reaches the new one', (await got)?.payload === 'done');
  const meetingEnds = heard(fresh.ws, 'handover-closed');
  old.ws.close();
  check('the old phone gone, the meeting ends', (await meetingEnds)?.why === 'gone');
  fresh.ws.close();

  r = await knock(PORT, anna, { name: 'anna' });
  check('the old card is a stranger here now', r.answer.role === 'stranger', r.answer);
  r.ws.close();
  r = await knock(PORT, nova, { name: 'anna', model: 'Nuovo 1' });
  check('the new card is the owner, under the old name', r.answer.role === 'owner' && r.answer.name === 'anna', r.answer);
  const people = await askFor(r.ws, { type: 'people' }, 'people');
  const mine = people.people?.find((p) => p.you);
  check('the list says it: you, on the new phone, since today',
    mine?.name === 'anna' && mine?.owner === true && mine?.newPhone === today && mine?.model === 'Nuovo 1', people);
  // Its rooms by id on its own line, the one waiting too; nobody
  // else's line lists any.
  check('the rooms by id, on the asking phone\'s line only',
    [R1, R2, R3].every((id) => mine?.theirs?.some((t) => t.room === id))
      && people.people.filter((p) => !p.you).every((p) => Array.isArray(p.theirs) && p.theirs.length === 0),
    people);
  r.ws.close();
  const n1 = await join(PORT, nova, R1, 'anna', 'A');
  check('the new phone comes into R1, and is not told about itself',
    n1.answer.type === 'joined' && n1.answer.peerNewPhone === undefined, n1.answer);
  g1.ws.close();
  await sleep(150);
  const g1b = await join(PORT, gio, R1, 'gio', 'B');
  check('the guest, back in R1, is told at the door of the room', g1b.answer.peerNewPhone === today, g1b.answer);

  // --- A guest's place, and a member's -----------------------------------
  const gio2 = phone();
  r = await knock(PORT, gio);
  check('a guest is a guest at the door', r.answer.role === 'guest', r.answer);
  const ID2 = meeting();
  m = await askFor(r.ws, { type: 'handover-open', id: ID2 }, ['handover-opened', 'handover-error']);
  check('a guest opens a meeting for its own seat', m.type === 'handover-opened', m);
  const ownerTold = heard(n1.ws, 'peer-new-phone');
  m = await askFor(r.ws, { type: 'handover', to: gio2.pub }, ['handed-over', 'handover-error']);
  check('and hands it over: one room, no line on the list', m.type === 'handed-over' && m.rooms === 1 && m.owner === false, m);
  check('the owner of R1 hears it', (await ownerTold)?.room === R1);
  file = list();
  check('the guest of R1 is the new card', file.rooms.find((x) => x.room === R1)?.guest === gio2.pub, file.rooms);
  r.ws.close();
  const bruno2 = phone();
  r = await knock(PORT, bruno);
  m = await askFor(r.ws, { type: 'handover', to: bruno2.pub }, ['handed-over', 'handover-error']);
  check('a member hands the place over', m.type === 'handed-over' && m.rooms === 1 && m.owner === false, m);
  r.ws.close();
  file = list();
  check('the member\'s line and second seat are the new card\'s',
    file.devices.find((d) => d.name === 'bruno')?.pub === bruno2.pub
    && file.rooms.find((x) => x.room === R2)?.partnerPub === bruno2.pub, file);
  r = await knock(PORT, bruno2);
  check('and the new card is the member', r.answer.role === 'member' && r.answer.name === 'bruno', r.answer);
  r.ws.close();

  // --- What does not go -------------------------------------------------
  r = await knock(PORT_E, fixed);
  m = await askFor(r.ws, { type: 'handover-open', id: meeting() }, 'handover-error');
  check('a card written in the settings: the operator moves it', m.error === 'in-settings', m);
  m = await askFor(r.ws, { type: 'handover', to: phone().pub }, 'handover-error');
  check('nor does it hand its place over itself', m.error === 'in-settings', m);
  r.ws.close();

  const w = phone();
  r = await knock(PORT_W, w);
  check('another house, another owner', r.answer.role === 'owner', r.answer);
  const IDW = meeting();
  const expired = heard(r.ws, 'handover-closed', 4000);
  await askFor(r.ws, { type: 'handover-open', id: IDW }, 'handover-opened');
  check('nobody comes in time: the old phone is told', (await expired)?.why === 'expired');
  const late = await knock(PORT_W, phone());
  m = await askFor(late.ws, { type: 'handover-join', id: IDW }, 'handover-error');
  check('and the code is worth nothing', m.error === 'unknown', m);
  late.ws.close();
  const IDW2 = meeting();
  await askFor(r.ws, { type: 'handover-open', id: IDW2 }, 'handover-opened');
  const other = await knock(PORT_W, phone());
  await askFor(other.ws, { type: 'handover-join', id: IDW2 }, 'handover-joined');
  const tooMuch = heard(other.ws, 'handover-closed');
  for (let i = 0; i < 70; i += 1) r.ws.send(JSON.stringify({ type: 'handover-msg', payload: 'x' }));
  check('too many envelopes: the meeting ends', (await tooMuch)?.why === 'too-much');
  const IDW3 = meeting();
  await askFor(r.ws, { type: 'handover-open', id: IDW3 }, 'handover-opened');
  const replaced = heard(r.ws, 'handover-closed');
  await askFor(r.ws, { type: 'handover-open', id: meeting() }, 'handover-opened');
  check('a new code puts the one before out', (await replaced)?.why === 'replaced');
  r.ws.close();
  other.ws.close();
  for (const s of [n1, g1b, a2, b2]) s.ws.close();
} finally {
  srv.kill(); srvE.kill(); srvW.kill();
  for (const f of [FILE, FILE_E, FILE_W, ADMIN, ADMIN_LOG]) { try { unlinkSync(f); } catch { /* noop */ } }
}
console.log(failed ? `\n${failed} FAILED` : '\nALL OK');
process.exit(failed ? 1 : 0);
