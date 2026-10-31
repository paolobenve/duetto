import nacl from 'tweetnacl';
import { encodeBase64 } from 'tweetnacl-util';
import {
  Giving, Taking, parseQr, qrText, newSecret, meetingId, meetingKey, figuresOf, commitmentTo,
  bundleOf, fromBundle, serversOf, keepIncoming, readIncoming, dropIncoming, finishMoving,
  type GiveView, type TakeView, type Moving,
} from '../handover';
import { SignalCrypto } from '../crypto';
import { DEFAULT_CONFIG, type DuoConfig, type PairInfo } from '../config';
import type { DoorLine } from '../door';

const card = () => encodeBase64(nacl.sign.keyPair().publicKey);
const key = () => encodeBase64(nacl.randomBytes(32));
const SERVER = 'wss://example.org/duetto/ws';

function pair(id: string, extra: Partial<PairInfo> = {}): PairInfo {
  return { id, key: key(), side: 'A', peerName: id, pairedAt: '2026-10-01T00:00:00Z', serverUrl: SERVER, ...extra };
}

/** An old phone's configuration: two pairs, a code waiting, its own phone's things. */
function oldConfig(): DuoConfig {
  const p1 = pair('room-1', { settings: { ...(DEFAULT_CONFIG as any), alertSound: 'chosen', alertSoundUri: 'content://x', alertPicked: 'chosen' } });
  return {
    ...DEFAULT_CONFIG,
    serverUrl: SERVER,
    serverRole: 'owner',
    displayName: 'Anna',
    pair: p1,
    pairs: [p1, pair('room-2', { side: 'B' })],
    pending: [{ code: '12345678', id: 'room-3', pub: 'p', sec: 's', serverUrl: SERVER, until: '2099-01-01T00:00:00Z' }],
    setupShown: true,
    knobWorks: 'yes',
    btDevices: { aa: { name: 'Cuffie' } },
    alertSound: 'chosen',
    alertSoundUri: 'content://media/1',
    alertSoundName: 'Mia',
    invitation: 'ABCD-2345',
    handingOver: { to: 'x', servers: [] },
  };
}

/**
 * A server in a few lines: who sits there, the meetings, the words
 * passed between the two - as src/index.js does it, and nothing else.
 */
function fakeServer() {
  const sitting = new Map<string, 'owner' | 'member' | 'guest'>();
  type Line = DoorLine & { card: string; hear: (m: any) => void };
  const meetings = new Map<string, { old: Line; neu: Line | null }>();
  const endOf = (line: Line, why: string) => {
    for (const [id, m] of meetings) {
      if (m.old !== line && m.neu !== line) continue;
      meetings.delete(id);
      for (const l of [m.old, m.neu]) if (l && l !== line) l.hear({ type: 'handover-closed', why });
    }
  };
  function handle(line: Line, obj: any) {
    if (obj.type === 'handover-open') {
      if (!sitting.has(line.card)) { line.hear({ type: 'handover-error', error: 'no-place' }); return; }
      meetings.set(obj.id, { old: line, neu: null });
      line.hear({ type: 'handover-opened', until: Date.now() + 300_000 });
    } else if (obj.type === 'handover-close') {
      endOf(line, 'closed');
    } else if (obj.type === 'handover-join') {
      const m = meetings.get(obj.id);
      if (sitting.has(line.card)) line.hear({ type: 'handover-error', error: 'has-place' });
      else if (!m) line.hear({ type: 'handover-error', error: 'unknown' });
      else if (m.neu) line.hear({ type: 'handover-error', error: 'taken' });
      else { m.neu = line; m.old.hear({ type: 'handover-arrived' }); line.hear({ type: 'handover-joined' }); }
    } else if (obj.type === 'handover-msg') {
      for (const m of meetings.values()) {
        if (m.old === line && m.neu) m.neu.hear(obj);
        else if (m.neu === line) m.old.hear(obj);
      }
    } else if (obj.type === 'handover') {
      const role = sitting.get(line.card);
      if (!role) { line.hear({ type: 'handover-error', error: 'not-yours' }); return; }
      if (sitting.has(obj.to)) { line.hear({ type: 'handover-error', error: 'has-place' }); return; }
      sitting.delete(line.card);
      sitting.set(obj.to, role);
      line.card = '';
      line.hear({ type: 'handed-over', rooms: 1, owner: role === 'owner' });
      for (const m of meetings.values()) {
        if (m.old === line && m.neu && m.neu.card === obj.to) m.neu.hear({ type: 'handover-done' });
      }
    }
  }
  const opener = (who: string) => async (): Promise<DoorLine> => {
    const ears = new Set<(m: any) => void>();
    let open = true;
    const line: Line = {
      card: who,
      role: sitting.get(who) ?? 'stranger',
      listen: (fn) => { ears.add(fn); return () => { ears.delete(fn); }; },
      onGone: () => { /* the fake one never drops */ },
      // Words arrive later than they are said, as on a network.
      hear: (m) => { setTimeout(() => { if (open) for (const fn of [...ears]) fn(m); }, 0); },
      close: () => { if (!open) return; open = false; endOf(line, 'gone'); },
      send: (obj) => { if (open) handle(line, obj); },
    };
    return line;
  };
  return { sitting, opener, meetings };
}

