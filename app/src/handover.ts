/*
 * Duetto - a permanent voice and video channel for two people.
 * Copyright (C) 2026 Paolo Benvenuto
 *
 * Free software under the GNU General Public License, version 3 or any
 * later version, and with no warranty of any kind. The full text is in
 * the LICENSE file at the root of the project, and at
 * <https://www.gnu.org/licenses/>.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import nacl from 'tweetnacl';
import { decodeUTF8, encodeBase64, decodeBase64 } from 'tweetnacl-util';
import { SignalCrypto } from './crypto';
import {
  DEFAULT_CONFIG, type DuoConfig, type PairInfo, type ServerRole,
  displayServer, normalizeServerUrl, storeSettingsInPair, withoutServerKeys,
} from './config';
import type { DoorLine } from './door';

/**
 * Changing phone, without losing the pairs.
 *
 * A new phone was a new card, and the server knew it from nobody: the
 * owner came home with the key and broke the pairs of the card it
 * replaced, anybody else needed a new invitation, and the pairs were
 * made again one by one, with the other person at hand. The pairs are
 * the two phones' secret - the server never sees them - so only the old
 * phone can give them, and it gives them to the new one:
 *
 *  1. the old phone shows a QR code: a server and a secret;
 *  2. the new one reads it, and the two meet at that server's door, in
 *     envelopes sealed with a key made of the secret - the server knows
 *     the meeting by a fingerprint of it, and never has the secret;
 *  3. both show the same six figures, and the person says so on the
 *     old phone;
 *  4. the old phone sends what it has - the pairs, the codes waiting,
 *     the settings - and the new one keeps it, not yet in use;
 *  5. at every server where it sits, the old card gives its place to
 *     the new card; the new phone starts, and the old one empties
 *     itself.
 *
 * The six figures keep out whoever saw the QR code: they are made of a
 * share from each phone, and each fixes its own before it sees the
 * other's - the new phone by sending a fingerprint of its share first -
 * so that nobody, not even with the server on their side, can make up a
 * phone that gives the same figures.
 *
 * The order keeps the pairs: first they are on both phones, then the
 * place moves, then the old phone lets them go. Stopped half way, the
 * old phone still has everything; once the place has started moving,
 * the old phone finishes moving it whenever it can, even after a
 * restart (`handingOver` in the configuration).
 */

// --- The QR code -------------------------------------------------------------

/** What the QR code says: a server, and a secret for this hand-over alone. */
export type HandoverQr = { serverUrl: string; secret: string };

/**
 * Not a link: a camera app that reads it finds nothing to open, and
 * nothing to pass on in a chat. Only Duetto's own reader knows it.
 */
const QR_HEAD = 'duetto-handover:1/';

const toUrl = (b64: string) => b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/[=]+$/, '');
const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
const sha512 = (s: string) => nacl.hash(decodeUTF8(s));

/** 256 random bits, as the QR code carries them. */
export function newSecret(): string {
  return toUrl(encodeBase64(nacl.randomBytes(32)));
}

/** The secret first: the server may be a whole address, slashes and all. */
export function qrText(serverUrl: string, secret: string): string {
  return `${QR_HEAD}${secret}/${displayServer(serverUrl)}`;
}

/** Reads a hand-over's QR code back; null for anything else. */
export function parseQr(text: string): HandoverQr | null {
  const t = (text || '').trim();
  if (!t.startsWith(QR_HEAD)) return null;
  const m = /^([A-Za-z0-9_-]{43})\/(\S+)$/.exec(t.slice(QR_HEAD.length));
  if (!m) return null;
  const serverUrl = normalizeServerUrl(m[2]);
  return serverUrl ? { serverUrl, secret: m[1] } : null;
}

/** The meeting's name at the server: a fingerprint of the secret. */
export function meetingId(secret: string): string {
  return hex(sha512(`duetto-handover-id|${secret}`).slice(0, 32));
}

/** The key of the envelopes, made of the secret. */
export function meetingKey(secret: string): Uint8Array {
  return sha512(`duetto-handover-key|${secret}`).slice(0, nacl.secretbox.keyLength);
}

// --- The six figures -----------------------------------------------------------

/** A phone's share of the figures. */
export function newShare(): string {
  return encodeBase64(nacl.randomBytes(32));
}

