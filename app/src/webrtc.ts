import { Dimensions } from 'react-native';
import {
  RTCPeerConnection,
  RTCSessionDescription,
  RTCIceCandidate,
  mediaDevices,
  MediaStream,
} from 'react-native-webrtc';
import type { DuoConfig } from './config';
import { iceServers } from './config';
import type { Signaling, SignalMessage } from './signaling';

/**
 * Sessione del canale: audio sempre, video a richiesta.
 *
 * Entrando nel canale si apre SOLO il microfono. La camera viene accesa
 * solo quando la chiedi: cosi' non resta occupata (e l'indicatore privacy
 * di Android non resta acceso) mentre stai nel canale solo per esserci.
 *
 * Il canale video verso l'altro viene pero' aperto SUBITO, anche se
 * vuoto: accendere e spegnere la camera si limita a mettere o togliere
 * la traccia al suo interno, senza rinegoziare nulla. E' la differenza
 * fra un video che si riaccende sempre e uno che dopo il primo giro
 * mostra uno schermo nero.
 *
 * La "perfect negotiation" resta per le rinegoziazioni che possono
 * comunque capitare: se i due si accavallano, il polite (chi era gia'
 * nel canale) cede e annulla la propria offerta.
 */

export type ChannelEvents = {
  onLocalStream?: (s: MediaStream | null) => void;
  onRemoteStream?: (s: MediaStream | null) => void;
  onConnectionState?: (state: string) => void;
  /** stato di mic/camera dell'altra persona, con le proporzioni del suo video */
  onPeerState?: (st: { audio: boolean; video: boolean; aspect?: number }) => void;
  /**
   * Se stiamo ricevendo una traccia video.
   *
   * Serve un evento esplicito: le tracce vengono aggiunte DENTRO lo
   * stesso oggetto MediaStream, quindi rinotificare lo stream non
   * cambierebbe il riferimento e React non ridisegnerebbe nulla.
   */
  onRemoteVideo?: (present: boolean) => void;
};

/** Proporzioni di ripiego: anteprima verticale 9:16, il caso piu' comune. */
export const DEFAULT_ASPECT = 9 / 16;

/**
 * Diagnostica del collegamento.
 *
 * Quando la connessione non si stabilisce, dall'esterno si vede solo
 * "sto stabilendo la connessione". Serve sapere DOVE si ferma: se i
 * candidati vengono raccolti, di che tipo sono (host = stessa rete,
 * srflx = visto da fuori tramite STUN, relay = passa dal TURN), e a che
 * punto si blocca lo stato di ICE. Si legge con:
 *
 *   adb logcat -s ReactNativeJS | grep duotalk
 */
const log = (...args: any[]) => console.log('[duotalk-rtc]', ...args);

/** host / srflx / prflx / relay: dice che strada sta tentando ICE. */
function candidateType(candidate: string): string {
  const m = /(?:^| )typ ([a-z]+)/.exec(candidate || '');
  return m ? m[1] : '?';
}

export class ChannelSession {
  private pc: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private remoteStream: MediaStream | null = null;
  private videoSender: any = null;

  private polite = false;
  private makingOffer = false;
  private ignoreOffer = false;
  /** candidate arrivati prima della remote description: li mettiamo in coda */
  private pendingCandidates: any[] = [];
  /** relay comunicato dal server: evita di configurarlo su ogni telefono */
  private extraIce: any[] = [];

  /** Collegamento di riserva ricevuto dal server. */
  setServerIceServers(list: any[]) {
    this.extraIce = list ?? [];
  }

  constructor(
    private cfg: DuoConfig,
    private signaling: Signaling,
    private events: ChannelEvents,
  ) {}

  // --- Ingresso nel canale -------------------------------------------------

  /** Apre il microfono. Da chiamare appena si entra nel canale. */
  async enterChannel() {
    if (this.localStream) return;
    this.localStream = await mediaDevices.getUserMedia({ audio: true, video: false });
    this.events.onLocalStream?.(this.localStream);
  }

