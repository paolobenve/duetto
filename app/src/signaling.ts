/*
 * Duetto - a permanent voice and video channel for two people.
 * Copyright (C) 2026 Paolo Benvenuto
 *
 * Free software under the GNU General Public License, version 3 or any
 * later version, and with no warranty of any kind. The full text is in
 * the LICENSE file at the root of the project, and at
 * <https://www.gnu.org/licenses/>.
 */
import { SignalCrypto } from './crypto';
import { logger } from './log';
import { deviceKey, deviceModel, deviceName, signNonce } from './device';

/**
 * The connection to the signalling server.
 *
 * The same connection serves two phases:
 *
 *  - PAIRING: public keys are exchanged in the clear (`pair` messages).
 *    There is nothing to hide: without the code, which never reaches
 *    the server, those keys are not enough to work anything out.
 *
 *  - EVERYDAY USE: everything else travels inside `signal`, encrypted
 *    with the key settled while pairing. The server forwards opaque
 *    envelopes.
 *
 * The `mode` tells the server whether we are merely reachable
 * (`listening`) or inside the channel (`active`).
 */

export type SignalMessage =
  | { kind: 'desc'; type: 'offer' | 'answer'; sdp: string }
  | { kind: 'ice'; candidate: any }
  // `watching`: the other app is really showing something on screen.
  // Missing in older builds, and then we assume it is: better to send
  // for nothing than to show a black rectangle.
  // `output`: where the sound comes out on the other side - speaker,
  // earpiece, headphones, bluetooth. It says how they are listening to
  // you, which is the thing people ask out loud all the time ("are you
  // on speaker?").
  // `version`: which Duetto is running over there. It explains the odd
  // things - something here that is missing there - without having to
  // ask. Missing in older builds, which is already an answer: it means
  // older than this very field.
  // `camera`: which of the two is filming. Nothing about the picture
  // changes - it is the same image - but the journal can then say what
  // the other person did, and "they turned the camera round" explains a
  // shot that suddenly changes.
  // `volume`: how loudly I am listening to YOU. It is the only way to
  // know that the other person has you turned down: it is a setting of
  // theirs, on their phone, and without telling each other you end up
  // repeating "can you hear me?" and never finding out that you were at
  // a quarter volume.
  // `sendDelay` and `recvDelay`: the two halves of the wait that THEIR
  // phone can time - the encoder and the send queue on one side, the
  // jitter buffer, the decoder and the loudspeaker on the other. A
  // journey is one phone's send half plus the road plus the other's
  // receive half, so neither could ever write it alone: they tell each
  // other the pieces they measure at home, and both do the sum.
  | { kind: 'state'; audio: boolean; video: boolean; aspect?: number; watching?: boolean;
      hwVp9?: boolean; output?: string; version?: string; build?: number; camera?: string;
      volume?: number; sendDelay?: number; recvDelay?: number }
  // "I did not leave: the phone closed the window on me."
  //
  // Sent by the headless presence when it takes the place of an app
  // that was torn down without anybody asking. On the other side the
  // two arrived identical - "waiting" - and whoever read it had to
  // guess which of the two it was.
  | { kind: 'tornDown' }
  // The answering side cannot offer: if it ends up without a link and
  // the other one does not notice, the only way out is to ask.
  // Which Duetto is on the other phone, said as soon as the two find
  // each other - in the channel or merely waiting. It used to travel
  // only inside `state`, which the session sends, and the session
  // exists only in the channel: so while waiting nobody knew anything,
  // which is exactly when one would rather know before going in.
  //
  // It goes in the encrypted envelope and not through the server: what
  // version somebody is running is their business, not his.
  | { kind: 'hello'; version: string; build?: number }
  | { kind: 'renegotiate' }
  // Video quality belongs to both: changing it on one phone changes it
  // on the other. Whoever receives it does not send it back.
  | { kind: 'quality'; value: string }
  // Audio options belong to the conversation, not to one phone: a
  // richer voice makes sense when both of you turn it on.
  | { kind: 'audio'; richer: boolean }
  // The journal of what the phone is doing, which each phone sends to
  // the other every so often: plug one of them into a computer and you
  // can read both. The other phone is in somebody else's hands and a
  // cable never reaches it.
  | { kind: 'journal'; text: string }
  // "I died and I am back": whoever watched the other one disappear
  // with no explanation deserves to know, and the phone that died finds
  // out why when it starts again. Nobody can send this while dying.
  // `back` is the time the app started again, on the phone that had
  // died. Without it the receiver can only say "now" - and if they were
  // disconnected, that message reaches them when THEY come back, so the
  // notice gave the time of the reader's own return.
  | { kind: 'death'; when: number; cause: string; back?: number }
  // A loud sound to call back somebody who is in the channel but not
  // answering: asleep, or with the phone on the far side of the room.
  // The sender picks it, the receiver's phone plays it.
  | { kind: 'alarm'; sound: string };

