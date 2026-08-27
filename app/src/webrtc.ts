/*
 * Duetto - a permanent voice and video channel for two people.
 * Copyright (C) 2026 Paolo Benvenuto
 *
 * Free software under the GNU General Public License, version 3 or any
 * later version, and with no warranty of any kind. The full text is in
 * the LICENSE file at the root of the project, and at
 * <https://www.gnu.org/licenses/>.
 */
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
import { iceServers, VIDEO_PROFILES, CAPTURE_FPS } from './config';
import type { Signaling, SignalMessage } from './signaling';
import { VERSION, BUILD } from './version';
import { logger } from './log';

/**
 * The channel session: audio always, video on request.
 *
 * Entering the channel opens the microphone ONLY. The camera comes on
 * when you ask for it: this way it does not stay busy - and Android's
 * privacy indicator does not stay lit - while you are in the channel
 * merely to be there.
 *
 * The video channel towards the other side, however, is opened AT ONCE,
 * empty: switching the camera on and off then merely puts a track in or
 * takes it out, with nothing to renegotiate. It is the difference
 * between a video that always comes back and one that shows a black
 * screen after the first round.
 *
 * "Perfect negotiation" stays for the renegotiations that can happen
 * anyway: if two of them cross, the polite side - the one that was
 * already in the channel - gives way and rolls its own offer back.
 */

export type ChannelEvents = {
  onLocalStream?: (s: MediaStream | null) => void;
  onRemoteStream?: (s: MediaStream | null) => void;
  onConnectionState?: (state: string) => void;
  /** the other person's mic and camera, with the shape of their video */
  onPeerState?: (st: {
    audio: boolean; video: boolean; aspect?: number; hwVp9?: boolean;
    /** where the sound comes out over there, if they say so */
    output?: string;
    /** which Duetto is running there; missing if older than this field */
    version?: string;
    /** which APK of that version: the versions are raised by hand, so
     *  two phones on the same one can be weeks apart */
    build?: number;
    /** the wait they are living through: ours plus theirs is the whole of it */
    delay?: number;
    /** which camera is filming: 'front' or 'back' */
    camera?: string;
    /** how loudly they are listening to US: 1 = as we send it */
    volume?: number;
  }) => void;
  /**
   * Whether we are receiving a video track.
   *
   * An explicit event is needed: tracks are added INSIDE the same
   * MediaStream object, so notifying the stream again would not change
   * the reference and React would redraw nothing.
   */
  onRemoteVideo?: (present: boolean) => void;
  /** what is really going out and coming in, to show under the controls */
  onVideoStats?: (st: VideoStats) => void;
};

export type VideoStats = {
  /**
   * How long a packet takes to go and come back, in milliseconds.
   *
   * It is the road alone: how long a packet takes to go and come back,
   * with nothing of what the two phones do at its ends. Half of it is
   * the first of the three terms of the wait below, so reading the two
   * together says how much of that wait is travel and how much is
   * buffers and codecs - which is the whole question, when a
   * conversation drags.
   *
   * ICE measures it on the road actually in use, so it also says
   * whether that road is a good one: a relay on the other side of the
   * world shows up here before it shows up in the picture.
   */
  latency?: number | null;
  /**
   * How long the voice and the picture take to reach you, one way, in
   * milliseconds. An estimate, and it says so with a tilde on screen.
   *
   * The round trip above measures the road; this measures the wait.
   * Three things are added up, all of them read from the connection
   * itself: half the round trip, how long a packet sat in the jitter
   * buffer - which is where a restless network turns into delay - and
   * the time to decode it.
   *
   * What is NOT in there, and cannot be from this side: the camera and
   * the microphone of the phone that is sending, its encoder, and the
   * audio output of this one, which on Android is worth some tens of
   * milliseconds. So the true wait, from their mouth to your ear, is a
   * little longer than this number - never shorter.
   */
  voiceDelay?: number | null;
  pictureDelay?: number | null;
  out?: { w: number; h: number; fps: number; kbps: number | null };
  in?: { w: number; h: number; fps: number; kbps: number | null };
  /** how much audio is going out: the only way to check the ceiling */
  audioKbps?: number | null;
  /** which way the traffic is going, worked out at every sample */
  path?: 'local' | 'direct' | 'relay';
};

/** Fallback shape: a 9:16 upright preview, the commonest case. */
export const DEFAULT_ASPECT = 9 / 16;

/**
 * Diagnostics for the link.
 *
 * When the connection will not come up, all you see from outside is
 * "connecting". What is needed is WHERE it stops: whether candidates
 * are gathered at all, of what kind (host = same network, srflx = seen
 * from outside through STUN, relay = going through the TURN), and where
 * the ICE state gets stuck. Read it with:
 *
 *   adb logcat -s ReactNativeJS | grep duetto
 */
const log = logger('[duetto-rtc]');

/**
 * The two ceilings for the voice, and when the video decides for them.
 *
 * Thirty-two kbit/s is roughly what Opus sends a voice at by default;
 * sixty-four is the "richer voice", and you can hear the difference.
 * The extra costs 32 kbit/s.
 *
 * The thresholds are that extra, multiplied: above ten times as much
 * video - three hundred and twenty kbit/s - those extra 32 are three
 * per cent of the traffic, and holding them back to save something
 * makes no sense. We go back to the user's setting below five times as
 * much, where saving starts to count again; in between nothing changes,
 * so a video wobbling around the threshold does not make the ceiling
 * bounce.
 */
const AUDIO_PLAIN = 32000;
const AUDIO_RICH = 64000;
const AUDIO_EXTRA_KBPS = (AUDIO_RICH - AUDIO_PLAIN) / 1000;
const VIDEO_HEAVY = AUDIO_EXTRA_KBPS * 10;
const VIDEO_LIGHT = AUDIO_EXTRA_KBPS * 5;

/** host / srflx / prflx / relay: which road ICE is trying. */
function candidateType(candidate: string): string {
  const m = /(?:^| )typ ([a-z]+)/.exec(candidate || '');
  return m ? m[1] : '?';
}

export class ChannelSession {
  private pc: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private remoteStream: MediaStream | null = null;
  private videoSender: any = null;
  /** we are looking at the screen: we tell the other side */
  private localWatching = true;
  /**
   * The wait we are living through, as last told to the other side.
   *
   * Each phone can only measure what arrives at it: the wait one feels
   * in a conversation is the sum of the two, and neither of them can
   * work it out alone. So each says its own, and both can add up.
   *
   * It is told only while diagnostics are on - it is a number nobody
   * looks at otherwise - and only when it has really moved: it changes
   * by a few milliseconds at every reading, and a message for that
   * would be noise on the wire.
   */
  private delaySaid: number | null = null;
  private ourDelay: number | null = null;
  /**
   * The other side is looking. It starts at `true` and only comes down
   * on an explicit message: an older build, or a message lost on the
   * way, must leave the video on rather than switch it off for good.
   */
  private peerWatching = true;
  /** `degradationPreference` is written once, never while running */
  private degradationSet = false;
  /** the last samples, to work out the real bitrate between two reads */
  private lastOutbound: { ts: number; bytes: number } | null = null;
  private lastInbound: { ts: number; bytes: number } | null = null;
  private lastAudioOut: { ts: number; bytes: number } | null = null;
  /** a line in the log now and then, while the panel refreshes often */
  private statsTicks = 0;

