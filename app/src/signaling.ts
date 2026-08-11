import { SignalCrypto } from './crypto';

/**
 * Connessione al signaling.
 *
 * La stessa connessione serve a due fasi:
 *
 *  - ACCOPPIAMENTO: si scambiano chiavi pubbliche in chiaro (messaggi
 *    `pair`). Non c'e' nulla da nascondere: senza il codice, che al
 *    server non arriva mai, quelle chiavi non bastano a ricavare nulla.
 *
 *  - USO NORMALE: tutto il resto viaggia dentro `signal`, cifrato con la
 *    chiave stabilita all'accoppiamento. Il server inoltra buste opache.
 *
 * Lo stato `mode` dice al server se siamo solo raggiungibili
 * (`listening`) o dentro il canale (`active`).
 */

export type SignalMessage =
  | { kind: 'desc'; type: 'offer' | 'answer'; sdp: string }
  | { kind: 'ice'; candidate: any }
  | { kind: 'state'; audio: boolean; video: boolean; aspect?: number };

export type PairMessage =
  | { kind: 'pubkey'; pub: string; name: string }
  | { kind: 'confirm'; proof: string };

export type Mode = 'listening' | 'active';

/** Un server ICE (STUN o TURN) come lo descrive WebRTC. */
export type IceServer = {
  urls: string | string[];
  username?: string;
  credential?: string;
};

export type PresenceStatus =
  | 'connecting'
  | 'alone'      // collegati, l'altro non e' nel canale
  | 'together'   // ci siamo entrambi nel canale
  | 'offline';   // niente rete o server irraggiungibile

export type SignalingEvents = {
  onStatus?: (s: PresenceStatus) => void;
  onJoined?: (info: {
    polite: boolean;
    peerPresent: boolean;
    peerActive: boolean;
    peerName: string;
    /** collegamento di riserva, configurato sul server */
    turn: IceServer | null;
  }) => void;
  onPeerJoined?: (name: string, mode: Mode) => void;
  onPeerLeft?: () => void;
  onPeerMode?: (mode: Mode, name: string) => void;
  /** il server ci avvisa: l'altro e' entrato, oppure ha bussato */
  onNotify?: (reason: 'peer-active' | 'knock', name: string) => void;
  onSignal?: (msg: SignalMessage) => void;
  onPair?: (msg: PairMessage) => void;
  onKnockResult?: (ok: boolean, error?: string) => void;
  onError?: (code: string) => void;
};

const RECONNECT_MIN_MS = 1000;
const RECONNECT_MAX_MS = 15000;

export type SignalingOptions = {
  serverUrl: string;
  accessToken: string;
  /** stanza = impronta del codice di accoppiamento */
  room: string;
  displayName: string;
  /** chiave della coppia; assente durante l'accoppiamento */
  key?: Uint8Array | string | null;
  /** lato della coppia: identifica il dispositivo, cosi' riagganciandosi
   *  riprende il proprio posto invece di essere respinto */
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

  /** La chiave arriva solo a accoppiamento concluso. */
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
    this.ws = ws;

    ws.onopen = () => {
      this.backoff = RECONNECT_MIN_MS;
      this.rawSend({
        type: 'join',
        room: this.opts.room,
        token: this.opts.accessToken,
        name: this.opts.displayName || 'Qualcuno',
        mode: this.mode,
        side: this.opts.side,
      });
    };

    ws.onmessage = (ev) => this.handle(ev.data);
    ws.onerror = () => { /* la chiusura seguira': il reconnect e' li' */ };
    ws.onclose = () => {
      this.events.onStatus?.('offline');
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
        this.events.onPeerJoined?.(msg.name || 'Qualcuno', msg.mode === 'active' ? 'active' : 'listening');
        break;

      case 'peer-left':
        this.events.onStatus?.('alone');
        this.events.onPeerLeft?.();
        break;

      case 'peer-mode':
        this.events.onStatus?.(msg.mode === 'active' ? 'together' : 'alone');
        this.events.onPeerMode?.(msg.mode, msg.name || '');
        break;

      case 'notify':
        this.events.onNotify?.(msg.reason, msg.name || 'Qualcuno');
        break;

      case 'signal': {
        if (!this.crypto) return;
        const clear = this.crypto.open<SignalMessage>(msg.payload);
        if (!clear) {
          // Busta non decifrabile: chiavi diverse fra i due telefoni,
          // oppure qualcuno ha provato a manometterla lungo la strada.
          this.events.onError?.('decrypt-failed');
          return;
        }
        this.events.onSignal?.(clear);
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

  /** Messaggio WebRTC/stato, cifrato. */
  sendSignal(msg: SignalMessage) {
    if (!this.crypto) return;
    this.rawSend({ type: 'signal', payload: this.crypto.seal(msg) });
  }

  /** Messaggio di accoppiamento, in chiaro (chiavi pubbliche). */
  sendPair(msg: PairMessage) {
    this.rawSend({ type: 'pair', payload: msg });
  }

  /** Entra o esce dal canale. E' questo a far scattare la notifica all'altro. */
  setMode(mode: Mode) {
    if (mode === this.mode) return;
    this.mode = mode;
    this.rawSend({ type: 'mode', mode });
  }

  getMode(): Mode {
    return this.mode;
  }

  /** Chiede al server di avvisare l'altro. */
  knock() {
    this.rawSend({ type: 'knock' });
  }

  get connected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  private rawSend(obj: unknown) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(obj));
      return;
    }
    // Un messaggio scartato perche' il server non e' raggiungibile era
    // finora invisibile: si vedeva solo l'effetto, cioe' una negoziazione
    // che non arrivava mai a destinazione.
    const kind = (obj as any)?.type ?? '?';
    console.log('[duotalk-sig]', 'scartato (server irraggiungibile):', kind);
  }

  private scheduleReconnect() {
    if (this.closedByUser || this.reconnectTimer) return;
    const delay = this.backoff;
    this.backoff = Math.min(this.backoff * 2, RECONNECT_MAX_MS);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.open();
    }, delay);
  }

  close() {
    this.closedByUser = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      try { this.rawSend({ type: 'bye' }); } catch { /* noop */ }
      try { this.ws.close(); } catch { /* noop */ }
      this.ws = null;
    }
  }
}
