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
  MediaStreamTrack,
} from 'react-native-webrtc';
import { Journal, Heartbeat, AudioDevices, Leveller } from 'duetto-platform';
import type { DuoConfig } from './config';
import { iceServers, VIDEO_PROFILES, CAPTURE_FPS } from './config';
import type { Hand, Signaling, SignalMessage } from './signaling';
import { VERSION_LABEL, BUILD } from './version';
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
  /** a camera operation queued or running, or the camera still closing: see onCamera */
  onCameraBusy?: (busy: boolean) => void;
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
    /** the two halves they can time: with ours they make both journeys */
    sendDelay?: number;
    recvDelay?: number;
    /** which camera is filming: 'front' or 'back' */
    camera?: string;
    /** how loudly they are listening to US: 1 = as we send it */
    volume?: number;
    /** the two halves of `volume`, when they say them: the phone's knob (0..1) and Duetto's gain */
    volSys?: number | null;
    gain?: number;
    /** in another call on the phone */
    busy?: boolean;
    /** their battery, when they say */
    battery?: { percent: number; charging: boolean } | null;
    /** the network carrying them, when they say: 'wifi', 'mobile', ... */
    net?: string | null;
    /** putting back how things were on coming in: no cues for it */
    restoring?: boolean;
    /** when a finger last moved each thing, if they say: see Hand */
    hand?: Hand;
    /** they let us talk through their silence: missing from an older app */
    talkThrough?: boolean;
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
  /**
   * Their video frames arriving again after a pause - or for the first
   * time on a track that had been waiting for them. A view built when
   * the announcement came, before any frame, could stay black for good
   * with the picture flowing underneath: this is when to build it.
   */
  onRemoteVideoFlowing?: () => void;
  /** the whole session should be renewed: see weighGrainyIncoming */
  onSessionRenewWanted?: (why: string) => void;
  /** their voice heard through our silence, or no longer: see talkThrough */
  onHeardThrough?: (on: boolean) => void;
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
   * The two halves of the wait that THIS phone can time, in
   * milliseconds - the halves of what is travelling: the sound's when
   * only sound flows, the picture's while frames move, because the two
   * are synchronised and the wait one lives through is the frame's.
   *
   * `sendDelay` is what it adds before it leaves: the encoder and the
   * queue behind it. `recvDelay` is what it adds after it arrives: the
   * jitter buffer, the decoder, and the loudspeaker.
   *
   * Neither is a journey: a journey is one phone's send half, plus the
   * road, plus the other's receive half. Each phone tells the other its
   * two, and both can then write the two directions - all of it from
   * measurements taken where they are made, none of it borrowed.
   *
   * What is still missing, and no API offers: the camera and the
   * microphone, from the light and the air to the first byte. So the
   * true wait is a little longer than what is written - never shorter.
   */
  sendDelay?: number | null;
  recvDelay?: number | null;
  out?: { w: number; h: number; fps: number; kbps: number | null };
  in?: {
    w: number; h: number; fps: number; kbps: number | null;
    /** frames ARRIVING a second, decoded or not: see weighStalledDecoder */
    arriving?: number | null;
  };
  /** how much audio is going out: the only way to check the ceiling */
  audioKbps?: number | null;
  /** what the incoming voice lost over the last interval, per cent */
  audioLossIn?: number | null;
  /** which way the traffic is going, worked out at every sample */
  path?: 'local' | 'direct' | 'relay';
  /**
   * Packets from the other side landed here a moment ago.
   *
   * The difference between a link that is being rebuilt and one that
   * has stopped carrying: during an ICE restart the old road keeps
   * working until a new one is nominated, and the screen used to cry
   * "establishing the connection" over a conversation that had never
   * stopped.
   */
  carrying?: boolean;
  /**
   * On a relayed road, which leg carries us to the relay: udp, tcp or
   * tls. It is invisible from the candidates - their protocol speaks
   * of the far side - and it is exactly the thing that decides whether
   * a carrier's NAT can kill the road.
   */
  relayLeg?: string;
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
/**
 * How long a negotiation may meet silence before it is called stalled:
 * see isStalled(). Long enough for a slow road and a slow phone, short
 * enough that nobody stares at "establishing the connection" for it.
 */
const STALL_MS = 10_000;
/** how long an encoder may stand still before the channel is put right */
const STALL_CURE_MS = 8_000;
/** how many times that is tried, the wait doubling, before giving up */
const STALL_CURES = 2;
/**
 * The camera taken away, opened again: this long after Duetto is in
 * sight, then after these waits if it is still held elsewhere - and
 * then at the next return. See cameraEnded.
 */
const CAMERA_RETRY_MS = [1_000, 10_000, 30_000];
/** a camera operation still running after this is written down: see onCamera */
const CAMERA_STUCK_MS = 5_000;
/**
 * After the camera is switched off, this long before the next operation.
 *
 * Switching off finishes for the app when it has asked the camera to
 * close; the library goes on closing it a while longer. On 15 October,
 * on the edge, a switch-on came a second after a switch-off and never
 * finished; a minute later the video library crashed. The video button
 * stays faded meanwhile: see onCameraBusy.
 */
const CAMERA_SETTLE_MS = 1_000;

/**
 * The balancing of the two pictures: see weighBalance().
 *
 * Sending this many times more than what comes back, for this many
 * readings in a row (the readings are two seconds apart), is called
 * lopsided; the strong sender then lowers its own ceiling a step and
 * watches what happens, as many times as it takes, never below the
 * floor. When the other side has caught up for as long, the ceiling
 * climbs back a step at a time, and at the profile's own ceiling it is
 * taken away altogether.
 */
/** Their picture grainy: under this share of the profile's ceiling, this long, on a clean road. */
const GRAINY_BELOW_SHARE = 0.1;
/**
 * And never above this, whatever the profile.
 *
 * The stuck pictures ever seen were at 30 to 169 kbit/s: WebRTC's floor,
 * which knows nothing of the profile chosen. A tenth of the ceiling made
 * the "highest" profile's threshold 400 kbit/s, and on 18 October three
 * of the edge's eleven cures came above 250, for a picture low because
 * the road was narrow.
 */
const GRAINY_BELOW_BPS = 250_000;
const GRAINY_MS = 6_000;
const GRAINY_AFTER_LINK_MS = 8_000;
/** Their picture decoded at a trickle while arriving in full: see weighStalledDecoder. */
const DECODER_BUSY_SHARE = 0.25;
/** drawn at fewer than this, a full picture arriving, when the other side does not say what it sends */
const DECODER_STALLED_FPS = 6;
const DECODER_STALLED_MS = 8_000;
/** or decoded at under this share of the frames arriving, when this many arrive - or of those sent */
const DECODER_BEHIND_SHARE = 0.5;
const DECODER_ARRIVING_FPS = 15;
/**
 * Nothing whole arriving: frames a second at or under this, drawn and
 * arriving, with at least this many kbit/s coming in all the same.
 * See weighStalledDecoder.
 */