  /** Crea la connessione con l'altro. Chiamata quando entrambi siamo presenti. */
  async attachPeer(polite: boolean) {
    if (this.pc) return;
    if (!this.localStream) await this.enterChannel();

    this.polite = polite;
    const servers = [...iceServers(this.cfg), ...this.extraIce];
    log('collego il peer - offre l\'altro:', polite, '| ICE server:',
      servers.map((s2) => s2.urls).join(', '));
    const pc = new RTCPeerConnection({ iceServers: servers });
    this.pc = pc;

    this.remoteStream = new MediaStream();

    // @ts-ignore evento di react-native-webrtc
    pc.addEventListener('track', (event: any) => {
      const stream = this.remoteStream;
      if (!stream) return;
      const incoming: any = event.track;
      log('traccia in arrivo:', incoming?.kind, 'id', incoming?.id);

      if (incoming) {
        // Via le tracce dello stesso tipo ormai chiuse. Se restassero, il
        // renderer continuerebbe a disegnare la prima della lista - cioe'
        // quella morta - e si vedrebbe uno schermo nero invece del video.
        stream.getTracks()
          .filter((x: any) =>
            x.kind === incoming.kind && x.id !== incoming.id && x.readyState === 'ended')
          .forEach((x: any) => {
            log('tolgo traccia esaurita:', x.kind, x.id);
            try { stream.removeTrack(x); } catch { /* noop */ }
          });
        if (!stream.getTracks().find((x: any) => x.id === incoming.id)) {
          stream.addTrack(incoming);
        }
      }

      this.events.onRemoteStream?.(stream);
      this.reportRemoteVideo();

      incoming?.addEventListener?.('ended', () => {
        log('traccia terminata:', incoming.kind, incoming.id);
        try { stream.removeTrack(incoming); } catch { /* noop */ }
        this.events.onRemoteStream?.(stream);
        this.reportRemoteVideo();
      });
      incoming?.addEventListener?.('mute', () => {
        log('traccia sospesa:', incoming.kind);
        this.reportRemoteVideo();
      });
      incoming?.addEventListener?.('unmute', () => {
        log('traccia ripresa:', incoming.kind);
        this.reportRemoteVideo();
      });
    });

    // @ts-ignore
    pc.addEventListener('icecandidate', (event: any) => {
      if (event.candidate) {
        log('candidato locale', candidateType(event.candidate.candidate));
        this.signaling.sendSignal({ kind: 'ice', candidate: event.candidate });
      } else {
        log('raccolta candidati locali conclusa');
      }
    });

    // @ts-ignore
    pc.addEventListener('icecandidateerror', (e: any) => {
      // Tipico se STUN/TURN non risponde o le credenziali sono sbagliate.
      log('errore su candidato:', e?.errorCode, e?.errorText, e?.url);
    });

    // @ts-ignore
    pc.addEventListener('iceconnectionstatechange', () => {
      log('ICE:', pc.iceConnectionState);
    });

    // @ts-ignore
    pc.addEventListener('icegatheringstatechange', () => {
      log('raccolta candidati:', pc.iceGatheringState);
    });

    // @ts-ignore
    pc.addEventListener('connectionstatechange', () => {
      log('connessione:', pc.connectionState);
      this.events.onConnectionState?.(pc.connectionState);
    });

    // @ts-ignore
    pc.addEventListener('negotiationneeded', async () => {
      // Offre SEMPRE e SOLO una delle due parti.
      //
      // Aprire il canale video scatena questo evento su entrambi i
      // telefoni: se offrissero tutti e due, le offerte si scontrerebbero
      // e la risoluzione dipenderebbe dal rollback, che in
      // react-native-webrtc non e' affidabile. Era la causa del
      // "a volte funziona, a volte no".
      if (this.polite) {
        log('rinegoziazione richiesta, ma tocca all\'altro: lascio fare');
        return;
      }
      await this.negotiate();
    });

    // --- Solo ORA le tracce -------------------------------------------
    // I gestori vanno registrati PRIMA di toccare tracce e canali.
    // Qui sotto c'e' un await (replaceTrack, quando la camera e' gia'
    // accesa): durante quell'attesa scatta la richiesta di negoziazione,
    // e se il gestore non fosse ancora registrato andrebbe persa. Era
    // esattamente il caso del riaggancio a camera accesa: la connessione
    // veniva ricostruita ma l'offerta non partiva mai.
    // Audio: c'e' sempre.
    const audioTrack = this.localStream!.getAudioTracks()[0];
    if (audioTrack) pc.addTrack(audioTrack, this.localStream as MediaStream);

    // Video: il canale viene aperto SUBITO, anche senza traccia dentro.
    //
    // E' la scelta che rende affidabile l'accensione e lo spegnimento.
    // Aggiungendo e togliendo la traccia ogni volta si rinegozia, si
    // creano tracce nuove che si accavallano alle vecchie, e dall'altra
    // parte si finisce per disegnare quella morta (schermo nero). Con il
    // canale sempre aperto basta sostituire la traccia al suo interno:
    // niente rinegoziazione e niente tracce che si accumulano.
    // Lo dichiara UNA SOLA delle due parti: quella che fa l'offerta.
    // Dichiarandolo entrambi, la dichiarazione di chi risponde rischia di
    // restare orfana - non entra nella negoziazione - e quel telefono non
    // riesce piu' a inviare il proprio video pur ricevendo quello altrui.
    // Chi risponde se lo prende dalla negoziazione (captureVideoSender).
    if (!polite) {
      try {
        const vt: any = (pc as any).addTransceiver('video', { direction: 'sendrecv' });
        this.videoSender = vt?.sender ?? null;
        log('canale video dichiarato da noi:', !!this.videoSender);
      } catch (e) {
        log('addTransceiver non disponibile, ripiego su addTrack:', String(e));
        this.videoSender = null;
      }
    } else {
      log('canale video: lo dichiara l\'altro, lo prendo a negoziazione fatta');
    }

    // Se il video era gia' acceso, la traccia entra nel canale appena aperto.
    const existingVideo = this.localStream!.getVideoTracks()[0];
    if (existingVideo) {
      if (this.videoSender) {
        try { await this.videoSender.replaceTrack(existingVideo); } catch { /* noop */ }
      } else {
        this.videoSender = pc.addTrack(existingVideo, this.localStream as MediaStream);
      }
    }


    // E la negoziazione la avviamo comunque noi, invece di sperare
    // nell'evento: se e' gia' partita, il controllo dentro negotiate()
    // la lascia proseguire senza sovrapporsi.
    if (!polite) await this.negotiate();
  }