/** What the new phone says first: its share, inside a fingerprint. */
export function commitmentTo(share: string): string {
  return hex(sha512(`duetto-handover-commit|${share}`).slice(0, 32));
}

/** The six figures both phones show: the same, or somebody is in between. */
export function figuresOf(
  secret: string, oldPub: string, newPub: string, oldPart: string, newPart: string,
): string {
  const h = sha512(`duetto-handover-check|${secret}|${oldPub}|${newPub}|${oldPart}|${newPart}`);
  const n = (h[0] * 2 ** 24 + h[1] * 2 ** 16 + h[2] * 2 ** 8 + h[3]) % 1_000_000;
  return String(n).padStart(6, '0');
}

/** "123 456": read at a glance, on two screens side by side. */
export const formatFigures = (f: string) => `${f.slice(0, 3)} ${f.slice(3)}`;

/** A card: the public half of an Ed25519 key, 32 bytes in base64. */
function isCard(pub: unknown): pub is string {
  if (typeof pub !== 'string' || pub.length > 64) return false;
  try { return decodeBase64(pub).length === 32; } catch { return false; }
}

// --- What passes -----------------------------------------------------------------

/**
 * What is the phone's own and not the person's: asked of this phone,
 * learnt on it. The new phone starts these afresh - the screen of the
 * battery and the permissions included, which it has to see itself.
 */
const PHONE_ONLY: Partial<DuoConfig> = {
  setupShown: false,
  otherAppsAsked: false,
  ringPermissionAsked: false,
  knobWorks: 'unknown',
  ladderLaidOut: undefined,
  btDevices: {},
};

type Sounding = { alertSound: string; alertSoundUri: string; alertSoundName: string; alertPicked: string };

/** A sound picked among the phone's own files is not on the other phone: the default instead. */
function withoutPhoneSound<T extends Sounding>(s: T): T {
  if (s.alertSound !== 'chosen' && s.alertPicked !== 'chosen') return s;
  return {
    ...s,
    alertSound: s.alertSound === 'chosen' ? 'default' : s.alertSound,
    alertSoundUri: '',
    alertSoundName: '',
    alertPicked: s.alertPicked === 'chosen' ? '' : s.alertPicked,
  } as T;
}

function cleaned(cfg: DuoConfig): DuoConfig {
  const pairs = cfg.pairs.map((p) => (p.settings ? { ...p, settings: withoutPhoneSound(p.settings) } : p));
  const out: DuoConfig = {
    ...withoutPhoneSound(cfg),
    ...PHONE_ONLY,
    invitation: '',
    serverKey: '',
    pair: cfg.pair ? pairs.find((p) => p.id === cfg.pair!.id) ?? null : null,
    pairs,
  };
  delete out.handingOver;
  return out;
}

/** What the old phone sends: everything it has, but what is the phone's own. */
export function bundleOf(cfg: DuoConfig): DuoConfig {
  return cleaned(withoutServerKeys(storeSettingsInPair(cfg)));
}

/**
 * What the new phone keeps of what came: a configuration, checked - a
 * pair is a room, a key and a side, or it is nothing - with the
 * phone's own started afresh, whatever the other phone sent.
 */
export function fromBundle(raw: unknown): DuoConfig | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const got = raw as Partial<DuoConfig>;
  if (!Array.isArray(got.pairs) || typeof got.serverUrl !== 'string') return null;
  const isPair = (p: any): p is PairInfo => !!p && typeof p === 'object'
    && typeof p.id === 'string' && p.id !== '' && (p.side === 'A' || p.side === 'B')
    && typeof p.key === 'string' && keyLength(p.key) === nacl.secretbox.keyLength;
  const pending = Array.isArray(got.pending)
    ? got.pending.filter((x: any) => !!x && typeof x.id === 'string' && typeof x.sec === 'string')
    : [];
  return cleaned({ ...DEFAULT_CONFIG, ...got, pairs: got.pairs.filter(isPair), pending } as DuoConfig);
}

function keyLength(b64: string): number {
  try { return decodeBase64(b64).length; } catch { return 0; }
}

