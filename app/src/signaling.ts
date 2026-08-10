import { SignalCrypto } from './crypto';
import type { DuoConfig } from './config';

/**
 * Client di signaling per il canale.
 *
 * In chiaro verso il server viaggiano solo i dati che gli servono per
 * fare il suo mestiere: canale, token, topic ntfy da suonare e nome
 * mostrato nella notifica.
 *
 * Tutto il resto (SDP, ICE, stato di mic e camera) sta dentro `payload`,
 * che e' una BUSTA CIFRATA con la passphrase condivisa: il server la
 * inoltra senza poterla leggere.
 */

export type SignalMessage =
  | { kind: 'desc'; type: 'offer' | 'answer'; sdp: string }
  | { kind: 'ice'; candidate: any }
  // `aspect` = larghezza/altezza del video COSI' COME VIENE MOSTRATO da chi
  // lo manda (dipende dal suo orientamento), per dare al riquadrino le
  // proporzioni giuste invece di un rettangolo fisso.
  | { kind: 'state'; audio: boolean; video: boolean; aspect?: number };

export type PresenceStatus =
  | 'connecting'   // sto raggiungendo il server
  | 'alone'        // sono nel canale, l'altro non c'e'
  | 'together'     // ci siamo entrambi
  | 'offline';     // niente rete / server irraggiungibile

export type SignalingEvents = {
  onStatus?: (s: PresenceStatus) => void;
  onJoined?: (info: { polite: boolean; peerPresent: boolean }) => void;
  onPeerJoined?: (name: string) => void;
  onPeerLeft?: () => void;
  onSignal?: (msg: SignalMessage) => void;
  onKnockResult?: (ok: boolean, error?: string) => void;
  onError?: (code: string) => void;
};

const RECONNECT_MIN_MS = 1000;
const RECONNECT_MAX_MS = 15000;

export class Signaling {
  private ws: WebSocket | null = null;
  private crypto: SignalCrypto;
  private closedByUser = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private backoff = RECONNECT_MIN_MS;

  constructor(private cfg: DuoConfig, private events: SignalingEvents) {
    this.crypto = new SignalCrypto(cfg.secret);
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
      ws = new WebSocket(this.cfg.serverUrl);
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.ws = ws;

    ws.onopen = () => {
      this.backoff = RECONNECT_MIN_MS;
      // Handshake. peerTopic e nome servono al server per il campanello ntfy.
      this.rawSend({
        type: 'join',
        room: this.cfg.channel,
        token: this.cfg.accessToken,
        peerTopic: this.cfg.peerTopic,
        name: this.cfg.displayName || 'Qualcuno',
      });
    };

    ws.onmessage = (ev) => this.handle(ev.data);
    ws.onerror = () => { /* la chiusura seguira': il reconnect e' gestito li' */ };
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
      case 'joined': {
        const peerPresent = (msg.peers ?? 0) > 0;
        this.events.onStatus?.(peerPresent ? 'together' : 'alone');
        this.events.onJoined?.({ polite: !!msg.polite, peerPresent });
        break;
      }
      case 'peer-joined':
        this.events.onStatus?.('together');
        this.events.onPeerJoined?.(msg.name || 'Qualcuno');
        break;
      case 'peer-left':
        this.events.onStatus?.('alone');
        this.events.onPeerLeft?.();
        break;
      case 'signal': {
        const clear = this.crypto.open<SignalMessage>(msg.payload);
        if (!clear) {
          // Busta non decifrabile: passphrase diversa fra i due telefoni,
          // oppure qualcuno ha provato a manometterla lungo la strada.
          this.events.onError?.('decrypt-failed');
          return;
        }
        this.events.onSignal?.(clear);
        break;
      }
      case 'knock-result':
        this.events.onKnockResult?.(!!msg.ok, msg.error);
        break;
      case 'error':
        this.events.onError?.(msg.error || 'unknown');
        break;
    }
  }

  /** Invia un messaggio WebRTC/stato cifrato all'altro. */
  sendSignal(msg: SignalMessage) {
    this.rawSend({ type: 'signal', payload: this.crypto.seal(msg) });
  }

  /** Chiede al server di far suonare la notifica sul telefono dell'altro. */
  knock() {
    this.rawSend({ type: 'knock' });
  }

  get connected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  private rawSend(obj: unknown) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(obj));
    }
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
