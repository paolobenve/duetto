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
 * Accendere/spegnere il video aggiunge o rimuove una traccia, quindi
 * richiede una rinegoziazione. Per gestire il caso in cui entrambi
 * facciano la stessa cosa nello stesso istante usiamo la "perfect
 * negotiation": uno dei due (il polite, cioe' chi era gia' nel canale)
 * cede e annulla la propria offerta.
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
    const pc = new RTCPeerConnection({ iceServers: iceServers(this.cfg) });
    this.pc = pc;

    this.localStream!.getTracks().forEach((track) => {
      const sender = pc.addTrack(track, this.localStream as MediaStream);
      // Il video puo' essere gia' acceso (l'hai attivato mentre eri da solo):
      // teniamo il riferimento al sender, o non potremmo piu' spegnerlo.
      if (track.kind === 'video') this.videoSender = sender;
    });

    this.remoteStream = new MediaStream();

    // @ts-ignore evento di react-native-webrtc
    pc.addEventListener('track', (event: any) => {
      const stream = this.remoteStream;
      if (!stream) return;
      event.streams[0]?.getTracks().forEach((t: any) => {
        if (!stream.getTracks().find((x: any) => x.id === t.id)) stream.addTrack(t);
      });
      this.events.onRemoteStream?.(stream);
      this.reportRemoteVideo();

      // Se l'altro toglie il video, la traccia finisce: va detto alla UI.
      event.track?.addEventListener?.('ended', () => {
        try { stream.removeTrack(event.track); } catch { /* noop */ }
        this.events.onRemoteStream?.(stream);
        this.reportRemoteVideo();
      });
      // Alcune versioni segnalano la sospensione invece della fine.
      event.track?.addEventListener?.('mute', () => this.reportRemoteVideo());
      event.track?.addEventListener?.('unmute', () => this.reportRemoteVideo());
    });

    // @ts-ignore
    pc.addEventListener('icecandidate', (event: any) => {
      if (event.candidate) {
        this.signaling.sendSignal({ kind: 'ice', candidate: event.candidate });
      }
    });

    // @ts-ignore
    pc.addEventListener('connectionstatechange', () => {
      this.events.onConnectionState?.(pc.connectionState);
    });

    // @ts-ignore
    pc.addEventListener('negotiationneeded', async () => {
      await this.negotiate();
    });

    // Chi non e' polite apre le danze; l'altro risponde.
    if (!polite) await this.negotiate();
  }

  private async negotiate() {
    const pc = this.pc;
    if (!pc) return;
    try {
      this.makingOffer = true;
      const offer = await pc.createOffer({});
      await pc.setLocalDescription(offer);
      const desc = pc.localDescription!;
      this.signaling.sendSignal({ kind: 'desc', type: 'offer', sdp: desc.sdp });
    } catch {
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

    const pc = this.pc;
    if (!pc) return;

    if (msg.kind === 'desc') {
      const collision =
        msg.type === 'offer' && (this.makingOffer || pc.signalingState !== 'stable');

      // Impolite: in caso di collisione ignora l'offerta dell'altro.
      this.ignoreOffer = !this.polite && collision;
      if (this.ignoreOffer) return;

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

      if (msg.type === 'offer') {
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        this.signaling.sendSignal({
          kind: 'desc',
          type: 'answer',
          sdp: pc.localDescription!.sdp,
        });
      }
      return;
    }

    if (msg.kind === 'ice') {
      if (this.ignoreOffer) return;
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

  /** Stiamo ricevendo una traccia video viva? */
  hasRemoteVideo(): boolean {
    const t: any = this.remoteStream?.getVideoTracks()[0];
    return !!t && t.readyState !== 'ended' && t.muted !== true;
  }

  private reportRemoteVideo() {
    this.events.onRemoteVideo?.(this.hasRemoteVideo());
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

  /** Accende la camera: aggiunge la traccia e rinegozia. */
  async enableVideo(): Promise<boolean> {
    if (!this.localStream || this.localStream.getVideoTracks().length > 0) return true;
    const cam = await mediaDevices.getUserMedia({
      video: {
        facingMode: 'user',
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: 30 },
      },
    });
    const track = cam.getVideoTracks()[0];
    if (!track) return false;
    this.localStream.addTrack(track);
    // addTrack fa scattare "negotiationneeded": la rinegoziazione parte da sola.
    if (this.pc) this.videoSender = this.pc.addTrack(track, this.localStream);
    this.events.onLocalStream?.(this.localStream);
    this.broadcastState();
    return true;
  }

  /** Spegne la camera: rilascia davvero la traccia e rinegozia. */
  async disableVideo(): Promise<boolean> {
    const track = this.localStream?.getVideoTracks()[0];
    if (this.pc && this.videoSender) {
      try { this.pc.removeTrack(this.videoSender); } catch { /* noop */ }
      this.videoSender = null;
    }
    if (track && this.localStream) {
      this.localStream.removeTrack(track);
      track.stop(); // libera la camera (via l'indicatore privacy di Android)
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