/** The servers this phone has something on: the one in use, its pairs', its codes'. */
export function serversOf(cfg: DuoConfig): string[] {
  const all = [
    cfg.serverUrl,
    ...cfg.pairs.map((p) => p.serverUrl || cfg.serverUrl),
    ...(cfg.pending ?? []).map((p) => p.serverUrl),
  ].map((s) => normalizeServerUrl(s || '')).filter(Boolean);
  return [...new Set(all)];
}

// --- The conversation -----------------------------------------------------------

type Opener = (serverUrl: string) => Promise<DoorLine>;

/** How long one answer of the server is waited for. */
const ANSWER_WAIT_MS = 20_000;
/** How long the new phone is given to say it has kept what came. */
const HAVE_WAIT_MS = 60_000;

const sits = (role: ServerRole) => role === 'owner' || role === 'member' || role === 'guest';

/** Says something at the door and waits for one of these words: null if none comes. */
function ask(line: DoorLine, obj: unknown, types: string[], ms = ANSWER_WAIT_MS): Promise<any> {
  return new Promise((resolve) => {
    let settled = false;
    const done = (m: any) => {
      if (settled) return;
      settled = true;
      stop();
      clearTimeout(timer);
      resolve(m);
    };
    const stop = line.listen((msg) => { if (types.includes(msg?.type)) done(msg); });
    const timer = setTimeout(() => done(null), ms);
    line.onGone(() => done(null));
    line.send(obj);
  });
}

/** The reason a server's answer gives, in one word. */
const reasonOf = (answer: any) => (!answer ? 'timeout'
  : answer.type === 'error' && answer.error === 'expected-join' ? 'server-old'
    : String(answer.error || 'refused'));

/**
 * Whether this card sits on this server, and whether the server knows
 * the hand-over: a meeting opened and closed at once. 'place', 'none',
 * or the reason it cannot be done there.
 */
async function probe(server: string, open: Opener): Promise<string> {
  let line: DoorLine;
  try { line = await open(server); } catch { return 'unreachable'; }
  try {
    if (line.role === 'unknown') return 'server-old';
    if (!sits(line.role)) return 'none';
    const answer = await ask(line, { type: 'handover-open', id: meetingId(newSecret()) },
      ['handover-opened', 'handover-error', 'error']);
    if (answer?.type !== 'handover-opened') return reasonOf(answer);
    line.send({ type: 'handover-close' });
    return 'place';
  } finally {
    line.close();
  }
}

/**
 * The place, moved at one server. A line of one's own unless one is
 * given - the meeting's. A card that is nobody there any more has
 * nothing left to move: moved at a try whose answer never came, or
 * taken off the list meanwhile.
 */
async function moveAt(server: string, to: string, open: Opener, given?: DoorLine | null): Promise<true | string> {
  let line = given ?? null;
  if (!line) {
    try { line = await open(server); } catch { return 'unreachable'; }
  }
  try {
    if (!given && line.role === 'stranger') return true;
    if (line.role === 'unknown') return 'server-old';
    const answer = await ask(line, { type: 'handover', to }, ['handed-over', 'handover-error', 'error']);
    return answer?.type === 'handed-over' ? true : reasonOf(answer);
  } finally {
    if (!given) line.close();
  }
}

export type Moving = { to: string; servers: string[] };

/**
 * The place moved at every server still left, in order: after a
 * stop half way, or after a restart. The new phone has everything
 * already; `moving` writes down what is left after each server.
 * True when nothing is left.
 */
export async function finishMoving(m: Moving, o: {
  open: Opener;
  moving: (m: Moving) => Promise<void>;
  view: (v: GiveView) => void;
  mark?: (word: string) => void;
  /** the meeting's own line, for its server */
  line?: { server: string; line: DoorLine } | null;
}): Promise<boolean> {
  let left = [...m.servers];
  for (const s of m.servers) {
    o.view({ step: 'moving', server: s });
    const r = await moveAt(s, m.to, o.open, o.line?.server === s ? o.line.line : null);
    if (r !== true) {
      o.mark?.(`failed:${r}`);
      o.view({ step: 'failed', why: r, server: s, late: true });
      return false;
    }
    left = left.filter((x) => x !== s);
    await o.moving({ to: m.to, servers: left });
    o.mark?.(`moved:${displayServer(s)}`);
  }
  return true;
}

