import { SignalCrypto } from './crypto';

/**
 * Connessione al signaling.
 *
 * La stessa connessione serve a due fasi:
 *
 *  - ACCOPPIAMENTO: si scambiano chiavi pubbliche in chiaro (messaggi
 *    `pair`). Non c'è nulla da nascondere: senza il codice, che al
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
  // `watching`: l'app dell'altro sta davvero mostrando lo schermo.
  // Assente nelle build vecchie, e allora si assume di sì: meglio
  // trasmettere per niente che mostrare un riquadro nero.
  // `uscita`: da dove esce il suono dall'altra parte - vivavoce,
  // orecchio, cuffie, bluetooth. Dice come ti sta ascoltando, cosa
  // che a voce si chiede di continuo ("sei in vivavoce?").
  | { kind: 'state'; audio: boolean; video: boolean; aspect?: number; watching?: boolean;
      hwVp9?: boolean; uscita?: string }
  // Chi risponde non può offrire: se resta senza collegamento e l'altro
  // non se ne accorge, l'unica via d'uscita è chiederglielo.
  | { kind: 'renegotiate' }
  // La qualità video vale per tutti e due: cambiarla da un telefono la
  // cambia anche sull'altro. Chi la riceve non la rimanda indietro.
  | { kind: 'quality'; value: string }
  // Le opzioni audio valgono per la conversazione, non per un telefono:
  // la voce più ricca ha senso se la alzano tutti e due.
  | { kind: 'audio'; migliore: boolean }
  // Il diario dei consumi, che ogni telefono manda all'altro ogni tanto:
  // così, collegandone uno solo a un computer, si leggono tutti e due.
  // L'altro telefono sta in mano a un'altra persona e a un cavo non ci
  // arriva mai.
  | { kind: 'diario'; testo: string }
  // "Sono morta e sono tornata": chi ha visto sparire l'altro senza un
  // perche' merita di saperlo, e il telefono che e' morto il perche' lo
  // scopre riaccendendosi. Nessuno puo' mandarlo mentre muore.
  | { kind: 'morte'; quando: number; causa: string }
  // Un suono forte per richiamare chi e' nel canale ma non risponde:
  // addormentato, o col telefono dall'altra parte della stanza. Lo
  // sceglie chi lo manda, lo suona il telefono di chi lo riceve.
  | { kind: 'sveglia'; suono: string };

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
  | 'alone'      // collegati, l'altro non è nel canale
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
  /** @param motivo 'bye' se è uscito lui, 'caduta' se è sparita la rete */
  onPeerLeft?: (motivo: 'bye' | 'caduta') => void;
  onPeerMode?: (mode: Mode, name: string) => void;
  /** risposta a `chiediPresenza`: com'e' messo l'altro adesso */
  onPresence?: (info: { peerPresent: boolean; peerActive: boolean; peerName: string }) => void;
  /** il server ci avvisa: l'altro è entrato, oppure ha bussato */
  onNotify?: (reason: 'peer-active' | 'knock', name: string) => void;
  onSignal?: (msg: SignalMessage) => void;
  onPair?: (msg: PairMessage) => void;
  onKnockResult?: (ok: boolean, error?: string) => void;
  onError?: (code: string) => void;
};

/**
 * Diagnostica della connessione al server.
 *
 * Le cadute avvengono qui, e finora non lasciavano traccia: si vedeva
 * solo l'effetto sul video. Si legge con:
 *
 *   adb logcat -s ReactNativeJS | grep duetto-sig
 */
const log = (...args: any[]) => console.log('[duetto-sig]', ...args);

// Attesa fra un tentativo e l'altro. Tenuta breve di proposito: qui la
// riconnessione non è un dettaglio, è la differenza fra essere
// raggiungibili o no. Il costo di un tentativo a vuoto è trascurabile.
const RECONNECT_MIN_MS = 500;
const RECONNECT_MAX_MS = 4000;

export type SignalingOptions = {
  serverUrl: string;
  /** stanza = impronta del codice di accoppiamento */
  room: string;
  displayName: string;
  /** chiave della coppia; assente durante l'accoppiamento */
  key?: Uint8Array | string | null;
  /** lato della coppia: identifica il dispositivo, così riagganciandosi
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

  /**
   * Riprova subito, senza aspettare il tentativo programmato.
   *
   * Serve quando sappiamo che qualcosa è cambiato - l'app torna in
   * primo piano, la rete è rientrata - e attendere sarebbe tempo perso.
   */
  reconnectNow() {
    if (this.closedByUser) return;
    if (this.ws && this.ws.readyState === WebSocket.OPEN) return;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.backoff = RECONNECT_MIN_MS;
    log('riprovo subito');
    this.open();
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

    const openedAt = Date.now();
    ws.onopen = () => {
      log('collegato al server');
      this.backoff = RECONNECT_MIN_MS;
      this.rawSend({
        type: 'join',
        room: this.opts.room,
        name: this.opts.displayName || 'Qualcuno',
        mode: this.mode,
        side: this.opts.side,
      });
    };

    ws.onmessage = (ev) => this.handle(ev.data);
    ws.onerror = (e: any) => {
      log('errore di rete:', e?.message ?? '(senza dettagli)');
    };
    ws.onclose = (e: any) => {
      // Il codice dice CHI ha chiuso e perché: 1006 è una caduta di
      // rete, 1000/1001 una chiusura ordinata, 4xxx un rifiuto nostro.
      log('caduto dopo', Math.round((Date.now() - openedAt) / 1000), 's',
        '- codice', e?.code ?? '?', e?.reason ? `(${e.reason})` : '');
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
        // "bye" = se n'è andato; "caduta" = gli è caduta la connessione,
        // e con ogni probabilità torna. I server vecchi non lo dicono:
        // senza motivo si tratta come una caduta, che è il caso in cui
        // sbagliare costa meno.
        this.events.onPeerLeft?.(msg.reason === 'bye' ? 'bye' : 'caduta');
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

  /** Entra o esce dal canale. È questo a far scattare la notifica all'altro. */
  setMode(mode: Mode) {
    if (mode === this.mode) return;
    this.mode = mode;
    this.rawSend({ type: 'mode', mode });
  }

  getMode(): Mode {
    return this.mode;
  }

  /**
   * Chiede al server com'e' messo l'altro in questo momento.
   *
   * Serve a chi sta aspettando: gli annunci dicono i cambiamenti, ma la
   * caduta di chi sta solo in ascolto il server la scopre con comodo, e
   * fino ad allora la riga "in ascolto" resta li' a dire una cosa che
   * non e' piu' vera. Domandare la rinfresca, e fa anche verificare
   * quella presenza dall'altra parte.
   */
  chiediPresenza() {
    this.rawSend({ type: 'presence' });
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
    // Un messaggio scartato perché il server non è raggiungibile era
    // finora invisibile: si vedeva solo l'effetto, cioè una negoziazione
    // che non arrivava mai a destinazione.
    const kind = (obj as any)?.type ?? '?';
    console.log('[duetto-sig]', 'scartato (server irraggiungibile):', kind);
  }

  private scheduleReconnect() {
    if (this.closedByUser || this.reconnectTimer) return;
    const delay = this.backoff;
    this.backoff = Math.min(this.backoff * 2, RECONNECT_MAX_MS);
    log('riprovo fra', delay, 'ms');
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