  /**
   * The video running moves far more data than the voice.
   *
   * When it does, the low audio ceiling saves nothing worth having -
   * thirty-two kbit/s next to half a megabit of video is background
   * noise - and in exchange the voice sounds worse, which is the thing
   * the channel was opened for. So it lifts itself, without touching
   * the setting: that stays as it is, and takes charge again as soon as
   * the video goes off or thins out.
   *
   * With wide hysteresis: a video swinging around the threshold would
   * push the ceiling back and forth, and every change is a
   * renegotiation of the encoder's parameters.
   */
  private heavyVideo = false;
  private statsTimer: ReturnType<typeof setInterval> | null = null;
  /** Whether the technical lines are being watched: it sets the pace below. */
  private diagnostics = false;
  /** the other side says its camera is on: the `state` message tells us */
  private peerVideoDeclared = false;

  /**
   * Which camera films.
   *
   * The starting value comes from the connection's settings: every
   * session used to start from the front one, and whoever was pointing
   * at something else had to turn it round every time. It holds with
   * the video off too, so you can pick before switching on, and it
   * survives the camera being reopened at a change of resolution.
   */
  private frontCamera: boolean;

  /**
   * Microphone on or muted, as whoever uses the app wants it. It holds
   * before the microphone is even opened: while waiting for the other
   * person there is no track yet, but there is a choice.
   */
  private audioDesired = true;

  /**
   * Where the sound comes out on this side: speaker, earpiece,
   * headphones, bluetooth. Only used to tell the other person, who
   * would otherwise have to ask out loud.
   */
  private ourOutput = 'SPEAKER_PHONE';

  /** A connection is being built: whoever arrives later waits for this. */
  private creating: Promise<void> | null = null;

  /**
   * Bumped at every teardown. A build started before and finished after
   * is stale goods: without this number it would put back up the
   * connection somebody had just decided to throw away.
   */
  private generation = 0;
  /** this phone can encode VP9 in hardware */
  private localVp9 = false;
  /** the other one can too: VP9 only makes sense if both can */
  private peerVp9 = false;

  private polite = false;
  private makingOffer = false;
  private ignoreOffer = false;
  /** candidates that arrived before the remote description: they queue up */
  private pendingCandidates: any[] = [];
  /** the relay the server tells us about: no need to set it up on each phone */
  private extraIce: any[] = [];

  /** The fallback link received from the server. */
  setServerIceServers(list: any[]) {
    this.extraIce = list ?? [];
  }

  constructor(
    private cfg: DuoConfig,
    private signaling: Signaling,
    private events: ChannelEvents,
  ) {
    this.frontCamera = cfg.frontCamera !== false;
    /**
     * The gain starts from the one saved for the output in use.
     *
     * It matters because the first state message goes out before the
     * app has had time to apply it again: without this it would
     * announce a level this phone is not using, and the correction is
     * one more message that can get lost.
     */
    this.peerGain = cfg.gains?.[cfg.audioOutput] ?? 1;
    this.heardLevel = this.peerGain;
    // A session born while diagnostics are on measures itself at the
    // close pace from the start: the switch reaches the ones already
    // running through setDiagnostics, but a new one would begin slow.
    this.diagnostics = cfg.diagnostics === true;
  }

  // --- Coming into the channel ---------------------------------------------

  /**
   * Opens the microphone, if it is not open already.
   *
   * It is not opened on entering the channel but when it is really
   * needed, that is, when there is somebody on the other side to talk
   * to. Whoever comes in first may wait a long time, and through that
   * wait the phone's audio path would stay on, recording for nobody:
   * current spent, and Android's listening indicator lit with nobody
   * listening.
   *
   * Called by attachPeer - the other person has arrived - and by
   * enableVideo.
   */
  private async ensureMic(): Promise<void> {
    if (this.localStream) return;
    const stream = await mediaDevices.getUserMedia({ audio: true, video: false });
    // The microphone can be born muted: "Mute" can be pressed while
    // waiting, and that choice has to hold for the track that did not
    // exist yet.
    const track = stream.getAudioTracks()[0];
    if (track) track.enabled = this.audioDesired;
    this.localStream = stream;
    this.events.onLocalStream?.(stream);
  }

  /**
   * How far to lift the other voice inside WebRTC.
   *
   * It is needed where the phone's call volume does not move - on
   * speaker, on plenty of models, it is nailed to the top by the
   * manufacturer. This gain asks the phone for nothing: it multiplies
   * the signal before it goes out. 1 = as it arrived.
   */
  private peerGain = 1;

  /**
   * The level at which we are hearing the other side, to be declared to
   * them.
   *
   * Not the gain: the product of the phone's call volume and the gain,
   * which is what is really heard. That is what they need - our
   * multiplier on its own would tell them nothing, because they cannot
   * know where the knob stands over here.
   */
  private heardLevel = 1;

  /** The audio sender of the live connection. */
  private liveAudioSender(): any {
    const pc: any = this.pc;
    try {
      return pc?.getSenders?.()?.find((x: any) => x.track?.kind === 'audio') ?? null;
    } catch { return null; }
  }

  /**
   * The audio ceiling: 32 kbit/s, or 64 with "richer voice".
   *
   * Switching the option off WRITES the low value instead of removing
   * the limit: removing a ceiling brings nobody down, and Opus stayed
   * where it had got to - the option looked like a one-way street.
   * Thirty-two is roughly where a voice travels by default.
   */
  private async applyAudioQuality() {
    const sender: any = this.liveAudioSender();
    if (!sender?.getParameters) return;
    try {
      const params = sender.getParameters();
      if (!Array.isArray(params.encodings) || params.encodings.length === 0) {
        params.encodings = [{}];
      }
      const rich = this.richAudio();
      params.encodings[0].maxBitrate = rich ? AUDIO_RICH : AUDIO_PLAIN;
      await sender.setParameters(params);
      log('audio:', rich ? '64 kbit/s ceiling' : '32 kbit/s ceiling',
        !this.cfg.richerAudio && rich ? '(because of the video)' : '');
    } catch (e) {
      log('cannot apply the audio quality:', String(e));
    }
  }

  /**
   * Whether the voice should go out rich right now.
   *
   * The user's setting always wins upwards: whoever turned it on wants
   * it with the video off too. The video can only add, never take away.
   *
   * The processing - noise suppression, levelling - is not here because
   * it cannot be changed from here: in react-native-webrtc it is
   * configured when the connection factory is created, once for the
   * whole app, and the constraints passed to getUserMedia are ignored
   * on Android. The option that reopened the microphone with exactly
   * the same parameters was removed rather than left there pretending.
   */
  private richAudio(): boolean {
    return this.cfg.richerAudio || this.heavyVideo;
  }

  async setAudioOptions(richer: boolean) {
    this.cfg = { ...this.cfg, richerAudio: richer };
    await this.applyAudioQuality();
  }

