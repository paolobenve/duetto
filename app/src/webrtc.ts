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
 * Gestore della sessione WebRTC (audio + video) tra i due telefoni.
 *
 * Il traffico media e' cifrato end-to-end da WebRTC stesso (DTLS-SRTP);
 * qui ci occupiamo di negoziazione, tracce e comandi (mute/camera).
 */

export type CallEvents = {
  onLocalStream?: (s: MediaStream) => void;
  onRemoteStream?: (s: MediaStream) => void;
  onConnectionState?: (state: string) => void;
};

export class CallSession {
  private pc: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private remoteStream: MediaStream | null = null;
  private makingOffer = false;
  private isInitiator = false;

  constructor(
    private cfg: DuoConfig,
    private signaling: Signaling,
    private events: CallEvents,
  ) {}

  /** Acquisisce microfono + camera e crea la PeerConnection. */
  async start(initiator: boolean) {
    this.isInitiator = initiator;

    this.localStream = await mediaDevices.getUserMedia({
      audio: true,
      video: {
        facingMode: 'user',
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: 30 },
      },
    });
    this.events.onLocalStream?.(this.localStream);

    const pc = new RTCPeerConnection({ iceServers: iceServers(this.cfg) });
    this.pc = pc;

    // Aggiunge le tracce locali
    this.localStream.getTracks().forEach((track) => {
      pc.addTrack(track, this.localStream as MediaStream);
    });

    // Stream remoto in arrivo
    this.remoteStream = new MediaStream();
    // @ts-ignore evento specifico react-native-webrtc
    pc.addEventListener('track', (event: any) => {
      event.streams[0]?.getTracks().forEach((t: any) => {
        this.remoteStream?.addTrack(t);
      });
      if (this.remoteStream) this.events.onRemoteStream?.(this.remoteStream);
    });

    // ICE candidate locali -> all'altro peer (cifrati dal Signaling)
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

    // Negoziazione: solo l'initiator crea l'offerta iniziale.
    // @ts-ignore
    pc.addEventListener('negotiationneeded', async () => {
      if (!this.isInitiator) return;
      await this.makeOffer();
    });

    if (initiator) {
      await this.makeOffer();
    }
  }

  private async makeOffer() {
    const pc = this.pc;
    if (!pc || this.makingOffer) return;
    try {
      this.makingOffer = true;
      const offer = await pc.createOffer({});
      await pc.setLocalDescription(offer);
      this.signaling.sendSignal({ kind: 'offer', sdp: pc.localDescription!.sdp });
    } finally {
      this.makingOffer = false;
    }
  }

  /** Gestisce un messaggio di signaling ricevuto (gia' decifrato). */
  async onSignal(msg: SignalMessage) {
    const pc = this.pc;
    if (!pc) return;

    if (msg.kind === 'offer') {
      await pc.setRemoteDescription(
        new RTCSessionDescription({ type: 'offer', sdp: msg.sdp }),
      );
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      this.signaling.sendSignal({ kind: 'answer', sdp: pc.localDescription!.sdp });
    } else if (msg.kind === 'answer') {
      await pc.setRemoteDescription(
        new RTCSessionDescription({ type: 'answer', sdp: msg.sdp }),
      );
    } else if (msg.kind === 'ice') {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(msg.candidate));
      } catch {
        // candidate fuori ordine/duplicato: ignorabile
      }
    }
  }

  /** Attiva/disattiva il microfono. Ritorna il nuovo stato (true = attivo). */
  toggleAudio(): boolean {
    const track = this.localStream?.getAudioTracks()[0];
    if (!track) return false;
    track.enabled = !track.enabled;
    return track.enabled;
  }

  /** Attiva/disattiva la camera. Ritorna il nuovo stato (true = attivo). */
  toggleVideo(): boolean {
    const track = this.localStream?.getVideoTracks()[0];
    if (!track) return false;
    track.enabled = !track.enabled;
    return track.enabled;
  }

  /** Passa da camera frontale a posteriore. */
  switchCamera() {
    const track = this.localStream?.getVideoTracks()[0] as any;
    if (track && typeof track._switchCamera === 'function') {
      track._switchCamera();
    }
  }

  isAudioEnabled(): boolean {
    return this.localStream?.getAudioTracks()[0]?.enabled ?? false;
  }

  isVideoEnabled(): boolean {
    return this.localStream?.getVideoTracks()[0]?.enabled ?? false;
  }

  /** Chiude la sessione e rilascia camera/microfono. */
  stop() {
    this.localStream?.getTracks().forEach((t) => t.stop());
    this.remoteStream?.getTracks().forEach((t) => t.stop());
    this.localStream = null;
    this.remoteStream = null;
    if (this.pc) {
      try { this.pc.close(); } catch { /* noop */ }
      this.pc = null;
    }
  }
}