const STARVED_FPS = 1;
const STARVED_KBPS = 100;
/** our frames a second are said again in the state when they move by this many */
const SENT_FPS_STEP = 5;
/** the incoming video turned off or on: the answer waited for so long at most */
const RENEW_VIDEO_WAIT_MS = 5_000;
/** and the decoded frames read again after so long */
const RENEW_VIDEO_CHECK_MS = 4_000;
/** talking through their silence: said again so often while the finger is down */
const TALK_THROUGH_EVERY_MS = 2_000;
/** and heard through ours until so long after the last word of it */
const TALK_THROUGH_LAPSE_MS = 5_000;
const BALANCE_RATIO = 3;
const BALANCE_TICKS = 10;
const BALANCE_STEP = 0.7;
/** No balancing for this long after a link made again: see balanceHoldUntil. */
const BALANCE_HOLD_MS = 120_000;
const BALANCE_FLOOR = 200_000;

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
   * The two halves of a journey, as this phone measures them.
   *
   * A frame or a sample goes: encoder, send queue, the road, the jitter
   * buffer, the decoder, the loudspeaker. The first two are on the
   * phone that sends, the last three on the phone that receives, and
   * the road belongs to both.
   *
   * So neither of them can time a whole journey - but each times its
   * own pieces exactly, and they are pure local measurements: nothing
   * borrowed, nothing stale. They tell each other the two numbers and
   * both work out both directions.
   *
   * `sendDelay`: encoding and the wait in the send queue, here.
   * `recvDelay`: jitter buffer, decoding and the audio output, here.
   */
  private sendDelay: number | null = null;
  private recvDelay: number | null = null;
  private termsLogged = '';
  /**
   * What the road loses, written in the journal now and then.
   *
   * Packets lost coming in, as we count them; packets lost going out,
   * as the other side reports them back; the jitter of what arrives
   * and the round trip of the media. The screen shows the delays, but
   * the journal used to keep none of this, and it is the first thing
   * to ask about a conversation that sounded broken over mobile data.
   * They go in six columns of the journal, on every line - numbers in
   * cells, so a day can be drawn - refreshed at every reading; and a
   * line of its own is forced every thirty seconds while media flows,
   * with diagnostics on, and at once when the voice coming in starts
   * losing more than two packets in a hundred, which is where one
   * begins to hear it. The loss is counted over the interval, not
   * since the start: an old storm must not colour a calm minute.
   */
  private lossPrev: Record<string, { got: number; lost: number }> = {};
  private lossLineAt = 0;
  private lossAudioWasBad = false;
  /** since when the incoming voice has lost under one in a hundred; 0 while it does not */
  private lossAudioGoodSince = 0;
  private delaySaid = '';
  private delaySaidAt = 0;
  /**
   * The other side is looking. It starts at `true` and only comes down
   * on an explicit message: an older build, or a message lost on the
   * way, must leave the video on rather than switch it off for good.
   */
  private peerWatching = true;
  /**
   * The other side hears us: listening on, a volume above zero, not in
   * another call. Like `peerWatching`, it starts at `true` and only an
   * explicit word brings it down: an older build does not say it.
   */
  private peerHears = true;
  /** what the audio sender was last set to: sending or not */
  private voiceSent: boolean | null = null;
  /** `degradationPreference` is written once, never while running */
  private degradationSet = false;
  /** the last samples, to work out the real bitrate between two reads */
  private lastOutbound: { ts: number; bytes: number } | null = null;
  private lastInbound: { ts: number; bytes: number } | null = null;
  /** the incoming video's frames received at the last sample */
  private lastInboundFrames: { ts: number; frames: number } | null = null;
  /** the frames decoded of their picture, as the last reading counted them: see renewIncomingVideo */
  private framesDecodedIn: number | null = null;
  private renewingVideo = false;
  /**
   * When bytes from the other side last landed here, by the clock of
   * the statistics walk. It answers one question - "is the wifi
   * really deaf?" - for the emergency lane: packets that keep landing
   * are the proof it is not, whatever the server's silence means.
   */
  private lastMediaAt = 0;
  private inboundBytesSeen = 0;
  /** what the road in use has carried, both ways together */
  private lastWire: { ts: number; bytes: number } | null = null;
  /**
   * What the wait counters said last time, one entry per stream.
   *
   * They are totals since the stream was born: `jitterBufferDelay`
   * divided by the samples emitted gives the average of a whole
   * conversation, not of this moment. Read that way the number hardly
   * moved - turning the video off changed nothing on the screen,
   * because an hour of history was holding it still. What is wanted is
   * the difference between two readings, exactly as for the bytes.
   */
  private lastWait: Record<string, Record<string, { sum: number; count: number }>> = {};
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
  /** the sampling on the native heartbeat too: the timer stands still with the app put away */
  private statsBeat: (() => void) | null = null;
  /** Whether the technical lines are being watched: it sets the pace below. */
  private diagnostics = false;
  /** the other side says its camera is on: the `state` message tells us */
  private peerVideoDeclared = false;
  /** the network carrying the other side, as their state says: see weighGrainyIncoming */
  private peerNet: string | null = null;
  /** the frames a second the other side says it sends: see weighStalledDecoder */
  private peerSentFps: number | null = null;
  /** ours, the last said in the state: said again when it moves by SENT_FPS_STEP */
  private sentFps: number | null = null;
  private sentFpsSaid: number | null = null;

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
   * Silent both ways, because the phone is in another call.
   *
   * A telephone call, a WhatsApp call: Android takes the audio away
   * from us and says so, and going on as if nothing had happened means
   * the other person hears your call and you hear them over it. The
   * microphone goes off and their voice to zero, without touching what
   * you chose - Mute stays as it was - and both come back when the call
   * ends. `ducked` is the lighter case: a sound of the phone's own that
   * asks only for room, and gets their voice lowered for a moment.
   */
  private hushed = false;
  /** the voice's energy counters at the last reading, out and in */
  private voicePrev: { mic?: [number, number]; rx?: [number, number] } = {};
  private ducked = false;
  /**
   * Talking through their silence: a finger held down here, our voice
   * heard over there although they turned the listening off. See
   * talkThrough.
   */
  private talkingThrough = false;
  private talkThroughBeat: ReturnType<typeof setInterval> | null = null;
  /** theirs, through our silence: on while their word of it keeps coming */
  private heardThrough = false;
  private heardThroughLapse: ReturnType<typeof setTimeout> | null = null;
  /** the gain their voice would have with the listening on: the one heard through it */
  private throughGain = 1;
  /** whether we let them: said in the state, and an older app never asks */
  private throughAllowed = true;
  /** the leveller is working: the level goes to it, the track plays whole */
  private levelling = false;
  /** the battery, told to the other side for their diagnostics */
  private battery: { percent: number; charging: boolean } | null = null;
  /** the network carrying us, told with the battery: with diagnostics on */
  private network: string | null = null;
  setNetwork(n: string | null) {
    if (n === this.network) return;
    this.network = n;
    this.broadcastState();
  }

  setBattery(b: { percent: number; charging: boolean } | null) {
    const same = (!!b === !!this.battery)
      && (!b || (b.percent === this.battery!.percent && b.charging === this.battery!.charging));
    if (same) return;
    this.battery = b;
    this.broadcastState();
  }

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
  /** frames encoded at the last sample, and since when they stopped growing with the video on */
  private lastFramesEncoded = 0;
  /** the road last written in the journal: relay, direct, local */
  private lastRoad = '';
  private stalledSince = 0;
  /** how many times the channel has been put right for a still encoder */
  private stallCures = 0;
  /** the camera taken away by another app, and not yet opened again */
  private cameraLost = false;
  private cameraRetry: ReturnType<typeof setTimeout> | null = null;
  /** attempts since Duetto came back in sight */
  private cameraTries = 0;
  private cameraReopening = false;
  private makingOffer = false;
  private ignoreOffer = false;
  /** When the offer that is being ignored was set aside: see onSignal. */
  private ignoreOfferSince = 0;
  /** An ICE restart was asked for and no offer has left yet. */
  private restartAskedAt = 0;
  /** When our offer left with no answer back yet; 0 = nothing pending. */
  private offerPendingSince = 0;
  /** When this peer was built: the clock for "nothing ever arrived". */
  private peerBornAt = 0;
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
  /**
   * The local stream, with its microphone - once. Two asking together
   * used to open two: the second took the place of the first, and the
   * first's microphone stayed open with nobody holding it (10 October,
   * the moto: the video switched back on by itself and by hand in the
   * same second).
   */
  private micOpening: Promise<void> | null = null;
  private ensureMic(): Promise<void> {
    if (this.localStream) return Promise.resolve();
    if (this.micOpening) return this.micOpening;
    this.micOpening = (async () => {
      const stream = await mediaDevices.getUserMedia({ audio: true, video: false });
      // The microphone can be born muted: "Mute" can be pressed while
      // waiting, and that choice has to hold for the track that did not
      // exist yet.
      const track = stream.getAudioTracks()[0];
      if (track) track.enabled = this.micLive();
      this.localStream = stream;
      this.events.onLocalStream?.(stream);
    })().finally(() => { this.micOpening = null; });
    return this.micOpening;
  }

  /**
   * One camera operation at a time: switching on, switching off,
   * opening again.
   *
   * On 10 October the moto came back into the channel after an update,
   * switching its video back on by itself, and the button was pressed in
   * the same second: two switch-ons ran together and opened the camera
   * twice - Android's camera log has Duetto evicting itself. The first
   * opening was left half done, and switching off a camera still opening
   * makes the video library wait for good, on the one thread it does
   * everything on: from then on no camera would open until the process
   * was stopped. Now each waits for the one before; a second switch-on
   * finds the camera already on.
   */
  private cameraQueue: Promise<unknown> = Promise.resolve();
  /** camera operations queued or running */
  private cameraBusy = 0;
  /**
   * @param what for the journal: on, off, reopen
   *
   * Each operation that waits behind another, and each that takes longer
   * than CAMERA_STUCK_MS, is written down: on 15 October, on the edge, a
   * switch-on a second after a switch-off never finished, the presses
   * after it queued behind it with nothing to show, and the journal had
   * not a word about any of it.
   *
   * Busy from the moment one is asked for until the queue is empty
   * again, the pause after a switch-off included: the video button
   * listens to that (onCameraBusy), and stays faded meanwhile.
   */
  private onCamera<T>(what: string, op: () => Promise<T>): Promise<T> {
    const ahead = this.cameraBusy++;
    if (ahead === 0) this.events.onCameraBusy?.(true);
    if (ahead > 0) Journal.mark(`camera:queued:${what}:behind-${ahead}`).catch(() => { /* noop */ });
    const timed = async () => {
      const started = Date.now();
      const watch = setTimeout(() => {
        Journal.mark(`camera:stuck:${what}`).catch(() => { /* noop */ });
      }, CAMERA_STUCK_MS);
      try {
        return await op();
      } finally {
        clearTimeout(watch);
        const took = Date.now() - started;
        if (took >= CAMERA_STUCK_MS) {
          Journal.mark(`camera:unstuck:${what}:${Math.round(took / 1000)}s`).catch(() => { /* noop */ });
        }
      }
    };
    const run = this.cameraQueue.then(timed, timed);
    this.cameraQueue = run.catch(() => undefined)
      .then(() => (what === 'off'
        ? new Promise<void>((done) => { setTimeout(done, CAMERA_SETTLE_MS); })
        : undefined))
      .then(() => {
        this.cameraBusy -= 1;
        if (this.cameraBusy === 0) this.events.onCameraBusy?.(false);
      });
    return run;
  }

  /** the session id of the other side's last description: see fromNewPeerConnection */
  private remoteSessionId: string | null = null;

  /** The "o=" line's session id: a new RTCPeerConnection, a new id. */
  private static sessionId(sdp: string): string | null {
    return /^o=\S+ (\S+) /m.exec(sdp)?.[1] ?? null;
  }

  /**
   * This offer comes from a link the other side has just made from
   * scratch, while ours is the old one.
   *
   * The side that answers took the new offer onto its old link and
   * kept it - and every picture stuck on the floor came after that:
   * the other phone back after an update, a rebuild of theirs, the
   * links made again after the server dropped. What cured it each time
   * was a new link on this side too: leaving and entering, the session
   * renewed, the microphone renewed with the link. The app makes ours
   * again before answering.
   */
  fromNewPeerConnection(sdp: string): boolean {
    if (!this.pc || !this.remoteSessionId) return false;
    const id = ChannelSession.sessionId(sdp);
    return id !== null && id !== this.remoteSessionId;
  }

  /**
   * A new microphone track in place of the old one, the session kept.
   *
   * A trial: the grainy picture came right only when the whole session
   * was thrown away, and of what the session carries from one link to
   * the next the microphone's track is the thing nothing else renews -
   * switching the microphone off and on only disables it. The link is
   * made again by the caller, and the new track goes on it.
   */
  async renewMic(): Promise<boolean> {
    const old = this.localStream?.getAudioTracks()[0];
    if (!this.localStream || !old) return false;
    const fresh = await mediaDevices.getUserMedia({ audio: true, video: false });
    const track = fresh.getAudioTracks()[0];
    if (!track) return false;
    track.enabled = this.micLive();
    this.localStream.removeTrack(old);
    old.stop();
    this.localStream.addTrack(track);
    return true;
  }

  /**
   * A new microphone track on the link as it stands, for a change of
   * road.
   *
   * A change of network usually changes the road of the same link
   * (ICE restart): no rebuild, so no fresh track, and the old one held
   * the other phone's estimate on the floor once more - 480x240 coming
   * in until the safety net rebuilt the link. The new track takes the
   * old one's place in the sender, with no rebuild and no black. A
   * trial: so far a fresh track always rode a new link.
   */
  async freshMicOnRoad(): Promise<boolean> {
    const sender = this.liveAudioSender();
    if (!sender) return false;
    if (!(await this.renewMic())) return false;
    const track = this.localStream?.getAudioTracks()[0];
    if (!track) return false;
    await sender.replaceTrack(track);
    return true;
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
  /** the two halves of `heardLevel`, told alongside: the phone's knob (0..1, null if unknown) and our gain */
  private heardSys: number | null = null;
  private heardGain = 1;

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
      const send = this.voiceWanted();
      params.encodings[0].active = send;
      await sender.setParameters(params);
      log('audio:', rich ? '64 kbit/s ceiling' : '32 kbit/s ceiling',
        !this.cfg.richerAudio && rich ? '(because of the video)' : '',
        send ? '' : '(not sent)');
      if (send !== this.voiceSent) {
        this.voiceSent = send;
        Journal.mark(`voice-sent:${send ? 'yes' : `no:${this.voiceHeldWhy()}`}`)
          .catch(() => { /* noop */ });
      }
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
  /**
   * Whether our voice is worth sending.
   *
   * A muted microphone still sent silence - a packet every 400 ms with
   * DTX - and a voice nobody was hearing went out whole: packets that
   * keep the radio awake for nothing. The sender is paused, not
   * emptied: no renegotiation, and it starts again at once.
   */
  private voiceWanted(): boolean {
    return this.micLive() && (this.peerHears || this.talkingThrough);
  }

  /** The microphone's track open: wanted, or held down to talk through. */
  private micLive(): boolean {
    return (this.audioDesired || this.talkingThrough) && !this.hushed;
  }

  private voiceHeldWhy(): string {
    if (!this.audioDesired) return 'mic-off';
    if (this.hushed) return 'in-call';
    return 'not-heard';
  }

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
    /**
     * Every link after the first gets a microphone track of its own.
     *
     * The old one, carried from link to link, kept the other phone's
     * bandwidth estimate on the floor after a change of network: a
     * 320x176 stamp coming in over a clean road, for minutes, on the
     * wifi and on the mobile data, until a new track was opened - twice
     * out of twice that alone brought 720p back within seconds, where
     * rebuilding the link and switching the microphone off and on did
     * nothing. The track is reopened while the link is down anyway.
     */
    if (this.builtOnce && mine === this.generation) {
      try {
        if (await this.renewMic()) Journal.mark('mic:fresh-track').catch(() => { /* noop */ });
      } catch (e) {
        Journal.mark(`mic:fresh-track:failed:${String(e)}`).catch(() => { /* noop */ });
      }
    }
    // Somebody else may have built it in the meantime, or somebody may
    // have torn everything down: either way this build is out of date.
    if (this.pc || mine !== this.generation) return;

    this.polite = polite;
    const servers = [...iceServers(), ...this.extraIce];
    log('connecting the peer - they offer:', polite, '| ICE servers:',
      servers.map((s2) => s2.urls).join(', '));
    const pc = new RTCPeerConnection({ iceServers: servers });
    this.pc = pc;
    this.builtOnce = true;
    this.peerBornAt = Date.now();

    this.remoteStream = new MediaStream();

    // The measurements follow the connection, not our camera: with the
    // other side's video alone there is still something to show.
    this.lastOutbound = null;
    this.lastFramesEncoded = 0;
    this.stalledSince = 0;
    this.stallCures = 0;
    this.lastInbound = null;
    this.lastInboundFrames = null;
    this.lastWait = {};
    this.termsLogged = '';
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
        // The frames are really back: the moment to draw them on a view
        // of their own - see onRemoteVideoFlowing.
        if (incoming.kind === 'video') this.events.onRemoteVideoFlowing?.();
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
      // The measuring changes pace with the state: see startStats.
      if (this.statsTimer && isCurrent()) this.startStats();
      this.events.onConnectionState?.(pc.connectionState);
      if (pc.connectionState === 'connected') {
        if (this.linkedOnce) {
          this.balanceHoldUntil = Date.now() + BALANCE_HOLD_MS;
          Journal.mark('balance:hold').catch(() => { /* noop */ });
        }
        this.linkedOnce = true;
        this.linkedAt = Date.now();
        // The wish held back during the repair is granted now: see
        // applyPeerWatching.
        this.applyPeerWatching();
        // And whether our voice goes out, on the sender of this link.
        this.applyAudioQuality();
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
    this.lastFramesEncoded = 0;
    this.stalledSince = 0;
    this.stallCures = 0;
        this.lastInbound = null;
        this.lastInboundFrames = null;
        this.logOutboundVideo();
        setTimeout(() => this.logOutboundVideo(), 1000);
        // How the voice is taken - microphone, effects, silenced or not -
        // once the recording has surely started: a voice leaving far too
        // quiet on one phone is otherwise a guess.
        setTimeout(() => {
          if (!isCurrent()) return;
          AudioDevices.voice()
            .then((v) => { if (v) Journal.mark(`voice-path:${v}`).catch(() => { /* noop */ }); })
            .catch(() => { /* noop */ });
        }, 3000);
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
      this.voiceSent = null;
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

  /**
   * The video channel must carry our track out, not only theirs in.
   *
   * On the polite side the transceiver that came with their offer is
   * receive-only until somebody says otherwise, and replacing its
   * track alone sends nothing: the other side sees black - one phone
   * did, for an afternoon, and switching the video off and on changed
   * nothing, because nobody ever renegotiated. So: the direction set
   * to sendrecv, and a renegotiation - ours if we may offer, asked of
   * them if we may not. Called when the video goes on, and again when
   * the encoder is seen standing still with the video on.
   */
  private async ensureVideoSending(why: string) {
    const pc: any = this.pc;
    const sender = this.videoSender;
    if (!pc || !sender) return;
    let tr: any = null;
    try { tr = pc.getTransceivers?.().find((t: any) => t.sender === sender) ?? null; } catch { /* noop */ }
    const dir = tr?.direction ?? '?';
    const cur = tr?.currentDirection ?? '?';
    Journal.mark(`video:${why}:dir=${dir}/${cur} polite=${this.polite ? 'yes' : 'no'}`).catch(() => { /* noop */ });
    if (tr && dir !== 'sendrecv') {
      try { tr.direction = 'sendrecv'; } catch (e) { log('direction not set:', String(e)); }
    }
    if (dir === 'sendrecv' && cur === 'sendrecv' && why === 'on') return;
    if (this.polite) {
      log('renegotiation asked of them');
      this.signaling.sendSignal({ kind: 'renegotiate', offer: true, why: `video-${why}` });
    } else {
      await this.negotiate();
    }
  }

  /**
   * Thrifty audio: 60 ms packets and silence not sent.
   *
   * Opus sends a packet every 20 ms by default, fifty a second each
   * way, and on a mobile network it is the packets, not the bytes,
   * that keep the radio awake. Sixty milliseconds is a third of them,
   * with a delay of forty milliseconds more that nobody hears; and DTX
   * sends one packet every four hundred milliseconds while nobody is
   * talking. Both are asked for in the SDP: libwebrtc reads them from
   * the description it RECEIVES, so ours is shaped too, before it goes
   * out, for the other side - an older app included - to send the same
   * way; and theirs is shaped on arrival, for our encoder.
   */
  /**
   * The other side's description, shaped for OUR encoder.
   *
   * libwebrtc takes the parameters of what it sends from the
   * description it receives: that is why the audio is shaped on both,
   * and why the video's starting bitrate goes here alone. Written on
   * our own offer it would set the OTHER phone's start, from our
   * network - and it is the sender's road that decides. On wifi the
   * encoder starts from the profile's figure instead of the library's
   * three hundred; on mobile data the default stands. See config.ts.
   */
  private shapeRemote(sdp: string): string {
    const shaped = ChannelSession.thriftyAudio(sdp, this.ptime());
    if (this.network !== 'wifi') return shaped;
    const profile = VIDEO_PROFILES[this.cfg.videoQuality] ?? VIDEO_PROFILES.better;
    const kbps = Math.round(profile.startWifi / 1000);
    const out = ChannelSession.withStartBitrate(shaped, kbps);
    if (out !== shaped && !this.startSaid) {
      this.startSaid = true;
      Journal.mark(`video:start:${kbps}k:wifi`).catch(() => { /* noop */ });
    }
    return out;
  }
  private startSaid = false;

  /** x-google-start-bitrate on every real video codec: not on rtx, red, fec. */
  private static withStartBitrate(sdp: string, kbps: number): string {
    const pts = [...sdp.matchAll(/^a=rtpmap:(\d+) (VP8|VP9|H264|AV1)\//gim)].map((m) => m[1]);
    let out = sdp;
    for (const pt of pts) {
      const fmtp = new RegExp(`^(a=fmtp:${pt} [^\\r\\n]*)`, 'm');
      if (fmtp.test(out)) {
        out = out.replace(fmtp, (line) => (/x-google-start-bitrate=/.test(line)
          ? line.replace(/x-google-start-bitrate=\d+/, `x-google-start-bitrate=${kbps}`)
          : `${line};x-google-start-bitrate=${kbps}`));
      } else {
        out = out.replace(
          new RegExp(`(a=rtpmap:${pt} [^\\r\\n]*\\r?\\n)`),
          (all) => `${all}a=fmtp:${pt} x-google-start-bitrate=${kbps}\r\n`,
        );
      }
    }
    return out;
  }

  /**
   * Sixty milliseconds of voice per packet, or twenty when the road
   * loses: see shortPackets in config.ts. A choice for this session
   * alone may sit beside the written one - "for this time" on the
   * sheet - and dies with the session.
   */
  private shortThisTime = false;
  private ptime(): number {
    return this.cfg.shortPackets || this.shortThisTime ? 20 : 60;
  }

  /**
   * Switches the packet length, here and now, for both.
   *
   * The length an encoder uses is read from the description it
   * RECEIVES, so a new pair of descriptions has to go round: the side
   * that offers makes the offer, the other asks it to. Told to the
   * other side by whoever keeps the configuration, as the richer voice
   * is.
   */
  async setShortPackets(on: boolean, permanent: boolean) {
    if (permanent) this.cfg = { ...this.cfg, shortPackets: on };
    else this.shortThisTime = on;
    Journal.mark(`packets:${this.ptime()}ms${permanent ? '' : ':this-time'}`).catch(() => { /* noop */ });
    if (!this.pc) return;
    if (this.polite) this.signaling.sendSignal({ kind: 'renegotiate', offer: true, why: 'packets' });
    else await this.negotiate();
  }

  private static thriftyAudio(sdp: string, ptime = 60): string {
    const m = sdp.match(/a=rtpmap:(\d+) opus\/48000\/2/i);
    if (!m) return sdp;
    const pt = m[1];
    const shaped = (params: string) => {
      const kv = new Map<string, string>();
      for (const p of params.split(';')) {
        const t = p.trim();
        if (!t) continue;
        const i = t.indexOf('=');
        kv.set(i < 0 ? t : t.slice(0, i), i < 0 ? '' : t.slice(i + 1));
      }
      kv.set('minptime', '10');
      kv.set('useinbandfec', '1');
      kv.set('usedtx', '1');
      kv.set('ptime', String(ptime));
      kv.set('maxptime', '120');
      return [...kv].map(([k, v]) => (v === '' ? k : `${k}=${v}`)).join(';');
    };
    const fmtp = new RegExp(`^a=fmtp:${pt} ([^\\r\\n]*)`, 'm');
    if (fmtp.test(sdp)) return sdp.replace(fmtp, (_all, p) => `a=fmtp:${pt} ${shaped(p)}`);
    return sdp.replace(
      new RegExp(`(a=rtpmap:${pt} opus\\/48000\\/2[^\\r\\n]*\\r?\\n)`),
      (all) => `${all}a=fmtp:${pt} ${shaped('')}\r\n`,
    );
  }

  /**
   * A new offer on the link as it stands, asked by the other side: they
   * cannot offer, and asking for it used to rebuild the whole link - a
   * black picture to open a video channel. With no link, false: the
   * caller builds one.
   */
  async offerAgain(why: string): Promise<boolean> {
    if (!this.pc || this.polite) return false;
    Journal.mark(`link:renegotiate:asked:${why}`).catch(() => { /* noop */ });
    await this.negotiate();
    return true;
  }

  /**
   * Their picture's decoder made anew, the link left standing.
   *
   * A stuck decoder was cured by a new link - the microphone's track,
   * then the whole session - and a new link stops everything: the
   * voice both ways, and the picture the other side was watching, black
   * for six seconds on the POCO for a decoder stuck on the edge (24
   * October). What is stuck is only the picture coming in, and WebRTC
   * stops its decoder when there is nothing more to receive and makes a
   * new one when there is again. So the video channel is turned, on the
   * same link, to sending alone and back, two renegotiations as for a
   * codec changed: the voice goes on, our picture goes on reaching
   * them, and theirs stands still here for a second.
   *
   * False if it could not be done - no link, no video channel, an
   * answer that never came - and the caller goes on to the next cure.
   */
  async renewIncomingVideo(why: string): Promise<boolean> {
    const pc: any = this.pc;
    if (!pc || pc.connectionState !== 'connected' || this.renewingVideo) return false;
    let tr: any = null;
    try {
      tr = (pc.getTransceivers?.() ?? [])
        .find((t: any) => !t?.stopped && t?.receiver?.track?.kind === 'video') ?? null;
    } catch { /* noop */ }
    const was = tr?.direction;
    if (was !== 'sendrecv' && was !== 'recvonly') return false;
    this.renewingVideo = true;
    Journal.mark(`session:renew-video:${why}:decoded=${this.framesDecodedIn ?? '?'}`).catch(() => { /* noop */ });
    try {
      const off = await this.turnReceiving(tr, was === 'sendrecv' ? 'sendonly' : 'inactive', false);
      const back = await this.turnReceiving(tr, was, true);
      Journal.mark(`session:renew-video:${off && back ? 'done' : `failed:${off ? 'back' : 'off'}`}`)
        .catch(() => { /* noop */ });
      // Read again a little later: a counter started afresh is a new
      // decoder; one going on from where it was is the old one.
      setTimeout(() => {
        Journal.mark(`session:renew-video:after:decoded=${this.framesDecodedIn ?? '?'}`).catch(() => { /* noop */ });
      }, RENEW_VIDEO_CHECK_MS);
      return off && back;
    } catch (e) {
      log('incoming video not renewed:', String(e));
      try { tr.direction = was; } catch { /* noop */ }
      return false;
    } finally {
      this.renewingVideo = false;
    }
  }

  /** The video channel turned to a direction, negotiated, and waited for. */
  private async turnReceiving(tr: any, direction: string, receiving: boolean): Promise<boolean> {
    tr.direction = direction;
    // The setter reaches the native side by itself, a moment later.
    await new Promise((r) => setTimeout(r, 200));
    if (this.polite) this.signaling.sendSignal({ kind: 'renegotiate', offer: true, why: 'renew-video' });
    else await this.negotiate();
    const until = Date.now() + RENEW_VIDEO_WAIT_MS;
    while (Date.now() < until) {
      const now: string | null = tr.currentDirection ?? null;
      if (now && (now === 'sendrecv' || now === 'recvonly') === receiving) return true;
      await new Promise((r) => setTimeout(r, 100));
    }
    return false;
  }

  /** How long ago the link in use was built, in ms; Infinity with none. */
  linkAge(): number {
    return this.pc && this.peerBornAt ? Date.now() - this.peerBornAt : Infinity;
  }

  /** The link's own state, for the app; null with no link. */
  linkState(): string | null {
    return this.pc?.connectionState ?? null;
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
      await pc.setLocalDescription(
        new RTCSessionDescription({ type: offer.type, sdp: ChannelSession.thriftyAudio(offer.sdp, this.ptime()) }),
      );
      const desc = pc.localDescription!;
      log('offer sent');
      this.signaling.sendSignal({ kind: 'desc', type: 'offer', sdp: desc.sdp });
      // If an ICE restart was waiting for this offer, it has left now.
      this.restartAskedAt = 0;
      // And the answer's clock starts: see isStalled().
      this.offerPendingSince = Date.now();
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
      this.peerNet = typeof msg.net === 'string' ? msg.net : null;
      this.peerSentFps = typeof msg.sentFps === 'number' ? msg.sentFps : null;
      this.peerVp9 = msg.hwVp9 === true;
      this.events.onPeerState?.({
        audio: msg.audio,
        video: msg.video,
        aspect: msg.aspect,
        hwVp9: this.peerVp9,
        output: msg.output,
        version: msg.version,
        build: msg.build,
        sendDelay: msg.sendDelay,
        recvDelay: msg.recvDelay,
        camera: msg.camera,
        volume: msg.volume,
        volSys: typeof msg.volSys === 'number' ? msg.volSys : null,
        gain: typeof msg.gain === 'number' ? msg.gain : undefined,
        busy: msg.busy === true,
        battery: typeof msg.batteryPct === 'number'
          ? { percent: msg.batteryPct, charging: msg.charging === true }
          : null,
        net: typeof msg.net === 'string' ? msg.net : null,
        restoring: msg.restoring === true,
        hand: msg.hand && typeof msg.hand === 'object' ? msg.hand : undefined,
        talkThrough: msg.talkThrough === true,
      });
      this.setPeerWatching(msg.watching !== false);
      // Not heard: listening off or at zero, or in another call.
      const hears = msg.busy !== true && !(typeof msg.volume === 'number' && msg.volume <= 0);
      if (hears !== this.peerHears) {
        this.peerHears = hears;
        this.applyAudioQuality();
      }
      // What the other side declares goes into the judgement on
      // "is their video there": when it changes, that has to be redone.
      this.reportRemoteVideo();
      return;
    }

    if (msg.kind === 'talkThrough') {
      this.hearThrough(msg.on === true);
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
      if (this.ignoreOffer) {
        this.ignoreOfferSince = Date.now();
        log('offer ignored (collision, we are impolite)');
        return;
      }

      if (collision) {
        // Polite: roll our own offer back and take theirs.
        try {
          await pc.setLocalDescription({ type: 'rollback' } as any);
        } catch {
          // if rollback is not supported we carry on anyway
        }
      }

      await pc.setRemoteDescription(
        new RTCSessionDescription({ type: msg.type, sdp: this.shapeRemote(msg.sdp) }),
      );
      this.remoteSessionId = ChannelSession.sessionId(msg.sdp);
      // Something came back: whatever was waiting, it is not stalled.
      this.offerPendingSince = 0;
      await this.flushCandidates();
      await this.captureVideoSender();

      if (msg.type === 'offer') {
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(
          new RTCSessionDescription({ type: answer.type, sdp: ChannelSession.thriftyAudio(answer.sdp, this.ptime()) }),
        );
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
      if (this.ignoreOffer) {
        // The flag lives from one description to the next: if the
        // collision it belongs to never completes - the answer to our
        // own offer lost along the way - it used to stay up for ever,
        // discarding every candidate that arrived. After a good while
        // with no description it no longer describes anything.
        if (Date.now() - this.ignoreOfferSince > 10_000) {
          this.ignoreOffer = false;
        } else {
          log('candidate ignored (collision, we are impolite)');
          return;
        }
      }
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
        this.restartAskedAt = Date.now();
        pc.restartIce();
        log('ICE restarted');
        // Trust, but verify: restartIce() only queues a request for
        // negotiation, and the event carrying it has been known not to
        // fire. If no offer has left in a moment, it is made by hand -
        // the same road the older versions below always take. (A timer:
        // with the screen off it may not fire, and there the heartbeat's
        // harder medicine covers the same hole.)
        setTimeout(async () => {
          if (this.pc !== pc || !this.restartAskedAt) return;
          this.restartAskedAt = 0;
          try {
            const offer = await pc.createOffer({ iceRestart: true });
            await pc.setLocalDescription(
              new RTCSessionDescription({ type: offer.type, sdp: ChannelSession.thriftyAudio(offer.sdp, this.ptime()) }),
            );
            this.signaling.sendSignal({
              kind: 'desc', type: 'offer', sdp: pc.localDescription.sdp,
            });
            log('the restart offer had not left: made by hand');
          } catch (e) {
            log('hand-made restart offer failed:', String(e));
          }
        }, 1500);
        return true;
      }
      // Older versions: the same thing, with an offer.
      const offer = await pc.createOffer({ iceRestart: true });
      await pc.setLocalDescription(
        new RTCSessionDescription({ type: offer.type, sdp: ChannelSession.thriftyAudio(offer.sdp, this.ptime()) }),
      );
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
   * Negotiation that went out and met silence.
   *
   * The sickness isPeerHealthy() cannot see: a connection whose offer
   * (or whose whole negotiation) was lost on the road stays NEW for
   * ever - never failed, never disconnected, just unborn - and every
   * safety net read NEW as healthy. Two phones stood facing each
   * other, each waiting, each convinced nothing was wrong; it happened
   * now and then for as long as anyone remembers, whenever an offer
   * fell into the gap between the socket opening and the server's
   * `joined`.
   *
   * Two shapes of the same silence: our offer left and no answer came
   * back (the offering side), or the peer was built and nothing ever
   * arrived at all (the answering side). After a good while, that
   * silence is a verdict - and the ordinary medicine applies.
   */
  /**
   * Packets from the other side arriving right now: the received bytes
   * read twice, `ms` apart.
   *
   * The sampled counter behind mediaArrivedWithin is read every ten
   * seconds with the app behind, and a question about the last two
   * seconds was answered "no" on a link that was carrying - rebuilt for
   * nothing, a black picture.
   */
  async mediaFlowingNow(ms = 1000): Promise<boolean> {
    const read = async (): Promise<number> => {
      const pc: any = this.pc;
      if (!pc) return -1;
      let bytes = 0;
      const stats = await pc.getStats();
      stats.forEach((r: any) => {
        if (r.type === 'inbound-rtp') bytes += Number(r.bytesReceived ?? 0);
      });
      return bytes;
    };
    try {
      const before = await read();
      if (before < 0) return false;
      await new Promise((done) => setTimeout(done, ms));
      const after = await read();
      return after > before;
    } catch {
      return false;
    }
  }

  /** Bytes from the other side landed here within the last `ms`. */
  mediaArrivedWithin(ms: number): boolean {
    return this.lastMediaAt > 0 && Date.now() - this.lastMediaAt < ms;
  }

  isStalled(): boolean {
    const pc: any = this.pc;
    if (!pc || pc.connectionState !== 'new') return false;
    const now = Date.now();
    if (this.offerPendingSince && now - this.offerPendingSince > STALL_MS) return true;
    return !pc.remoteDescription && !!this.peerBornAt && now - this.peerBornAt > STALL_MS;
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
      const pairs = new Map<string, any>();
      let chosenId: string | null = null;
      stats.forEach((r: any) => {
        if (r.type === 'local-candidate' || r.type === 'remote-candidate') {
          candidates.set(r.id, r);
        }
        // "selected" in some implementations, "nominated+succeeded" in
        // others - and in the standard's own words, the transport names
        // the winner. All three dialects are listened to: see the same
        // note where the statistics are gathered.
        if (r.type === 'candidate-pair') {
          pairs.set(r.id, r);
          if ((r.selected || r.nominated) && r.state === 'succeeded') pair = r;
        }
        if (r.type === 'transport' && r.selectedCandidatePairId) {
          chosenId = r.selectedCandidatePairId;
        }
      });
      if (chosenId && pairs.get(chosenId)) pair = pairs.get(chosenId);
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
  /**
   * How long without a packet before the link is called silent.
   *
   * Comfortably more than the fast sampling interval below, because
   * the arrival is only noticed when the walk goes past: less than
   * that and a link in perfect health would be called silent between
   * one reading and the next.
   */
  private static readonly CARRYING_MS = 4000;

  private static readonly STATS_MS = 2000;
  private static readonly STATS_SLOW_MS = 10000;

  private startStats() {
    if (this.statsTimer) clearInterval(this.statsTimer);
    /**
     * The quick pace also while the link is not whole.
     *
     * There the measurement answers a question that is being asked on
     * screen: are packets still landing? Ten seconds are far too
     * coarse for it - the answer would be older than the thing it
     * describes - and an interruption does not last long enough for
     * the cost to matter.
     */
    const unwell = !!this.pc && this.pc.connectionState !== 'connected';
    const every = this.diagnostics || unwell
      ? ChannelSession.STATS_MS : ChannelSession.STATS_SLOW_MS;
    this.statsTimer = setInterval(() => { this.logOutboundVideo(); }, every);
    if (!this.statsBeat) this.statsBeat = Heartbeat.subscribe(() => { this.logOutboundVideo(); });
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
      let framesEncodedSum = 0;
      let framesEncodedSeen = false;

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
      /**
       * Every term of the wait, in seconds, over the last interval.
       *
       * They all come the same way: a total that grows, divided by a
       * count that grows with it. Read as they stand - total over total
       * - they would give the average of the whole conversation, and a
       * number like that hardly moves when something changes: it is how
       * switching a camera off used to change nothing on the screen. So
       * every one of them is taken as the step between two readings.
       *
       * `waited[what]` is a term: 'buffer', 'decode', 'playout' on the
       * receiving side, 'encode' and 'queue' on the sending one. The
       * kind - audio or video - keeps its own set, because the picture
       * and the sound do not wait the same.
       */
      const waited: Record<string, Record<string, number>> = {};
      const step = (kind: string, what: string, sum: number, count: number) => {
        if (typeof sum !== 'number' || typeof count !== 'number') return;
        if (!this.lastWait[kind]) this.lastWait[kind] = {};
        const was = this.lastWait[kind][what];
        this.lastWait[kind][what] = { sum, count };
        if (!was || count <= was.count || sum < was.sum) return;
        if (!waited[kind]) waited[kind] = {};
        waited[kind][what] = (sum - was.sum) / (count - was.count);
      };
      const forKind = (kind: string) => {
        if (!waited[kind]) waited[kind] = {};
        return waited[kind];
      };
      /**
       * The winning pair, asked of the transport first.
       *
       * `selectedCandidatePairId` is the standard's way of naming it.
       * The flags on the pairs themselves - `selected`, `nominated` -
       * are the older dialects, and on the cellular path after an ICE
       * restart they simply were not there: the road, the latency and
       * with them the whole journey vanished from the screen at the
       * exact moment one wanted to see which road had died.
       */
      const pairsById = new Map<string, any>();
      let selectedPairId: string | null = null;
      stats.forEach((r: any) => {
        if (r.type === 'local-candidate' || r.type === 'remote-candidate') {
          candidatesById.set(r.id, r);
        }
        if (r.type === 'candidate-pair') {
          pairsById.set(r.id, r);
          if ((r.selected || r.nominated) && r.state === 'succeeded') pairStat = r;
        }
        if (r.type === 'transport' && r.selectedCandidatePairId) {
          selectedPairId = r.selectedCandidatePairId;
        }
      });
      if (selectedPairId && pairsById.get(selectedPairId)) {
        pairStat = pairsById.get(selectedPairId);
      }
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
        if (out.path === 'relay' && typeof l?.relayProtocol === 'string') {
          out.relayLeg = l.relayProtocol;
        }
        // Written down when it changes: a "connecting" out of the blue
        // is read the day after only if the road before it is known.
        const road = `${out.path}${out.relayLeg ? '/' + out.relayLeg : ''}`;
        if (road !== this.lastRoad) {
          this.lastRoad = road;
          // A new road counts from its own zero.
          this.lastWire = null;
          Journal.mark(`road:${road}`).catch(() => { /* noop */ });
        }
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

      const road: Record<string, {
        got?: number; lost?: number; jitter?: number; far?: number; rtt?: number;
      }> = {};
      const onRoad = (kind: string) => (road[kind] ??= {});
      /** the voice's energy counters, out and in: see voicePrev */
      const energy: { mic?: [number, number]; rx?: [number, number] } = {};
      stats.forEach((r: any) => {
        if (r.kind === 'audio' && typeof r.totalAudioEnergy === 'number'
          && typeof r.totalSamplesDuration === 'number') {
          if (r.type === 'media-source') energy.mic = [r.totalAudioEnergy, r.totalSamplesDuration];
          if (r.type === 'inbound-rtp') energy.rx = [r.totalAudioEnergy, r.totalSamplesDuration];
        }
        // The round trip of the media itself, which RTCP measures on
        // the stream and not on the ICE ping.
        if (r.type === 'remote-inbound-rtp') {
          if (typeof r.roundTripTime === 'number') {
            forKind(String(r.kind)).rtt = r.roundTripTime;
            onRoad(String(r.kind)).rtt = r.roundTripTime;
          }
          // What the other side lost of what we sent, in its last report.
          if (typeof r.fractionLost === 'number') onRoad(String(r.kind)).far = r.fractionLost;
        }
        if (r.type === 'inbound-rtp') {
          const kind = String(r.kind);
          step(kind, 'buffer', r.jitterBufferDelay, r.jitterBufferEmittedCount);
          const here = onRoad(kind);
          here.got = Number(r.packetsReceived ?? 0);
          here.lost = Number(r.packetsLost ?? 0);
          if (typeof r.jitter === 'number') here.jitter = r.jitter;
          step(kind, 'decode', r.totalDecodeTime, r.framesDecoded);
          // Any movement of the received-bytes counter - growth, or the
          // reset of a rebuilt connection - is a packet that landed.
          const got = Number(r.bytesReceived ?? 0);
          if (got > 0 && got !== this.inboundBytesSeen) {
            this.inboundBytesSeen = got;
            this.lastMediaAt = Date.now();
          }
        }
        // What this phone adds before letting a frame go: the encoder,
        // and the wait in the queue behind it.
        if (r.type === 'outbound-rtp') {
          const kind = String(r.kind);
          step(kind, 'encode', r.totalEncodeTime, r.framesEncoded);
          step(kind, 'queue', r.totalPacketSendDelay, r.packetsSent);
        }
        // The loudspeaker's own wait, which is the tail nobody used to
        // count and which on Android is worth more than the decoder.
        if (r.type === 'media-playout') {
          step('audio', 'playout', r.totalPlayoutDelay, r.totalSamplesCount);
        }
        if (r.kind === 'audio' && r.type === 'outbound-rtp') return;
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
          this.weighSentFps(out.out.fps);
          // Counted for the stall watch below, every video report of
          // the tick together: see there.
          framesEncodedSum += Number(r.framesEncoded ?? 0);
          framesEncodedSeen = true;
        } else if (r.type === 'inbound-rtp') {
          // Frames arriving, beside frames decoded: a decoder falling
          // behind is told by the two apart, not by a figure alone.
          const frames = Number(r.framesReceived);
          const was = this.lastInboundFrames;
          const arriving = Number.isFinite(frames) && was && r.timestamp > was.ts && frames >= was.frames
            ? Math.round(((frames - was.frames) * 1000) / (r.timestamp - was.ts))
            : null;
          if (Number.isFinite(frames)) this.lastInboundFrames = { ts: r.timestamp, frames };
          const decoded = Number(r.framesDecoded);
          if (Number.isFinite(decoded)) this.framesDecodedIn = decoded;
          out.in = {
            w: r.frameWidth ?? 0,
            h: r.frameHeight ?? 0,
            fps: Math.round(r.framesPerSecond ?? 0),
            kbps: rate(this.lastInbound, r.timestamp, r.bytesReceived),
            arriving,
          };
          this.lastInbound = { ts: r.timestamp, bytes: r.bytesReceived };
        }
      });

      /**
       * The encoder standing still with the video on: black over there -
       * but only when the frames should really be going out. With the
       * other side not watching, our own app behind or no camera alive,
       * it is us holding them back, and there is nothing to put right:
       * the cure was being applied every eight seconds for hours to a
       * channel with nothing wrong with it.
       *
       * The frames of every video report of the tick, together, and a
       * count that goes down taken as a new start: after a renegotiation
       * the sender's report can begin again from zero, or an old one can
       * linger beside the new, and either was read as an encoder
       * standing still - eight false alarms in two minutes, on a video
       * going out at thirty frames a second.
       */
      if (framesEncodedSeen) {
        const fe = framesEncodedSum;
        if (this.isVideoEnabled() && this.videoShouldFlow()) {
          if (fe < this.lastFramesEncoded) {
            this.lastFramesEncoded = fe;
            this.stalledSince = 0;
          } else if (fe > this.lastFramesEncoded) {
            this.lastFramesEncoded = fe;
            this.stalledSince = 0;
            this.stallCures = 0;
          } else if (!this.stalledSince) {
            this.stalledSince = Date.now();
          } else if (Date.now() - this.stalledSince > STALL_CURE_MS * 2 ** this.stallCures) {
            // And a cure that does not work is not repeated for ever:
            // twice, the wait doubling, then it is written down and
            // left alone until the frames move again.
            this.stalledSince = Date.now();
            if (this.stallCures >= STALL_CURES) {
              this.stalledSince = 0;
              this.lastFramesEncoded = fe;
              Journal.mark('video:stalled:giving-up').catch(() => { /* noop */ });
              log('video encoder still standing still: leaving the channel alone');
            } else {
              this.stallCures += 1;
              // First the camera, opened again: one that dies without a
              // word leaves the encoder nothing to encode, and no
              // negotiation gives it a picture. Then the channel.
              if (this.stallCures === 1) {
                log('video encoder standing still: opening the camera again');
                this.reopenCamera('stalled').catch(() => { /* noop */ });
              } else {
                log('video encoder standing still: putting the channel right');
                this.ensureVideoSending('stalled').catch(() => { /* noop */ });
              }
            }
          }
        } else {
          this.lastFramesEncoded = fe;
          this.stalledSince = 0;
          this.stallCures = 0;
        }
      }

      /**
       * What the channel costs: everything that goes in and out over
       * the road in use, both ways together.
       *
       * Not the bytes of the voice: those are the payload alone, and
       * the phone's own counter - which sees the wire - reads two to
       * five times more. The wrapping of every packet is about sixty
       * bytes, which during the silence nobody transmits is nearly all
       * of it; the reports, the ICE taps and, through the relay, the
       * TLS around each packet, are the rest. This counter is the one
       * that can be held beside Android's.
       */
      if (pairStat) {
        const wire = Number(pairStat.bytesSent ?? 0) + Number(pairStat.bytesReceived ?? 0);
        out.audioKbps = rate(this.lastWire, pairStat.timestamp, wire);
        this.lastWire = { ts: pairStat.timestamp, bytes: wire };
      }

      /**
       * The two halves this phone can time, in milliseconds - the
       * halves OF WHAT IS TRAVELLING.
       *
       * Sound alone: the sound's terms, which is the fastest this app
       * goes. With a picture flowing, the picture's terms take over:
       * the two streams are synchronised, the sound is held to the
       * frame, and the wait one lives through is the frame's. (The
       * sound's own buffer does grow a little under that holding, but
       * the picture's chain is the one being watched, and it is the
       * one written.) This is a CHOICE, made deliberately and once
       * revisited: measuring the sound alone in both cases was tried,
       * read the wrong way round on the screen, and put back.
       *
       * The picture's terms only exist while frames actually move -
       * the counters stand still with the camera off, and a standing
       * counter yields no term - so the fall from video to audio needs
       * no flag: it happens by itself, per direction.
       *
       * The audio output is added to the receiving half whatever is on
       * screen: it is the same loudspeaker in both cases.
       */
      const term = (kind: string, what: string): number | undefined => waited[kind]?.[what];
      const play = term('audio', 'playout') ?? 0;

      const recv = (kind: string): number | null => {
        const buffer = term(kind, 'buffer');
        if (buffer === undefined) return null;
        return buffer + (term(kind, 'decode') ?? 0) + play;
      };
      const send = (kind: string): number | null => {
        const queue = term(kind, 'queue');
        const encode = term(kind, 'encode');
        if (queue === undefined && encode === undefined) return null;
        return (queue ?? 0) + (encode ?? 0);
      };

      /**
       * Which of the terms this phone really offers, said once.
       *
       * They are read by name out of a report that changes between
       * versions of libwebrtc: a name that is not there costs no error
       * and no warning, it simply weighs zero - and a term missing in
       * silence would make the whole number look smaller without anyone
       * knowing why. The log says which ones turned up, once per
       * connection, and settles the question on the real phones.
       */
      const found = [];
      for (const kind of ['audio', 'video']) {
        for (const what of ['buffer', 'decode', 'playout', 'encode', 'queue']) {
          if (waited[kind]?.[what] !== undefined) found.push(`${kind}.${what}`);
        }
      }
      // Said again whenever the set changes, not once per connection:
      // switching a camera on brings the video's terms in, and with a
      // single line at the start those would never be seen.
      const list = found.join(', ');
      if (list && list !== this.termsLogged) {
        this.termsLogged = list;
        log('the wait is made of:', list);
      }

      const recvSeconds = recv('video') ?? recv('audio');
      const sendSeconds = send('video') ?? send('audio');
      this.recvDelay = recvSeconds === null || recvSeconds === undefined
        ? null : Math.round(recvSeconds * 1000);
      this.sendDelay = sendSeconds === null || sendSeconds === undefined
        ? null : Math.round(sendSeconds * 1000);
      out.recvDelay = this.recvDelay;
      out.sendDelay = this.sendDelay;

      /**
       * Said when either half moves, and said anyway every so often.
       *
       * The first rule alone was not enough, and it showed: switching a
       * camera off, the wait comes down in small steps - five
       * milliseconds at a time - and none of them ever reached the
       * threshold, so the number on the far screen stayed where it was,
       * stale, while the thing it measured had changed. A message every
       * six seconds costs nothing and is never wrong.
       */
      const now = Date.now();
      const saying = `${this.sendDelay ?? ''}/${this.recvDelay ?? ''}`;
      const moved = (a: number | null, b: number | null) =>
        a !== null && b !== null && Math.abs(a - b) > 10;
      const before = this.delaySaid.split('/');
      if (this.diagnostics && saying !== '/'
          && (this.delaySaid === ''
            || moved(this.sendDelay, Number(before[0]) || null)
            || moved(this.recvDelay, Number(before[1]) || null)
            || now - this.delaySaidAt > 6000)) {
        this.delaySaid = saying;
        this.delaySaidAt = now;
        this.broadcastState();
      }

      // The road's losses, for the journal's six columns: see lossPrev.
      const cells: Record<string, { in: string; out: string; jitter: string; rtt: string }> = {};
      let audioIn: number | null = null;
      for (const kind of ['audio', 'video']) {
        const r = road[kind];
        if (!r || r.got === undefined || r.lost === undefined) continue;
        const prev = this.lossPrev[kind];
        this.lossPrev[kind] = { got: r.got, lost: r.lost };
        // A rebuilt connection starts its counters again: skip the tick.
        if (!prev || r.got < prev.got || r.lost < prev.lost) continue;
        const dGot = r.got - prev.got;
        const dLost = r.lost - prev.lost;
        if (dGot + dLost === 0) continue;
        const pct = (100 * dLost) / (dGot + dLost);
        if (kind === 'audio') audioIn = pct;
        cells[kind] = {
          in: pct.toFixed(1),
          out: r.far !== undefined ? (100 * r.far).toFixed(1) : '',
          jitter: r.jitter !== undefined ? String(Math.round(r.jitter * 1000)) : '',
          rtt: r.rtt !== undefined ? String(Math.round(r.rtt * 1000)) : '',
        };
      }
      out.audioLossIn = audioIn;
      // How loud the voice went out and came in since the last reading:
      // mean power over the stretch, in dBFS.
      const level = (now?: [number, number], prev?: [number, number]) => {
        if (!now || !prev) return '';
        const dE = now[0] - prev[0];
        const dT = now[1] - prev[1];
        if (!(dT > 0) || !(dE >= 0)) return '';
        return dE > 0 ? (10 * Math.log10(dE / dT)).toFixed(0) : '-96';
      };
      Journal.voice(level(energy.mic, this.voicePrev.mic), level(energy.rx, this.voicePrev.rx))
        .catch(() => { /* noop */ });
      this.voicePrev = energy;
      if (cells.audio || cells.video) {
        const a = cells.audio;
        const v = cells.video;
        Journal.road(a?.in ?? '', a?.out ?? '', a?.jitter ?? '', a?.rtt ?? '',
          v?.in ?? '', v?.out ?? '').catch(() => { /* noop */ });
        if (this.diagnostics) {
          const now = Date.now();
          // "Bad" is said once per storm, not at every reading: a road
          // that hovers around the threshold flipped in and out at
          // every tick and wrote a line every few seconds - a beta
          // tester's journal had two hundred of them. It turns bad at
          // five in a hundred and is good again only after a full
          // minute under one.
          if (audioIn !== null) {
            if (audioIn >= 5) this.lossAudioGoodSince = 0;
            else if (audioIn < 1 && !this.lossAudioGoodSince) this.lossAudioGoodSince = now;
          }
          const bad = audioIn !== null && audioIn >= 5;
          const calmAgain = this.lossAudioGoodSince > 0 && now - this.lossAudioGoodSince > 60_000;
          const turnedBad = bad && !this.lossAudioWasBad;
          if (turnedBad) this.lossAudioWasBad = true;
          else if (calmAgain) this.lossAudioWasBad = false;
          if (turnedBad || now - this.lossLineAt > 30_000) {
            this.lossLineAt = now;
            Journal.mark(turnedBad ? 'loss:audio-bad' : 'loss').catch(() => { /* noop */ });
          }
        }
      } else if (this.lossLineAt) {
        // Nothing flows: the cells go empty rather than stale.
        this.lossLineAt = 0;
        Journal.road('', '', '', '', '', '').catch(() => { /* noop */ });
      }

      out.carrying = this.mediaArrivedWithin(ChannelSession.CARRYING_MS);
      this.events.onVideoStats?.(out);
      this.weighVideo((out.out?.kbps ?? 0) + (out.in?.kbps ?? 0));
      this.weighBalance(out.out?.kbps ?? null, out.in?.kbps ?? null);
      // The picture for the journal: after a change of network the
      // Edge went on sending a stamp until the channel was entered
      // again, and only the debugging log knew why.
      // The picture coming in says the frames arriving too, after the
      // ones drawn: "@8/30" is a decoder behind, "@8/8" a picture that
      // comes slow. On 16 October the edge drew the POCO's 720p at 8 a
      // second for two minutes, and the journal could not tell which.
      const pic = (v?: { w: number; h: number; fps: number; kbps: number | null; arriving?: number | null }) =>
        v && v.w > 0
          ? `${v.w}x${v.h}@${v.fps}${v.arriving != null ? `/${v.arriving}` : ''} ${v.kbps ?? '?'}k`
          : '';
      const avail = Number(pairStat?.availableOutgoingBitrate);
      Journal.video(pic(out.out), pic(out.in),
        avail > 0 ? String(Math.round(avail / 1000)) : '',
        out.out ? limit : '',
        this.balanceCap !== null ? String(Math.round(this.balanceCap / 1000)) : '')
        .catch(() => { /* noop */ });
      const losses = Object.values(cells).flatMap((c) => [c.in, c.out])
        .filter((v) => v !== '').map(Number);
      this.weighGrainyIncoming(out.in ?? null, out.latency ?? null,
        losses.length ? Math.max(...losses) : null);

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
  /**
   * Their picture arriving grainy on a clean road: the session wants
   * renewing.
   *
   * The sender's estimate fell to the floor after a change of network
   * and stayed there, and nothing made on the link brought it back -
   * neither its rebuilds nor our camera or microphone switched off and
   * on. Leaving the channel and entering again did, every time, within
   * seconds: and that throws the whole session away. So the receiver,
   * who sees the stamp, asks for that much: their video declared on,
   * ours watching, under 10% of the profile's ceiling - the floor, not
   * a mobile network's honest half megabit - and below its height,
   * losses under 1% and the round trip under 200 ms, for 6 seconds, and
   * not in the first 8 of a link. The app decides what and how often
   * (see renewSession).
   *
   * A picture that came back up after the last asking and has fallen
   * again is said so - ":relapse" - for the cure worked and the road
   * narrowed once more: on 22 October the POCO's estimate, on wifi,
   * rose to 6 Mbit/s after each rebuild and was down at 0.3 within half
   * a minute, and the second cure only blacked the picture out.
   */
  /** a link has been built in this session: the next gets a fresh microphone track */
  private builtOnce = false;
  private grainySince = 0;
  /** a cure asked for in this session: see weighGrainyIncoming */
  private cureAsked = false;
  /** their picture came up since the last cure was asked for */
  private upSinceCure = false;
  private linkedAt = 0;
  private weighGrainyIncoming(
    pic: { w: number; h: number; fps: number; kbps: number | null } | null,
    rttMs: number | null, lossPct: number | null,
  ) {
    const profile = VIDEO_PROFILES[this.cfg.videoQuality] ?? VIDEO_PROFILES.better;
    const now = Date.now();
    const low = pic !== null && pic.kbps !== null && pic.h > 0
      && pic.kbps * 1000 < Math.min(profile.maxBitrate * GRAINY_BELOW_SHARE, GRAINY_BELOW_BPS)
      && pic.h < profile.capture.height;
    if (this.cureAsked && pic !== null && pic.kbps !== null && pic.h > 0 && !low) this.upSinceCure = true;
    const grainy = this.peerVideoDeclared && this.localWatching
      && now - this.linkedAt > GRAINY_AFTER_LINK_MS
      && low
      && lossPct !== null && lossPct < 1 && rttMs !== null && rttMs < 200
      // Their mobile data is a narrow road, not a stuck estimate: on 18
      // October the POCO, on mobile data with 200 to 400 kbit/s going
      // out, was taken for stuck by the edge ten times in 27 minutes,
      // and every cure blacked the picture out to come back as low.
      && this.peerNet !== 'mobile';
    this.weighStalledDecoder(pic, rttMs, lossPct, profile.maxBitrate, now);
    if (!grainy) { this.grainySince = 0; return; }
    if (!this.grainySince) { this.grainySince = now; return; }
    if (now - this.grainySince < GRAINY_MS) return;
    this.grainySince = 0;
    const relapse = this.cureAsked && this.upSinceCure;
    this.cureAsked = true;
    this.upSinceCure = false;
    this.events.onSessionRenewWanted?.(
      `${pic!.w}x${pic!.h}:${pic!.kbps}k:rtt=${rttMs}${relapse ? ':relapse' : ''}`,
    );
  }

  /**
   * Their picture arriving in full and decoded at a trickle: the
   * decoder stuck.
   *
   * On 5 October the Edge went on receiving 720p at 2.4 Mbit/s and drew
   * it at 0 to 5 frames a second, its own encoder limited by the CPU at
   * 320x176, for over four minutes on a clean road; leaving and
   * entering - a new decoder and a new encoder - put it right at once.
   * The same cure, asked here: a quarter of the profile's ceiling
   * arriving, 6 frames a second drawn or fewer, for 8 seconds.
   *
   * And drawn at less than half the frames arriving, however many: on 11
   * October the edge drew the POCO's 30 at 7 and 8 a second for two
   * minutes, its encoder limited by the CPU down to 320x176 - the same
   * picture - and stayed just above the 6, so nothing was done; at 14:10
   * the same day, at 5, the cure had set it right. Where the frames
   * arriving cannot be counted, the 6 alone, as before.
   *
   * And at under half the frames the other side says it sends: on 23
   * October the edge drew the POCO's 25 at 8 a second, 3.3 Mbit/s coming
   * in, and the frames counted arriving were 8 too - the count stuck
   * with the decoder - so it was not "behind", and the cure waited for
   * the 4, a minute later. Taken for a figure alone - under 15 drawn,
   * whatever arrives - it was wrong the next evening: the POCO's camera,
   * in a dim room, sends 10 a second, a longer exposure for a brighter
   * picture, and the edge drawing all 10 rebuilt the link every few
   * minutes for nothing. 8 of 25 and 10 of 10 look the same from here;
   * only the sender knows which it is, and it says so in the state.
   * Where it does not - an older Duetto - the 6 alone, as before.
   *
   * And nothing whole arriving, with the data still coming: on 26
   * October, after a hiccup of the home wifi that dropped 85% of the
   * packets for a moment, the POCO went on receiving 300 to 800 kbit/s
   * of the edge's video, with 10 to 20% lost, and for over a minute not
   * one frame came whole - 0 arriving, 0 drawn, a black picture. None
   * of the above saw it: they watch frames that arrive and are not
   * drawn. The edge's owner set it right by hand, the video off and on
   * and then out and in; the same cures, asked here, after the same 8
   * seconds - unless the other side says it is sending nothing.
   */
  private stalledDecoderSince = 0;

  /** Our frames a second, told the other side when they move: see weighStalledDecoder. */
  private weighSentFps(fps: number) {
    this.sentFps = fps;
    if (!this.isVideoEnabled()) return;
    const said = this.sentFpsSaid;
    if (said === null || Math.abs(fps - said) >= SENT_FPS_STEP) this.broadcastState();
  }

  private weighStalledDecoder(
    pic: { w: number; h: number; fps: number; kbps: number | null; arriving?: number | null } | null,
    rttMs: number | null, lossPct: number | null, ceiling: number, now: number,
  ) {
    const arriving = pic?.arriving ?? null;
    const sent = this.peerSentFps;
    const behind = pic !== null && (sent !== null
      ? pic.fps < sent * DECODER_BEHIND_SHARE
      : pic.fps <= DECODER_STALLED_FPS)
      || (pic !== null && arriving !== null && arriving >= DECODER_ARRIVING_FPS
        && pic.fps < arriving * DECODER_BEHIND_SHARE);
    const stuck = this.peerVideoDeclared && this.localWatching
      && now - this.linkedAt > GRAINY_AFTER_LINK_MS
      && pic !== null && pic.kbps !== null && pic.kbps * 1000 >= ceiling * DECODER_BUSY_SHARE
      && behind
      && lossPct !== null && lossPct < 1 && rttMs !== null && rttMs < 200;
    // No condition on the road here: a lossy one is exactly when it came.
    const starved = this.peerVideoDeclared && this.localWatching
      && now - this.linkedAt > GRAINY_AFTER_LINK_MS
      && pic !== null && pic.kbps !== null && pic.kbps >= STARVED_KBPS
      && pic.fps <= STARVED_FPS && (arriving === null || arriving <= STARVED_FPS)
      && sent !== 0;
    this.weighUncured(pic, behind, stuck || starved, rttMs, lossPct, ceiling, now);
    if (!stuck && !starved) { this.stalledDecoderSince = 0; return; }
    if (!this.stalledDecoderSince) { this.stalledDecoderSince = now; return; }
    if (now - this.stalledDecoderSince < DECODER_STALLED_MS) return;
    this.stalledDecoderSince = 0;
    const of = (arriving !== null ? `/${arriving}` : '') + (sent !== null ? `/${sent}` : '');
    // The same ladder of cures in the app: the prefix is what it reads.
    const kind = stuck ? 'decoder-stalled' : 'decoder-stalled:starved';
    this.events.onSessionRenewWanted?.(`${kind}:${pic!.w}x${pic!.h}@${pic!.fps}${of}:${pic!.kbps}k`);
  }

  /**
   * A picture drawn slow and the cure above not coming: why, once.
   *
   * On 16 October the edge drew the POCO's 720p at 8 to 10 frames a
   * second for two and a half minutes - 2.5 Mbit/s arriving, no loss, 17
   * ms of round trip - and the cure, which should have come in 8
   * seconds, never did; the journal could not say which of its
   * conditions had held it back. What is watched here is what the eye
   * sees: a full picture arriving, fewer than 15 frames a second drawn.
   * Held for as long as the cure would wait without the cure, the
   * journal is told the conditions missing, once for each episode.
   */
  private slowDrawnSince = 0;
  private slowDrawnTold = false;
  private weighUncured(
    pic: { w: number; h: number; fps: number; kbps: number | null; arriving?: number | null } | null,
    behind: boolean, stuck: boolean,
    rttMs: number | null, lossPct: number | null, ceiling: number, now: number,
  ) {
    const sent = this.peerSentFps;
    const slow = pic !== null && pic.kbps !== null
      && pic.kbps * 1000 >= ceiling * DECODER_BUSY_SHARE && pic.fps < DECODER_ARRIVING_FPS
      // as many as are sent: a camera in the dark, not a decoder
      && !(sent !== null && pic.fps >= sent * DECODER_BEHIND_SHARE);
    if (!slow || stuck) {
      this.slowDrawnSince = 0;
      this.slowDrawnTold = false;
      return;
    }
    if (!this.slowDrawnSince) { this.slowDrawnSince = now; return; }
    if (this.slowDrawnTold || now - this.slowDrawnSince < DECODER_STALLED_MS) return;
    this.slowDrawnTold = true;
    const arriving = pic!.arriving ?? null;
    const missing: string[] = [];
    if (!behind) missing.push(arriving === null ? 'arriving-unknown' : 'not-behind');
    if (!this.peerVideoDeclared) missing.push('peer-video-undeclared');
    if (!this.localWatching) missing.push('not-watching');
    if (now - this.linkedAt <= GRAINY_AFTER_LINK_MS) missing.push('just-linked');
    if (lossPct === null) missing.push('loss-unknown');
    else if (lossPct >= 1) missing.push(`loss=${lossPct}`);
    if (rttMs === null) missing.push('rtt-unknown');
    else if (rttMs >= 200) missing.push(`rtt=${rttMs}`);
    Journal.mark(`decoder:behind-no-cure:${missing.join('+') || 'none'}`
      + `:${pic!.w}x${pic!.h}@${pic!.fps}/${arriving ?? '?'}/${sent ?? '?'}:${pic!.kbps}k`)
      .catch(() => { /* noop */ });
  }

  /** The balancing ceiling on the outgoing video, in bit/s; null = none. */
  private balanceCap: number | null = null;
  /**
   * No balancing until then: the two minutes after a link made again.
   *
   * A change of network - ours or theirs - leaves one side receiving
   * little for a while, the wifi at the edge of its reach, the
   * bandwidth estimate climbing back. The balancing read that as an
   * imbalance and lowered the other picture too, three steps, for a
   * minute and a half after the first had recovered: worse for both,
   * better for nobody.
   */
  private balanceHoldUntil = 0;
  /** a link has been made in this channel: the next one is made again */
  private linkedOnce = false;
  private lopsidedTicks = 0;
  private evenTicks = 0;

  /**
   * The strong sender gives way, a step at a time.
   *
   * Two pictures crossing the same conversation can come out absurdly
   * unequal - full HD one way, a stamp the other - and the difference
   * buys the weak side nothing: the strong stream and the weak one do
   * not even share a bottleneck. So, by explicit choice, whoever sends
   * far more than they receive lowers their own ceiling a step and
   * watches what happens, until the two are roughly even; and climbs
   * back the moment the other keeps up. The lever is the bandwidth
   * ceiling alone - the encoder scales the picture under it by itself,
   * with no camera to reopen and no black frame.
   *
   * Only while both pictures flow: one camera off makes the
   * difference the point, not a fault.
   */
  private weighBalance(outKbps: number | null, inKbps: number | null) {
    if (!this.isVideoEnabled() || !this.peerVideoDeclared
        || outKbps === null || inKbps === null || inKbps <= 0) {
      this.lopsidedTicks = 0;
      this.evenTicks = 0;
      if (this.balanceCap !== null && !this.peerVideoDeclared) {
        // Their camera went off: the reason for the ceiling went with it.
        this.balanceCap = null;
        this.applyBalance();
      }
      return;
    }
    if (Date.now() < this.balanceHoldUntil) {
      this.lopsidedTicks = 0;
      this.evenTicks = 0;
      if (this.balanceCap !== null) {
        // A ceiling chosen before the change was chosen against
        // another road.
        this.balanceCap = null;
        this.applyBalance();
      }
      return;
    }
    const profile = VIDEO_PROFILES[this.cfg.videoQuality] ?? VIDEO_PROFILES.better;
    if (outKbps > inKbps * BALANCE_RATIO) {
      this.evenTicks = 0;
      this.lopsidedTicks += 1;
      if (this.lopsidedTicks < BALANCE_TICKS) return;
      this.lopsidedTicks = 0;
      const from = this.balanceCap ?? profile.maxBitrate;
      const next = Math.max(Math.round(from * BALANCE_STEP), BALANCE_FLOOR);
      if (next >= from) return; // already at the floor
      this.balanceCap = next;
      log('balance: giving way,', Math.round(next / 1000), 'kbit/s ceiling',
        `(sending ${outKbps}, receiving ${inKbps})`);
      Journal.mark(`balance:down:${Math.round(next / 1000)}k:out=${outKbps}:in=${inKbps}`)
        .catch(() => { /* noop */ });
      this.applyBalance();
      return;
    }
    if (this.balanceCap !== null && outKbps < inKbps * (BALANCE_RATIO / 2)) {
      this.lopsidedTicks = 0;
      this.evenTicks += 1;
      if (this.evenTicks < BALANCE_TICKS) return;
      this.evenTicks = 0;
      // All at once, not a step at a time: the other side keeping up
      // again means the reason is gone, and the climb in steps left the
      // ceiling standing half a minute after.
      this.balanceCap = null;
      log('balance: the other side keeps up, ceiling gone');
      Journal.mark(`balance:up:none:out=${outKbps}:in=${inKbps}`).catch(() => { /* noop */ });
      this.applyBalance();
      return;
    }
    this.lopsidedTicks = 0;
    this.evenTicks = 0;
  }

  /** Writes the balancing ceiling onto the live sender. */
  private async applyBalance() {
    const sender = this.videoSender;
    if (!sender) return;
    try {
      const profile = VIDEO_PROFILES[this.cfg.videoQuality] ?? VIDEO_PROFILES.better;
      const params = sender.getParameters();
      if (!Array.isArray(params.encodings) || params.encodings.length === 0) {
        params.encodings = [{}];
      }
      params.encodings[0].maxBitrate = Math.min(
        profile.maxBitrate, this.balanceCap ?? profile.maxBitrate,
      );
      await sender.setParameters(params);
    } catch (e) {
      log('balance: cannot write the ceiling:', String(e));
    }
  }

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
    if (track) track.enabled = this.micLive();
    this.applyAudioQuality();
    this.broadcastState();
    return this.audioDesired;
  }

  /** Silent both ways while the phone is in another call, and back after. */
  hush(on: boolean) {
    if (on === this.hushed) return;
    this.hushed = on;
    const track = this.localStream?.getAudioTracks()[0];
    if (track) track.enabled = this.micLive();
    this.applyAudioQuality();
    this.applyGain();
    this.broadcastState();
  }

  /** Their voice lowered while a sound of the phone's own asks for room. */
  duck(on: boolean) {
    if (on === this.ducked) return;
    this.ducked = on;
    this.applyGain();
  }

  isHushed(): boolean {
    return this.hushed;
  }

  /** Switches the camera on: puts the track into the open channel. */
  enableVideo(): Promise<boolean> {
    return this.onCamera('on', () => this.enableVideoNow());
  }

  private async enableVideoNow(): Promise<boolean> {
    // The local stream has to exist: the video track is added to it.
    // Switching the camera on while waiting for the other person
    // therefore opens the microphone too - the camera costs far more
    // anyway, and keeping the two apart would complicate the rest for
    // no gain.
    await this.ensureMic();
    if (this.localStream!.getVideoTracks().length > 0) {
      Journal.mark('video:enable:already-on').catch(() => { /* noop */ });
      return true;
    }
    const track = await this.openCamera();
    if (!track) {
      Journal.mark('video:enable:no-track').catch(() => { /* noop */ });
      return false;
    }

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
    await this.ensureVideoSending('on');

    // If the other side is not watching in the meantime, the camera
    // stays on for the preview but nothing goes out of the channel.
    if (!this.peerWatching) await this.applyPeerWatching();

    this.lastOutbound = null;
    this.lastFramesEncoded = 0;
    this.stalledSince = 0;
    this.stallCures = 0;

    this.events.onLocalStream?.(this.localStream);
    this.broadcastState();
    return true;
  }

  /** The camera opened, as chosen: the track, not yet anywhere. */
  private async openCamera(): Promise<MediaStreamTrack | null> {
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
    if (!track) return null;
    // Taken away by another app, the track ends: see cameraEnded.
    (track as any).addEventListener?.('ended', () => this.cameraEnded(track));

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
    return track;
  }

  /**
   * The camera taken away.
   *
   * Another app in front - the phone's camera, Google Lens - takes the
   * camera, and Android takes it from Duetto: the track ends (see
   * scripts/patch-webrtc-camera.js). Before, the picture going out
   * stood still for good, and only switching the video off and on
   * brought it back. Now it is opened again by itself, but only with
   * Duetto in sight: from behind, whatever is in front holds the camera
   * and the attempt would fail. In sight a moment later, and again
   * after ten seconds and after thirty - the other app may still be
   * holding it, beside us on a split screen or under the little window;
   * after that, at the next return.
   */
  private cameraEnded(track: MediaStreamTrack) {
    if (this.localStream?.getVideoTracks()[0] !== track) return;
    // In sight or behind: taken by an app put in front, or by something
    // of the phone's own while Duetto was being looked at.
    Journal.mark(`camera:lost:${this.localWatching ? 'in-sight' : 'behind'}`)
      .catch(() => { /* noop */ });
    this.cameraLost = true;
    this.scheduleCamera();
  }

  private scheduleCamera() {
    if (this.cameraRetry) { clearTimeout(this.cameraRetry); this.cameraRetry = null; }
    if (!this.cameraLost || !this.localWatching) return;
    const wait = CAMERA_RETRY_MS[this.cameraTries];
    if (wait === undefined) return;
    this.cameraRetry = setTimeout(() => {
      this.cameraRetry = null;
      this.cameraTries += 1;
      this.reopenCamera('lost').catch(() => { /* noop */ });
    }, wait);
  }

  /**
   * The camera opened anew in place of a track that no longer films,
   * the way switching the video off and on does - without the other
   * side seeing the video go off: the same sender, a new track. The old
   * one is let go first, or the camera would still be ours, and busy.
   */
  private reopenCamera(why: string): Promise<void> {
    return this.onCamera('reopen', () => this.reopenCameraNow(why));
  }

  private async reopenCameraNow(why: string): Promise<void> {
    const local = this.localStream;
    const old = local?.getVideoTracks()[0];
    // Switched off in the meantime: nothing to bring back.
    if (!local || (!old && !this.cameraLost) || this.cameraReopening) return;
    this.cameraReopening = true;
    Journal.mark(`camera:reopen:${why}`).catch(() => { /* noop */ });
    try {
      if (old) {
        local.removeTrack(old);
        try { old.stop(); } catch { /* noop */ }
      }
      // Still wanted, until a new track is there.
      this.cameraLost = true;
      const track = await this.openCamera();
      if (!track) {
        Journal.mark('camera:reopen:no-track').catch(() => { /* noop */ });
        this.scheduleCamera();
        return;
      }
      local.addTrack(track);
      this.cameraLost = false;
      const sender: any = this.liveVideoSender();
      if (sender) {
        this.videoSender = sender;
        await sender.replaceTrack(this.peerWatching ? track : null);
        await this.applyVideoQuality();
      }
      this.lastOutbound = null;
      this.lastFramesEncoded = 0;
      this.stalledSince = 0;
      this.events.onLocalStream?.(local);
      this.broadcastState();
      log('camera opened again, track', track.id);
    } catch (e) {
      Journal.mark(`camera:reopen:failed:${String(e).slice(0, 60)}`).catch(() => { /* noop */ });
      this.scheduleCamera();
    } finally {
      this.cameraReopening = false;
    }
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
      // The balancing ceiling holds across a change of profile: the
      // imbalance it answers did not change with the setting.
      params.encodings[0].maxBitrate = Math.min(
        profile.maxBitrate, this.balanceCap ?? profile.maxBitrate,
      );
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
    this.lastFramesEncoded = 0;
    this.stalledSince = 0;
    this.stallCures = 0;
    this.lastInbound = null;
    this.lastInboundFrames = null;
    this.lastWait = {};
    this.termsLogged = '';
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
   * VP9 switched on or off from the settings, now.
   *
   * The session read the choice once, when it was born, and only the
   * side that declares the video channel used it, at its first
   * negotiation: switched later it did nothing until the session was
   * made anew - and the switch was not even saved. Now the codec order
   * is put on the video channel at once, on either side, and one
   * renegotiation applies it: a moment of still picture, as when the
   * camera turns round. Without a channel yet, the next negotiation
   * takes it.
   */
  setVideoCodec(codec: DuoConfig['videoCodec']) {
    if (this.cfg.videoCodec === codec) return;
    this.cfg = { ...this.cfg, videoCodec: codec };
    const pc: any = this.pc;
    const sender = this.liveVideoSender();
    if (!pc || !sender) return;
    let tr: any = null;
    try { tr = pc.getTransceivers?.().find((t: any) => t.sender === sender) ?? null; } catch { /* noop */ }
    if (!tr || typeof tr.setCodecPreferences !== 'function') return;
    try {
      if (codec === 'vp9' && this.vp9Usable()) this.preferVp9(tr);
      else tr.setCodecPreferences([]);
    } catch (e) {
      log('codec order not changed:', String(e));
      return;
    }
    Journal.mark(`video-codec:${codec}`).catch(() => { /* noop */ });
    if (this.polite) {
      this.signaling.sendSignal({ kind: 'renegotiate', offer: true, why: 'video-codec' });
    } else {
      this.negotiate().catch(() => { /* noop */ });
    }
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
  /**
   * Whether the camera's frames should really be leaving right now.
   *
   * They should not when the other side is not watching (we replace
   * the track with nothing on purpose), when our own app is behind, or
   * when there is no live camera track: in all three the encoder
   * standing still is what we asked for, not a fault.
   */
  private videoShouldFlow(): boolean {
    if (!this.peerWatching || !this.localWatching) return false;
    const track: any = this.localStream?.getVideoTracks?.()[0];
    if (!track || track.enabled === false) return false;
    return track.readyState !== 'ended';
  }

  setLocalWatching(watching: boolean) {
    if (this.localWatching === watching) return;
    this.localWatching = watching;
    log(watching ? 'watching again' : 'not watching any more');
    // Back in sight, the camera taken away is asked for again.
    if (watching) this.cameraTries = 0;
    this.scheduleCamera();
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
    /**
     * Never while the link is stitching itself back together.
     *
     * A death makes the far side's screens blink, the blinking sends
     * "watching" flapping, and each flap used to swap the track on the
     * sender - firing a renegotiation into the middle of the repair.
     * The logs showed it plainly: `track suspended` a breath before
     * every avoidable demolition. The wish is kept (`peerWatching`
     * holds it) and granted when the link is whole again: attachPeer
     * already re-applies it on every rebuild, and the state message
     * repeats it within seconds anyway.
     */
    if (this.pc?.connectionState !== 'connected') return;
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
  disableVideo(): Promise<boolean> {
    return this.onCamera('off', () => this.disableVideoNow());
  }

  private async disableVideoNow(): Promise<boolean> {
    const track = this.localStream?.getVideoTracks()[0];
    this.cameraLost = false;
    this.scheduleCamera();

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
    this.lastFramesEncoded = 0;
    this.stalledSince = 0;
    this.stallCures = 0;

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

  /**
   * When a finger last moved each thing: see Hand. Static, so that a
   * session made again carries the stamps on and the other side does
   * not take a new session's zeros for a touch.
   */
  private static hand: Hand = {};
  /** A button was pressed: the change it brings is a choice, and rings over there. */
  markHand(kind: keyof Hand) {
    ChannelSession.hand[kind] = Math.max(Date.now(), (ChannelSession.hand[kind] ?? 0) + 1);
  }

  /** Tells the other side about mic, camera and shape (encrypted). */
  broadcastState() {
    this.signaling.sendSignal({
      kind: 'state',
      audio: this.isAudioEnabled(),
      output: this.ourOutput,
      // The label, as the greeting says it: a build on its way to a
      // version calls itself "0.9.15-pre" there, and the bare number
      // here made two phones of the same version look different.
      version: VERSION_LABEL,
      build: BUILD,
      sendDelay: this.sendDelay ?? undefined,
      recvDelay: this.recvDelay ?? undefined,
      camera: this.isFrontCamera() ? 'front' : 'back',
      volume: this.heardLevel,
      volSys: this.heardSys,
      gain: this.heardGain,
      video: this.isVideoEnabled(),
      aspect: this.getLocalVideoAspect(),
      watching: this.localWatching,
      hwVp9: this.localVp9,
      busy: this.hushed,
      batteryPct: this.battery?.percent,
      charging: this.battery?.charging,
      net: this.network ?? undefined,
      sentFps: this.isVideoEnabled() && this.sentFps !== null ? this.sentFps : undefined,
      hand: { ...ChannelSession.hand },
      restoring: this.restoring || undefined,
      talkThrough: this.throughAllowed,
    });
    this.sentFpsSaid = this.sentFps;
  }

  /**
   * Putting back how things were, on coming into the channel: the video,
   * the microphone, the listening, as they were left. Said in the state,
   * so that the other side does not take it for choices made now - it
   * played "video on", "microphone on" one after another, each cutting
   * the one before, the entering sound first of all.
   */
  private restoring = false;
  setRestoring(on: boolean) {
    if (on === this.restoring) return;
    this.restoring = on;
    this.broadcastState();
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
  setRemoteGain(g: number, through = g) {
    if (through !== this.throughGain) {
      this.throughGain = through;
      if (this.heardThrough) this.applyGain();
    }
    if (g === this.peerGain) return;
    this.peerGain = g;
    this.applyGain();
    // We tell them: it is the only way they have of knowing you are
    // hearing them faintly, and out loud that question never gets
    // settled.
    this.broadcastState();
  }

  /** The level declared to the other side; it changes the telling, not the sound. */
  setHeardLevel(l: number, sys: number | null = null, gain = 1) {
    // Zero is a value like any other: it means they are not heard at
    // all, and that is precisely what the other side needs to know.
    if (!(l >= 0)) return;
    if (l === this.heardLevel && sys === this.heardSys && gain === this.heardGain) return;
    this.heardLevel = l;
    this.heardSys = sys;
    this.heardGain = gain;
    this.broadcastState();
  }

  private applyGain() {
    const tracks = this.remoteStream?.getAudioTracks?.() ?? [];
    // Their voice through our silence: at the level the listening on
    // would give it, no louder.
    const base = this.peerGain === 0 && this.heardThrough ? this.throughGain : this.peerGain;
    const gain = this.hushed ? 0 : this.ducked ? base * 0.25 : base;
    // Levelled, the level comes after the compressor, which would undo
    // it on the track: see Leveller.kt. Silence stays on the track.
    if (this.levelling) Leveller.setGain(gain).catch(() => { /* noop */ });
    const onTrack = this.levelling && gain > 0 ? 1 : gain;
    for (const t of tracks) {
      try {
        (t as any)._setVolume?.(onTrack);
      } catch { /* an unadjusted voice is not worth an error */ }
    }
  }

  /**
   * Talking through their silence, for as long as a finger is held down.
   *
   * They turned the listening off - a film watched together, the same
   * dialogue from the television and, a moment late, from the phone -
   * and something has to be said: the call's sounds got them to turn it
   * back on, by gestures, and then off again (a tester's girlfriend,
   * 24 October). Held down, our voice goes out although they do not
   * hear us - the microphone too, if it was off - and over there it is
   * heard although they hushed it. Said again every two seconds: a
   * word lost on the way, or a finger that never came up because the
   * app went, closes it by itself over there.
   *
   * Their listening is not touched: it stays off, and says so.
   */
  talkThrough(on: boolean) {
    if (on === this.talkingThrough) return;
    this.talkingThrough = on;
    const track = this.localStream?.getAudioTracks()[0];
    if (track) track.enabled = this.micLive();
    this.applyAudioQuality();
    if (this.talkThroughBeat) { clearInterval(this.talkThroughBeat); this.talkThroughBeat = null; }
    const say = () => this.signaling.sendSignal({ kind: 'talkThrough', on });
    say();
    if (on) this.talkThroughBeat = setInterval(say, TALK_THROUGH_EVERY_MS);
    Journal.mark(`talk-through:${on ? 'on' : 'off'}`).catch(() => { /* noop */ });
  }

  /** The leveller started or stopped working: the level moves to it, or back. */
  setLevelling(on: boolean) {
    if (on === this.levelling) return;
    this.levelling = on;
    this.applyGain();
  }

  /** Whether they may talk through our silence: see talkThrough. */
  setTalkThroughAllowed(on: boolean) {
    if (on === this.throughAllowed) return;
    this.throughAllowed = on;
    if (!on) this.hearThrough(false);
    this.broadcastState();
  }

  /** Their voice through our silence, while their word of it keeps coming. */
  private hearThrough(on: boolean) {
    if (this.heardThroughLapse) { clearTimeout(this.heardThroughLapse); this.heardThroughLapse = null; }
    const now = on && this.throughAllowed;
    if (now) this.heardThroughLapse = setTimeout(() => this.hearThrough(false), TALK_THROUGH_LAPSE_MS);
    if (now === this.heardThrough) return;
    this.heardThrough = now;
    this.applyGain();
    this.events.onHeardThrough?.(now);
    Journal.mark(`heard-through:${now ? 'on' : 'off'}`).catch(() => { /* noop */ });
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
    this.remoteSessionId = null;
    this.creating = null;
    if (this.statsTimer) { clearInterval(this.statsTimer); this.statsTimer = null; }
    if (this.statsBeat) { this.statsBeat(); this.statsBeat = null; }
    this.lastOutbound = null;
    this.lastFramesEncoded = 0;
    this.stalledSince = 0;
    this.stallCures = 0;
    this.lastInbound = null;
    this.lastInboundFrames = null;
    this.lastWait = {};
    this.termsLogged = '';
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
    this.offerPendingSince = 0;
    this.peerBornAt = 0;
    // The balancing starts afresh with the link: if the imbalance is
    // real it re-forms in twenty seconds, and if it is not, a rebuilt
    // link must not inherit a ceiling chosen against another road.
    this.balanceCap = null;
    this.lopsidedTicks = 0;
    this.evenTicks = 0;
    this.events.onRemoteStream?.(null);
    this.events.onRemoteVideo?.(false);
    if (this.pc) {
      try { this.pc.close(); } catch { /* noop */ }
      this.pc = null;
    }
  }

  /** Leaves the channel and releases microphone and camera. */
  leaveChannel() {
    this.talkThrough(false);
    this.hearThrough(false);
    this.cameraLost = false;
    this.scheduleCamera();
    this.detachPeer();
    this.linkedOnce = false;
    this.balanceHoldUntil = 0;
    this.localStream?.getTracks().forEach((t) => t.stop());
    this.localStream = null;
    this.events.onLocalStream?.(null);
  }
}