  /**
   * Builds the connection to the other side. Called when both of us are
   * present.
   *
   * MIND the window between the guard and `this.pc = pc`: there is an
   * `await` in between - opening the microphone - and calls close
   * together used to create TWO of them. They arrive easily: one from
   * the other side's change of state, and one for every signalling
   * message that finds the connection not ready yet. The second won,
   * the first stayed alive receiving packets nobody was looking at any
   * more - and the video did not appear until the app was closed and
   * reopened.
   *
   * While the microphone was opened on entering the channel that wait
   * did not exist, and the guard was enough: it is the late microphone
   * that opened the window.
   */
  attachPeer(polite: boolean): Promise<void> {
    if (this.pc) return Promise.resolve();
    // Whoever arrives while a build is already under way waits for THAT
    // one instead of starting another. See the comment above: it is the
    // whole difference between one connection and two.
    if (!this.creating) {
      const mine = this.generation;
      this.creating = this.buildPeer(polite, mine)
        .finally(() => { this.creating = null; });
    }
    return this.creating;
  }

  private async buildPeer(polite: boolean, mine: number) {
    await this.ensureMic();
    // Somebody else may have built it in the meantime, or somebody may
    // have torn everything down: either way this build is out of date.
    if (this.pc || mine !== this.generation) return;

    this.polite = polite;
    const servers = [...iceServers(), ...this.extraIce];
    log('connecting the peer - they offer:', polite, '| ICE servers:',
      servers.map((s2) => s2.urls).join(', '));
    const pc = new RTCPeerConnection({ iceServers: servers });
    this.pc = pc;

    this.remoteStream = new MediaStream();

    // The measurements follow the connection, not our camera: with the
    // other side's video alone there is still something to show.
    this.lastOutbound = null;
    this.lastInbound = null;
    if (!this.statsTimer) this.startStats();

    /**
     * True only while this is THE connection in use.
     *
     * Rebuilding the link creates several RTCPeerConnections within a
     * few seconds, and the old ones keep emitting events for a while.
     * Their closures read `this.remoteStream`, which has meanwhile been
     * replaced: without this check a connection that is already dead
     * pushes its own track into the new stream, which then holds two
     * live videos and draws the wrong one - the black screen seen after
     * a change of network. It goes for states as well: a late 'failed'
     * from a superseded connection would set the repair of a healthy
     * connection going.
     */
    const isCurrent = () => this.pc === pc;

    // @ts-ignore react-native-webrtc event
    pc.addEventListener('track', (event: any) => {
      const stream = this.remoteStream;
      if (!stream) return;
      const incoming: any = event.track;
      if (!isCurrent()) {
        log('track from a superseded connection: ignored', incoming?.kind);
        return;
      }
      log('incoming track:', incoming?.kind, 'id', incoming?.id);

      if (incoming) {
        // One track per kind: that is what the protocol calls for.
        // If an old one stayed, the renderer would draw the first of
        // the list - the dead one - and the screen would go black.
        stream.getTracks()
          .filter((x: any) => x.kind === incoming.kind && x.id !== incoming.id)
          .forEach((x: any) => {
            log('removing superseded track:', x.kind, x.id, x.readyState);
            try { stream.removeTrack(x); } catch { /* noop */ }
          });
        if (!stream.getTracks().find((x: any) => x.id === incoming.id)) {
          stream.addTrack(incoming);
        }
      }

      this.events.onRemoteStream?.(stream);
      this.reportRemoteVideo();
      // A new track is born at full volume: if the user had turned the
      // other voice down, without this it would come back deafening by
      // itself at every reconnection.
      if (incoming?.kind === 'audio') this.applyGain();

      incoming?.addEventListener?.('ended', () => {
        log('track ended:', incoming.kind, incoming.id);
        try { stream.removeTrack(incoming); } catch { /* noop */ }
        this.events.onRemoteStream?.(stream);
        this.reportRemoteVideo();
      });
      incoming?.addEventListener?.('mute', () => {
        log('track suspended:', incoming.kind);
        this.reportRemoteVideo();
      });
      incoming?.addEventListener?.('unmute', () => {
        log('track resumed:', incoming.kind);
        this.reportRemoteVideo();
      });
    });

    // @ts-ignore
    pc.addEventListener('icecandidate', (event: any) => {
      if (!isCurrent()) return;
      if (event.candidate) {
        // The address matters: if it is a ".local" name (mDNS) the
        // other side cannot resolve it and the direct road never opens.
        log('local candidate', candidateType(event.candidate.candidate),
          (event.candidate.candidate || '').split(' ')[4] ?? '?');
        this.signaling.sendSignal({ kind: 'ice', candidate: event.candidate });
      } else {
        log('local candidate gathering finished');
      }
    });

    // @ts-ignore
    pc.addEventListener('icecandidateerror', (e: any) => {
      // Typical when STUN/TURN does not answer, or the credentials are
      // wrong.
      log('candidate error:', e?.errorCode, e?.errorText, e?.url);
    });

    // @ts-ignore
    pc.addEventListener('iceconnectionstatechange', () => {
      if (!isCurrent()) return;
      log('ICE:', pc.iceConnectionState);
    });

    // @ts-ignore
    pc.addEventListener('icegatheringstatechange', () => {
      log('candidate gathering:', pc.iceGatheringState);
    });

    // @ts-ignore
    pc.addEventListener('connectionstatechange', () => {
      if (!isCurrent()) return;
      log('connection:', pc.connectionState);
      this.events.onConnectionState?.(pc.connectionState);
      if (pc.connectionState === 'connected') {
        this.logSelectedPath(pc);
        /**
         * The path is read at once, and again a second later.
         *
         * At the moment the connection declares itself ready, the chosen
         * candidate pair is often not readable yet - the log says "not
         * settled yet" - and waiting for the next sample leaves what is
         * on screen seconds behind, just when it has changed.
         */
        this.lastOutbound = null;
        this.lastInbound = null;
        this.logOutboundVideo();
        setTimeout(() => this.logOutboundVideo(), 1000);
         /**
         * As soon as we are connected we declare our state again.
         *
         * Whoever switches the video on BEFORE the other arrives sends
         * their `state` when there is nobody listening: on entering, the
         * second phone does not know the first has its camera on, and
         * since that message is one of the two signals that decide
         * whether there is video, it did not show it. Saying it again on
         * connecting costs nothing and closes the hole from both sides.
         */
        this.broadcastState();
      }
    });

    // @ts-ignore
    pc.addEventListener('negotiationneeded', async () => {
      // ALWAYS and ONLY one of the two sides offers.
      //
      // Opening the video channel fires this event on both phones: if
      // both offered, the offers would collide and the outcome would
      // depend on rollback, which is not dependable in
      // react-native-webrtc. It was the cause of the "sometimes it
      // works, sometimes it does not".
      if (this.polite) {
        log('renegotiation wanted, but it is their turn: leaving it to them');
        return;
      }
      await this.negotiate();
    });

    // --- Only NOW the tracks ------------------------------------------
    // The handlers have to be registered BEFORE touching tracks and
    // channels. There is an await below (replaceTrack, when the camera
    // is already on): during that wait the negotiation request fires,
    // and if the handler were not registered yet it would be lost. That
    // was exactly the case of reconnecting with the camera on: the
    // connection was rebuilt but the offer never went out.
    // Audio: always there.
    const audioTrack = this.localStream!.getAudioTracks()[0];
    if (audioTrack) {
      pc.addTrack(audioTrack, this.localStream as MediaStream);
      // The ceiling has to be set again on every new connection: the
      // parameters live on the sender, which is born with it.
      setTimeout(() => this.applyAudioQuality(), 0);
    }

    // Video: the channel is opened AT ONCE, even with no track inside.
    //
    // This is the choice that makes switching on and off dependable.
    // Adding and removing the track every time means renegotiating,
    // creating new tracks that overlap the old ones, and on the other
    // side drawing the dead one (black screen). With the channel always
    // open it is enough to replace the track inside it: no
    // renegotiation and no tracks piling up.
    // ONE of the two sides declares it: the one that makes the offer.
    // With both declaring, the answering side's declaration risks being
    // orphaned - it does not enter the negotiation - and that phone
    // stops being able to send its own video while still receiving the
    // other's. The answering side picks it up from the negotiation
    // (captureVideoSender).
    if (!polite) {
      try {
        const vt: any = (pc as any).addTransceiver('video', { direction: 'sendrecv' });
        this.preferVp9(vt);
        this.videoSender = vt?.sender ?? null;
        log('video channel declared by us:', !!this.videoSender);
      } catch (e) {
        log('addTransceiver not available, falling back to addTrack:', String(e));
        this.videoSender = null;
      }
    } else {
      log('video channel: they declare it, we take it once negotiated');
    }

    // If the video was already on, the track goes into the channel just
    // opened.
    const existingVideo = this.localStream!.getVideoTracks()[0];
    if (existingVideo) {
      if (this.videoSender) {
        try { await this.videoSender.replaceTrack(existingVideo); } catch { /* noop */ }
      } else {
        this.videoSender = pc.addTrack(existingVideo, this.localStream as MediaStream);
      }
    }


    // And we start the negotiation ourselves rather than hoping for the
    // event: if one is already under way, the check inside negotiate()
    // lets it carry on without overlapping.
    if (!polite) await this.negotiate();
  }