/** The words of the two phones, sealed: who says them, and what. */
type Word =
  | { by: 'new'; t: 'hello'; pub: string; commit: string; model?: string }
  | { by: 'old'; t: 'share'; pub: string; share: string }
  | { by: 'new'; t: 'reveal'; share: string }
  | { by: 'old'; t: 'bundle'; cfg: DuoConfig }
  | { by: 'new'; t: 'have' }
  | { by: 'old'; t: 'done' };

export type GiveView =
  | { step: 'checking' }
  | { step: 'code'; qr: string; until: number }
  | { step: 'compare'; figures: string; model: string }
  | { step: 'sending' }
  | { step: 'moving'; server: string }
  | { step: 'done' }
  /** `late`: the place had started moving, and moving it is what is left */
  | { step: 'failed'; why: string; server?: string; late?: boolean };

/**
 * The old phone's side.
 *
 * `start` looks at every server this phone has something on - none
 * may be missing, or nothing starts - and shows the code; `confirm`,
 * once the person has seen the same figures on both phones, sends
 * what there is and moves the place; `again` makes a new code after
 * one ran out; `cancel` stops, as long as nothing has moved.
 */
export class Giving {
  private line: DoorLine | null = null;
  private main = '';
  private places: string[] = [];
  private secret = '';
  private box: SignalCrypto | null = null;
  private newPub = '';
  private newModel = '';
  private commit = '';
  private share = '';
  private stage: 'checking' | 'opening' | 'waiting' | 'shared' | 'compare' | 'sending' | 'moving' | 'over'
    = 'checking';
  private timer: ReturnType<typeof setTimeout> | null = null;
  /** the place has started moving: from here only finishing it is left */
  private underway = false;

  constructor(private o: {
    /** the configuration as it is now: read again when it is sent */
    cfg: () => DuoConfig;
    /** this phone's card */
    myPub: string;
    open: Opener;
    view: (v: GiveView) => void;
    /**
     * Before what there is goes across: the phone's own connections
     * closed, so that nothing new - a letter, a pair - comes in after
     * it has been sent.
     */
    quiet: () => Promise<void>;
    /** the place starts moving, or has moved at one more server: written down */
    moving: (m: Moving) => Promise<void>;
    mark?: (word: string) => void;
  }) {}

  async start(): Promise<void> {
    this.o.view({ step: 'checking' });
    const places: string[] = [];
    for (const s of serversOf(this.o.cfg())) {
      const r = await probe(s, this.o.open);
      if (this.stage === 'over') return;
      if (r === 'place') places.push(s);
      else if (r !== 'none') { this.fail(r, s); return; }
    }
    if (places.length === 0) { this.fail('no-place'); return; }
    const inUse = normalizeServerUrl(this.o.cfg().serverUrl);
    this.main = places.includes(inUse) ? inUse : places[0];
    // The meeting's server last: its moving is what tells the new
    // phone that it may start.
    this.places = [...places.filter((s) => s !== this.main), this.main];
    await this.openMeeting();
  }

  /** A new code, after one ran out: the servers are the ones seen. */
  async again(): Promise<void> {
    if (!this.main || this.underway || (this.stage !== 'over' && this.stage !== 'waiting')) return;
    await this.openMeeting();
  }

  async confirm(): Promise<void> {
    if (this.stage !== 'compare') return;
    this.stage = 'sending';
    this.o.mark?.('confirmed');
    this.o.view({ step: 'sending' });
    await this.o.quiet().catch(() => { /* sent all the same */ });
    if (this.stage !== 'sending') return;
    this.seal({ by: 'old', t: 'bundle', cfg: bundleOf(this.o.cfg()) });
    this.timer = setTimeout(() => this.fail('timeout'), HAVE_WAIT_MS);
  }

  /** Whether the place has started moving: then the phone is no longer the same one. */
  get moved(): boolean {
    return this.underway;
  }

  /** Stopped by the person: only before anything has moved. */
  cancel(): void {
    if (this.stage === 'moving' || this.stage === 'over') return;
    this.line?.send({ type: 'handover-close' });
    this.stage = 'over';
    this.clearTimer();
    this.closeLine();
  }