  private async negotiate() {
    const pc = this.pc;
    if (!pc) return;
    // Una negoziazione alla volta: due offerte in parallelo si
    // annullerebbero a vicenda.
    if (this.makingOffer || pc.signalingState !== 'stable') {
      log('negoziazione gia\' in corso o stato non stabile:', pc.signalingState);
      return;
    }
    try {
      this.makingOffer = true;
      const offer = await pc.createOffer({});
      await pc.setLocalDescription(offer);
      const desc = pc.localDescription!;
      log('offerta inviata');
      this.signaling.sendSignal({ kind: 'desc', type: 'offer', sdp: desc.sdp });
    } catch (e) {
      log('negoziazione fallita:', String(e));
      // se la negoziazione fallisce ci riprovera' il prossimo evento
    } finally {
      this.makingOffer = false;
    }
  }

  // --- Messaggi dall'altro peer -------------------------------------------

  async onSignal(msg: SignalMessage) {
    if (msg.kind === 'state') {
      this.events.onPeerState?.({
        audio: msg.audio,
        video: msg.video,
        aspect: msg.aspect,
      });
      return;
    }

    if (msg.kind === 'renegotiate') return; // gestito da chi conosce il ruolo

    const pc = this.pc;
    if (!pc) return;

    if (msg.kind === 'desc') {
      log('ricevuto', msg.type, '- stato:', pc.signalingState);
      const collision =
        msg.type === 'offer' && (this.makingOffer || pc.signalingState !== 'stable');

      // Impolite: in caso di collisione ignora l'offerta dell'altro.
      this.ignoreOffer = !this.polite && collision;
      if (this.ignoreOffer) { log('offerta ignorata (collisione, siamo impolite)'); return; }

      if (collision) {
        // Polite: annulla la propria offerta e accetta quella dell'altro.
        try {
          await pc.setLocalDescription({ type: 'rollback' } as any);
        } catch {
          // se il rollback non e' supportato proseguiamo comunque
        }
      }

      await pc.setRemoteDescription(
        new RTCSessionDescription({ type: msg.type, sdp: msg.sdp }),
      );
      await this.flushCandidates();
      await this.captureVideoSender();

      if (msg.type === 'offer') {
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        log('risposta inviata - direzioni:',
          ((pc as any).getTransceivers?.() ?? [])
            .map((t: any) => `${t?.receiver?.track?.kind ?? '?'}:${t?.direction}`)
            .join(' '));
        this.signaling.sendSignal({
          kind: 'desc',
          type: 'answer',
          sdp: pc.localDescription!.sdp,
        });
      }
      return;
    }

    if (msg.kind === 'ice') {
      if (this.ignoreOffer) { log('offerta ignorata (collisione, siamo impolite)'); return; }
      // Se la remote description non c'e' ancora, il candidate va in coda.
      if (!pc.remoteDescription) {
        this.pendingCandidates.push(msg.candidate);
        return;
      }
      try {
        await pc.addIceCandidate(new RTCIceCandidate(msg.candidate));
      } catch {
        // candidate duplicato o fuori ordine: ignorabile
      }
    }
  }

