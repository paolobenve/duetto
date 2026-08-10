// Smoke test del signaling: avvia il server, connette due client,
// verifica pairing, limite a 3, token e inoltro dei payload.
import { spawn } from 'node:child_process';
import { WebSocket } from 'ws';

const PORT = 8799;
const TOKEN = 'test-token';
const URL = `ws://127.0.0.1:${PORT}`;

const srv = spawn('node', ['src/index.js'], {
  env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', ACCESS_TOKEN: TOKEN },
  stdio: ['ignore', 'ignore', 'inherit'],
});

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const next = (ws) => new Promise((res) => ws.once('message', (d) => res(JSON.parse(d.toString()))));

let failures = 0;
const check = (cond, name) => {
  console.log(`${cond ? 'OK  ' : 'FAIL'}  ${name}`);
  if (!cond) failures++;
};

try {
  await wait(400);

  // A entra: deve essere in attesa (initiator false)
  const a = new WebSocket(URL);
  await new Promise((r) => a.once('open', r));
  a.send(JSON.stringify({ type: 'join', room: 'r1', token: TOKEN }));
  const aJoined = await next(a);
  check(aJoined.type === 'joined' && aJoined.initiator === false, 'A joined, non initiator');

  // B entra: deve essere initiator
  const b = new WebSocket(URL);
  await new Promise((r) => b.once('open', r));
  b.send(JSON.stringify({ type: 'join', room: 'r1', token: TOKEN }));
  const bJoined = await next(b);
  check(bJoined.type === 'joined' && bJoined.initiator === true, 'B joined, initiator');

  // A deve ricevere peer-joined
  const aPeer = await next(a);
  check(aPeer.type === 'peer-joined', 'A notificato del peer');

  // B invia un payload "cifrato" opaco -> A lo riceve identico
  const payload = 'BUSTA_OPACA_BASE64==';
  b.send(JSON.stringify({ type: 'signal', payload }));
  const aSignal = await next(a);
  check(aSignal.type === 'signal' && aSignal.payload === payload, 'inoltro payload integro');

  // Terzo client: room-full
  const c = new WebSocket(URL);
  await new Promise((r) => c.once('open', r));
  c.send(JSON.stringify({ type: 'join', room: 'r1', token: TOKEN }));
  const cRes = await next(c);
  check(cRes.type === 'error' && cRes.error === 'room-full', 'terzo rifiutato (room-full)');

  // Token errato
  const d = new WebSocket(URL);
  await new Promise((r) => d.once('open', r));
  d.send(JSON.stringify({ type: 'join', room: 'r2', token: 'sbagliato' }));
  const dRes = await next(d);
  check(dRes.type === 'error' && dRes.error === 'bad-token', 'token errato rifiutato');

  a.close(); b.close(); c.close(); d.close();
} catch (e) {
  console.error('Errore nel test:', e);
  failures++;
} finally {
  srv.kill('SIGTERM');
  await wait(200);
  console.log(failures === 0 ? '\nTUTTO OK' : `\n${failures} FALLIMENTI`);
  process.exit(failures === 0 ? 0 : 1);
}
