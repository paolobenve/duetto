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
  onJoined?: (info: {
    polite: boolean;
    peerPresent: boolean;
    peerActive: boolean;
    peerName: string;
    /** the fallback relay, configured on the server */
    turn: IceServer | null;
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
  onError?: (code: string) => void;
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
const RECONNECT_MIN_MS = 500;
const RECONNECT_MAX_MS = 4000;

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
  private crypto: SignalCrypto | null = null;
  private closedByUser = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private backoff = RECONNECT_MIN_MS;
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
      this.rawSend({
        type: 'join',
        room: this.opts.room,
        key: this.opts.serverKey || undefined,
        name: this.opts.displayName || 'Someone',
        mode: this.mode,
        side: this.opts.side,
      });
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

  private handle(data: any) {
    let msg: any;
    try {
      msg = JSON.parse(typeof data === 'string' ? data : String(data));
    } catch {
      return;
    }

    switch (msg.type) {
      case 'joined':
        this.events.onStatus?.(msg.peerActive ? 'together' : 'alone');
        this.events.onJoined?.({
          polite: !!msg.polite,
          peerPresent: !!msg.peerPresent,
          peerActive: !!msg.peerActive,
          peerName: msg.peerName || '',
          turn: msg.turn ?? null,
        });
        break;

      case 'peer-joined':
        if (msg.mode === 'active') this.events.onStatus?.('together');
        this.events.onPeerJoined?.(
          msg.name || 'Someone', msg.mode === 'active' ? 'active' : 'listening',
        );
        break;

      case 'peer-left':
        this.events.onStatus?.('alone');
        // "bye" = they left; "dropped" = their connection went, and
        // they will most likely be back. Older servers do not say
        // which: with no reason given we treat it as a drop, which is
        // the case where being wrong costs less.
        this.events.onPeerLeft?.(msg.reason === 'bye' ? 'bye' : 'dropped');
        break;

      case 'presence':
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
        this.events.onError?.(msg.error || 'unknown');
        break;
    }
  }

  /** A WebRTC or state message, encrypted. */
  sendSignal(msg: SignalMessage) {
    if (!this.crypto) return;
    this.rawSend({ type: 'signal', payload: this.crypto.seal(msg) });
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
    const delay = this.backoff;
    this.backoff = Math.min(this.backoff * 2, RECONNECT_MAX_MS);
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