  /**
   * Individua il canale video dopo la negoziazione.
   *
   * Serve a chi non lo ha dichiarato: il canale esiste perche' lo ha
   * aperto l'altro, e da qui in poi possiamo usarlo anche noi per
   * inviare, mettendoci semplicemente dentro la traccia.
   */
  private async captureVideoSender() {
    if (this.videoSender || !this.pc) return;
    const list: any[] = (this.pc as any).getTransceivers?.() ?? [];
    const video = list.find(
      (t) => t?.receiver?.track?.kind === 'video' || t?.sender?.track?.kind === 'video',
    );
    if (!video?.sender) {
      log('canale video non ancora individuabile');
      return;
    }

    // IMPORTANTE: un canale creato applicando l'offerta dell'altro nasce in
    // sola ricezione. Cosi' com'e' potremmo vedere il video altrui ma non
    // inviare il nostro, e il difetto sarebbe asimmetrico - proprio quello
    // che si vedeva. Lo portiamo a bidirezionale ORA, prima di preparare la
    // risposta, cosi' viaggia in questa stessa negoziazione senza doverne
    // aprire un'altra (cosa che a noi, che non offriamo, e' preclusa).
    try {
      if (video.direction !== 'sendrecv') {
        log('canale video era', video.direction, '-> lo porto a sendrecv');
        video.direction = 'sendrecv';
      }
    } catch (e) {
      log('non riesco a cambiare direzione del canale video:', String(e));
    }

    this.videoSender = video.sender;
    log('canale video individuato, direzione', video.direction);

    // Se nel frattempo la camera era gia' accesa, la traccia entra ora.
    const localVideo = this.localStream?.getVideoTracks()[0];
    if (localVideo) {
      try {
        await this.videoSender.replaceTrack(localVideo);
        await this.keepResolutionStable();
        log('traccia locale inserita nel canale appena individuato');
      } catch (e) {
        log('inserimento traccia fallito:', String(e));
      }
    }
  }

  /** Esiste una connessione con l'altro, buona o meno che sia. */
  hasPeer(): boolean {
    return !!this.pc;
  }

