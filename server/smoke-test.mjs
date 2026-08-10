// Smoke test del signaling "a canale".
// Avvia un finto server ntfy per catturare le notifiche, avvia il
// signaling, e verifica presenza, ruoli, inoltro cifrato e campanello.
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { WebSocket } from 'ws';

const PORT = 8799;
const NTFY_PORT = 8798;
const TOKEN = 'test-token';
const URL = `ws://127.0.0.1:${PORT}`;

// --- finto server ntfy -------------------------------------------------------
const pushes = [];
const ntfy = createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    try { pushes.push(JSON.parse(body)); } catch { /* noop */ }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end('{"id":"fake"}');
  });
});
await new Promise((r) => ntfy.listen(NTFY_PORT, '127.0.0.1', r));

// --- signaling ---------------------------------------------------------------
const srv = spawn('node', ['src/index.js'], {
  env: {
    ...process.env,
    PORT: String(PORT),
    HOST: '127.0.0.1',
    ACCESS_TOKEN: TOKEN,
    NTFY_URL: `http://127.0.0.1:${NTFY_PORT}`,
  },
  stdio: ['ignore', 'ignore', 'inherit'],
});

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** Client con coda di messaggi, per aspettare un tipo specifico. */
function client() {
  const ws = new WebSocket(URL);
  const queue = [];
  const waiters = [];
  ws.on('message', (d) => {
    const msg = JSON.parse(d.toString());
    const w = waiters.findIndex((x) => x.type === msg.type);
    if (w !== -1) waiters.splice(w, 1)[0].resolve(msg);
    else queue.push(msg);
  });
  return {
    ws,
    open: () => new Promise((r) => ws.once('open', r)),
    send: (o) => ws.send(JSON.stringify(o)),
    /** aspetta il primo messaggio di un dato tipo (max 3s) */
    expect(type) {
      const i = queue.findIndex((m) => m.type === type);
      if (i !== -1) return Promise.resolve(queue.splice(i, 1)[0]);
      return new Promise((resolve, reject) => {
        waiters.push({ type, resolve });
        setTimeout(() => reject(new Error(`timeout su "${type}"`)), 3000);
      });
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

  // --- A entra da solo -------------------------------------------------------
  const a = client();
  await a.open();
  a.send({ type: 'join', room: 'casa', token: TOKEN, peerTopic: 'topic-di-B', name: 'Anna' });
  const aJoined = await a.expect('joined');
  check(aJoined.polite === true, 'primo entrato: ruolo polite');
  check(aJoined.peers === 0, 'primo entrato: canale vuoto');

  await wait(300);
  check(pushes.length === 1, 'entrando da solo parte 1 notifica');
  check(pushes[0]?.topic === 'topic-di-B', 'notifica inviata al topic dell’altro');
  check(/Anna/.test(pushes[0]?.message ?? ''), 'notifica contiene il nome');
  check(
    pushes[0]?.click === 'duotalk://channel',
    'notifica porta il deep link per aprire l’app',
  );

  // --- B entra ---------------------------------------------------------------
  const b = client();
  await b.open();
  b.send({ type: 'join', room: 'casa', token: TOKEN, peerTopic: 'topic-di-A', name: 'Bruno' });
  const bJoined = await b.expect('joined');
  check(bJoined.polite === false, 'secondo entrato: ruolo impolite (ruoli distinti)');
  check(bJoined.peers === 1, 'secondo entrato: vede l’altro presente');

  const aPeer = await a.expect('peer-joined');
  check(aPeer.name === 'Bruno', 'A viene avvisata in-app, col nome');

  await wait(300);
  check(pushes.length === 1, 'nessuna notifica se l’altro e’ gia’ nel canale');

  // --- inoltro della busta cifrata ------------------------------------------
  const payload = 'BUSTA_OPACA_BASE64==';
  b.send({ type: 'signal', payload });
  const aSignal = await a.expect('signal');
  check(aSignal.payload === payload, 'busta inoltrata integra');

  // --- bussa -----------------------------------------------------------------
  b.send({ type: 'knock' });
  const knock = await b.expect('knock-result');
  check(knock.ok === true, 'bussata accettata');
  await wait(200);
  check(pushes.length === 2, 'la bussata genera una notifica');
  check(pushes[1]?.topic === 'topic-di-A', 'bussata inviata al topic giusto');
  check(pushes[1]?.priority === 5, 'bussata a priorita’ massima');

  // --- anti-martellamento ----------------------------------------------------
  b.send({ type: 'knock' });
  const knock2 = await b.expect('knock-result');
  check(knock2.ok === false && knock2.error === 'too-soon', 'seconda bussata subito: bloccata');

  // --- uscita ----------------------------------------------------------------
  b.close();
  const left = await a.expect('peer-left');
  check(left.type === 'peer-left', 'A viene avvisata dell’uscita');

  // --- terzo dispositivo -----------------------------------------------------
  const c = client();
  await c.open();
  c.send({ type: 'join', room: 'casa', token: TOKEN });
  await wait(100);
  const d = client();
  await d.open();
  d.send({ type: 'join', room: 'casa', token: TOKEN });
  const e = client();
  await e.open();
  e.send({ type: 'join', room: 'casa', token: TOKEN });
  const eRes = await e.expect('error');
  check(eRes.error === 'room-full', 'il terzo dispositivo viene rifiutato');

  // --- token errato ----------------------------------------------------------
  const f = client();
  await f.open();
  f.send({ type: 'join', room: 'altro', token: 'sbagliato' });
  const fRes = await f.expect('error');
  check(fRes.error === 'bad-token', 'token errato rifiutato');

  a.close(); c.close(); d.close(); e.close(); f.close();
} catch (err) {
  console.error('Errore nel test:', err.message);
  failures++;
} finally {
  srv.kill('SIGTERM');
  ntfy.close();
  await wait(200);
  console.log(failures === 0 ? '\nTUTTO OK' : `\n${failures} FALLIMENTI`);
  process.exit(failures === 0 ? 0 : 1);
}
