// Smoke test del signaling.
// Verifica presenza, stati listening/active, notifiche, inoltro delle
// buste cifrate, scambio di accoppiamento, "avvisa" e limite a due.
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

/** Client con coda di messaggi, per aspettare un tipo specifico. */
function client() {
  const ws = new WebSocket(URL);
  const queue = [];
  const waiters = [];
  ws.on('message', (d) => {
    const msg = JSON.parse(d.toString());
    const i = waiters.findIndex((x) => x.type === msg.type);
    if (i !== -1) waiters.splice(i, 1)[0].resolve(msg);
    else queue.push(msg);
  });
  return {
    open: () => new Promise((r) => ws.once('open', r)),
    send: (o) => ws.send(JSON.stringify(o)),
    expect(type) {
      const i = queue.findIndex((m) => m.type === type);
      if (i !== -1) return Promise.resolve(queue.splice(i, 1)[0]);
      return new Promise((resolve, reject) => {
        waiters.push({ type, resolve });
        setTimeout(() => reject(new Error(`timeout su "${type}"`)), 3000);
      });
    },
    /** vero se NON arriva nessun messaggio di quel tipo entro ms */
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

  // --- A si collega solo in ascolto ------------------------------------
  const a = client();
  await a.open();
  a.send({ type: 'join', room: 'coppia1', token: TOKEN, name: 'Anna', mode: 'listening' });
  const aJoined = await a.expect('joined');
  check(aJoined.polite === true, 'primo collegato: ruolo polite');
  check(aJoined.peerPresent === false, 'primo collegato: l’altro non c’e’');

  // --- B si collega, anche lui in ascolto -------------------------------
  const b = client();
  await b.open();
  b.send({ type: 'join', room: 'coppia1', token: TOKEN, name: 'Bruno', mode: 'listening' });
  const bJoined = await b.expect('joined');
  check(bJoined.polite === false, 'secondo collegato: ruolo impolite (ruoli distinti)');
  check(bJoined.peerPresent === true, 'secondo collegato: vede l’altro');
  check(bJoined.peerActive === false, 'secondo collegato: l’altro e’ solo in ascolto');

  const aPeer = await a.expect('peer-joined');
  check(aPeer.name === 'Bruno', 'A sa chi si e’ collegato');

  // Nessuna notifica se entrambi stanno solo in ascolto: sarebbe rumore.
  check(await a.expectNone('notify'), 'due in ascolto: nessuna notifica');

  // --- B entra nel canale ------------------------------------------------
  b.send({ type: 'mode', mode: 'active' });
  const aNotify = await a.expect('notify');
  check(aNotify.reason === 'peer-active', 'A avvisata che l’altro e’ entrato');
  check(aNotify.name === 'Bruno', 'la notifica porta il nome');

  // --- A entra a sua volta: ora nessuna notifica a B --------------------
  a.send({ type: 'mode', mode: 'active' });
  const bMode = await b.expect('peer-mode');
  check(bMode.mode === 'active', 'B vede che anche A e’ entrata');
  check(await b.expectNone('notify'), 'chi e’ gia’ nel canale non viene notificato');

  // --- inoltro busta cifrata --------------------------------------------
  const payload = 'BUSTA_OPACA_BASE64==';
  b.send({ type: 'signal', payload });
  const aSignal = await a.expect('signal');
  check(aSignal.payload === payload, 'busta di signaling inoltrata integra');

  // --- inoltro accoppiamento ---------------------------------------------
  b.send({ type: 'pair', payload: { kind: 'pubkey', pub: 'CHIAVE_PUBBLICA' } });
  const aPair = await a.expect('pair');
  check(aPair.payload?.pub === 'CHIAVE_PUBBLICA', 'scambio di accoppiamento inoltrato');

  // --- avvisa -------------------------------------------------------------
  a.send({ type: 'knock' });
  const knock = await a.expect('knock-result');
  check(knock.ok === true, 'avviso accettato');
  const bNotify = await b.expect('notify');
  check(bNotify.reason === 'knock' && bNotify.name === 'Anna', 'B riceve l’avviso');

  a.send({ type: 'knock' });
  const knock2 = await a.expect('knock-result');
  check(knock2.ok === false && knock2.error === 'too-soon', 'secondo avviso subito: bloccato');

  // --- uscita -------------------------------------------------------------
  b.close();
  const left = await a.expect('peer-left');
  check(left.type === 'peer-left', 'A avvisata della disconnessione');

  // --- avvisare quando l'altro e' offline ---------------------------------
  await wait(100);
  const c0 = client();
  await c0.open();
  c0.send({ type: 'join', room: 'sola', token: TOKEN, name: 'Carla', mode: 'active' });
  await c0.expect('joined');
  c0.send({ type: 'knock' });
  const k3 = await c0.expect('knock-result');
  check(k3.ok === false && k3.error === 'peer-offline', 'avviso a un assente: segnalato');

  // --- terzo dispositivo --------------------------------------------------
  const d = client();
  await d.open();
  d.send({ type: 'join', room: 'coppia1', token: TOKEN, name: 'X', mode: 'listening' });
  await d.expect('joined');
  const e = client();
  await e.open();
  e.send({ type: 'join', room: 'coppia1', token: TOKEN, name: 'Y', mode: 'listening' });
  const eRes = await e.expect('error');
  check(eRes.error === 'room-full', 'il terzo dispositivo viene rifiutato');

  // --- coppie indipendenti -------------------------------------------------
  const f = client();
  await f.open();
  f.send({ type: 'join', room: 'coppia2', token: TOKEN, name: 'Z', mode: 'listening' });
  const fRes = await f.expect('joined');
  check(fRes.peerPresent === false, 'un’altra coppia non vede la prima');

  // --- token errato --------------------------------------------------------
  const g = client();
  await g.open();
  g.send({ type: 'join', room: 'coppia3', token: 'sbagliato', name: 'W' });
  const gRes = await g.expect('error');
  check(gRes.error === 'bad-token', 'token errato rifiutato');

  a.close(); c0.close(); d.close(); e.close(); f.close(); g.close();
} catch (err) {
  console.error('Errore nel test:', err.message);
  failures++;
} finally {
  srv.kill('SIGTERM');
  await wait(200);
  console.log(failures === 0 ? '\nTUTTO OK' : `\n${failures} FALLIMENTI`);
  process.exit(failures === 0 ? 0 : 1);
}