  private async openMeeting(): Promise<void> {
    this.closeLine();
    this.clearTimer();
    this.stage = 'opening';
    this.newPub = '';
    this.secret = newSecret();
    this.box = new SignalCrypto(meetingKey(this.secret));
    let line: DoorLine;
    try { line = await this.o.open(this.main); } catch { this.fail('unreachable', this.main); return; }
    if (this.stage !== 'opening') { line.close(); return; }
    if (!sits(line.role)) { line.close(); this.fail(line.role === 'unknown' ? 'server-old' : 'no-place', this.main); return; }
    this.line = line;
    line.listen((msg) => { if (this.line === line) this.heard(msg); });
    line.onGone(() => { if (this.line === line) this.gone(); });
    line.send({ type: 'handover-open', id: meetingId(this.secret) });
  }

  private heard(msg: any) {
    // While the place moves, the answers are waited for one by one.
    if (this.stage === 'moving' || this.stage === 'over') return;
    switch (msg?.type) {
      case 'handover-opened':
        if (this.stage !== 'opening') return;
        this.stage = 'waiting';
        this.o.mark?.('code');
        this.o.view({
          step: 'code',
          qr: qrText(this.main, this.secret),
          until: Number(msg.until) || Date.now() + 5 * 60_000,
        });
        return;
      case 'handover-error':
      case 'error':
        this.fail(reasonOf(msg), this.main);
        return;
      case 'handover-closed':
        this.fail(msg.why === 'expired' ? 'expired' : 'closed');
        return;
      case 'handover-msg':
        this.word(this.box?.open<Word>(String(msg.payload || '')) ?? null);
        return;
      default:
    }
  }

  private word(w: Word | null) {
    if (w?.by === 'new' && w.t === 'hello' && this.stage === 'waiting') {
      if (!isCard(w.pub) || !/^[0-9a-f]{64}$/.test(String(w.commit))) { this.fail('mismatch'); return; }
      this.newPub = w.pub;
      this.commit = w.commit;
      this.newModel = String(w.model || '').replace(/[^\p{L}\p{N} ._()+-]/gu, '').slice(0, 40);
      this.share = newShare();
      this.stage = 'shared';
      this.seal({ by: 'old', t: 'share', pub: this.o.myPub, share: this.share });
      return;
    }
    if (w?.by === 'new' && w.t === 'reveal' && this.stage === 'shared') {
      if (commitmentTo(String(w.share)) !== this.commit) { this.fail('mismatch'); return; }
      this.stage = 'compare';
      this.o.mark?.('compare');
      this.o.view({
        step: 'compare',
        figures: figuresOf(this.secret, this.o.myPub, this.newPub, this.share, String(w.share)),
        model: this.newModel,
      });
      return;
    }
    if (w?.by === 'new' && w.t === 'have' && this.stage === 'sending') {
      this.clearTimer();
      this.move().catch(() => this.fail('failed', undefined, true));
      return;
    }
    // Anything else - unreadable, out of turn - is not this conversation.
    this.fail('mismatch');
  }

  /** Server by server, the meeting's last; then the last word, and the phone lets go. */
  private async move(): Promise<void> {
    this.stage = 'moving';
    this.underway = true;
    const m: Moving = { to: this.newPub, servers: this.places };
    await this.o.moving(m);
    const ok = await finishMoving(m, {
      open: this.o.open,
      moving: this.o.moving,
      view: this.o.view,
      mark: this.o.mark,
      line: this.line ? { server: this.main, line: this.line } : null,
    });
    if (!ok) { this.stage = 'over'; this.closeLine(); return; }
    this.seal({ by: 'old', t: 'done' });
    this.stage = 'over';
    this.o.mark?.('done');
    this.closeLine();
    this.o.view({ step: 'done' });
  }

  private gone() {
    if (this.stage === 'moving' || this.stage === 'over') return;
    this.fail('closed');
  }

  private seal(w: Word) {
    if (this.box) this.line?.send({ type: 'handover-msg', payload: this.box.seal(w) });
  }

  private fail(why: string, server?: string, late = false) {
    if (this.stage === 'over') return;
    this.stage = 'over';
    this.clearTimer();
    this.o.mark?.(`failed:${why}`);
    this.closeLine();
    this.o.view({ step: 'failed', why, server, late });
  }

  private clearTimer() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private closeLine() {
    const l = this.line;
    this.line = null;
    l?.close();
  }
}

export type TakeView =
  | { step: 'connecting' }
  | { step: 'compare'; figures: string }
  | { step: 'receiving' }
  | { step: 'waiting' }
  | { step: 'done'; cfg: DuoConfig }
  | { step: 'failed'; why: string };