  private async negotiate() {
    const pc = this.pc;
    if (!pc) return;
    // One negotiation at a time: two offers in parallel would cancel
    // each other out.
    if (this.makingOffer || pc.signalingState !== 'stable') {
      log('negotiation already under way, or state not stable:', pc.signalingState);
      return;
    }
    try {
      this.makingOffer = true;
      const offer = await pc.createOffer({});
      await pc.setLocalDescription(offer);
      const desc = pc.localDescription!;
      log('offer sent');
      this.signaling.sendSignal({ kind: 'desc', type: 'offer', sdp: desc.sdp });
    } catch (e) {
      log('negotiation failed:', String(e));
      // if a negotiation fails, the next event will try again
    } finally {
      this.makingOffer = false;
    }
  }

  // --- Messages from the other peer ---------------------------------------

  async onSignal(msg: SignalMessage) {
    if (msg.kind === 'state') {
      this.peerVideoDeclared = msg.video === true;
      this.peerVp9 = msg.hwVp9 === true;
      this.events.onPeerState?.({
        audio: msg.audio,
        video: msg.video,
        aspect: msg.aspect,
        hwVp9: this.peerVp9,
        output: msg.output,
        version: msg.version,
        build: msg.build,
        delay: msg.delay,
        camera: msg.camera,
        volume: msg.volume,
      });
      this.setPeerWatching(msg.watching !== false);
      // What the other side declares goes into the judgement on
      // "is their video there": when it changes, that has to be redone.
      this.reportRemoteVideo();
      return;
    }

    if (msg.kind === 'renegotiate') return; // handled by whoever knows the role

    const pc = this.pc;
    if (!pc) return;

    if (msg.kind === 'desc') {
      log('received', msg.type, '- state:', pc.signalingState);
      const collision =
        msg.type === 'offer' && (this.makingOffer || pc.signalingState !== 'stable');

      // Impolite: on a collision, ignore the other side's offer.
      this.ignoreOffer = !this.polite && collision;
      if (this.ignoreOffer) { log('offer ignored (collision, we are impolite)'); return; }

      if (collision) {
        // Polite: roll our own offer back and take theirs.
        try {
          await pc.setLocalDescription({ type: 'rollback' } as any);
        } catch {
          // if rollback is not supported we carry on anyway
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
        log('answer sent - directions:',
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
      if (this.ignoreOffer) { log('candidate ignored (collision, we are impolite)'); return; }
      // If there is no remote description yet, the candidate queues up.
      if (!pc.remoteDescription) {
        this.pendingCandidates.push(msg.candidate);
        return;
      }
      try {
        await pc.addIceCandidate(new RTCIceCandidate(msg.candidate));
      } catch {
        // a duplicate or out-of-order candidate: safe to ignore
      }
    }
  }

  /**
   * Finds the video channel after the negotiation.
   *
   * This is for the side that did not declare it: the channel exists
   * because the other one opened it, and from here on we can use it to
   * send as well, simply by putting our track inside.
   */
  private async captureVideoSender() {
    if (this.videoSender || !this.pc) return;
    const list: any[] = (this.pc as any).getTransceivers?.() ?? [];
    const video = list.find(
      (t) => t?.receiver?.track?.kind === 'video' || t?.sender?.track?.kind === 'video',
    );
    if (!video?.sender) {
      log('video channel not findable yet');
      return;
    }

    // IMPORTANT: a channel created by applying the other side's offer is
    // born receive-only. Left like that we could see their video but not
    // send ours, and the fault would be one-sided - which is exactly
    // what was happening. We turn it two-way NOW, before preparing the
    // answer, so that it travels in this same negotiation without having
    // to open another one - which we, as the side that does not offer,
    // cannot do.
    try {
      if (video.direction !== 'sendrecv') {
        log('video channel was', video.direction, '-> turning it to sendrecv');
        video.direction = 'sendrecv';
      }
    } catch (e) {
      log('cannot change the video channel direction:', String(e));
    }

    this.videoSender = video.sender;
    log('video channel found, direction', video.direction);

    // If the camera was already on in the meantime, the track goes in now.
    const localVideo = this.localStream?.getVideoTracks()[0];
    if (localVideo) {
      try {
        await this.videoSender.replaceTrack(localVideo);
        await this.applyVideoQuality();
        log('local track put into the channel just found');
      } catch (e) {
        log('putting the track in failed:', String(e));
      }
    }
  }

  /**
   * Light repair: redoes only the search for a network path, leaving
   * the connection and the tracks standing.
   *
   * It is the first thing to try when the link gives way: tearing
   * everything down and rebuilding interrupts audio and video for a
   * couple of seconds, while an ICE restart often puts them right with
   * nobody noticing. Only the offering side can do it; the other one
   * can only ask.
   */
  async restartIce(): Promise<boolean> {
    const pc: any = this.pc;
    if (!pc || this.polite) return false;
    try {
      if (typeof pc.restartIce === 'function') {
        pc.restartIce();
        log('ICE restarted');
        return true;
      }
      // Older versions: the same thing, with an offer.
      const offer = await pc.createOffer({ iceRestart: true });
      await pc.setLocalDescription(offer);
      this.signaling.sendSignal({
        kind: 'desc', type: 'offer', sdp: pc.localDescription.sdp,
      });
      log('ICE restarted with a fresh offer');
      return true;
    } catch (e) {
      log('ICE restart failed:', String(e));
      return false;
    }
  }

  /** There is a connection to the other side, good or otherwise. */
  hasPeer(): boolean {
    return !!this.pc;
  }

  /**
   * Is the direct link still good?
   *
   * After a network break the connection sits there but is dead
   * ("failed" or "disconnected"): it wants rebuilding, not reusing.
   */
  isPeerHealthy(): boolean {
    const st = this.pc?.connectionState;
    if (!st) return false;
    return st !== 'failed' && st !== 'closed' && st !== 'disconnected';
  }

  /**
   * There is a video track from the other side, not yet closed.
   *
   * We deliberately do NOT look at "muted" alone: what it means varies
   * between versions and platforms. Whether the video is really on is
   * something the other side says in its state message; here we only
   * answer whether the video channel exists. The interface puts the two
   * together.
   */
  hasRemoteVideo(): boolean {
    const t: any = this.remoteStream?.getVideoTracks()[0];
    if (!t || t.readyState === 'ended') return false;
    // A track whose sender has stopped transmitting stays `live` and
    // becomes `muted`: looking at readyState alone made us believe the
    // other side had its camera on the moment the app opened, and our
    // own video ended up in the thumbnail instead of full screen.
    //
    // But muted alone is not enough either: during a network break the
    // track goes quiet even with their camera on, and dropping the video
    // there would make the layout dance at every drop. So what the other
    // side declares counts too.
    return !t.muted || this.peerVideoDeclared;
  }

  private reportRemoteVideo() {
    const tracks: any[] = this.remoteStream?.getVideoTracks() ?? [];
    const present = this.hasRemoteVideo();
    log('remote video:', present ? 'there' : 'not there',
      '- video tracks in the stream:', tracks.length,
      tracks.map((t) => `${t.id}:${t.readyState}`).join(' '));
    this.events.onRemoteVideo?.(present);
  }

  /**
   * Which way the audio and video are really going, once connected.
   *
   * The candidates gathered do not say: they are all gathered anyway,
   * and then one wins. The difference matters, because the paths break
   * in different ways - host is the local network, srflx crosses two
   * NATs, relay goes through our own coturn - and without this figure
   * there is no telling whether a drop is the path's fault or something
   * else's.
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
        // "selected" in some implementations, "nominated+succeeded" in others
        if (r.type === 'candidate-pair' && (r.selected || r.nominated) && r.state === 'succeeded') {
          pair = r;
        }
      });
      if (!pair) { log('path: not settled yet'); return; }

      // Every road tried, not only the winning one: if the traffic goes
      // through the relay while the two phones are on the same network,
      // the answer lies in which local pair failed, or was never born.
      const describe = (c: any) =>
        c ? `${c.candidateType}/${c.address ?? c.ip ?? '?'}` : '?';
      stats.forEach((r: any) => {
        if (r.type !== 'candidate-pair') return;
        log('  road:',
          describe(candidates.get(r.localCandidateId)),
          '->', describe(candidates.get(r.remoteCandidateId)),
          '-', r.state,
          r.nominated ? '(chosen)' : '');
      });
      const local = candidates.get(pair.localCandidateId);
      const remote = candidates.get(pair.remoteCandidateId);
      const kind = local?.candidateType === 'relay' || remote?.candidateType === 'relay'
        ? 'RELAY (through the server)'
        : local?.candidateType === 'host' && remote?.candidateType === 'host'
          ? 'LOCAL (same network)'
          : 'DIRECT through NAT';
      log('path:', kind,
        '-', `${local?.candidateType ?? '?'}/${local?.protocol ?? '?'}`,
        '->', `${remote?.candidateType ?? '?'}/${remote?.protocol ?? '?'}`);
    } catch (e: any) {
      log('path not readable:', e?.message ?? e);
    }
  }

  /**
   * What is really going out, and why not more.
   *
   * The bitrate ceiling is a limit, not a target: how much is spent is
   * decided by the bandwidth estimate, by how busy the scene is and -
   * with "balanced" - by how far the encoder has scaled the output
   * down. Without reading it one ends up guessing;
   * `qualityLimitationReason` says it in a word: "bandwidth", "cpu", or
   * "none" - meaning: this is enough.
   */
  /**
   * How often the connection is measured.
   *
   * `getStats()` is not free: it is a call over the bridge that comes
   * back with dozens of entries to walk through, and it used to happen
   * every two seconds for the whole length of a conversation, whether
   * anybody was reading the numbers or not.
   *
   * Only with diagnostics on is it worth that pace, because there the
   * numbers are on the screen and have to move. Off, the measurement is
   * still needed - it is what tells the voice ceiling when the video
   * goes quiet, and it is what notices the link is going through the
   * relay - but ten seconds is plenty for both: the one has a hysteresis
   * of its own, the other happens once per link.
   */
  private static readonly STATS_MS = 2000;
  private static readonly STATS_SLOW_MS = 10000;

  private startStats() {
    if (this.statsTimer) clearInterval(this.statsTimer);
    const every = this.diagnostics ? ChannelSession.STATS_MS : ChannelSession.STATS_SLOW_MS;
    this.statsTimer = setInterval(() => { this.logOutboundVideo(); }, every);
  }

  /** Follows the diagnostics switch: it changes the pace above. */
  setDiagnostics(on: boolean) {
    if (on === this.diagnostics) return;
    this.diagnostics = on;
    if (this.statsTimer) this.startStats();
  }

  private async logOutboundVideo() {
    const pc: any = this.pc;
    if (!pc?.getStats) return;
    try {
      const stats = await pc.getStats();
      const out: VideoStats = {};
      let limit = '?';

      /**
       * The path is read again at every sample, not only on connecting.
       *
       * ICE can change road mid-course - moving from wifi to mobile the
       * direct one falls and the relay takes over - and a reading frozen
       * at the moment of connection would tell a lie exactly when the
       * truth is wanted.
       */
      const candidatesById = new Map<string, any>();
      let pairStat: any = null;
      /** What each of the two arriving streams waited, and its own round trip. */
      const waited: Record<string, { buffer?: number; decode?: number; rtt?: number }> = {};
      const forKind = (kind: string) => {
        if (!waited[kind]) waited[kind] = {};
        return waited[kind];
      };
      stats.forEach((r: any) => {
        if (r.type === 'local-candidate' || r.type === 'remote-candidate') {
          candidatesById.set(r.id, r);
        }
        if (r.type === 'candidate-pair' && (r.selected || r.nominated)
            && r.state === 'succeeded') {
          pairStat = r;
        }
      });
      if (pairStat) {
        const roundTrip = pairStat.currentRoundTripTime;
        out.latency = typeof roundTrip === 'number'
          ? Math.round(roundTrip * 1000)
          : null;
        const l = candidatesById.get(pairStat.localCandidateId);
        const rr = candidatesById.get(pairStat.remoteCandidateId);
        out.path =
          l?.candidateType === 'relay' || rr?.candidateType === 'relay' ? 'relay'
            : l?.candidateType === 'host' && rr?.candidateType === 'host' ? 'local'
              : 'direct';
      }

      /** Rebuilding the connection restarts the counters from zero: the
       *  difference goes negative, and showing that is worse than
       *  saying nothing. */
      const rate = (prev: { ts: number; bytes: number } | null, ts: number, bytes: number) => {
        const dt = prev ? (ts - prev.ts) / 1000 : 0;
        const delta = prev ? bytes - prev.bytes : -1;
        return prev && dt > 0 && delta >= 0
          ? Math.round((delta * 8) / dt / 1000)
          : null;
      };

      stats.forEach((r: any) => {
        // The round trip of the media itself, which RTCP measures on
        // the stream and not on the ICE ping.
        if (r.type === 'remote-inbound-rtp' && typeof r.roundTripTime === 'number') {
          forKind(String(r.kind)).rtt = r.roundTripTime;
        }
        if (r.type === 'inbound-rtp') {
          const w = forKind(String(r.kind));
          if (r.jitterBufferEmittedCount > 0 && typeof r.jitterBufferDelay === 'number') {
            w.buffer = r.jitterBufferDelay / r.jitterBufferEmittedCount;
          }
          if (r.framesDecoded > 0 && typeof r.totalDecodeTime === 'number') {
            w.decode = r.totalDecodeTime / r.framesDecoded;
          }
        }
        if (r.kind === 'audio' && r.type === 'outbound-rtp') {
          out.audioKbps = rate(this.lastAudioOut, r.timestamp, r.bytesSent);
          this.lastAudioOut = { ts: r.timestamp, bytes: r.bytesSent };
          return;
        }
        if (r.kind !== 'video') return;
        if (r.type === 'outbound-rtp') {
          out.out = {
            w: r.frameWidth ?? 0,
            h: r.frameHeight ?? 0,
            fps: Math.round(r.framesPerSecond ?? 0),
            kbps: rate(this.lastOutbound, r.timestamp, r.bytesSent),
          };
          this.lastOutbound = { ts: r.timestamp, bytes: r.bytesSent };
          limit = r.qualityLimitationReason ?? '?';
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

      /**
       * The wait on one of the two streams, in milliseconds.
       *
       * Without the buffer there is nothing to say: it is the term that
       * makes this different from the round trip, and it is missing
       * until something has actually been played. The stream's own
       * round trip is preferred to the ICE one, which travels the same
       * road but is measured on another kind of packet.
       */
      const oneWay = (kind: string): number | null => {
        const w = waited[kind];
        if (!w || w.buffer === undefined) return null;
        const roundTrip = w.rtt ?? pairStat?.currentRoundTripTime;
        const half = typeof roundTrip === 'number' ? roundTrip / 2 : 0;
        return Math.round((half + w.buffer + (w.decode ?? 0)) * 1000);
      };
      out.voiceDelay = oneWay('audio');
      out.pictureDelay = oneWay('video');

      /**
       * The one we are living through - the picture's when there is a
       * picture, because the sound is held back to keep up with it -
       * goes to the other side, so that both can show the whole of it.
       * Twenty milliseconds of movement are worth a message; less is
       * the number breathing.
       */
      this.ourDelay = out.pictureDelay ?? out.voiceDelay ?? null;
      if (this.diagnostics && this.ourDelay !== null
          && (this.delaySaid === null || Math.abs(this.ourDelay - this.delaySaid) > 20)) {
        this.delaySaid = this.ourDelay;
        this.broadcastState();
      }

      this.events.onVideoStats?.(out);
      this.weighVideo((out.out?.kbps ?? 0) + (out.in?.kbps ?? 0));

      // One line in the log now and then is enough: the rest is under
      // the controls.
      this.statsTicks += 1;
      if (out.out && this.statsTicks % 8 === 0) {
        log('going out:', `${out.out.w}x${out.out.h}`, `@${out.out.fps}fps`,
          out.out.kbps !== null ? `- ${out.out.kbps} kbit/s` : '',
          '- limited by:', limit);
      }
    } catch { /* diagnostics must never get in the way */ }
  }

  /**
   * Looks at how much video is going through and decides the voice
   * ceiling.
   *
   * Both directions are counted: the video is the big thing crossing
   * this connection, and while it is there, the voice's extra few kbits
   * are noticed nowhere.
   */
  private weighVideo(videoKbps: number) {
    const before = this.heavyVideo;
    if (!this.heavyVideo && videoKbps >= VIDEO_HEAVY) this.heavyVideo = true;
    else if (this.heavyVideo && videoKbps < VIDEO_LIGHT) this.heavyVideo = false;
    if (this.heavyVideo !== before) this.applyAudioQuality();
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

  // --- Controls ------------------------------------------------------------

  /**
   * Mute: the track is silenced, the microphone is not released.
   * Returns the new state.
   *
   * Really releasing it was tried - it lets other apps use it, and
   * turns the recording indicator off - but on taking it back the
   * system does not give us precedence again: from then on even the
   * keyboard's dictation would grab it while our microphone was on. On
   * Android exclusivity cannot be demanded, and holding on is the only
   * thing that resembles it.
   */
  toggleAudio(): boolean {
    // We reason about the intent, not the track: while waiting for the
    // other person the microphone is not open yet, but the button has to
    // work anyway and the choice has to hold for when it is.
    this.audioDesired = !this.audioDesired;
    const track = this.localStream?.getAudioTracks()[0];
    if (track) track.enabled = this.audioDesired;
    this.broadcastState();
    return this.audioDesired;
  }

  /** Switches the camera on: puts the track into the open channel. */
  async enableVideo(): Promise<boolean> {
    // The local stream has to exist: the video track is added to it.
    // Switching the camera on while waiting for the other person
    // therefore opens the microphone too - the camera costs far more
    // anyway, and keeping the two apart would complicate the rest for
    // no gain.
    await this.ensureMic();
    if (this.localStream!.getVideoTracks().length > 0) return true;
    const profile = VIDEO_PROFILES[this.cfg.videoQuality] ?? VIDEO_PROFILES.standard;
    const cam = await mediaDevices.getUserMedia({
      video: {
        // The chosen camera, not always the front one: changing
        // resolution reopens the camera, and starting from 'user' again
        // turned the shot back on one's own face with nobody asking.
        facingMode: this.frontCamera ? 'user' : 'environment',
        // The resolution comes from the profile: it is the one lever no
        // encoder can ignore. Scaling the output would be painless, but
        // on some phones the request is recorded and then disregarded.
        width: { ideal: profile.capture.width },
        height: { ideal: profile.capture.height },
        frameRate: { ideal: CAPTURE_FPS },
        // The shape is stated explicitly: without it the sensor can
        // pick a different format (4:3 instead of 16:9) and with it the
        // angle of view changes, so what stays inside the frame changes
        // too.
        aspectRatio: { ideal: 16 / 9 },
      },
    } as any);
    const track = cam.getVideoTracks()[0];
    if (!track) return false;

    /**
     * The requested format may not exist on the sensor.
     *
     * `aspectRatio` is a wish, not an obligation: ask a phone that does
     * not have 640x360 for it, and it falls back on the nearest 4:3. We
     * accept that: really coming down in resolution is worth more than a
     * constant shape, and the thumbnail follows the shape of its camera.
     * It only goes into the log, because it explains a different framing
     * on the two phones without anybody having to guess.
     */
    try {
      const st: any = (track as any).getSettings?.() ?? {};
      if (st.width && st.height && Math.abs(st.width / st.height - 16 / 9) > 0.05) {
        log('not a 16:9 format:', `${st.width}x${st.height}`,
          '- the sensor does not have the one asked for');
      }
    } catch { /* noop */ }

    // Taken once: after an `await` the compiler can no longer know the
    // field is still filled, and it is right.
    const local = this.localStream!;
    local.addTrack(track);                    // the local preview
    try {
      const st: any = (track as any).getSettings?.() ?? {};
      log('camera on:', `${st.width ?? '?'}x${st.height ?? '?'}`,
        st.frameRate ? `@${Math.round(st.frameRate)}fps` : '', '- track', track.id);
    } catch {
      log('camera on, track', track.id);
    }

    const senderOn: any = this.liveVideoSender();
    if (senderOn) {
      // No renegotiation: the other side simply sees the frames start
      // again on the track it already had.
      try {
        this.videoSender = senderOn;
        await senderOn.replaceTrack(track);
        await this.applyVideoQuality();
      } catch (e) {
        log('replaceTrack failed:', String(e));
      }
    } else if (this.pc) {
      // Fallback, if the video channel had not been opened in advance.
      this.videoSender = this.pc.addTrack(track, local);
    }

    // If the other side is not watching in the meantime, the camera
    // stays on for the preview but nothing goes out of the channel.
    if (!this.peerWatching) await this.applyPeerWatching();

    this.lastOutbound = null;

    this.events.onLocalStream?.(this.localStream);
    this.broadcastState();
    return true;
  }

  /**
   * The video sender of the LIVE connection, not the one we remember.
   *
   * `this.videoSender` is captured during the negotiation and, after a
   * rebuild, can refer to a superseded connection: writing parameters
   * to it succeeds without error and has no effect whatever. That is
   * how one phone kept sending 1080p with the "saver" profile on,
   * throwing frames away instead of getting smaller, while the other
   * one obeyed.
   */
  private liveVideoSender(): any {
    const pc: any = this.pc;
    if (!pc) return this.videoSender;
    try {
      const withTrack = pc.getSenders?.()
        ?.find((x: any) => x.track?.kind === 'video');
      if (withTrack) return withTrack;
      // Camera off: there is no track, but there is a channel.
      const tv = pc.getTransceivers?.()
        ?.find((t: any) => t.receiver?.track?.kind === 'video');
      if (tv?.sender) return tv.sender;
    } catch { /* fall back on the remembered one */ }
    return this.videoSender;
  }

  /**
   * Applies the chosen video profile.
   *
   * A video's bandwidth does not depend on the codec but on three
   * numbers: resolution, frames per second and bitrate ceiling. The
   * codec changes how well that ceiling is used, not how much of it is
   * spent.
   *
   * While filming, only the ceiling is touched: changing the scale or
   * the frame rate on a running encoder makes it stop producing, and
   * the video disappears on the other side while our own preview keeps
   * working.
   */
  private async applyVideoQuality() {
    const sender: any = this.liveVideoSender();
    if (!sender?.getParameters) return;
    const profile = VIDEO_PROFILES[this.cfg.videoQuality] ?? VIDEO_PROFILES.standard;
    try {
      const params = sender.getParameters();
      if (!Array.isArray(params.encodings) || params.encodings.length === 0) {
        params.encodings = [{}];
      }
      // `degradationPreference` is set ONCE, at the first application:
      // changing it on a running encoder is among the things I suspect
      // of making it stop producing, and it does not need changing to
      // change profile.
      if (!this.degradationSet) {
        params.degradationPreference = profile.degradation;
        this.degradationSet = true;
      }
      // Neither the frame rate nor the scale: the resolution is decided
      // by the capture, and on this side only the bandwidth ceiling is
      // left.
      params.encodings[0].scaleResolutionDownBy = 1;
      params.encodings[0].maxBitrate = profile.maxBitrate;
      await sender.setParameters(params);
      if (sender !== this.videoSender) {
        log('parameters written on the live sender, not the remembered one');
        this.videoSender = sender;
      }
      log('video quality:', this.cfg.videoQuality,
        `- ceiling ${Math.round(profile.maxBitrate / 1000)} kbit/s,`,
        profile.degradation);
    } catch (e) {
      log('cannot apply the video quality:', String(e));
    }
  }

  /**
   * Changes profile.
   *
   * Bitrate and frame rate change on the fly. The capture format does
   * not: it has to be asked of the camera when it is switched on, so if
   * it changes while the camera is on, the camera must be reopened.
   * There is a flash of black, but it is the only way:
   * `applyConstraints` in react-native-webrtc does not reformat a
   * capture in progress.
   */
  async setVideoQuality(q: DuoConfig['videoQuality']) {
    if (this.cfg.videoQuality === q) return;
    const after = VIDEO_PROFILES[q] ?? VIDEO_PROFILES.standard;
    this.cfg = { ...this.cfg, videoQuality: q };

    const track: any = this.localStream?.getVideoTracks()[0];
    if (!track) { await this.applyVideoQuality(); return; }

    const st = track.getSettings?.() ?? {};
    const captureWidth = st.width ?? 0;
    if (captureWidth === after.capture.width) {
      await this.applyVideoQuality();
      return;
    }

    /**
     * Changing resolution means reopening the camera, and half a second
     * of black.
     *
     * Shrinking only what comes out of the encoder would be painless,
     * and was tried: but not every encoder honours the request, and
     * telling the ones that do from the ones that do not needs a
     * measurement that turned out to be undependable - it called a
     * phone deaf that was in fact obeying. A mechanism that never fires
     * and does not say so is worse than the half second of black it was
     * meant to avoid.
     */
    log('new capture resolution:',
      `${captureWidth} -> ${after.capture.width}`, '- reopening the camera');
    await this.disableVideo();
    await this.enableVideo();
    // The sample starts again from here: otherwise the first bandwidth
    // shown after the change would be an average straddling it.
    this.lastOutbound = null;
    this.lastInbound = null;
    this.logOutboundVideo();
  }

  /** What this phone can do: the native module finds out. */
  setLocalVp9(supported: boolean) {
    if (this.localVp9 === supported) return;
    this.localVp9 = supported;
    this.broadcastState();
  }

  /**
   * VP9 is only worth it if BOTH encode it in hardware.
   *
   * Codec preferences apply to the whole session, not to one direction:
   * preferring VP9 because I can do it would force the other side to
   * encode it in software - more heat and more battery than the
   * bandwidth saved.
   */
  vp9Usable(): boolean {
    return this.localVp9 && this.peerVp9;
  }

  /**
   * Puts VP9 at the head of the codec list, if we can and want to.
   *
   * It has to be done on the transceiver BEFORE negotiating: afterwards
   * changing codec would need a full renegotiation.
   */
  private preferVp9(transceiver: any) {
    if (this.cfg.videoCodec !== 'vp9' || !this.vp9Usable()) return;
    try {
      const caps = (RTCRtpReceiver as any)?.getCapabilities?.('video');
      if (!caps?.codecs || typeof transceiver?.setCodecPreferences !== 'function') {
        log('codec preferences not available in this version: staying on VP8');
        return;
      }
      const vp9 = caps.codecs.filter((c: any) => /vp9/i.test(c.mimeType));
      const rest = caps.codecs.filter((c: any) => !/vp9/i.test(c.mimeType));
      if (vp9.length === 0) { log('no VP9 among the available codecs'); return; }
      transceiver.setCodecPreferences([...vp9, ...rest]);
      log('preferred codec: VP9 (hardware on both phones)');
    } catch (e) {
      log('cannot prefer VP9:', String(e));
    }
  }

  /**
   * We tell the other side whether we are watching, so they can stop
   * sending video nobody is looking at.
   */
  setLocalWatching(watching: boolean) {
    if (this.localWatching === watching) return;
    this.localWatching = watching;
    log(watching ? 'watching again' : 'not watching any more');
    this.broadcastState();
  }

  /**
   * The other side is not watching: we stop sending the video.
   *
   * The camera stays on and the local preview keeps working - only the
   * track is taken out of the channel, as it already is for switching
   * the video off. The channel stays open, so resuming does not cost a
   * renegotiation.
   */
  private setPeerWatching(watching: boolean) {
    if (this.peerWatching === watching) return;
    this.peerWatching = watching;
    log(watching ? 'they are watching again' : 'they are not watching: video paused');
    this.applyPeerWatching();
  }

  /** Lines up what leaves the channel with `peerWatching`. */
  private async applyPeerWatching() {
    const sender = this.liveVideoSender();
    if (!sender) return;
    const track = this.localStream?.getVideoTracks()[0] ?? null;
    try {
      await sender.replaceTrack(this.peerWatching ? track : null);
    } catch (e) {
      log('cannot change what the video channel is sending:', String(e));
    }
  }

  /** Switches the camera off: empties the channel and really releases it. */
  async disableVideo(): Promise<boolean> {
    const track = this.localStream?.getVideoTracks()[0];

    const senderOff: any = this.liveVideoSender();
    if (senderOff) {
      // The channel stays open and ready for the next switch-on.
      try {
        await senderOff.replaceTrack(null);
      } catch (e) {
        log('replaceTrack(null) failed:', String(e));
      }
    }

    if (track && this.localStream) {
      this.localStream.removeTrack(track);
      track.stop(); // frees the camera and turns Android's indicator off
      log('camera off, track', track.id);
    }

    this.lastOutbound = null;

    this.events.onLocalStream?.(this.localStream);
    this.broadcastState();
    return false;
  }

  /**
   * Turns from the front camera to the back one.
   *
   * It works with the video off too: there is nothing to turn round
   * then, but the choice holds and applies when it is switched on. It
   * is the way to point at something without showing your own face
   * first, even for a moment.
   *
   * @returns true if from now on the front camera films
   */
  switchCamera(): boolean {
    this.frontCamera = !this.frontCamera;
    const track = this.localStream?.getVideoTracks()[0] as any;
    if (track && typeof track._switchCamera === 'function') track._switchCamera();
    return this.frontCamera;
  }

  /** Which camera films (or will film). */
  isFrontCamera(): boolean {
    return this.frontCamera;
  }

  /**
   * The shape MY video is shown in (width over height).
   *
   * The camera always hands over a landscape frame (1280x720, say) and
   * it is rotated according to how you are holding the phone: so the
   * long side follows the orientation of the screen.
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
      /* some versions do not expose getSettings */
    }
    if (!w || !h) return undefined;

    const longSide = Math.max(w, h);
    const shortSide = Math.min(w, h);
    const win = Dimensions.get('window');
    const portrait = win.height >= win.width;
    return portrait ? shortSide / longSide : longSide / shortSide;
  }

  /** Tells the other side about mic, camera and shape (encrypted). */
  broadcastState() {
    this.signaling.sendSignal({
      kind: 'state',
      audio: this.isAudioEnabled(),
      output: this.ourOutput,
      version: VERSION,
      build: BUILD,
      delay: this.ourDelay ?? undefined,
      camera: this.isFrontCamera() ? 'front' : 'back',
      volume: this.heardLevel,
      video: this.isVideoEnabled(),
      aspect: this.getLocalVideoAspect(),
      watching: this.localWatching,
      hwVp9: this.localVp9,
    });
  }

  /** Changes the declared audio output and lets the other side know. */
  setOutput(output: string) {
    if (output === this.ourOutput) return;
    this.ourOutput = output;
    this.broadcastState();
  }

  /**
   * Turns the other voice up or down, on our side.
   *
   * It is applied again to every new track: a rebuilt connection brings
   * a new one, which is born at full volume and without this would come
   * back deafening by itself.
   */
  setRemoteGain(g: number) {
    if (g === this.peerGain) return;
    this.peerGain = g;
    this.applyGain();
    // We tell them: it is the only way they have of knowing you are
    // hearing them faintly, and out loud that question never gets
    // settled.
    this.broadcastState();
  }

  /** The level declared to the other side; it changes the telling, not the sound. */
  setHeardLevel(l: number) {
    // Zero is a value like any other: it means they are not heard at
    // all, and that is precisely what the other side needs to know.
    if (!(l >= 0) || l === this.heardLevel) return;
    this.heardLevel = l;
    this.broadcastState();
  }

  private applyGain() {
    const tracks = this.remoteStream?.getAudioTracks?.() ?? [];
    for (const t of tracks) {
      try {
        (t as any)._setVolume?.(this.peerGain);
      } catch { /* an unadjusted voice is not worth an error */ }
    }
  }

  /** Whether the microphone has been opened. False while waiting. */
  hasMic(): boolean {
    return !!this.localStream;
  }

  isAudioEnabled(): boolean {
    // Before the microphone is opened, the intent is what counts: to
    // the other side "on" means you will be heard, not that the device
    // is already running.
    return this.audioDesired;
  }

  isVideoEnabled(): boolean {
    const t = this.localStream?.getVideoTracks()[0];
    return !!t && t.enabled;
  }

  /** Closes the connection to the other side but stays in the channel. */
  detachPeer() {
    // From here on, every build started earlier is stale goods.
    this.generation += 1;
    this.creating = null;
    if (this.statsTimer) { clearInterval(this.statsTimer); this.statsTimer = null; }
    this.lastOutbound = null;
    this.lastInbound = null;
    // With no connection there is no video paying for the rich voice:
    // the next one starts again from the user's setting.
    this.heavyVideo = false;
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

  /** Leaves the channel and releases microphone and camera. */
  leaveChannel() {
    this.detachPeer();
    this.localStream?.getTracks().forEach((t) => t.stop());
    this.localStream = null;
    this.events.onLocalStream?.(null);
  }
}