export type PairMessage =
  | { kind: 'pubkey'; pub: string; name: string }
  | { kind: 'confirm'; proof: string };

export type Mode = 'listening' | 'active';

/** An ICE server (STUN or TURN) as WebRTC describes it. */
export type IceServer = {
  urls: string | string[];
  username?: string;
  credential?: string;
};

export type PresenceStatus =
  | 'connecting'
  | 'alone'      // connected, the other one is not in the channel
  | 'together'   // we are both in the channel
  | 'offline';   // no network, or the server is out of reach

export type SignalingEvents = {
  /**
   * @param detail with `offline`, the socket's closing code
   *
   * The code says WHO closed: 1006 is a network drop, 1000 and 1001 an
   * orderly close, 4xxx a refusal from the server. It is for whoever
   * reads the journal tomorrow, not for whoever is looking at the
   * screen now.
   */
  onStatus?: (s: PresenceStatus, detail?: string) => void;
  /** The people this server lets in, when we are allowed to ask. */
  onPeople?: (people: PersonOnServer[], invitations: InvitationOnServer[]) => void;
  /** An invitation just made, ready to be handed over. */
  onInvited?: (name: string, code: string, days: number) => void;
  onJoined?: (info: {
    polite: boolean;
    peerPresent: boolean;
    peerActive: boolean;
    peerName: string;
    /** the fallback relay, configured on the server */
    turn: IceServer | null;
    /** a STUN of the house, if the operator names one */
    stun: IceServer | null;
    /** whether this phone may invite: it is one of the owner's */
    owner: boolean;
    /** whether it may open connections of its own on this server */
    opens: boolean;
  }) => void;
  onPeerJoined?: (name: string, mode: Mode) => void;
  /** @param why 'bye' if they left, 'dropped' if the network went */
  onPeerLeft?: (why: 'bye' | 'dropped') => void;
  onPeerMode?: (mode: Mode, name: string) => void;
  /** the answer to `askPresence`: how the other side is doing now */
  onPresence?: (info: { peerPresent: boolean; peerActive: boolean; peerName: string }) => void;
  /** the server tells us: the other one came in, or knocked */
  onNotify?: (reason: 'peer-active' | 'knock', name: string) => void;
  onSignal?: (msg: SignalMessage) => void;
  onPair?: (msg: PairMessage) => void;
  onKnockResult?: (ok: boolean, error?: string) => void;
  /** @param reason with `not-allowed`: 'stranger', 'bad-invite' or 'bad-key' */
  onError?: (code: string, reason?: string) => void;
};

/**
 * Diagnostics for the connection to the server.
 *
 * The drops happen here, and used to leave no trace: only the effect on
 * the video was visible. Read them with:
 *
 *   adb logcat -s ReactNativeJS | grep duetto-sig
 */
/**
 * TEMPORARY. What an older Duetto says on the wire.
 *
 * The names of the messages went into English along with the code, and
 * a phone that has not been updated goes on sending the ones from
 * before: `diario` for the journal, `sveglia` for the sound to call
 * somebody back, `morte` for the app that died, `smontata` for the
 * window taken apart by the phone. Not recognising them, we dropped
 * them in silence - the journals stopped being exchanged on the very
 * evening of the update, and it took reading them to notice.
 *
 * We send the new names and accept both, which is what was done for the
 * sounds and for the causes of a death. It goes away with the next
 * version, once every phone has been updated.
 */