/** How often, and how many times, the new phone asks whether the place has come. */
const WATCH_MS = 5000;
const WATCH_TIMES = 24;

/**
 * The new phone's side: at the door of the QR code's server, a
 * stranger there; the figures; what comes, kept; and the start once
 * the place is here - said by the old phone, by the server, or by the
 * door itself when the old phone went before saying it.
 */
export class Taking {
  private line: DoorLine | null = null;
  private stage: 'connecting' | 'hello' | 'compare' | 'keeping' | 'have' | 'over' = 'connecting';
  private readonly box: SignalCrypto;
  private readonly share = newShare();
  private got: DuoConfig | null = null;
  private watching: ReturnType<typeof setTimeout> | null = null;

  constructor(private o: {
    qr: HandoverQr;
    /** this phone's card */
    myPub: string;
    model: string;
    open: Opener;
    view: (v: TakeView) => void;
    /** what came, kept aside - not in use - until the place has come */
    keep: (cfg: DuoConfig) => Promise<void>;
    /** and let go, when the old phone says it stops */
    drop: () => Promise<void>;
    mark?: (word: string) => void;
  }) {
    this.box = new SignalCrypto(meetingKey(o.qr.secret));
  }

  async start(): Promise<void> {
    this.o.view({ step: 'connecting' });
    let line: DoorLine;
    try { line = await this.o.open(this.o.qr.serverUrl); } catch { this.fail('unreachable'); return; }
    if (this.stage === 'over') { line.close(); return; }
    // A card that sits there already would be two places in one phone.
    if (line.role !== 'stranger') {
      line.close();
      this.fail(line.role === 'unknown' ? 'server-old' : 'has-place');
      return;
    }
    this.line = line;
    line.listen((msg) => { if (this.line === line) this.heard(msg); });
    line.onGone(() => { if (this.line === line) this.gone(); });
    line.send({ type: 'handover-join', id: meetingId(this.o.qr.secret) });
  }

  /**
   * Stopped by the person: only until what came is kept. After that the
   * old phone may be moving the place, and a new phone that let the
   * pairs go would be left with a place and nothing in it.
   */
  cancel(): boolean {
    if (this.stage === 'keeping' || this.stage === 'have') return false;
    if (this.stage === 'over') return true;
    this.line?.send({ type: 'handover-close' });
    this.stage = 'over';
    this.closeLine();
    return true;
  }

  private heard(msg: any) {
    if (this.stage === 'over') return;
    switch (msg?.type) {
      case 'handover-joined':
        if (this.stage !== 'connecting') return;
        this.stage = 'hello';
        this.o.mark?.('joined');
        this.seal({ by: 'new', t: 'hello', pub: this.o.myPub, commit: commitmentTo(this.share), model: this.o.model });
        return;
      case 'handover-error':
      case 'error':
        if (this.stage === 'have') return;
        this.fail(reasonOf(msg));
        return;
      case 'handover-msg':
        this.word(this.box.open<Word>(String(msg.payload || '')));
        return;
      case 'handover-done':
        if (this.stage === 'have') this.finish();
        return;
      case 'handover-closed':
        if (this.stage === 'have') {
          // Said "stop" by the old phone: the place is not coming.
          if (msg.why === 'closed') {
            this.o.drop().catch(() => { /* noop */ });
            this.fail('cancelled');
          } else {
            this.watch();
          }
          return;
        }
        this.fail(msg.why === 'expired' ? 'expired' : msg.why === 'closed' ? 'cancelled' : 'closed');
        return;
      default:
    }
  }

