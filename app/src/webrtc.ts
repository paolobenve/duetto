import { Dimensions } from 'react-native';
import {
  RTCPeerConnection,
  RTCRtpReceiver,
  RTCSessionDescription,
  RTCIceCandidate,
  mediaDevices,
  MediaStream,
} from 'react-native-webrtc';
import type { DuoConfig } from './config';
import { iceServers, VIDEO_PROFILES } from './config';
import type { Signaling, SignalMessage } from './signaling';

/**
 * Sessione del canale: audio sempre, video a richiesta.
 *
 * Entrando nel canale si apre SOLO il microfono. La camera viene accesa
 * solo quando la chiedi: così non resta occupata (e l'indicatore privacy
 * di Android non resta acceso) mentre stai nel canale solo per esserci.
 *
 * Il canale video verso l'altro viene però aperto SUBITO, anche se
 * vuoto: accendere e spegnere la camera si limita a mettere o togliere
 * la traccia al suo interno, senza rinegoziare nulla. È la differenza
 * fra un video che si riaccende sempre e uno che dopo il primo giro
 * mostra uno schermo nero.
 *
 * La "perfect negotiation" resta per le rinegoziazioni che possono
 * comunque capitare: se i due si accavallano, il polite (chi era già
 * nel canale) cede e annulla la propria offerta.
 */

export type ChannelEvents = {
  onLocalStream?: (s: MediaStream | null) => void;
  onRemoteStream?: (s: MediaStream | null) => void;
  onConnectionState?: (state: string) => void;
  /** stato di mic/camera dell'altra persona, con le proporzioni del suo video */
  onPeerState?: (st: { audio: boolean; video: boolean; aspect?: number; hwVp9?: boolean }) => void;
  /**
   * Se stiamo ricevendo una traccia video.
   *
   * Serve un evento esplicito: le tracce vengono aggiunte DENTRO lo
   * stesso oggetto MediaStream, quindi rinotificare lo stream non
   * cambierebbe il riferimento e React non ridisegnerebbe nulla.
   */
  onRemoteVideo?: (present: boolean) => void;
  /** cosa sta davvero uscendo ed entrando, per mostrarlo sotto ai comandi */
  onVideoStats?: (st: VideoStats) => void;
};

export type VideoStats = {
  out?: { w: number; h: number; fps: number; kbps: number | null };
  in?: { w: number; h: number; fps: number; kbps: number | null };
};