const tick = () => new Promise((r) => setTimeout(r, 0));
async function until(ok: () => boolean, what: string) {
  for (let i = 0; i < 400; i += 1) {
    if (ok()) return;
    await tick();
  }
  throw new Error(`never: ${what}`);
}
const last = <T extends { step: string }>(views: T[]) => views[views.length - 1];

describe('the QR code', () => {
  test('carries the server and the secret, and gives them back', () => {
    const secret = newSecret();
    expect(secret).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(parseQr(qrText(SERVER, secret))).toEqual({ serverUrl: SERVER, secret });
    const own = 'ws://example.org:8787/custom';
    expect(parseQr(qrText(own, secret))).toEqual({ serverUrl: own, secret });
  });

  test('is not a link, and nothing else is one of these', () => {
    const text = qrText(SERVER, newSecret());
    expect(text.startsWith('duetto-handover:')).toBe(true);
    expect(parseQr('https://example.org/duetto/p/12345678')).toBeNull();
    expect(parseQr('duetto://example.org/pair/12345678')).toBeNull();
    expect(parseQr(`duetto-handover:1/short/${SERVER}`)).toBeNull();
    expect(parseQr('')).toBeNull();
  });

  test('the server knows the meeting by a fingerprint, the key is the phones\'', () => {
    const a = newSecret();
    const b = newSecret();
    expect(meetingId(a)).toMatch(/^[0-9a-f]{64}$/);
    expect(meetingId(a)).toBe(meetingId(a));
    expect(meetingId(a)).not.toBe(meetingId(b));
    expect(meetingKey(a)).toHaveLength(32);
    expect(encodeBase64(meetingKey(a))).not.toBe(encodeBase64(meetingKey(b)));
  });
});

describe('the six figures', () => {
  test('six of them, and any share changes them', () => {
    const [s, o, n, so, sn] = [newSecret(), card(), card(), key(), key()];
    const f = figuresOf(s, o, n, so, sn);
    expect(f).toMatch(/^\d{6}$/);
    expect(figuresOf(s, o, n, so, sn)).toBe(f);
    const others = [figuresOf(s, o, card(), so, sn), figuresOf(s, o, n, key(), sn), figuresOf(s, o, n, so, key())];
    expect(others.filter((x) => x === f).length).toBeLessThan(2);
  });
});

describe('what passes', () => {
  test('everything of the person\'s, nothing of the phone\'s', () => {
    const b = bundleOf(oldConfig());
    expect(b.pairs.map((p) => p.id)).toEqual(['room-1', 'room-2']);
    expect(b.pairs.every((x) => x.key.length === 44)).toBe(true);
    expect(b.pending?.[0]?.id).toBe('room-3');
    expect(b.displayName).toBe('Anna');
    expect(b.setupShown).toBe(false);
    expect(b.knobWorks).toBe('unknown');
    expect(b.btDevices).toEqual({});
    expect(b.alertSound).toBe('default');
    expect(b.alertSoundUri).toBe('');
    expect(b.pairs[0].settings?.alertSound).toBe('default');
    expect(b.pairs[0].settings?.alertPicked).toBe('');
    expect(b.invitation).toBe('');
    expect(b.serverKey).toBe('');
    expect(b.handingOver).toBeUndefined();
  });

  test('the new phone checks what came', () => {
    expect(fromBundle(null)).toBeNull();
    expect(fromBundle([])).toBeNull();
    expect(fromBundle({ pairs: 'no', serverUrl: SERVER })).toBeNull();
    const sent = { ...bundleOf(oldConfig()), setupShown: true, pairs: [pair('good'), { id: 'bad', key: 'short', side: 'A' }, { id: 'x', key: key() }] };
    const got = fromBundle(sent)!;
    expect(got.pairs.map((p) => p.id)).toEqual(['good']);
    expect(got.setupShown).toBe(false);
  });

  test('every server the phone has something on, once', () => {
    const cfg = oldConfig();
    cfg.pairs.push(pair('elsewhere', { serverUrl: 'other.org' }));
    expect(serversOf(cfg)).toEqual([SERVER, 'wss://other.org/duetto/ws']);
  });
});