function fromOlderDuetto(msg: any): SignalMessage {
  if (!msg || typeof msg !== 'object') return msg;
  switch (msg.kind) {
    case 'diario':
      return { kind: 'journal', text: String(msg.testo ?? '') };
    case 'sveglia':
      return { kind: 'alarm', sound: String(msg.suono ?? '') };
    case 'morte':
      return {
        kind: 'death',
        when: Number(msg.quando) || 0,
        cause: String(msg.causa ?? ''),
        back: Number(msg.tornato) || undefined,
      };
    case 'smontata':
      return { kind: 'tornDown' };
    case 'audio':
      // The field changed name inside a message whose name did not.
      return msg.richer === undefined
        ? { kind: 'audio', richer: msg.migliore === true }
        : msg;
    case 'state':
      // Two of its fields were in Italian: where the sound comes out
      // over there, and which Duetto is running.
      return {
        ...msg,
        output: msg.output ?? msg.uscita,
        version: msg.version ?? msg.versione,
      };
    default:
      return msg;
  }
}

const log = logger('[duetto-sig]');

// The wait between one attempt and the next. Kept short on purpose:
// reconnecting is not a detail here, it is the difference between being
// reachable and not. A failed attempt costs next to nothing.
/**
 * How long the server is given to say its number before we knock
 * anyway. Long enough for a round trip on a poor network, short enough
 * that nobody notices it.
 */
const GREETING_WAIT_MS = 700;

const RECONNECT_MIN_MS = 500;
/** How long to stand still when the server says we knock too often. */
const TOO_MANY_WAIT_MS = 60_000;
const RECONNECT_MAX_MS = 4000;

/** Somebody the server lets in, as the app shows them. */
export type PersonOnServer = {
  name: string;
  since: string;
  /** how many connections they have opened, and how many brought somebody */
  rooms: number;
  brought: number;
  /** the owner of the server, or somebody let in by an invitation */
  owner: boolean;
  /** the phone's make and model, when it said */
  model: string;
  /** this very phone */
  you: boolean;
  /** their rooms: the id is the pair's, known to the phone that opened it */
  theirs: { room: string; guest: boolean }[];
};

export type InvitationOnServer = { name: string; code: string; expires: string };

export type SignalingOptions = {
  serverUrl: string;
  /**
   * The key of the server, when it asks for one.
   *
   * It says nothing about who you are and it does not protect the pair:
   * that is the pairing code's business. It protects the SERVER - it is
   * the key of the house, and without it a stranger who has learnt the
   * address is turned away before being told anything, the relay's
   * credentials included.
   */
  serverKey?: string;
  /** the invitation, used once at the first knock on a new server */
  invitation?: string;
  /** the room = the fingerprint of the pairing code */
  room: string;
  displayName: string;
  /** the pair's key; missing while pairing */
  key?: Uint8Array | string | null;
  /** which side of the pair: it identifies the device, so that on
   *  reconnecting it takes its own seat back instead of being turned
   *  away */
  side?: 'A' | 'B';
  mode?: Mode;
};

export class Signaling {
  private ws: WebSocket | null = null;
  /** Already knocked on this socket: it is done once, greeting or not. */
  private joined = false;
  private joinTimer: ReturnType<typeof setTimeout> | null = null;
  /** The number to sign, when the server has one. */
  private nonce: string | null = null;
  private crypto: SignalCrypto | null = null;
  private closedByUser = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private backoff = RECONNECT_MIN_MS;
  /**
   * A long wait, when the server says we are knocking too often.
   *
   * Its brake counts the knocks from one address in a minute, and at
   * home every phone shares the same one: after a restart they all come
   * back at once and the budget goes. Answering that with another knock
   * half a second later is what turns a brake into a wall - two a
   * second against thirty a minute, and it never clears. So we stand
   * still for a minute, which is the length of the window.
   */
  private pausedUntil = 0;
  private mode: Mode;

  constructor(private opts: SignalingOptions, private events: SignalingEvents) {
    this.crypto = opts.key ? new SignalCrypto(opts.key) : null;
    this.mode = opts.mode ?? 'listening';
  }

