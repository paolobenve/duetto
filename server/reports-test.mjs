/*
 * Duetto - a permanent voice and video channel for two people.
 * Copyright (C) 2026 Paolo Benvenuto
 *
 * Free software under the GNU General Public License, version 3 or any
 * later version, and with no warranty of any kind. The full text is in
 * the LICENSE file at the root of the project, and at
 * <https://www.gnu.org/licenses/>.
 */
// What the server writes on GitLab in the project's name: the
// invitation note, the owner's alone and for an invitation of this
// house; the reports, a few at a time and a few files each. GitLab is
// a small server of our own here, which writes down every call.
// Run from this directory: `npm run test:reports`.
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { WebSocket } from 'ws';
import { generateKeyPairSync, sign } from 'node:crypto';
import { tmpdir } from 'node:os';
import { unlinkSync } from 'node:fs';

const PORT = 8795;
const GITLAB_PORT = 8796;
const FILE = `${tmpdir()}/duetto-reports-${process.pid}.json`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- GitLab, as far as the server uses it --------------------------------
const issues = [
  { iid: 1, title: 'Beta tester: Mario', web_url: 'http://gitlab.test/1' },
  { iid: 2, title: 'Security: a hole', web_url: 'http://gitlab.test/2' },
];
/** @type {{ method: string, path: string, body: string }[]} */
let calls = [];
const gitlab = createServer((req, res) => {
  let body = '';
  req.on('data', (d) => { body += d; });
  req.on('end', () => {
    const url = new URL(req.url, 'http://gitlab.test');
    const path = url.pathname.replace(/^\/api\/v4\/projects\/[^/]+/, '');
    calls.push({ method: req.method, path, body });
    let answer = {};
    if (req.method === 'GET' && path === '/issues') {
      const said = (url.searchParams.get('search') || '').toLowerCase();
      answer = issues.filter((i) => i.title.toLowerCase().includes(said));
    } else if (path === '/uploads') {
      answer = { markdown: '[journal](/uploads/x/journal.csv)' };
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(answer));
  });
});
await new Promise((r) => gitlab.listen(GITLAB_PORT, '127.0.0.1', r));
const notes = () => calls.filter((c) => c.method === 'POST' && c.path.endsWith('/notes'));
const opened = () => calls.filter((c) => c.method === 'PUT');
const uploads = () => calls.filter((c) => c.path === '/uploads');
/** The calls, short: what a failure prints. */
const seen = (list = calls) => list.map((c) => `${c.method} ${c.path}`);

// --- the server, and phones that talk to it ------------------------------
const srv = spawn('node', ['src/index.js'], {
  env: {
    ...process.env, PORT: String(PORT), HOST: '127.0.0.1', DEVICES_FILE: FILE,
    AUTHORISED_KEYS: '', SERVER_KEY: '', TURN_URL: '', RELEASES_PROJECT: 'off',
    GITLAB_URL: `http://127.0.0.1:${GITLAB_PORT}`, GITLAB_TOKEN: 'not-a-token', GITLAB_PROJECT: 'p/duetto',
  },
  stdio: ['ignore', 'ignore', 'inherit'],
});

function phone() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const pub = publicKey.export({ format: 'der', type: 'spki' }).subarray(12);
  return {
    pub: pub.toString('base64'),
    signs: (nonce) => sign(null, Buffer.from(nonce, 'base64'), privateKey).toString('base64'),
  };
}