describe('the hand-over, from one phone to the other', () => {
  function phones(srv: ReturnType<typeof fakeServer>, oldCard: string, newCard: string, cfg = oldConfig()) {
    const giveViews: GiveView[] = [];
    const takeViews: TakeView[] = [];
    const moves: Moving[] = [];
    const kept: DuoConfig[] = [];
    let quieted = 0;
    const giving = new Giving({
      cfg: () => cfg,
      myPub: oldCard,
      open: srv.opener(oldCard),
      view: (v) => giveViews.push(v),
      quiet: async () => { quieted += 1; },
      moving: async (m) => { moves.push(m); },
    });
    const qr = () => parseQr((giveViews.find((v) => v.step === 'code') as any).qr)!;
    const taking = () => new Taking({
      qr: qr(),
      myPub: newCard,
      model: 'Nuovo 1',
      open: srv.opener(newCard),
      view: (v) => takeViews.push(v),
      keep: async (c) => { kept.push(c); },
      drop: async () => { kept.length = 0; },
    });
    return { giving, taking, giveViews, takeViews, moves, kept, quieted: () => quieted, qr };
  }

  test('the same figures on both, then everything across, then the place', async () => {
    const srv = fakeServer();
    const oldCard = card();
    const newCard = card();
    srv.sitting.set(oldCard, 'owner');
    const p = phones(srv, oldCard, newCard);
    await p.giving.start();
    await until(() => last(p.giveViews)?.step === 'code', 'a code');
    const t = p.taking();
    await t.start();
    await until(() => last(p.giveViews)?.step === 'compare' && last(p.takeViews)?.step === 'compare', 'the figures');
    const shownOld = last(p.giveViews) as any;
    const shownNew = last(p.takeViews) as any;
    expect(shownOld.figures).toMatch(/^\d{6}$/);
    expect(shownOld.figures).toBe(shownNew.figures);
    expect(shownOld.model).toBe('Nuovo 1');
    expect(p.kept).toHaveLength(0);

    await p.giving.confirm();
    await until(() => last(p.giveViews)?.step === 'done' && last(p.takeViews)?.step === 'done', 'both done');
    expect(p.quieted()).toBe(1);
    expect(p.kept[0].pairs.map((x) => x.id)).toEqual(['room-1', 'room-2']);
    expect((last(p.takeViews) as any).cfg.pairs).toHaveLength(2);
    expect(srv.sitting.get(newCard)).toBe('owner');
    expect(srv.sitting.has(oldCard)).toBe(false);
    expect(p.moves[0]).toEqual({ to: newCard, servers: [SERVER] });
    expect(p.moves[p.moves.length - 1]).toEqual({ to: newCard, servers: [] });
    expect(p.giving.moved).toBe(true);
  });

  test('a photo of the code, used first: the real new phone finds it taken, and nothing goes', async () => {
    const srv = fakeServer();
    const oldCard = card();
    srv.sitting.set(oldCard, 'member');
    const p = phones(srv, oldCard, card());
    await p.giving.start();
    await until(() => last(p.giveViews)?.step === 'code', 'a code');
    const intruder = new Taking({
      qr: p.qr(), myPub: card(), model: 'x', open: srv.opener(card()),
      view: () => { /* noop */ }, keep: async () => { /* noop */ }, drop: async () => { /* noop */ },
    });
    await intruder.start();
    await until(() => last(p.giveViews)?.step === 'compare', 'the intruder\'s figures');
    const t = p.taking();
    await t.start();
    await until(() => last(p.takeViews)?.step === 'failed', 'refused');
    expect((last(p.takeViews) as any).why).toBe('taken');
    // The person sees no figures on the phone in hand, and says no.
    p.giving.cancel();
    await tick();
    expect(srv.sitting.get(oldCard)).toBe('member');
  });

  test('a share that is not the one promised: the old phone stops', async () => {
    const srv = fakeServer();
    const oldCard = card();
    srv.sitting.set(oldCard, 'owner');
    const p = phones(srv, oldCard, card());
    await p.giving.start();
    await until(() => last(p.giveViews)?.step === 'code', 'a code');
    const { secret } = p.qr();
    const box = new SignalCrypto(meetingKey(secret));
    const line = await srv.opener(card())();
    const heard: any[] = [];
    line.listen((m) => heard.push(m));
    line.send({ type: 'handover-join', id: meetingId(secret) });
    await until(() => heard.some((m) => m.type === 'handover-joined'), 'joined');
    line.send({ type: 'handover-msg', payload: box.seal({ by: 'new', t: 'hello', pub: card(), commit: commitmentTo('one') }) });
    await until(() => heard.some((m) => m.type === 'handover-msg'), 'the share');
    line.send({ type: 'handover-msg', payload: box.seal({ by: 'new', t: 'reveal', share: 'another' }) });
    await until(() => last(p.giveViews)?.step === 'failed', 'stopped');
    expect((last(p.giveViews) as any).why).toBe('mismatch');
  });

  test('the old phone says no: the new one lets go of nothing it has not got', async () => {
    const srv = fakeServer();
    const oldCard = card();
    srv.sitting.set(oldCard, 'guest');
    const p = phones(srv, oldCard, card());
    await p.giving.start();
    await until(() => last(p.giveViews)?.step === 'code', 'a code');
    await p.taking().start();
    await until(() => last(p.takeViews)?.step === 'compare', 'the figures');
    p.giving.cancel();
    await until(() => last(p.takeViews)?.step === 'failed', 'told');
    expect((last(p.takeViews) as any).why).toBe('cancelled');
    expect(p.kept).toHaveLength(0);
  });

  test('a new phone that sits there already, and an old one that sits nowhere', async () => {
    const srv = fakeServer();
    const oldCard = card();
    const busy = card();
    srv.sitting.set(oldCard, 'owner');
    srv.sitting.set(busy, 'member');
    const p = phones(srv, oldCard, busy);
    await p.giving.start();
    await until(() => last(p.giveViews)?.step === 'code', 'a code');
    await p.taking().start();
    await until(() => last(p.takeViews)?.step === 'failed', 'refused');
    expect((last(p.takeViews) as any).why).toBe('has-place');

    const nobody = phones(fakeServer(), card(), card());
    await nobody.giving.start();
    await until(() => last(nobody.giveViews)?.step === 'failed', 'nothing to give');
    expect((last(nobody.giveViews) as any).why).toBe('no-place');
  });

  test('the moving finished after a stop, and again without harm', async () => {
    const srv = fakeServer();
    const oldCard = card();
    const newCard = card();
    srv.sitting.set(oldCard, 'member');
    const moves: Moving[] = [];
    const o = { open: srv.opener(oldCard), moving: async (m: Moving) => { moves.push(m); }, view: () => { /* noop */ } };
    expect(await finishMoving({ to: newCard, servers: [SERVER] }, o)).toBe(true);
    expect(srv.sitting.get(newCard)).toBe('member');
    expect(moves[moves.length - 1]).toEqual({ to: newCard, servers: [] });
    expect(await finishMoving({ to: newCard, servers: [SERVER] }, o)).toBe(true);
  });
});

describe('what came, kept aside', () => {
  test('kept, read back, and gone after a day', async () => {
    const cfg = fromBundle(bundleOf(oldConfig()))!;
    await keepIncoming(cfg, SERVER);
    const got = await readIncoming();
    expect(got?.serverUrl).toBe(SERVER);
    expect(got?.cfg.pairs).toHaveLength(2);
    const realNow = Date.now;
    Date.now = () => realNow() + 2 * 86400_000;
    try {
      expect(await readIncoming()).toBeNull();
    } finally {
      Date.now = realNow;
    }
    expect(await readIncoming()).toBeNull();
    await dropIncoming();
  });
});