  /**
   * Try again now, without waiting for the scheduled attempt.
   *
   * For when we know something has changed - the app is back in the
   * foreground, the network has returned - and waiting would be wasted
   * time.
   */
  reconnectNow() {
    if (this.closedByUser) return;
    if (this.ws && this.ws.readyState === WebSocket.OPEN) return;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.backoff = RECONNECT_MIN_MS;
    log('trying again now');
    this.open();
  }

  /** The key only arrives once pairing is done. */
  setKey(key: Uint8Array | string) {
    this.crypto = new SignalCrypto(key);
  }

  connect() {
    this.closedByUser = false;
    this.backoff = RECONNECT_MIN_MS;
    this.open();
  }

  private open() {
    // The pause is honoured here, at the one gate every road passes
    // through: rebuild(), reconnectNow() and the heartbeat's repairs
    // all end in open(), and each of them used to walk straight past
    // it - so the brake the pause was written for got hammered anyway,
    // by the very machinery meant to be patient.
    if (Date.now() < this.pausedUntil) {
      log('paused by the brake, not dialing yet');
      this.scheduleReconnect();
      return;
    }
    // Whoever was across the table belonged to the old socket: the
    // fresh `joined` will say whether they are still there.
    this.peerThere = false;
    this.events.onStatus?.('connecting');
    let ws: WebSocket;
    try {
      ws = new WebSocket(this.opts.serverUrl);
    } catch {
      this.scheduleReconnect();
      return;
    }
    // The previous one gets properly closed: merely abandoning it
    // leaves it alive, drawing power and speaking out of turn.
    const previous = this.ws;
    this.ws = ws;
    if (previous && previous !== ws) {
      try { previous.close(); } catch { /* it was dead already */ }
    }

    /**
     * Is this still the socket in use?
     *
     * An abandoned socket does not go quiet: its close can arrive
     * minutes after we opened another one - on mobile networks it
     * happens at every change of cell, because the network is slow to
     * notice that the connection is gone. Without this check that late
     * close declared "no link to the server" while the new socket was
     * alive and working, and from the outside the app appeared to lose
     * the server by itself after a few calm minutes.
     */
    const inUse = () => this.ws === ws;

    const openedAt = Date.now();
    ws.onopen = () => {
      if (!inUse()) { try { ws.close(); } catch { /* noop */ } return; }
      log('connected to the server');
      this.backoff = RECONNECT_MIN_MS;
      /**
       * A breath for the server to say its number, and then in we go.
       *
       * A server that keeps a list of phones greets with a number to
       * sign: the signature is what shows this phone holds the secret
       * half of its key. One that does not, says nothing - and an older
       * one has never heard of any of this - so after a moment we knock
       * anyway, without a signature. Waiting for a greeting that will
       * never come would mean a new app unable to use an old server.
       */
      this.joined = false;
      // The number belongs to the socket that said it: an old one,
      // signed on a new connection, is worth nothing and would be
      // refused.
      this.nonce = null;
      this.joinTimer = setTimeout(() => { this.join(); }, GREETING_WAIT_MS);
    };

    ws.onmessage = (ev) => { if (inUse()) this.handle(ev.data); };
    ws.onerror = (e: any) => {
      if (!inUse()) return;
      log('network error:', e?.message ?? '(no details)');
    };
    ws.onclose = (e: any) => {
      if (!inUse()) {
        log('a socket we had already abandoned went down: not our concern');
        return;
      }
      // The code says WHO closed and why: 1006 is a network drop,
      // 1000/1001 an orderly close, 4xxx a refusal of ours.
      log('down after', Math.round((Date.now() - openedAt) / 1000), 's',
        '- code', e?.code ?? '?', e?.reason ? `(${e.reason})` : '');
      this.events.onStatus?.('offline', `${e?.code ?? '?'}${e?.reason ? `/${e.reason}` : ''}`);
      if (!this.closedByUser) this.scheduleReconnect();
    };
  }