  /**
   * Il collegamento diretto e' ancora buono?
   *
   * Dopo un'interruzione di rete la connessione resta li' ma e' morta
   * ("failed" o "disconnected"): va ricostruita, non riusata.
   */
  isPeerHealthy(): boolean {
    const st = this.pc?.connectionState;
    if (!st) return false;
    return st !== 'failed' && st !== 'closed' && st !== 'disconnected';
  }

  /**
   * C'e' una traccia video dall'altro, non ancora chiusa.
   *
   * Di proposito NON guardiamo "muted": la semantica varia fra versioni
   * e piattaforme. Se il video sia effettivamente acceso lo dice l'altro
   * col messaggio di stato; qui rispondiamo solo se il canale video
   * esiste. Le due informazioni vengono combinate nell'interfaccia.
   */
  hasRemoteVideo(): boolean {
    const t: any = this.remoteStream?.getVideoTracks()[0];
    return !!t && t.readyState !== 'ended';
  }

  private reportRemoteVideo() {
    const tracks: any[] = this.remoteStream?.getVideoTracks() ?? [];
    const present = this.hasRemoteVideo();
    log('video remoto:', present ? 'presente' : 'assente',
      '- tracce video nello stream:', tracks.length,
      tracks.map((t) => `${t.id}:${t.readyState}`).join(' '));
    this.events.onRemoteVideo?.(present);
  }

  private async flushCandidates() {
    const pc = this.pc;
    if (!pc) return;
    const queued = this.pendingCandidates;
    this.pendingCandidates = [];
    for (const c of queued) {
      try { await pc.addIceCandidate(new RTCIceCandidate(c)); } catch { /* noop */ }
    }
  }

  // --- Controlli -----------------------------------------------------------

  /** Accende/spegne il microfono. Ritorna il nuovo stato. */
  toggleAudio(): boolean {
    const track = this.localStream?.getAudioTracks()[0];
    if (!track) return false;
    track.enabled = !track.enabled;
    this.broadcastState();
    return track.enabled;
  }

  /** Accende la camera: mette la traccia nel canale gia' aperto. */
  async enableVideo(): Promise<boolean> {
    if (!this.localStream || this.localStream.getVideoTracks().length > 0) return true;
    const cam = await mediaDevices.getUserMedia({
      video: {
        facingMode: 'user',
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: 30 },
        // Proporzioni dichiarate esplicitamente: senza, il sensore puo'
        // scegliere un formato diverso (4:3 invece di 16:9) e con esso
        // cambia l'angolo di ripresa, quindi cosa resta dentro
        // l'inquadratura.
        aspectRatio: { ideal: 16 / 9 },
      },
    } as any);
    const track = cam.getVideoTracks()[0];
    if (!track) return false;

    this.localStream.addTrack(track);          // anteprima locale
    try {
      const st: any = (track as any).getSettings?.() ?? {};
      log('camera accesa:', `${st.width ?? '?'}x${st.height ?? '?'}`,
        st.frameRate ? `@${Math.round(st.frameRate)}fps` : '', '- traccia', track.id);
    } catch {
      log('camera accesa, traccia', track.id);
    }

    if (this.videoSender) {
      // Nessuna rinegoziazione: l'altro vede semplicemente ripartire i
      // fotogrammi sulla traccia che gia' aveva.
      try {
        await this.videoSender.replaceTrack(track);
        await this.keepResolutionStable();
      } catch (e) {
        log('replaceTrack fallita:', String(e));
      }
    } else if (this.pc) {
      // Ripiego, se il canale video non era stato aperto in anticipo.
      this.videoSender = this.pc.addTrack(track, this.localStream);
    }