/** A phone's connection: it says `first` once greeted, then waits by type. */
function connect(ph, first) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}`);
    const queue = [];
    const waiters = [];
    const c = {
      send: (o) => ws.send(JSON.stringify(o)),
      expect: (type, ms = 3000) => {
        const i = queue.findIndex((m) => m.type === type);
        if (i !== -1) return Promise.resolve(queue.splice(i, 1)[0]);
        return new Promise((res) => {
          const w = { type, res };
          waiters.push(w);
          setTimeout(() => { const k = waiters.indexOf(w); if (k !== -1) { waiters.splice(k, 1); res(null); } }, ms);
        });
      },
      close: () => ws.close(),
    };
    ws.on('message', (d) => {
      const m = JSON.parse(d.toString());
      if (m.type === 'hello') {
        ws.send(JSON.stringify({ ...first, pub: ph.pub, sig: ph.signs(m.nonce) }));
        resolve(c);
        return;
      }
      const i = waiters.findIndex((w) => w.type === m.type);
      if (i !== -1) waiters.splice(i, 1)[0].res(m);
      else queue.push(m);
    });
    ws.on('error', reject);
  });
}
async function inRoom(ph, room, extra = {}) {
  const c = await connect(ph, { type: 'join', room, name: 'tester', mode: 'listening', ...extra });
  const joined = await c.expect('joined');
  if (!joined) throw new Error(`not joined in ${room}`);
  return c;
}

let failed = 0;
const check = (label, ok, detail) => {
  console.log(`${ok ? 'OK ' : 'FAIL'} ${label}${ok ? '' : ` -> ${JSON.stringify(detail)}`}`);
  if (!ok) failed++;
};

await sleep(700);
try {
  // The owner takes the house at the door, and invites from a room.
  const owner = phone();
  const door = await connect(owner, { type: 'door', name: 'owner' });
  check('the first phone takes the house', (await door.expect('door'))?.role === 'owner');
  door.close();
  const own = await inRoom(owner, 'owner-room');
  own.send({ type: 'invite', name: 'Mario' });
  const mario = await own.expect('invited');
  own.send({ type: 'invite', name: 'Bruno' });
  const bruno = await own.expect('invited');
  own.send({ type: 'invite', name: 'Security' });
  const security = await own.expect('invited');

  // A member: in by an invitation, in a room of their own.
  const member = phone();
  const mem = await inRoom(member, 'member-room', { invite: bruno.code });
  const linkOf = (code) => `https://duetto.test/duetto/i/${code}`;

  // --- the invitation note ---
  calls = [];
  mem.send({ type: 'invite-note', name: 'Mario', link: linkOf(mario.code), expires: '' });
  let answer = await mem.expect('invite-note-result');
  check('a member may not have an invitation written', answer?.ok === false && answer.error === 'not-yours', answer);
  check('and GitLab is not even asked', calls.length === 0, seen());

  own.send({ type: 'invite-note', name: 'Mario', link: 'https://elsewhere.test/anything', expires: '' });
  answer = await own.expect('invite-note-result');
  check('the owner, with a link that is no invitation: refused', answer?.ok === false && answer.error === 'bad-link', answer);
  own.send({ type: 'invite-note', name: 'Mario', link: linkOf('ZZZZ-ZZZZ'), expires: '' });
  answer = await own.expect('invite-note-result');
  check('the owner, with an invitation this house never made: refused', answer?.ok === false && answer.error === 'bad-link', answer);
  check('GitLab still not asked', calls.length === 0, seen());

  // The name in the message is not believed: the invitation's is.
  own.send({ type: 'invite-note', name: 'Security', link: linkOf(mario.code), expires: '' });
  answer = await own.expect('invite-note-result');
  check('the owner, with an invitation of this house: written', answer?.ok === true, answer);
  check('on the work item of the invitation\'s name, not the message\'s',
    notes().length === 1 && notes()[0].path === '/issues/1/notes' && notes()[0].body.includes(mario.code), seen(notes()));
  check('a beta tester\'s work item born shut is opened',
    opened().length === 1 && opened()[0].path === '/issues/1' && opened()[0].body.includes('"confidential":false'), seen(opened()));

  calls = [];
  own.send({ type: 'invite-note', name: 'Security', link: linkOf(security.code), expires: '' });
  answer = await own.expect('invite-note-result');
  check('an invitation whose name finds another work item: written there', answer?.ok === true
    && notes().length === 1 && notes()[0].path === '/issues/2/notes', { answer, notes: seen(notes()) });
  check('and that work item, not a beta tester\'s, is left as it is', opened().length === 0, seen(opened()));

  // --- the reports ---
  calls = [];
  mem.send({ type: 'report', part: 'begin', name: 'Mario', text: 'hello' });
  for (let i = 0; i < 30; i += 1) mem.send({ type: 'report', part: 'file', name: `piece-${i}.csv`, text: '' });
  mem.send({ type: 'report', part: 'end' });
  answer = await mem.expect('report-result');
  check('a report of thirty files, empty ones too: refused', answer?.ok === false && answer.error === 'too-big', answer);
  await sleep(200);
  check('and nothing goes up to GitLab', uploads().length === 0 && notes().length === 0, seen());

  // Four at once, the owner's from four rooms: the fifth waits.
  const open4 = [];
  for (let i = 0; i < 4; i += 1) {
    const c = await inRoom(owner, `owner-room-${i}`);
    c.send({ type: 'report', part: 'begin', name: 'Mario', text: `report ${i}` });
    open4.push(c);
  }
  await sleep(100);
  const fifth = await inRoom(owner, 'owner-room-5');
  fifth.send({ type: 'report', part: 'begin', name: 'Mario', text: 'one too many' });
  answer = await fifth.expect('report-result');
  check('a fifth report while four are coming in: busy', answer?.ok === false && answer.error === 'busy', answer);
  for (const c of open4) c.close();
  fifth.close();
  await sleep(100);

  // The member began one already (the refused one): five more, then no.
  let fine = 0;
  for (let i = 0; i < 5; i += 1) {
    mem.send({ type: 'report', part: 'begin', name: 'Mario', text: `report ${i}` });
    mem.send({ type: 'report', part: 'file', name: 'mine-2026-10-29.csv', text: 'a,b,c\n' });
    mem.send({ type: 'report', part: 'end' });
    if ((await mem.expect('report-result'))?.ok === true) fine += 1;
  }
  check('five reports more in the hour: all written', fine === 5, fine);
  mem.send({ type: 'report', part: 'begin', name: 'Mario', text: 'the seventh' });
  answer = await mem.expect('report-result');
  check('the seventh in the hour: too many', answer?.ok === false && answer.error === 'too-many', answer);
  mem.close(); own.close();
} catch (e) {
  console.log(`Error in the test: ${e.message}`);
  failed++;
} finally {
  srv.kill();
  gitlab.close();
  try { unlinkSync(FILE); } catch {}
}
console.log(failed ? `\n${failed} FAILED` : '\nALL OK');
process.exit(failed ? 1 : 0);