  /**
   * Knocks, once per socket.
   *
   * With a number from the server it goes signed, with the public half
   * of the phone's key alongside: whoever reads the list knows which
   * phone this is. Without one - an older server, or one that lets
   * everybody in - it goes as it always did.
   */
  private async join() {
    if (this.joined || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.joined = true;
    if (this.joinTimer) { clearTimeout(this.joinTimer); this.joinTimer = null; }

    let card: { pub: string; sig: string } | null = null;
    if (this.nonce) {
      try {
        await deviceName();
        const key = await deviceKey();
        card = { pub: key.pub, sig: signNonce(key, this.nonce) };
      } catch {
        // Unable to sign: we knock all the same, and a server that
        // wants a signature will say no. Better a clear "not allowed"
        // than a connection that never happens.
      }
    }

    this.rawSend({
      type: 'join',
      room: this.opts.room,
      key: this.opts.serverKey || undefined,
      pub: card?.pub,
      sig: card?.sig,
      invite: this.opts.invitation || undefined,
      name: this.opts.displayName || 'Someone',
      model: deviceModel(),
      mode: this.mode,
      side: this.opts.side,
    });
  }

  /** Asks the server who it lets in. Answered only to the owner's phones. */
  askPeople() {
    this.rawSend({ type: 'people' });
  }

  /** Makes an invitation for one person, and hands back the code. */
  askInvite(name: string) {
    this.rawSend({ type: 'invite', name });
  }

  /** Takes somebody off the list, with their rooms and their guests. */
  forgetPerson(name: string) {
    this.rawSend({ type: 'forget', name });
  }

  /** Takes back an invitation not yet used. */
  forgetInvitation(code: string) {
    this.rawSend({ type: 'forget', code });
  }

  private handle(data: any) {
    let msg: any;
    try {
      msg = JSON.parse(typeof data === 'string' ? data : String(data));
    } catch {
      return;
    }

    switch (msg.type) {
      // The server picks a number and asks for it signed: it wants to
      // know which phone this is. Answering means knocking straight
      // away, without waiting out the breath above.
      case 'hello':
        this.nonce = typeof msg.nonce === 'string' ? msg.nonce : null;
        this.join();
        break;

      // Who is let in, and an invitation just made: only a phone of the
      // owner's is ever answered these.
      case 'people':
        this.events.onPeople?.(
          (msg.people ?? []).map((p: any) => ({
            name: String(p.name || ''),
            since: String(p.since || ''),
            rooms: Number(p.rooms) || 0,
            brought: Number(p.brought) || 0,
            owner: p.owner === true,
            model: String(p.model || ''),
            you: p.you === true,
            theirs: Array.isArray(p.theirs)
              ? p.theirs.map((r: any) => ({ room: String(r.room || ''), guest: r.guest === true }))
              : [],
          })),
          msg.invitations ?? [],
        );
        break;

      case 'invited':
        this.events.onInvited?.(String(msg.name || ''), String(msg.code || ''),
          Number(msg.days) || 0);
        break;

      case 'joined':
        this.peerThere = !!msg.peerPresent;
        // The held facts go first, so they land in the order they were
        // born, before anything the handlers below decide to say.
        if (this.peerThere) this.flushOutbox();
        this.events.onStatus?.(msg.peerActive ? 'together' : 'alone');
        this.events.onJoined?.({
          polite: !!msg.polite,
          owner: !!msg.owner,
          // Missing from an older server, and then it is a yes: that is
          // what it always was.
          opens: msg.opens !== false,
          peerPresent: !!msg.peerPresent,
          peerActive: !!msg.peerActive,
          peerName: msg.peerName || '',
          turn: msg.turn ?? null,
          stun: msg.stun ?? null,
        });
        break;

      case 'peer-joined':
        this.peerThere = true;
        this.flushOutbox();
        if (msg.mode === 'active') this.events.onStatus?.('together');
        this.events.onPeerJoined?.(
          msg.name || 'Someone', msg.mode === 'active' ? 'active' : 'listening',
        );
        break;

      case 'peer-left':
        this.peerThere = false;
        this.events.onStatus?.('alone');
        // "bye" = they left; "dropped" = their connection went, and
        // they will most likely be back. Older servers do not say
        // which: with no reason given we treat it as a drop, which is
        // the case where being wrong costs less.
        this.events.onPeerLeft?.(msg.reason === 'bye' ? 'bye' : 'dropped');
        break;

      case 'presence':
        this.peerThere = !!msg.peerPresent;
        if (this.peerThere) this.flushOutbox();
        this.events.onPresence?.({
          peerPresent: !!msg.peerPresent,
          peerActive: !!msg.peerActive,
          peerName: msg.peerName || '',
        });
        break;

      case 'peer-mode':
        this.events.onStatus?.(msg.mode === 'active' ? 'together' : 'alone');
        this.events.onPeerMode?.(msg.mode, msg.name || '');
        break;

      case 'notify':
        this.events.onNotify?.(msg.reason, msg.name || 'Someone');
        break;

      case 'signal': {
        if (!this.crypto) return;
        const clear = this.crypto.open<SignalMessage>(msg.payload);
        if (!clear) {
          // An envelope we cannot open: different keys on the two
          // phones, or somebody tampered with it along the way.
          this.events.onError?.('decrypt-failed');
          return;
        }
        this.events.onSignal?.(fromOlderDuetto(clear));
        break;
      }

      case 'pair':
        this.events.onPair?.(msg.payload as PairMessage);
        break;

      case 'knock-result':
        this.events.onKnockResult?.(!!msg.ok, msg.error);
        break;

      case 'error':
        // The brake on knocking: standing still is the only way out of
        // it, and half a second is not standing still.
        if (msg.error === 'too-many-attempts') {
          this.pausedUntil = Date.now() + TOO_MANY_WAIT_MS;
          log('too many knocks: waiting a minute before trying again');
        }
        this.events.onError?.(msg.error || 'unknown',
          typeof msg.reason === 'string' ? msg.reason : undefined);
        break;
    }
  }

  /**
   * The pocket of facts waiting for somebody to hear them.
   *
   * A message sent while the server is out of reach, or while the
   * other side is between two connections, used to vanish in silence -
   * and among them were exactly the lines that explain a death, the
   * "I did not leave", the sound meant to call somebody back. Those are
   * FACTS: true whenever they arrive, worth carrying across the hole.
   *
   * Negotiation is the opposite and is deliberately NOT kept: an offer
   * or a candidate replayed into a fresh negotiation is how glare bugs
   * are born. That side regenerates itself - the rejoining restarts it
   * from scratch, and the safety nets re-ask - so replaying it could
   * only do harm.
   *
   * A handful at most, each with a shelf life: a pocket, not a mailbox.
   */
  private outbox: { kind: string; sealed: unknown; born: number; keep: number }[] = [];

  /** How long each fact stays worth delivering. Absent = not kept. */
  private static readonly KEEPABLE: Record<string, number> = {
    // The story of a death and the journal make sense even much later.
    journal: 10 * 60_000, death: 10 * 60_000, tornDown: 10 * 60_000,
    // A call-back sound or a settings change grow stale in a minute.
    alarm: 60_000, quality: 60_000, audio: 60_000,
  };

  /**
   * Whether the other side is there to hear a signal: the server
   * forwards to whoever is in the room and lets the rest fall, so a
   * signal with nobody across the table is as lost as one with no
   * socket.
   */
  private peerThere = false;

  private flushOutbox() {
    if (this.outbox.length === 0) return;
    const now = Date.now();
    const worth = this.outbox.filter((m) => now - m.born <= m.keep);
    this.outbox = [];
    for (const m of worth) {
      log('outbox: delivering a held', m.kind);
      this.rawSend({ type: 'signal', payload: m.sealed });
    }
  }

  /** A WebRTC or state message, encrypted. */
  sendSignal(msg: SignalMessage) {
    if (!this.crypto) return;
    const sealed = this.crypto.seal(msg);
    const open = !!this.ws && this.ws.readyState === WebSocket.OPEN;
    const keep = Signaling.KEEPABLE[msg.kind];
    /**
     * `peerThere` decides one thing only: whether a FACT goes into the
     * pocket instead of to a room that may be empty. It must never
     * silence the rest - what we know of the other side can be stale
     * or simply not yet said (the moment between the socket opening
     * and the server's `joined` is exactly such a window), and an
     * offer withheld on stale knowledge left two phones facing each
     * other in silence, each believing its link healthy because it was
     * too NEW to be called sick. Negotiation goes out whenever there
     * is a socket to carry it, as it always did: at worst the server
     * lets it fall, which is the price of before.
     */
    if (open && (this.peerThere || !keep)) {
      this.rawSend({ type: 'signal', payload: sealed });
      return;
    }
    if (!keep) {
      log('dropped (no way to send it):', msg.kind);
      return;
    }
    log('outbox: holding a', msg.kind);
    this.outbox.push({ kind: msg.kind, sealed, born: Date.now(), keep });
    // A pocket, not a mailbox: the oldest falls out first.
    if (this.outbox.length > 8) this.outbox.shift();
  }

  /** A pairing message, in the clear (public keys). */
  sendPair(msg: PairMessage) {
    this.rawSend({ type: 'pair', payload: msg });
  }

  /** Enters or leaves the channel. This is what alerts the other side. */
  setMode(mode: Mode) {
    if (mode === this.mode) return;
    this.mode = mode;
    this.rawSend({ type: 'mode', mode });
  }

  getMode(): Mode {
    return this.mode;
  }

  /**
   * Asks the server how the other side is doing right now.
   *
   * This is for whoever is waiting: announcements tell you about
   * changes, but the server takes its time noticing that somebody who
   * was merely listening has dropped, and until then the "waiting" line
   * sits there saying something that is no longer true. Asking
   * refreshes it, and makes the server check that presence from its own
   * side as well.
   */
  askPresence() {
    this.rawSend({ type: 'presence' });
  }

  /** Asks the server to alert the other side. */
  knock() {
    this.rawSend({ type: 'knock' });
  }

  get connected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  /**
   * Throws the current socket away and opens a new one, right now.
   *
   * `reconnectNow` is not enough when the socket is neither alive nor
   * dead: as far as the system is concerned it is still "opening", no
   * event arrives any more and the wait never ends. Here we close it by
   * hand - the close does not count as deliberate, so reconnecting
   * stays on - and start over.
   */
  rebuild() {
    if (this.closedByUser) return;
    log('connection rebuilt from scratch');
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    const old = this.ws;
    this.ws = null;
    if (old) {
      // Silenced before closing it: its `onclose` would arrive once the
      // new one is already up, and would declare that one dead.
      try {
        old.onopen = null;
        old.onmessage = null;
        old.onerror = null;
        old.onclose = null;
        old.close();
      } catch { /* noop */ }
    }
    this.backoff = RECONNECT_MIN_MS;
    this.open();
  }

  private rawSend(obj: unknown) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(obj));
      return;
    }
    // A message dropped because the server is out of reach used to be
    // invisible: all you saw was the effect, a negotiation that never
    // arrived.
    const kind = (obj as any)?.type ?? '?';
    log('dropped (server out of reach):', kind);
  }

  private scheduleReconnect() {
    if (this.closedByUser || this.reconnectTimer) return;
    const held = this.pausedUntil - Date.now();
    // A pinch of chance on top of the backoff: two phones behind the
    // same address that lost the server together would otherwise knock
    // again in step, forever, and trip its brake together too.
    const jitter = Math.floor(Math.random() * (this.backoff / 2));
    const delay = held > 0 ? held : this.backoff + jitter;
    if (held <= 0) this.backoff = Math.min(this.backoff * 2, RECONNECT_MAX_MS);
    log('trying again in', delay, 'ms');
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.open();
    }, delay);
  }

  /**
   * Closes the connection to the server.
   *
   * @param goodbye tell the other side we are REALLY leaving
   *
   * The goodbye is not a matter of manners: the server passes it on as
   * "they left on purpose", and their phone writes "they
   * disconnected". It must only be said when it is true.
   *
   * Almost every close is not: we close in order to reopen right away -
   * the headless presence handing over to the app, a change of
   * connection, the link being rebuilt. Saying goodbye in those cases
   * accused somebody who had done nothing of disconnecting on purpose,
   * and whoever read it stopped waiting for them.
   *
   * With no goodbye the server sees the socket drop and tells it for
   * what it is: a drop, after which coming back is the normal thing.
   */
  close(goodbye = false) {
    this.closedByUser = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      if (goodbye) {
        try { this.rawSend({ type: 'bye' }); } catch { /* noop */ }
      }
      try { this.ws.close(); } catch { /* noop */ }
      this.ws = null;
    }
  }
}