    this.events.onLocalStream?.(this.localStream);
    this.broadcastState();
    return true;
  }

  /**
   * Chiede di non ridurre la risoluzione quando la banda scarseggia.
   *
   * Il comportamento predefinito e' l'opposto: WebRTC abbassa la
   * risoluzione, e molti sensori cambiando formato cambiano anche
   * l'angolo di ripresa. Dall'altra parte si vede l'inquadratura
   * allargarsi e restringersi da sola. Meglio perdere fotogrammi che
   * cambiare cosa si inquadra.
   */
  private async keepResolutionStable() {
    const sender: any = this.videoSender;
    if (!sender?.getParameters) return;
    try {
      const params = sender.getParameters();
      params.degradationPreference = 'maintain-resolution';
      if (Array.isArray(params.encodings) && params.encodings.length > 0) {
        params.encodings[0].scaleResolutionDownBy = 1;
      }
      await sender.setParameters(params);
      log('risoluzione bloccata: sotto banda scarsa calano i fotogrammi');
    } catch (e) {
      log('non riesco a bloccare la risoluzione:', String(e));
    }
  }

  /** Spegne la camera: svuota il canale e rilascia davvero la camera. */
  async disableVideo(): Promise<boolean> {
    const track = this.localStream?.getVideoTracks()[0];

    if (this.videoSender) {
      // Il canale resta aperto e pronto per la prossima accensione.
      try {
        await this.videoSender.replaceTrack(null);
      } catch (e) {
        log('replaceTrack(null) fallita:', String(e));
      }
    }

    if (track && this.localStream) {
      this.localStream.removeTrack(track);
      track.stop(); // libera la camera e spegne l'indicatore di Android
      log('camera spenta, traccia', track.id);
    }

    this.events.onLocalStream?.(this.localStream);
    this.broadcastState();
    return false;
  }

  /** Passa da camera frontale a posteriore. */
  switchCamera() {
    const track = this.localStream?.getVideoTracks()[0] as any;
    if (track && typeof track._switchCamera === 'function') track._switchCamera();
  }

  /**
   * Proporzioni con cui il MIO video viene mostrato (larghezza/altezza).
   *
   * La camera consegna sempre un fotogramma orizzontale (es. 1280x720) e
   * viene ruotato in base a come tieni il telefono: quindi il lato lungo
   * segue l'orientamento dello schermo.
   */
  getLocalVideoAspect(): number | undefined {
    const track: any = this.localStream?.getVideoTracks()[0];
    if (!track) return undefined;

    let w: number | undefined;
    let h: number | undefined;
    try {
      const s = typeof track.getSettings === 'function' ? track.getSettings() : null;
      w = s?.width;
      h = s?.height;
    } catch {
      /* alcune versioni non espongono getSettings */
    }
    if (!w || !h) return undefined;

    const longSide = Math.max(w, h);
    const shortSide = Math.min(w, h);
    const win = Dimensions.get('window');
    const portrait = win.height >= win.width;
    return portrait ? shortSide / longSide : longSide / shortSide;
  }

  /** Comunica all'altro lo stato di mic/camera e le proporzioni (cifrato). */
  broadcastState() {
    this.signaling.sendSignal({
      kind: 'state',
      audio: this.isAudioEnabled(),
      video: this.isVideoEnabled(),
      aspect: this.getLocalVideoAspect(),
    });
  }

  isAudioEnabled(): boolean {
    return this.localStream?.getAudioTracks()[0]?.enabled ?? false;
  }

  isVideoEnabled(): boolean {
    const t = this.localStream?.getVideoTracks()[0];
    return !!t && t.enabled;
  }

  /** Chiude la connessione con l'altro ma resta nel canale. */
  detachPeer() {
    this.remoteStream?.getTracks().forEach((t) => t.stop());
    this.remoteStream = null;
    this.videoSender = null;
    this.pendingCandidates = [];
    this.makingOffer = false;
    this.ignoreOffer = false;
    this.events.onRemoteStream?.(null);
    this.events.onRemoteVideo?.(false);
    if (this.pc) {
      try { this.pc.close(); } catch { /* noop */ }
      this.pc = null;
    }
  }

  /** Esce dal canale e rilascia microfono e camera. */
  leaveChannel() {
    this.detachPeer();
    this.localStream?.getTracks().forEach((t) => t.stop());
    this.localStream = null;
    this.events.onLocalStream?.(null);
  }
}