  private word(w: Word | null) {
    if (w?.by === 'old' && w.t === 'share' && this.stage === 'hello') {
      if (!isCard(w.pub) || typeof w.share !== 'string' || w.share.length > 64) { this.fail('mismatch'); return; }
      this.seal({ by: 'new', t: 'reveal', share: this.share });
      this.stage = 'compare';
      this.o.mark?.('compare');
      this.o.view({ step: 'compare', figures: figuresOf(this.o.qr.secret, w.pub, this.o.myPub, w.share, this.share) });
      return;
    }
    if (w?.by === 'old' && w.t === 'bundle' && this.stage === 'compare') {
      const cfg = fromBundle(w.cfg);
      if (!cfg) { this.fail('bad-bundle'); return; }
      this.stage = 'keeping';
      this.o.view({ step: 'receiving' });
      this.o.keep(cfg).then(() => {
        if (this.stage !== 'keeping') return;
        this.got = cfg;
        this.stage = 'have';
        this.o.mark?.(`kept:${cfg.pairs.length}`);
        this.seal({ by: 'new', t: 'have' });
        this.o.view({ step: 'waiting' });
      }).catch(() => {
        this.stage = 'compare';
        this.fail('not-kept');
      });
      return;
    }
    if (w?.by === 'old' && w.t === 'done' && this.stage === 'have') { this.finish(); return; }
    if (this.stage === 'have') return;
    this.fail('mismatch');
  }

  private gone() {
    if (this.stage === 'have') { this.watch(); return; }
    this.fail('closed');
  }

  /** The old phone gone before its last word: the door says whether the place came. */
  private watch(times = WATCH_TIMES) {
    this.closeLine();
    if (this.stage !== 'have' || this.watching) return;
    this.watching = setTimeout(async () => {
      this.watching = null;
      let role: ServerRole = 'unknown';
      try {
        const l = await this.o.open(this.o.qr.serverUrl);
        role = l.role;
        l.close();
      } catch { /* not reachable now: asked again */ }
      if (this.stage !== 'have') return;
      if (sits(role)) { this.finish(); return; }
      if (times <= 1) { this.fail('stopped'); return; }
      this.watch(times - 1);
    }, WATCH_MS);
  }

  private finish() {
    if (this.stage !== 'have' || !this.got) return;
    this.stage = 'over';
    if (this.watching) clearTimeout(this.watching);
    this.watching = null;
    this.o.mark?.('done');
    this.closeLine();
    this.o.view({ step: 'done', cfg: this.got });
  }

  private seal(w: Word) {
    this.line?.send({ type: 'handover-msg', payload: this.box.seal(w) });
  }

  private fail(why: string) {
    if (this.stage === 'over') return;
    // What came is kept all the same, if it was: the place may still
    // come, and the next start looks (see readIncoming).
    this.stage = 'over';
    if (this.watching) clearTimeout(this.watching);
    this.watching = null;
    this.o.mark?.(`failed:${why}`);
    this.closeLine();
    this.o.view({ step: 'failed', why });
  }

  private closeLine() {
    const l = this.line;
    this.line = null;
    l?.close();
  }
}

// --- What came, kept aside -----------------------------------------------------

const INCOMING_KEY = 'duetto.handover-incoming';
/** After a day the old phone has not finished, and will not. */
const INCOMING_DAYS = 1;

export type Incoming = { cfg: DuoConfig; serverUrl: string; at: number };

export async function keepIncoming(cfg: DuoConfig, serverUrl: string): Promise<void> {
  await AsyncStorage.setItem(INCOMING_KEY, JSON.stringify({ cfg, serverUrl, at: Date.now() }));
}

/** What came and is not in use yet, if any, and not too old. */
export async function readIncoming(): Promise<Incoming | null> {
  try {
    const raw = await AsyncStorage.getItem(INCOMING_KEY);
    if (!raw) return null;
    const got = JSON.parse(raw);
    const cfg = fromBundle(got?.cfg);
    if (!cfg || typeof got.serverUrl !== 'string' || Date.now() - Number(got.at) > INCOMING_DAYS * 86400_000) {
      await dropIncoming();
      return null;
    }
    return { cfg, serverUrl: got.serverUrl, at: Number(got.at) };
  } catch {
    return null;
  }
}

export async function dropIncoming(): Promise<void> {
  await AsyncStorage.removeItem(INCOMING_KEY).catch(() => { /* noop */ });
}

/**
 * What came, ready to be used: kept aside, and this phone's card now
 * sits at its server - the old phone finished, while this one was not
 * looking. Null otherwise; and if the server is not reachable, null
 * too, for now.
 */
export async function incomingReady(open: Opener): Promise<Incoming | null> {
  const got = await readIncoming();
  if (!got) return null;
  try {
    const line = await open(got.serverUrl);
    const role = line.role;
    line.close();
    return sits(role) ? got : null;
  } catch {
    return null;
  }
}
