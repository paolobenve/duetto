import { SignalCrypto } from './crypto';
import type { DuoConfig } from './config';

/**
 * Client di signaling.
 *
 * Verso il server viaggiano solo:
 *   - il messaggio "join" (room + token in chiaro: servono al server)
 *   - messaggi "signal" il cui campo `payload` e' una BUSTA CIFRATA
 *
 * Il contenuto WebRTC (SDP/ICE) sta dentro la busta cifrata: il server
 * non lo vede. Qui gestiamo anche la riconnessione automatica.
 */

export type SignalMessage =
  | { kind: 'offer'; sdp: string }
  | { kind: 'answer'; sdp: string }
  | { kind: 'ice'; candidate: any };

export type SignalingEvents = {
  onStatus?: (s: SignalingStatus) => void;
  onJoined?: (info: { initiator: boolean; peers: number }) => void;
  onPeerJoined?: () => void;
  onPeerLeft?: () => void;
  onSignal?: (msg: SignalMessage) => void;
  onError?: (code: string) => void;
};

export type SignalingStatus =
  | 'connecting'
  | 'waiting-peer' // connesso al server, aspetto l'altro
  | 'peer-present' // l'altro c'e'
  | 'disconnected';

const RECONNECT_MS = 2000;

export class Signaling {
  private ws: WebSocket | null = null;
  private crypto: SignalCrypto;
  private closedByUser = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private cfg: DuoConfig, private events: SignalingEvents) {
    this.crypto = new SignalCrypto(cfg.secret);
  }

  connect() {
    this.closedByUser = false;
    this.open();
  }

  private open() {
    this.events.onStatus?.('connecting');
    let ws: WebSocket;
    try {
      ws = new WebSocket(this.cfg.serverUrl);
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.ws = ws;

    ws.onopen = () => {
      // handshake: room + token in chiaro (necessari al server)
      this.rawSend({
        type: 'join',
        room: this.cfg.room,
        token: this.cfg.accessToken,
      });
    };

    ws.onmessage = (ev) => this.handle(ev.data);

    ws.onerror = () => {
      // la chiusura seguira'; gestiamo li' il reconnect
    };

    ws.onclose = () => {
      this.events.onStatus?.('disconnected');
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
        this.events.onStatus?.(msg.peers > 0 ? 'peer-present' : 'waiting-peer');
        this.events.onJoined?.({ initiator: !!msg.initiator, peers: msg.peers ?? 0 });
        break;
      case 'peer-joined':
        this.events.onStatus?.('peer-present');
        this.events.onPeerJoined?.();
        break;
      case 'peer-left':
        this.events.onStatus?.('waiting-peer');
        this.events.onPeerLeft?.();
        break;
      case 'signal': {
        const clear = this.crypto.open<SignalMessage>(msg.payload);
        if (!clear) {
          // Busta non decifrabile: passphrase diversa o tentativo di manomissione.
          this.events.onError?.('decrypt-failed');
          return;
        }
        this.events.onSignal?.(clear);
        break;
      }
      case 'error':
        this.events.onError?.(msg.error || 'unknown');
        break;
    }
  }

  /** Invia un messaggio WebRTC cifrato all'altro peer. */
  sendSignal(msg: SignalMessage) {
    const payload = this.crypto.seal(msg);
    this.rawSend({ type: 'signal', payload });
  }

  private rawSend(obj: unknown) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(obj));
    }
  }

  private scheduleReconnect() {
    if (this.closedByUser || this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.open();
    }, RECONNECT_MS);
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