/** Proporzioni di ripiego: anteprima verticale 9:16, il caso più comune. */
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
  /** noi stiamo guardando lo schermo: lo diciamo all'altro */
  private localWatching = true;
  /**
   * L'altro sta guardando. Si parte da `true` e si scende solo su
   * comunicazione esplicita: una build vecchia, o un messaggio perso,
   * devono lasciare il video acceso, non spegnerlo per sempre.
   */
  private peerWatching = true;
  /** `degradationPreference` si scrive una volta sola, mai a caldo */
  private degradationSet = false;
  /** ultimi campioni per calcolare il bitrate reale fra due letture */
  private lastOutbound: { ts: number; bytes: number } | null = null;
  private lastInbound: { ts: number; bytes: number } | null = null;
  /** una riga nel log ogni tanto, ma il pannello si aggiorna spesso */
  private statsTicks = 0;
  private statsTimer: ReturnType<typeof setInterval> | null = null;
  /** l'altro dichiara la camera accesa: lo dice il messaggio `state` */
  private peerVideoDeclared = false;
  /** questo telefono sa encodare VP9 in hardware */
  private localVp9 = false;
  /** lo sa fare anche l'altro: VP9 ha senso solo se entrambi */
  private peerVp9 = false;

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

    // Le misure seguono la connessione, non la nostra camera: anche con
    // il solo video dell'altro acceso c'è qualcosa da mostrare.
    this.lastOutbound = null;
    this.lastInbound = null;
    if (!this.statsTimer) {
      this.statsTimer = setInterval(() => { this.logOutboundVideo(); }, 5000);
    }

    /**
     * Vero solo finché questa è LA connessione in uso.
     *
     * Ricostruendo il collegamento nascono più RTCPeerConnection nel giro
     * di pochi secondi, e quelle vecchie continuano a emettere eventi per
     * un po'. Le loro closure leggono `this.remoteStream`, che intanto è
     * stato sostituito: senza questo controllo una connessione già morta
     * infila la propria traccia nello stream nuovo, che si ritrova due
     * video vivi e ne disegna quello sbagliato - lo schermo nero visto
     * dopo un cambio di rete. Vale anche per gli stati: un 'failed' in
     * ritardo da una connessione superata farebbe ripartire la riparazione
     * di una connessione sana.
     */
    const isCurrent = () => this.pc === pc;

    // @ts-ignore evento di react-native-webrtc
    pc.addEventListener('track', (event: any) => {
      const stream = this.remoteStream;
      if (!stream) return;
      const incoming: any = event.track;
      if (!isCurrent()) {
        log('traccia da una connessione superata: ignorata', incoming?.kind);
        return;
      }
      log('traccia in arrivo:', incoming?.kind, 'id', incoming?.id);

      if (incoming) {
        // Una sola traccia per tipo: è quello che il protocollo prevede.
        // Se ne restasse una vecchia, il renderer disegnerebbe la prima
        // della lista - cioè quella morta - e si vedrebbe nero.
        stream.getTracks()
          .filter((x: any) => x.kind === incoming.kind && x.id !== incoming.id)
          .forEach((x: any) => {
            log('tolgo traccia superata:', x.kind, x.id, x.readyState);
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
      if (!isCurrent()) return;
      if (event.candidate) {
        // L'indirizzo serve: se è un nome ".local" (mDNS) l'altro non lo
        // risolve e la strada diretta non nasce nemmeno.
        log('candidato locale', candidateType(event.candidate.candidate),
          (event.candidate.candidate || '').split(' ')[4] ?? '?');
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
      if (!isCurrent()) return;
      log('ICE:', pc.iceConnectionState);
    });

    // @ts-ignore
    pc.addEventListener('icegatheringstatechange', () => {
      log('raccolta candidati:', pc.iceGatheringState);
    });

    // @ts-ignore
    pc.addEventListener('connectionstatechange', () => {
      if (!isCurrent()) return;
      log('connessione:', pc.connectionState);
      this.events.onConnectionState?.(pc.connectionState);
      if (pc.connectionState === 'connected') this.logSelectedPath(pc);
    });

    // @ts-ignore
    pc.addEventListener('negotiationneeded', async () => {
      // Offre SEMPRE e SOLO una delle due parti.
      //
      // Aprire il canale video scatena questo evento su entrambi i
      // telefoni: se offrissero tutti e due, le offerte si scontrerebbero
      // e la risoluzione dipenderebbe dal rollback, che in
      // react-native-webrtc non è affidabile. Era la causa del
      // "a volte funziona, a volte no".
      if (this.polite) {
        log('rinegoziazione richiesta, ma tocca all\'altro: lascio fare');
        return;
      }
      await this.negotiate();
    });

    // --- Solo ORA le tracce -------------------------------------------
    // I gestori vanno registrati PRIMA di toccare tracce e canali.
    // Qui sotto c'è un await (replaceTrack, quando la camera è già
    // accesa): durante quell'attesa scatta la richiesta di negoziazione,
    // e se il gestore non fosse ancora registrato andrebbe persa. Era
    // esattamente il caso del riaggancio a camera accesa: la connessione
    // veniva ricostruita ma l'offerta non partiva mai.
    // Audio: c'è sempre.
    const audioTrack = this.localStream!.getAudioTracks()[0];
    if (audioTrack) pc.addTrack(audioTrack, this.localStream as MediaStream);

    // Video: il canale viene aperto SUBITO, anche senza traccia dentro.
    //
    // È la scelta che rende affidabile l'accensione e lo spegnimento.
    // Aggiungendo e togliendo la traccia ogni volta si rinegozia, si
    // creano tracce nuove che si accavallano alle vecchie, e dall'altra
    // parte si finisce per disegnare quella morta (schermo nero). Con il
    // canale sempre aperto basta sostituire la traccia al suo interno:
    // niente rinegoziazione e niente tracce che si accumulano.
    // Lo dichiara UNA SOLA delle due parti: quella che fa l'offerta.
    // Dichiarandolo entrambi, la dichiarazione di chi risponde rischia di
    // restare orfana - non entra nella negoziazione - e quel telefono non
    // riesce più a inviare il proprio video pur ricevendo quello altrui.
    // Chi risponde se lo prende dalla negoziazione (captureVideoSender).
    if (!polite) {
      try {
        const vt: any = (pc as any).addTransceiver('video', { direction: 'sendrecv' });
        this.preferVp9(vt);
        this.videoSender = vt?.sender ?? null;
        log('canale video dichiarato da noi:', !!this.videoSender);
      } catch (e) {
        log('addTransceiver non disponibile, ripiego su addTrack:', String(e));
        this.videoSender = null;
      }
    } else {
      log('canale video: lo dichiara l\'altro, lo prendo a negoziazione fatta');
    }

    // Se il video era già acceso, la traccia entra nel canale appena aperto.
    const existingVideo = this.localStream!.getVideoTracks()[0];
    if (existingVideo) {
      if (this.videoSender) {
        try { await this.videoSender.replaceTrack(existingVideo); } catch { /* noop */ }
      } else {
        this.videoSender = pc.addTrack(existingVideo, this.localStream as MediaStream);
      }
    }


    // E la negoziazione la avviamo comunque noi, invece di sperare
    // nell'evento: se è già partita, il controllo dentro negotiate()
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
      this.peerVideoDeclared = msg.video === true;
      this.peerVp9 = msg.hwVp9 === true;
      this.events.onPeerState?.({
        audio: msg.audio,
        video: msg.video,
        aspect: msg.aspect,
        hwVp9: this.peerVp9,
      });
      this.setPeerWatching(msg.watching !== false);
      // Ciò che l'altro dichiara entra nel giudizio su "c'è il suo
      // video": cambiandolo, va rifatto.
      this.reportRemoteVideo();
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
          // se il rollback non è supportato proseguiamo comunque
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
      // Se la remote description non c'è ancora, il candidate va in coda.
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
   * Serve a chi non lo ha dichiarato: il canale esiste perché lo ha
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
    // sola ricezione. Così com'e' potremmo vedere il video altrui ma non
    // inviare il nostro, e il difetto sarebbe asimmetrico - proprio quello
    // che si vedeva. Lo portiamo a bidirezionale ORA, prima di preparare la
    // risposta, così viaggia in questa stessa negoziazione senza doverne
    // aprire un'altra (cosa che a noi, che non offriamo, è preclusa).
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

    // Se nel frattempo la camera era già accesa, la traccia entra ora.
    const localVideo = this.localStream?.getVideoTracks()[0];
    if (localVideo) {
      try {
        await this.videoSender.replaceTrack(localVideo);
        await this.applyVideoQuality();
        log('traccia locale inserita nel canale appena individuato');
      } catch (e) {
        log('inserimento traccia fallito:', String(e));
      }
    }
  }

  /**
   * Riparazione leggera: rifa' solo la ricerca del percorso di rete,
   * tenendo in piedi connessione e tracce.
   *
   * È la prima cosa da provare quando il collegamento cede: demolire e
   * ricostruire interrompe audio e video per un paio di secondi, mentre
   * un riavvio di ICE spesso li ripristina senza che si noti nulla.
   * Può farlo solo chi offre; all'altro resta il chiederlo.
   */
  async restartIce(): Promise<boolean> {
    const pc: any = this.pc;
    if (!pc || this.polite) return false;
    try {
      if (typeof pc.restartIce === 'function') {
        pc.restartIce();
        log('ICE riavviato');
        return true;
      }
      // Versioni più vecchie: si ottiene lo stesso con un'offerta.
      const offer = await pc.createOffer({ iceRestart: true });
      await pc.setLocalDescription(offer);
      this.signaling.sendSignal({
        kind: 'desc', type: 'offer', sdp: pc.localDescription.sdp,
      });
      log('ICE riavviato con una nuova offerta');
      return true;
    } catch (e) {
      log('riavvio di ICE fallito:', String(e));
      return false;
    }
  }

  /** Esiste una connessione con l'altro, buona o meno che sia. */
  hasPeer(): boolean {
    return !!this.pc;
  }

  /**
   * Il collegamento diretto è ancora buono?
   *
   * Dopo un'interruzione di rete la connessione resta lì ma è morta
   * ("failed" o "disconnected"): va ricostruita, non riusata.
   */
  isPeerHealthy(): boolean {
    const st = this.pc?.connectionState;
    if (!st) return false;
    return st !== 'failed' && st !== 'closed' && st !== 'disconnected';
  }

  /**
   * C'è una traccia video dall'altro, non ancora chiusa.
   *
   * Di proposito NON guardiamo "muted": la semantica varia fra versioni
   * e piattaforme. Se il video sia effettivamente acceso lo dice l'altro
   * col messaggio di stato; qui rispondiamo solo se il canale video
   * esiste. Le due informazioni vengono combinate nell'interfaccia.
   */
  hasRemoteVideo(): boolean {
    const t: any = this.remoteStream?.getVideoTracks()[0];
    if (!t || t.readyState === 'ended') return false;
    // Una traccia il cui mittente ha smesso di trasmettere resta `live` e
    // diventa `muted`: guardare solo readyState faceva credere che
    // l'altro avesse la camera accesa appena aperta l'app, e il proprio
    // video finiva nel riquadrino invece che a schermo intero.
    //
    // Il muto da solo però non basta: durante un'interruzione di rete la
    // traccia ammutolisce pur avendo l'altro la camera accesa, e togliere
    // il video lì farebbe ballare la disposizione a ogni caduta. Perciò
    // conta anche cosa l'altro dichiara.
    return !t.muted || this.peerVideoDeclared;
  }

  private reportRemoteVideo() {
    const tracks: any[] = this.remoteStream?.getVideoTracks() ?? [];
    const present = this.hasRemoteVideo();
    log('video remoto:', present ? 'presente' : 'assente',
      '- tracce video nello stream:', tracks.length,
      tracks.map((t) => `${t.id}:${t.readyState}`).join(' '));
    this.events.onRemoteVideo?.(present);
  }

  /**
   * Per dove sta davvero passando l'audio/video, una volta collegati.
   *
   * I candidati raccolti non lo dicono: si raccolgono sempre tutti, e
   * poi ne vince uno. La differenza conta, perché i percorsi hanno
   * fragilità diverse - host è la rete locale, srflx attraversa due NAT,
   * relay passa dal nostro coturn - e senza questo dato non si può
   * dire se una caduta dipenda dal percorso o da altro.
   */
  private async logSelectedPath(pc: any) {
    try {
      const stats = await pc.getStats();
      let pair: any = null;
      const candidates = new Map<string, any>();
      stats.forEach((r: any) => {
        if (r.type === 'local-candidate' || r.type === 'remote-candidate') {
          candidates.set(r.id, r);
        }
        // "selected" su alcune implementazioni, "nominated+succeeded" su altre
        if (r.type === 'candidate-pair' && (r.selected || r.nominated) && r.state === 'succeeded') {
          pair = r;
        }
      });
      if (!pair) { log('percorso: non ancora determinato'); return; }

      // Tutte le strade tentate, non solo quella vinta: se il traffico
      // passa dal relay pur essendo i due telefoni sulla stessa rete, la
      // risposta sta in quale coppia locale è fallita, o non è mai nata.
      const descrivi = (c: any) =>
        c ? `${c.candidateType}/${c.address ?? c.ip ?? '?'}` : '?';
      stats.forEach((r: any) => {
        if (r.type !== 'candidate-pair') return;
        log('  strada:',
          descrivi(candidates.get(r.localCandidateId)),
          '->', descrivi(candidates.get(r.remoteCandidateId)),
          '-', r.state,
          r.nominated ? '(scelta)' : '');
      });
      const local = candidates.get(pair.localCandidateId);
      const remote = candidates.get(pair.remoteCandidateId);
      const kind = local?.candidateType === 'relay' || remote?.candidateType === 'relay'
        ? 'RELAY (passa dal server)'
        : local?.candidateType === 'host' && remote?.candidateType === 'host'
          ? 'LOCALE (stessa rete)'
          : 'DIRETTO attraverso NAT';
      log('percorso:', kind,
        '-', `${local?.candidateType ?? '?'}/${local?.protocol ?? '?'}`,
        '->', `${remote?.candidateType ?? '?'}/${remote?.protocol ?? '?'}`);
    } catch (e: any) {
      log('percorso non leggibile:', e?.message ?? e);
    }
  }

  /**
   * Cosa sta davvero uscendo, e perché non di più.
   *
   * Il tetto di bitrate è un limite, non un obiettivo: quanto si consuma
   * lo decidono la stima di banda, la complessità della scena e - con
   * "balanced" - di quanto l'encoder ha scalato l'uscita. Senza leggerlo
   * si finisce a ipotizzare; `qualityLimitationReason` lo dice in una
   * parola: "bandwidth", "cpu", oppure "none" (cioè: tanto basta).
   */
  private async logOutboundVideo() {
    const pc: any = this.pc;
    if (!pc?.getStats) return;
    try {
      const stats = await pc.getStats();
      const out: VideoStats = {};
      let limite = '?';
      // Ciò che non compare fra le statistiche non c'è: lasciare il
      // valore precedente mostrerebbe una risoluzione che non esiste più.
      let fpsOut = 0;

      /** Ricostruendo la connessione i contatori ripartono da zero: la
       *  differenza diventa negativa, e mostrarla è peggio che tacere. */
      const rate = (prev: { ts: number; bytes: number } | null, ts: number, bytes: number) => {
        const dt = prev ? (ts - prev.ts) / 1000 : 0;
        const delta = prev ? bytes - prev.bytes : -1;
        return prev && dt > 0 && delta >= 0
          ? Math.round((delta * 8) / dt / 1000)
          : null;
      };

      stats.forEach((r: any) => {
        if (r.kind !== 'video') return;
        if (r.type === 'outbound-rtp') {
          out.out = {
            w: r.frameWidth ?? 0,
            h: r.frameHeight ?? 0,
            fps: Math.round(r.framesPerSecond ?? 0),
            kbps: rate(this.lastOutbound, r.timestamp, r.bytesSent),
          };
          this.lastOutbound = { ts: r.timestamp, bytes: r.bytesSent };
          limite = r.qualityLimitationReason ?? '?';
        } else if (r.type === 'inbound-rtp') {
          out.in = {
            w: r.frameWidth ?? 0,
            h: r.frameHeight ?? 0,
            fps: Math.round(r.framesPerSecond ?? 0),
            kbps: rate(this.lastInbound, r.timestamp, r.bytesReceived),
          };
          this.lastInbound = { ts: r.timestamp, bytes: r.bytesReceived };
        }
      });

      this.events.onVideoStats?.(out);

      // Nel log basta una riga ogni tanto: sotto ai comandi c'è il resto.
      this.statsTicks += 1;
      if (out.out && this.statsTicks % 3 === 0) {
        log('in uscita:', `${out.out.w}x${out.out.h}`, `@${out.out.fps}fps`,
          out.out.kbps !== null ? `- ${out.out.kbps} kbit/s` : '',
          '- limite:', limite);
      }
    } catch { /* la diagnostica non deve mai disturbare */ }
  }

  /**
   * Rete di sicurezza dopo un cambio di scala.
   *
   * Cambiare la scala a encoder acceso lo ha già fatto smettere di
   * produrre una volta: l'immagine spariva all'altro mentre la nostra
   * anteprima continuava, e l'unico rimedio era spegnere e riaccendere il
   * video. Qui si controlla che i fotogrammi encodati stiano davvero
   * salendo e, se non salgono, si torna alla scala piena da soli.
   *
   * Meglio un profilo che non fa quello che promette di un video che
   * sparisce senza dire perché.
   */
  private async watchEncoderAlive(scale: number) {
    if (scale === 1) return;
    const framesNow = async (): Promise<number | null> => {
      try {
        const stats = await (this.pc as any)?.getStats();
        let n: number | null = null;
        stats?.forEach((r: any) => {
          if (r.type === 'outbound-rtp' && r.kind === 'video') n = r.framesEncoded ?? null;
        });
        return n;
      } catch { return null; }
    };
    const before = await framesNow();
    if (before === null) return;
    setTimeout(async () => {
      const after = await framesNow();
      if (after === null || after > before) return;
      log('l\'encoder si è fermato dopo il cambio di scala: torno alla piena');
      try {
        const sender: any = this.videoSender;
        const params = sender.getParameters();
        if (Array.isArray(params.encodings) && params.encodings.length > 0) {
          params.encodings[0].scaleResolutionDownBy = 1;
          await sender.setParameters(params);
        }
      } catch { /* noop */ }
    }, 3000);
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

  /** Accende la camera: mette la traccia nel canale già aperto. */
  async enableVideo(): Promise<boolean> {
    if (!this.localStream || this.localStream.getVideoTracks().length > 0) return true;
    const profile = VIDEO_PROFILES[this.cfg.videoQuality] ?? VIDEO_PROFILES.standard;
    const cam = await mediaDevices.getUserMedia({
      video: {
        facingMode: 'user',
        // Il formato si fissa qui, all'accensione: cambiarlo dopo
        // vorrebbe dire riaprire la camera, e la riapertura lascia il
        // canale agganciato a una traccia che non produce più.
        width: { ideal: profile.capture.width },
        height: { ideal: profile.capture.height },
        frameRate: { ideal: profile.capture.frameRate },
        // Proporzioni dichiarate esplicitamente: senza, il sensore può
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
      // fotogrammi sulla traccia che già aveva.
      try {
        await this.videoSender.replaceTrack(track);
        await this.applyVideoQuality();
      } catch (e) {
        log('replaceTrack fallita:', String(e));
      }
    } else if (this.pc) {
      // Ripiego, se il canale video non era stato aperto in anticipo.
      this.videoSender = this.pc.addTrack(track, this.localStream);
    }

    // Se nel frattempo l'altro non sta guardando, la camera resta accesa
    // per l'anteprima ma dal canale non esce nulla.
    if (!this.peerWatching) await this.applyPeerWatching();

    this.lastOutbound = null;

    this.events.onLocalStream?.(this.localStream);
    this.broadcastState();
    return true;
  }

  /**
   * Chiede di non ridurre la risoluzione quando la banda scarseggia.
   *
   * Il comportamento predefinito è l'opposto: WebRTC abbassa la
   * risoluzione, e molti sensori cambiando formato cambiano anche
   * l'angolo di ripresa. Dall'altra parte si vede l'inquadratura
   * allargarsi e restringersi da sola. Meglio perdere fotogrammi che
   * cambiare cosa si inquadra.
   */
  /**
   * Applica il profilo video scelto.
   *
   * La banda di un video non dipende dal codec ma da tre numeri:
   * risoluzione, fotogrammi al secondo e tetto di bitrate. Il codec
   * cambia quanto bene sfrutta quel tetto, non quanto se ne consuma.
   *
   * A ripresa in corso si tocca solo il tetto: cambiare scala o fotogrammi
   * su un encoder acceso lo fa smettere di produrre, e all'altro il video
   * sparisce mentre la nostra anteprima continua a funzionare.
   */
  private async applyVideoQuality() {
    const sender: any = this.videoSender;
    if (!sender?.getParameters) return;
    const profile = VIDEO_PROFILES[this.cfg.videoQuality] ?? VIDEO_PROFILES.standard;
    try {
      const params = sender.getParameters();
      if (!Array.isArray(params.encodings) || params.encodings.length === 0) {
        params.encodings = [{}];
      }
      // `degradationPreference` si fissa UNA VOLTA, alla prima
      // applicazione: cambiarlo a encoder acceso è fra le cose che
      // sospetto lo facciano smettere di produrre, e non serve
      // cambiarlo per cambiare profilo.
      if (!this.degradationSet) {
        params.degradationPreference = profile.degradation;
        this.degradationSet = true;
      }
      // I fotogrammi NON si toccano: maxFramerate resta fuori.
      params.encodings[0].scaleResolutionDownBy = profile.scale;
      params.encodings[0].maxBitrate = profile.maxBitrate;
      await sender.setParameters(params);
      this.watchEncoderAlive(profile.scale);
      log('qualità video:', this.cfg.videoQuality,
        `- tetto ${Math.round(profile.maxBitrate / 1000)} kbit/s,`,
        profile.degradation);
    } catch (e) {
      log('non riesco ad applicare la qualità video:', String(e));
    }
  }

  /**
   * Cambia profilo.
   *
   * Bitrate e fotogrammi si cambiano al volo. Il formato di acquisizione
   * no: va chiesto alla camera all'accensione, quindi se cambia e la
   * camera è accesa bisogna riaprirla. Si vede un lampo, ma è l'unico
   * modo: `applyConstraints` su react-native-webrtc non riformatta la
   * ripresa in corso.
   */
  async setVideoQuality(q: DuoConfig['videoQuality']) {
    if (this.cfg.videoQuality === q) return;
    this.cfg = { ...this.cfg, videoQuality: q };
    // Nessuna riapertura della camera: cambiano solo i parametri
    // dell'encoder, e si applicano a ripresa in corso.
    await this.applyVideoQuality();
    // Il campione riparte da qui: altrimenti la prima banda mostrata dopo
    // il cambio sarebbe una media a cavallo del cambio stesso.
    this.lastOutbound = null;
    this.lastInbound = null;
    this.logOutboundVideo();
  }

  /** Cosa sa fare questo telefono: lo scopre il modulo nativo. */
  setLocalVp9(supported: boolean) {
    if (this.localVp9 === supported) return;
    this.localVp9 = supported;
    this.broadcastState();
  }

  /**
   * VP9 conviene solo se ENTRAMBI lo encodano in hardware.
   *
   * Le preferenze di codec valgono per tutta la sessione, non per una
   * direzione sola: preferendo VP9 perché lo so fare io, costringerei
   * l'altro a encodarlo via software - più calore e più batteria di
   * quanta banda si risparmi.
   */
  vp9Usable(): boolean {
    return this.localVp9 && this.peerVp9;
  }

  /**
   * Mette VP9 davanti nella lista dei codec, se si può e si vuole.
   *
   * Va fatto sul transceiver PRIMA di negoziare: dopo, cambiare codec
   * richiederebbe una rinegoziazione completa.
   */
  private preferVp9(transceiver: any) {
    if (this.cfg.videoCodec !== 'vp9' || !this.vp9Usable()) return;
    try {
      const caps = (RTCRtpReceiver as any)?.getCapabilities?.('video');
      if (!caps?.codecs || typeof transceiver?.setCodecPreferences !== 'function') {
        log('preferenze codec non disponibili su questa versione: resto su VP8');
        return;
      }
      const vp9 = caps.codecs.filter((c: any) => /vp9/i.test(c.mimeType));
      const resto = caps.codecs.filter((c: any) => !/vp9/i.test(c.mimeType));
      if (vp9.length === 0) { log('nessun VP9 fra i codec disponibili'); return; }
      transceiver.setCodecPreferences([...vp9, ...resto]);
      log('codec preferito: VP9 (hardware su entrambi i telefoni)');
    } catch (e) {
      log('non riesco a preferire VP9:', String(e));
    }
  }

  /**
   * Diciamo all'altro se stiamo guardando, così può smettere di spedirci
   * video che nessuno vede.
   */
  setLocalWatching(watching: boolean) {
    if (this.localWatching === watching) return;
    this.localWatching = watching;
    log(watching ? 'torniamo a guardare' : 'non guardiamo più');
    this.broadcastState();
  }

  /**
   * L'altro non guarda: smettiamo di trasmettere il video.
   *
   * La camera resta accesa e l'anteprima locale continua a funzionare -
   * si stacca solo la traccia dal canale, come già si fa per spegnere il
   * video. Il canale resta aperto, quindi riprendere non costa una
   * rinegoziazione.
   */
  private setPeerWatching(watching: boolean) {
    if (this.peerWatching === watching) return;
    this.peerWatching = watching;
    log(watching ? "l'altro guarda di nuovo" : "l'altro non guarda: sospendo il video");
    this.applyPeerWatching();
  }

  /** Allinea ciò che esce dal canale a `peerWatching`. */
  private async applyPeerWatching() {
    const sender = this.videoSender;
    if (!sender) return;
    const track = this.localStream?.getVideoTracks()[0] ?? null;
    try {
      await sender.replaceTrack(this.peerWatching ? track : null);
    } catch (e) {
      log('non riesco a cambiare la trasmissione del video:', String(e));
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

    this.lastOutbound = null;

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
      watching: this.localWatching,
      hwVp9: this.localVp9,
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
    if (this.statsTimer) { clearInterval(this.statsTimer); this.statsTimer = null; }
    this.lastOutbound = null;
    this.lastInbound = null;
    this.events.onVideoStats?.({});
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
