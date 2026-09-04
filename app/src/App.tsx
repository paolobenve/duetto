/*
 * Duetto - a permanent voice and video channel for two people.
 * Copyright (C) 2026 Paolo Benvenuto
 *
 * Free software under the GNU General Public License, version 3 or any
 * later version, and with no warranty of any kind. The full text is in
 * the LICENSE file at the root of the project, and at
 * <https://www.gnu.org/licenses/>.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  StatusBar, Platform, PermissionsAndroid, Alert, View, AppState, DeviceEventEmitter,
  ActivityIndicator, StyleSheet, BackHandler, Dimensions,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MediaStream } from 'react-native-webrtc';
import InCallManager from 'react-native-incall-manager';
import {
  Foreground, Pip, AppWindow, Visibility, Codecs, Audio, Alerts, Journal, Volume,
  Heartbeat, Network,
  Alarm,
} from 'duetto-platform';
import { attachWatchdog, Watchdog } from './watchdog';
import {
  DuoConfig, PairInfo, loadConfig, saveConfig,
  isServerConfigured, isPaired, displayServer, opensHere, VIDEO_PROFILES,
  addPair, switchToPair, forgetPair, markPairBroken, rememberPeerName,
  alignPairServer, renamePair, pairFileKey, pairName,
  storeSettingsInPair,
} from './config';
import { Signaling, PresenceStatus, Mode } from './signaling';
import type { PersonOnServer, InvitationOnServer } from './signaling';
import { useLanguage, t } from './i18n';
import { VERSION, BUILD } from './version';
import { logger, setLogging } from './log';
import { ChannelSession } from './webrtc';
import type { VideoStats } from './webrtc';
import SettingsScreen from './SettingsScreen';
import SetupScreen from './SetupScreen';
import PairingScreen from './PairingScreen';
import WelcomeScreen from './WelcomeScreen';
import { leaveServer, knock, watchDoor } from './door';
import ChannelScreen from './ChannelScreen';
import { loadPipPosition } from './VideoStage';
import { useAudioRoute } from './audioRoute';
import {
  startListening, stopListening, presenceLine, deathStory, interfaceInCharge, isRealName,
} from './presence';
import { avatarFor, peerAvatar } from './avatar';

// No screen in between: either you are setting things up, or pairing,
// or in the channel. Opening the app - from the icon or from a
// notification - means going in.
type Screen = 'loading' | 'welcome' | 'settings' | 'pairing' | 'setup' | 'channel';

/**
 * How long the other person's seat is kept when their network drops.
 *
 * Disappearing and coming back within a few seconds is what a change of
 * network normally looks like: taking their seat apart means putting it
 * back a moment later, and whoever is watching sees their own video
 * rise to full screen and come back down for nothing. If they left,
 * though, nobody waits: the server says which it was, telling a
 * goodbye from a drop.
 */
const RETURN_WAIT_MS = 6000;

/**
 * How often our own journal goes to the other phone.
 *
 * Five minutes, which is the pace at which the lines are written: one
 * at a time, a couple of hundred bytes. Hourly would have cost little
 * too, but a journal that arrives at once helps to understand what has
 * just happened over there - an app that vanished, say - while one that
 * arrives an hour late tells an old story. And it only goes out while
 * connected, that is, when the network is already in use.
 */
const JOURNAL_SWAP_MS = 5 * 60 * 1000;

const rtcLog = logger('[duetto-rtc]');
const uiLog = logger('[duetto-ui]');

/**
 * How many journal lines have already been sent, per connection.
 *
 * There cannot be a single count: with several connections, the lines
 * sent to one would count as sent to the other, which would never
 * receive them. Each has its own bookmark.
 */
const SENT_KEY = 'duetto.journal.sent';
const sentKeyFor = (id: string) => `${SENT_KEY}.${id}`;

/** The last death already told to the other phone: it is not repeated. */
const DEATH_TOLD_KEY = 'duetto.death.told';

/**
 * TEMPORARY. The names things used to be stored under, in Italian.
 *
 * The project is moving to English to be published, and the names under
 * which things are written in the phone's memory move with the rest.
 * Whoever already has the app must not notice: the first read looks for
 * the new name and, failing that, takes the old one and writes it back
 * under the new. To be REMOVED once every phone has been through here.
 */
/**
 * Where the drawers below are kept, so that they survive the app.
 *
 * They used to live in memory alone, and an update - which kills the
 * process - lost them: coming back after installing, the microphone was
 * on again although it had been left muted. The phone closing the app
 * did the same. What decides whether to restore is the time that has
 * passed, not whether the process is the same one.
 */
const HOW_IT_WAS_KEY = 'duetto.how-it-was';

const OLD_KEYS = {
  sent: 'duetto.diario.inviate',
  death: 'duetto.morte.raccontata',
};

/**
 * Reads something from storage, accepting the old name as well.
 *
 * Finding it under the old name it writes it back under the new one and
 * deletes the old: at the second start the bridge is no longer needed.
 */
async function readWithBridge(fresh: string, old: string): Promise<string | null> {
  const mine = await AsyncStorage.getItem(fresh);
  if (mine !== null) return mine;
  const before = await AsyncStorage.getItem(old);
  if (before === null) return null;
  await AsyncStorage.setItem(fresh, before).catch(() => { /* noop */ });
  await AsyncStorage.removeItem(old).catch(() => { /* noop */ });
  return before;
}

/**
 * How far to lift the other voice when the phone will not obey.
 *
 * On plenty of models the call volume on speaker is nailed to the top
 * by the manufacturer: the keys look broken and the voice stays
 * deafening. WebRTC then does the work, multiplying the signal before
 * it goes out.
 *
 * The step is a quarter: ten presses to halve or to double, which is
 * about the sensitivity of a real knob. It does not go below a quarter
 * - past that it is more honest to mute the microphone - nor above four
 * times, which is beyond the point where a voice starts to distort.
 */
const GAIN_STEP = 0.25;
/**
 * Our multiplier works at the two extremes.
 *
 * In between, the phone's own knob is in charge, which is finer and
 * does not touch the sound. But the phone has two limits: above, a top
 * that is never enough on speaker with a quiet voice; and below, a
 * first step which on some phones - a recent Motorola, on speaker - is
 * still very loud. The gain covers both ends.
 */
const GAIN_MIN = 0.25;
const GAIN_MAX = 4;



/**
 * How often we ask again whether the other person is there, while
 * waiting for them.
 *
 * The server announces changes, but it takes its time noticing that
 * somebody who is merely listening has dropped - its heartbeat is four
 * minutes, and that is on purpose, so as not to keep the radio awake
 * all night. Until then the line would say "waiting" about somebody who
 * is no longer there.
 *
 * Often at first, when you have just come in and are watching the
 * screen; sparsely after a quarter of an hour, when the wait has become
 * a background and nobody is staring at that line any more. A question
 * every five minutes costs about as much as a heartbeat: it is waking
 * the radio that costs, not the twenty bytes.
 */
/**
 * How long before a notification line that was not written is retried.
 *
 * It happens when the system refuses to start the service: a few
 * seconds later, usually, the app is back in a state where it can.
 */
const NOTICE_RETRY_MS = 5_000;

/**
 * How long we keep quiet before saying the server is gone.
 *
 * Five seconds: a change of cell sorts itself out in one or two and
 * does not deserve an alarm; a real fault lasts far longer and will be
 * seen anyway.
 */
const SERVER_GRACE_MS = 5_000;

/**
 * Coming back, what was chosen is what one finds - with one exception.
 *
 * The microphone comes back AS IT WAS LEFT, however long ago: it used
 * to have a five-minute window, and re-entering after an evening meant
 * re-making a choice already made. A microphone's state shows nothing
 * to anybody; there is no cost in remembering it for good.
 *
 * The camera, one minute: switching itself back on is another matter,
 * because it films a room and a face. Within the minute it is plainly
 * the same scene as before; beyond it you are starting again, and you
 * start with it off.
 */
const RESUME_VIDEO_MS = 60_000;

/**
 * How long a death is given to undo itself before any cure is given:
 * on the networks that kill a pair on a clock, it rises again by
 * itself within a couple of seconds almost every time, and a cure
 * given sooner turns an invisible stitch into a black screen.
 */
const FAILED_PATIENCE_MS = 8_000;

/** How often we look to see whether we are still without a server. */
const SERVER_CHECK_MS = 3_000;

/**
 * The cap on how long the knocker's own sound may last.
 *
 * The two knocks last half a second and end by themselves: the cap
 * stays as a net, because a confirming sound that carries on while you
 * are already doing something else is the thing we set out to remove.
 */
const KNOCK_ECHO_MS = 2_000;

/**
 * How long one may stay without a server before rebuilding everything.
 *
 * Measured from the last working connection: ten seconds without a
 * server are ten seconds, whether three attempts were made in between
 * or thirty.
 */
const NO_SERVER_WAIT_MS = 10 * 1000;

const PRESENCE_OFTEN_MS = 60 * 1000;
const PRESENCE_SPARSE_MS = 5 * 60 * 1000;
const PRESENCE_PATIENCE_MS = 15 * 60 * 1000;

/**
 * Asks for ALL the permissions at once, at the first start.
 *
 * Note: since Android 6, microphone, camera and notifications are
 * runtime permissions and the system does NOT allow granting them at
 * install time. Asking for them together is the nearest thing: after
 * the first time Android does not ask again.
 */
async function requestAllPermissions(): Promise<{ mic: boolean; camera: boolean }> {
  if (Platform.OS !== 'android') return { mic: true, camera: true };

  const wanted: any[] = [
    PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
    PermissionsAndroid.PERMISSIONS.CAMERA,
  ];
  if (Number(Platform.Version) >= 33) {
    wanted.push(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
  }
  /**
   * The bluetooth one, from Android 12, is what lets the app SEE a
   * headset - not use it: the phone plays through it either way. Denied
   * or never asked for, the earpiece one has connected does not appear
   * among the outputs at all, and there is nothing to choose. It was
   * declared in the manifest and never asked for, which is the same as
   * not having it; a reinstall brought that to light. Refusing it costs
   * only the bluetooth's name in the list, like refusing the microphone
   * costs the channel and not the listening.
   */
  if (Number(Platform.Version) >= 31) {
    wanted.push('android.permission.BLUETOOTH_CONNECT' as any);
  }
  try {
    const res = await PermissionsAndroid.requestMultiple(wanted);
    return {
      mic: res[PermissionsAndroid.PERMISSIONS.RECORD_AUDIO] === 'granted',
      camera: res[PermissionsAndroid.PERMISSIONS.CAMERA] === 'granted',
    };
  } catch {
    return { mic: false, camera: false };
  }
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('loading');
  /** a pairing code typed at the welcome, handed to the pairing screen */
  const [pairingCode, setPairingCode] = useState('');
  /** the pairing opened on typing a code, from the settings */
  const [pairingTyping, setPairingTyping] = useState(false);
  const [cfg, setCfg] = useState<DuoConfig | null>(null);

  /**
   * The language in use, chosen before anything is drawn.
   *
   * Set here, during the render, and not inside an effect: effects run
   * AFTER the children have been drawn, and the first screen would have
   * come out in the previous language. Changing connection changes
   * `cfg`, so everything is redrawn and the words follow by themselves.
   */
  useLanguage(cfg?.language);

  /**
   * Saves the configuration, and the connection's settings with it.
   *
   * Every choice one makes belongs to the person one is talking to:
   * writing it "in the app" alone would mean finding it on top of you
   * when moving to another connection. Here it is written in both
   * places at once, so it cannot be forgotten.
   */
  const saveCfg = useCallback((next: DuoConfig) => {
    const merged = storeSettingsInPair(next);
    saveConfig(merged).catch(() => { /* noop */ });
    return merged;
  }, []);

  const [inChannel, setInChannel] = useState(false);
  /**
   * Whether the phone is in another call.
   *
   * Android takes the audio away from us for a telephone call or a
   * WhatsApp one and says so - the library passed the word on, and
   * nobody was listening: the other person's voice went on playing
   * over the call, and the microphone went on sending it. Now the
   * session is hushed both ways for as long as the call lasts, and
   * lowered for the lighter case, a sound of the phone's own that asks
   * only for room.
   */
  const [onCall, setOnCall] = useState(false);
  useEffect(() => {
    if (!inChannel) { setOnCall(false); return; }
    /**
     * Three losses, and they are not the same thing.
     *
     * A call - the telephone, WhatsApp - takes the audio for a while
     * and gives it back: "transient". That is the one to be silent for,
     * both ways. Somebody playing a voice message or a video takes it
     * for good - "loss", full stop - and Android never says "back":
     * the first build treated that as a call and stayed mute, saying
     * "in another call" to somebody who had only listened to a message.
     * Now a plain loss only lowers the other voice, and says nothing;
     * and in both cases the focus is asked for again every few seconds,
     * so that the way back does not depend on anybody's courtesy.
     */
    let retry: ReturnType<typeof setInterval> | null = null;
    const back = (why: string) => {
      if (retry) { clearInterval(retry); retry = null; }
      sessionRef.current?.hush(false);
      sessionRef.current?.duck(false);
      setOnCall(false);
      Journal.mark(`audio-focus:back:${why}`).catch(() => {});
    };
    const keepAsking = () => {
      if (retry) return;
      retry = setInterval(async () => {
        try {
          const res = String(await (InCallManager as any).requestAudioFocus?.() ?? '');
          if (res.includes('GRANTED')) back('asked');
        } catch { /* asked again in a moment */ }
      }, 4000);
    };
    const sub = DeviceEventEmitter.addListener('onAudioFocusChange', (data: any) => {
      const what = String(data?.eventText || '');
      const call = what === 'AUDIOFOCUS_LOSS_TRANSIENT';
      const media = what === 'AUDIOFOCUS_LOSS';
      const duck = what === 'AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK';
      if (!call && !media && !duck) { back('told'); return; }
      const sess = sessionRef.current;
      sess?.hush(call);
      sess?.duck(!call);
      setOnCall(call);
      Journal.mark(`audio-focus:${call ? 'call' : media ? 'media' : 'duck'}`).catch(() => {});
      if (call || media) keepAsking();
    });
    return () => {
      sub.remove();
      if (retry) clearInterval(retry);
      sessionRef.current?.hush(false);
      sessionRef.current?.duck(false);
    };
  }, [inChannel]);
  /** where to go back to when the system-settings screen is closed */
  const [setupFrom, setSetupFrom] = useState<'start' | 'settings'>('start');

  const [status, setStatus] = useState<PresenceStatus>('connecting');
  const [peerPresent, setPeerPresent] = useState(false);
  /**
   * Reachable, or detached altogether.
   *
   * Leaving the channel one normally stays listening: that is the point
   * of the app, being there without keeping the screen on. But
   * sometimes one really wants not to be there - and then leaving is
   * not enough, the presence has to go: no connection, no standing
   * notification, no alerts, and to the other side you are unreachable,
   * which is the truth.
   *
   * It lasts until the app is opened again: opening it is already
   * saying "I am here".
   */
  const [available, setAvailable] = useState(true);
  /**
   * The next close is a goodbye, not a handover.
   *
   * Raised by whoever leaves on purpose - "make yourself unavailable",
   * breaking a connection, moving to another one - and lowered by the
   * close itself.
   */
  const sayGoodbye = useRef(false);
  /**
   * And with that goodbye the presence ends: the service stops.
   *
   * It is NOT the same thing as saying goodbye. Moving to another
   * connection is a goodbye for whoever is left behind, but the phone
   * stays reachable - over there - so the service has to carry on: had
   * the two travelled together, every switch would have switched the
   * presence off and on again, and in that gap nobody could reach you.
   */
  const stopService = useRef(false);
  /**
   * The latest piece of news to show inside the app.
   *
   * Outside there is the silent notification, but whoever is looking at
   * this screen does not pull the shade down: the same sentence has to
   * be here too, where the eye already is.
   */
  const [notice, setNotice] = useState<string | null>(null);
  /**
   * Leaving is under way: the journal is being flushed.
   *
   * It lasts a few tenths of a second, but without saying so the button
   * would look as though it had done nothing - and whoever sees no
   * reaction presses again.
   */
  const [leaving, setLeaving] = useState(false);

  /**
   * How far we are lifting the other voice, 1 = as it arrived.
   *
  /**
   * The phone's call volume, read from Android.
   *
   * It is half of what one hears, and it is not ours: it has a knob per
   * output, other apps move it too, and until now the app did not look
   * at it - it showed its own number as if that were the whole truth.
   */
  const [systemVolume, setSystemVolume] = useState({ volume: 0, max: 0 });

  /** shown for a moment while pressing: otherwise the effect is invisible */
  const [levelShowing, setLevelShowing] = useState(false);
  const levelTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /**
   * They left on purpose; their line did not drop.
   *
   * The server tells the two apart - whoever says goodbye and whoever
   * disappears - and the difference matters to the one left behind: you
   * come out of a tunnel, you do not come out of a decision.
   * "Unreachable" about somebody who disconnected deliberately would
   * sound like a fault worth waiting out.
   */
  const [peerDetached, setPeerDetached] = useState(false);
  /**
   * They are waiting because their phone closed the app on them.
   *
   * Worth telling apart: "waiting" suggests a choice of theirs, and on
   * some phones - a recent Motorola, to name one - the app gets torn
   * down at night with nobody touching it. Whoever reads it deserves to
   * know that nothing was decided on the other side.
   */
  const [peerTornDown, setPeerTornDown] = useState(false);
  const [peerName, setPeerName] = useState('');
  /**
   * Who this server lets in, when it lets us ask.
   *
   * Only a phone of the owner's is answered: `canInvite` comes from the
   * server itself, in the joining message, and the whole section in the
   * settings hangs on it. A guest's phone never even shows it.
   */
  const [canInvite, setCanInvite] = useState(false);
  /**
   * Whether this phone may open connections of its own here.
   *
   * On a server that keeps a list, a phone let in beside somebody else
   * may talk to them and to nobody new: pairing would make a room
   * nobody can open, and the app would try in silence until it gave up.
   * Better to say so and take the button away.
   */
  const [canAddPair, setCanAddPair] = useState(true);
  const [people, setPeople] = useState<PersonOnServer[]>([]);
  const [invitations, setInvitations] = useState<InvitationOnServer[]>([]);
  const [freshInvite, setFreshInvite] = useState<{ name: string; code: string } | null>(null);
  /** rooms already told to the server as gone: once is enough */
  const forgottenRooms = useRef<Set<string>>(new Set());
  const [connState, setConnState] = useState('new');
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [audioOn, setAudioOn] = useState(true);
  const [videoOn, setVideoOn] = useState(false);
  const [localAspect, setLocalAspect] = useState<number | undefined>(undefined);
  /**
   * Which camera the "Turn" button shows.
   *
   * The truth lives in the session, but the session is born after us:
   * the starting value is the one of the connection in use, and it
   * changes with the connection.
   */
  const [frontCamera, setFrontCamera] = useState(true);
  const [peerState, setPeerState] = useState<{
    audio: boolean; video: boolean; aspect?: number;
    /** in another call on their phone: silent both ways until it ends */
    busy?: boolean;
    /** where the sound comes out over there: they say so */
    output?: string;
    /** which Duetto they have; missing if older than this field */
    version?: string;
    /** which APK of that version; missing if older than this field */
    build?: number;
    /** the two halves their phone can time: with ours they make both journeys */
    sendDelay?: number;
    recvDelay?: number;
    /** how loudly they are hearing us: 1 = as we send it */
    volume?: number;
  }>({ audio: true, video: false });
  /**
   * Whether they have told us how they are yet.
   *
   * Before their first state arrives we know nothing about them, and a
   * missing version does not mean "they have an old build": it only
   * means they have not spoken yet.
   */
  const [peerSeen, setPeerSeen] = useState(false);
  /** VP9 in hardware: ours and theirs. The option shows only with both. */
  const [localVp9, setLocalVp9] = useState(false);
  const [peerVp9, setPeerVp9] = useState(false);
  /** the real resolution and bandwidth, shown under the controls */
  const [videoStats, setVideoStats] = useState<VideoStats>({});
  const [knockPending, setKnockPending] = useState(false);
  /** their video track really arriving, not merely announced */
  const [remoteHasVideo, setRemoteHasVideo] = useState(false);
  /**
   * Bumped every time their video starts again. It serves as a React
   * key: it forces the viewer to be recreated instead of reattached to
   * an old surface, which would stay black.
   */
  const [remoteVideoKey, setRemoteVideoKey] = useState(0);

  const signalingRef = useRef<Signaling | null>(null);
  const sessionRef = useRef<ChannelSession | null>(null);
  const politeRef = useRef(false);
  const peerActiveRef = useRef(false);
  const cameraGranted = useRef(false);
  const inChannelRef = useRef(false);
  const appStateRef = useRef(AppState.currentState);
  /** The battery warning is given once per opening, not at every glance. */
  const batteryWarned = useRef(false);
  /** enterChannel is needed inside an effect that is born before it */
  const enterChannelRef = useRef<(() => void) | null>(null);
  /** leaving, for whoever is born before the function that does it */
  const leaveChannelRef = useRef<(() => void) | null>(null);
  /** attachPeer too: the watchdog's beat is born before it */
  const attachPeerRef = useRef<((force?: boolean) => void) | null>(null);
  /**
   * When the last repair of the link was set off, whoever set it off.
   *
   * The heartbeat's medicine and the ladder's must not demolish on each
   * other's toes: a repair younger than a beat is left to work.
   */
  const recoveryBegunAt = useRef(0);

  /**
   * Patience for the deaths: a `failed` is given time to undo itself.
   *
   * On the networks that kill a pair on a clock - one carrier was
   * watched doing it every forty seconds for a whole afternoon, on
   * every transport - the pair rises again BY ITSELF within a couple
   * of seconds, almost every time. Cures given at the instant of
   * death turned every invisible stitch into a demolition with a
   * black screen: the cure hurt more than the cut. A single timer
   * waits the death out; only one that stays dead is medicated.
   *
   * The gears that used to engage here - all traffic through the
   * relay, then through its TCP door alone - are gone. They existed
   * because the deck held relay legs a carrier's NAT could reap on a
   * clock; since the relay is reached over TLS alone - the one dress
   * such a NAT respects - there is no better road left to shift to.
   * And the gear remembered across re-entries had proved poisonous:
   * whole evenings forced through the server on a stale lesson.
   */
  const failedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** sick rounds of the answerer's net, in a row: two are a sickness */
  const netSickTicks = useRef(0);
  /** the heartbeat saw the link sick at the previous beat too */
  const beatSickTwice = useRef(false);

  /**
   * The emergency lane: mobile data while the wifi plays deaf.
   *
   * Leaving the house, the wifi stops carrying long before the phone
   * lets go of it, and mid-conversation a minute of silence is not a
   * price anyone agreed to. When the link fails while words or
   * pictures are flowing, the server is probed once: if it answers,
   * the wifi carries and the trouble is on the other side; if it too
   * is silent, the deafness is ours - mobile data is switched on and
   * every socket bound to it, wifi or no wifi. The lane costs radio,
   * so it closes when the wifi has been back in health for a while
   * (in no hurry: coming home may wait a few seconds), or when the
   * conversation ends. While merely waiting, none of this runs - the
   * slow escalation is enough, and the radio stays cheap.
   */
  const laneOpen = useRef(false);
  const laneProbe = useRef<ReturnType<typeof setTimeout> | null>(null);
  const laneRelease = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** when the server last answered a presence question: the probe reads it */
  const lastPresenceAt = useRef(0);
  /**
   * When a lane was refused because the server was silent on the
   * mobile road too. Until he is heard from again there is no point
   * asking the radio every few seconds whether he is still silent.
   */
  const laneRefusedAt = useRef(0);

  const closeLane = useCallback((why: string) => {
    if (laneProbe.current) { clearTimeout(laneProbe.current); laneProbe.current = null; }
    if (laneRelease.current) { clearTimeout(laneRelease.current); laneRelease.current = null; }
    if (!laneOpen.current) return;
    laneOpen.current = false;
    Journal.mark(`mobile-lane:closed:${why}`).catch(() => { /* noop */ });
    Network.releaseMobile().catch(() => { /* noop */ });
  }, []);

  const maybeOpenLane = useCallback(() => {
    if (laneOpen.current || laneProbe.current) return;
    if (!inChannelRef.current || !peerActiveRef.current) return;
    // After a lane that bought nothing, none until the server has been
    // heard from again: see laneRefusedAt.
    if (laneRefusedAt.current && lastPresenceAt.current <= laneRefusedAt.current) return;
    // Only while something is actually flowing: with both microphones
    // shut and the cameras off, the slow road costs nobody anything.
    const s = sessionRef.current;
    const live = (s?.isAudioEnabled() ?? false) || (s?.isVideoEnabled() ?? false)
      || peerStateRef.current.audio || peerStateRef.current.video;
    if (!live) return;
    const asked = Date.now();
    signalingRef.current?.askPresence();
    // The timer stays marked busy through the whole judgement, probe
    // included: a second failure knocking meanwhile must not start a
    // second one.
    laneProbe.current = setTimeout(() => {
      const done = () => { laneProbe.current = null; };
      if (connStateRef.current === 'connected') { done(); return; }
      // The server answered over the wifi: it carries, the trouble is
      // on the other side of the road. No lane.
      if (lastPresenceAt.current > asked) { done(); return; }
      // Packets from the other side still landing here are the same
      // proof: a wifi that delivers is not deaf, whatever the server's
      // silence means.
      if (sessionRef.current?.mediaArrivedWithin(4000)) { done(); return; }
      /**
       * The server is silent on our road - but silence does not say
       * whose the deafness is: from here, a wifi gone deaf and a
       * server down for everybody sound exactly the same. It happened:
       * the server rebooted mid-call, the lane concluded "the deaf one
       * is me", bound every socket to the carrier's network and broke
       * a direct link that would have healed by itself. So one
       * question goes out through the mobile radio alone, with nothing
       * bound to it: is the server alive over there?
       */
      const url = String(cfgRef.current?.serverUrl ?? '');
      const host = url.replace(/^wss?:\/\//, '').split('/')[0].split(':')[0];
      if (!host) { done(); return; }
      Network.probeViaMobile(host, 443, 4000).then((alive: boolean) => {
        done();
        if (!alive) {
          // Silent on both roads: the trouble is his, and a lane would
          // buy nothing at the price of breaking what can heal alone.
          laneRefusedAt.current = Date.now();
          Journal.mark('mobile-lane:refused:server-down-everywhere')
            .catch(() => { /* noop */ });
          return;
        }
        if (connStateRef.current === 'connected') return;
        if (!inChannelRef.current || !peerActiveRef.current) return;
        laneOpen.current = true;
        Journal.mark('wifi-deaf:mobile-lane').catch(() => { /* noop */ });
        // Both words go out: Android is told to check the wifi (it may
        // demote it by itself), and the lane opens without waiting for
        // its verdict.
        Network.reportNotCarrying().catch(() => { /* noop */ });
        Network.requestMobile().catch(() => { /* noop */ });
      }).catch(() => { done(); });
    }, 3000);
  }, []);
  /** the relay announced by the server, valid while the connection lasts */
  const serverTurnRef = useRef<any[]>([]);
  /** the wait before the light repair of a fallen link */
  const softTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** the wait before rebuilding it entirely, if the light one is not enough */
  const hardTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** the link's current state, readable inside the timers */
  const connStateRef = useRef('new');
  /**
   * The connection to the server has dropped since we were connected.
   *
   * It matters because an offer sent while the server is out of reach
   * is dropped in silence: on coming back it has to be made again, even
   * if from our side the connection looked freshly built and therefore
   * healthy.
   */
  const signalingWasDown = useRef(false);
  /** their video was already there: so the view is not recreated for nothing */
  const hadRemoteVideo = useRef(false);
  /** a better road has already been tried on this link */
  const relayRetried = useRef(false);

  const clearRecovery = useCallback(() => {
    if (softTimer.current) { clearTimeout(softTimer.current); softTimer.current = null; }
    if (hardTimer.current) { clearTimeout(hardTimer.current); hardTimer.current = null; }
  }, []);

  /**
   * The audio output is remembered by the pair, not by the app.
   *
   * The hook no longer saves it by itself: it receives it from here and
   * hands the choices back to us, and they end up in the pair in use.
   */
  const rememberOutput = useCallback((route: string) => {
    setCfg((prev) => (prev && prev.audioOutput !== route
      ? saveCfg({ ...prev, audioOutput: route })
      : prev));
  }, [saveCfg]);

  const audio = useAudioRoute(inChannel, cfg?.audioOutput, rememberOutput);

  /**
   * How far the other voice is lifted ABOVE the phone's own top.
   *
   * One per output: the right level against the ear is not the right
   * level on speaker. It is 1 until more than the top is asked for.
   */
  const gain = cfg?.gains?.[audio.route] ?? 1;

  /**
   * Copies for the handlers, which are born once and would never see a
   * value that changed afterwards.
   */
  const audioRouteRef = useRef(audio.route);
  useEffect(() => { audioRouteRef.current = audio.route; }, [audio.route]);
  const systemVolumeRef = useRef(systemVolume);
  useEffect(() => { systemVolumeRef.current = systemVolume; }, [systemVolume]);

  /**
   * The level: what is really heard, and the only number shown.
   *
   * It is the product of the two halves - the phone's knob and our gain
   * - because that is the volume you are listening at. The old number
   * was our half alone, and it lied every time somebody moved the
   * other: a journal was seen with a phone's call volume at one of
   * eight and our 100% on top, and neither number, on its own,
   * explained the "I cannot hear you".
   */
  const level = systemVolume.max > 0
    ? Math.round((systemVolume.volume / systemVolume.max) * gain * 100) / 100
    : gain;

  /**
   * In a ref because `enterChannel` calls it, and that is born earlier
   * and must not be rebuilt every time something about the audio
   * changes.
   */
  const reapplyRouteRef = useRef<(() => void) | null>(null);
  useEffect(() => { reapplyRouteRef.current = audio.reapply; }, [audio.reapply]);

  /**
   * The other side should know where we are listening from.
   *
   * It is the thing people ask each other out loud all the time - "are
   * you on speaker?" - and the phone knows it already. It is sent at
   * every change, and costs nothing: one more field in a state message
   * that goes out anyway.
   */
  useEffect(() => {
    sessionRef.current?.setOutput(audio.route);
  }, [audio.route, inChannel]);

  /**
   * What the other person is called: whatever they called themselves,
   * or nothing.
   *
   * The connection's name has nothing to do with it - that is the name
   * of the thread, not of the person - and indeed it does not appear
   * here: if they never gave themselves a name they stay "the other",
   * and which connection you are in is said by the label, on its own
   * account.
   */
  const shownName = isRealName(peerName)
    ? peerName
    : isRealName(cfg?.pair?.peerName) ? cfg!.pair!.peerName : '';

  /**
   * The other side's last state, so we can notice what CHANGES.
   *
   * The state message arrives even when nothing has changed: without a
   * comparison, the journal would fill up with lines saying the same
   * thing.
   */
  const peerStateRef = useRef<{
    audio?: boolean; video?: boolean; camera?: string; output?: string; busy?: boolean;
  }>({});

  /**
   * Which version they have, written to the journal once per session.
   *
   * It matters when something does not add up on the far phone: half
   * the time the explanation is that a two-week-old version is running
   * over there, and without this line one has to ask out loud and trust
   * the answer. It goes into our own journal, which a cable can reach.
   */
  const peerVersionSeen = useRef('');
  useEffect(() => {
    const v = peerState.version;
    if (!v) return;
    // The build goes with it: the version alone no longer says which
    // APK is over there, now that all three of its numbers are raised
    // by hand.
    const said = peerState.build ? `${v}+${peerState.build}` : v;
    if (said === peerVersionSeen.current) return;
    peerVersionSeen.current = said;
    Journal.mark(`peer-version:${said}`).catch(() => { /* noop */ });
  }, [peerState.version, peerState.build]);

  const versionWarning = React.useMemo(() => {
    if (!peerSeen) return null;
    const theirs = peerState.version;
    /**
     * The build goes with the version, on both sides.
     *
     * Two phones can differ by a whole version or by one compilation,
     * and in a beta the second happens far more often: saying "0.9.0
     * here, 0.9.0 over there" while one of the two is twenty builds
     * behind would explain nothing. Where the other side does not say
     * its build - an older Duetto - only the version is named, which is
     * everything that is known.
     */
    const mine = `${VERSION} (${t('news.build', { n: String(BUILD) })})`;
    const theirBuild = peerState.build;
    if (!theirs) return t('news.versionsDifferOlder', { here: mine });
    const said = theirBuild
      ? `${theirs} (${t('news.build', { n: String(theirBuild) })})`
      : theirs;
    if (theirs !== VERSION) return t('news.versionsDiffer', { here: mine, there: said });
    /**
     * The same version, a different APK.
     *
     * The version used to end with the build counter, so any two phones
     * built at different moments called themselves differently and this
     * line appeared by itself. Now the three numbers are raised by hand
     * and two 0.9.0 can be weeks apart - which is exactly the case one
     * needs telling about, because it is what happens after installing
     * on one phone only.
     *
     * An older Duetto does not send the build: there we say nothing,
     * rather than blame a difference we cannot see.
     */
    if (!theirBuild || theirBuild === BUILD) return null;
    return t('news.buildsDiffer', { here: String(BUILD), there: String(theirBuild) });
    // The language is among the dependencies because the sentence is
    // built here: without it, changing language would leave this line in
    // the one it was born in.
  }, [peerSeen, peerState.version, peerState.build, cfg?.language]);

  /**
   * The call volume is read again whenever it may have changed.
   *
   * On entering the channel and at a change of output, because each
   * output has its own knob; and at every announcement from the system,
   * which arrives when another app moves it too. Without this, the
   * level shown would sit on a value that is no longer true.
   */
  useEffect(() => {
    let alive = true;
    const reread = () => {
      Volume.read().then((v) => {
        if (alive && v && v.max > 0) setSystemVolume({ volume: v.volume, max: v.max });
      }).catch(() => { /* noop */ });
    };
    reread();
    /**
     * A volume moved from outside leaves our gain alone.
     *
     * The gain used to be cleared here, on the thought that an outside
     * choice should not be multiplied by the leftover of an earlier
     * one. In practice the clearing did more harm than the falsity it
     * prevented: telling our own presses from somebody else's needed
     * an echo detector, a quick run of presses slipped past it, and
     * the gain vanished in the middle of one's own ladder - the
     * journal caught it doing exactly that. The gain is a choice made
     * in Duetto and only Duetto changes it; the level on screen is the
     * product of both knobs, so nothing shown is ever false. The mute
     * (gain zero) stays a Duetto matter for the same reason it always
     * did: nobody else lifts it.
     */
    const stop = Volume.listenToSystem(() => {
      reread();
    });
    return () => { alive = false; stop(); };
  }, [inChannel, audio.route, saveCfg]);

  /**
   * The gain is applied again at every change and at every re-entry
   * into the channel: the session can have been born after the value
   * was already there.
   */
  useEffect(() => {
    sessionRef.current?.setRemoteGain(gain);
  }, [gain, inChannel]);

  /**
   * What is declared to the other side is the LEVEL, not the gain.
   *
   * They need to know how loudly you are hearing them, and that volume
   * is the product of the two halves: our multiplier on its own would
   * tell them nothing useful, because they cannot know where the knob
   * on your phone stands.
   */
  useEffect(() => {
    sessionRef.current?.setHeardLevel(level);
  }, [level, inChannel]);

  /**
   * Turns the LEVEL up or down, sharing the work between the two
   * halves.
   *
   * Going up: first the phone's call volume is taken to its top, since
   * that is the real knob - Android remembers it per output, other apps
   * see it, and it does not touch the sound - and only when that is
   * finished does our own multiplier start, which is there for the
   * phones where the top is not enough.
   *
   * Going down it is the other way round: ours comes off first, then
   * theirs comes down. That way the multiplier, which is the part that
   * can distort, is used as little as possible.
   *
   * Two callers: the volume keys, when the phone will not obey them,
   * and the audio menu, which is there for whoever cannot see those
   * keys move anything at all - some phones slide the call volume index
   * without anything changing at the ear, and from outside that case
   * cannot be told from a working one.
   */
  const changeLevel = useCallback((direction: number) => {
    if (!direction) return;
    const show = () => {
      setLevelShowing(true);
      if (levelTimer.current) clearTimeout(levelTimer.current);
      levelTimer.current = setTimeout(() => setLevelShowing(false), 1800);
    };
    const output = audioRouteRef.current;
    const phone = systemVolumeRef.current;
    const ours = cfgRef.current?.gains?.[output] ?? 1;

    const changeOurGain = (value: number) => {
      setCfg((prev) => {
        if (!prev) return prev;
        // Zero is a real value: it is silence, and we make it ourselves
        // because the phone does not get there.
        const amount = value <= 0
          ? 0
          : Math.min(GAIN_MAX, Math.max(GAIN_MIN, value));
        if (amount === (prev.gains?.[output] ?? 1)) return prev;
        return saveCfg({
          ...prev,
          gains: { ...(prev.gains ?? {}), [output]: amount },
        });
      });
    };

    const movePhoneVolume = (v: number) => {
      setSystemVolume({ ...phone, volume: v });
      /**
       * Trust, but verify: on a good many phones the maker nails this
       * stream (speaker above all) and the set does nothing. Believing
       * it anyway walked our notion of the volume away from the truth,
       * step by step, until the ladder was attenuating with the phone
       * really at its top: a journal showed 12/12 beside a level of
       * 46%, a state no ladder can reach. If the phone did not move,
       * the truth comes back and the press goes to the gain, which
       * always obeys.
       */
      Volume.set(v).then(async () => {
        const real = await Volume.read();
        if (real.volume === v) return;
        setSystemVolume(real);
        Journal.mark(`volume:nailed at ${real.volume}/${real.max}`).catch(() => { /* noop */ });
        changeOurGain(direction > 0 ? up : down);
      }).catch(() => { /* noop */ });
    };

    const up = Math.round((ours + GAIN_STEP) * 100) / 100;
    const down = Math.round((ours - GAIN_STEP) * 100) / 100;

    if (direction > 0) {
      // Going up: from silence back to the phone's lowest step, then we
      // stop attenuating, then the phone comes up, and only when it is
      // at its top do we multiply.
      if (ours === 0) changeOurGain(1);
      else if (phone.max > 0 && phone.volume === 0) movePhoneVolume(1);
      else if (ours < 1) changeOurGain(up);
      else if (phone.max > 0 && phone.volume < phone.max) movePhoneVolume(phone.volume + 1);
      else changeOurGain(up);
    } else if (ours === 0) {
      // Already muted: there is nothing below.
    } else if (ours > 1) {
      changeOurGain(down);
    } else if (phone.max > 0 && phone.volume > 1) {
      movePhoneVolume(phone.volume - 1);
    } else if (ours > GAIN_MIN) {
      // The phone is at its lowest step and quieter is wanted: from
      // here down we attenuate, because below that step the phone
      // cannot go - and on some phones, on speaker, that step is still
      // very loud.
      changeOurGain(down);
    } else {
      /**
       * The last step down is silence, and we make it ourselves.
       *
       * Android will not take the call volume to zero: ask it for zero
       * and it holds the lowest step, which is perfectly audible. Real
       * silence is only had by clearing the multiplier, that is, by not
       * playing what arrives.
       */
      changeOurGain(0);
    }
    show();
  }, [saveCfg]);

  useEffect(() => {
    if (!inChannel) return;
    Volume.takeKeys(true).catch(() => {});
    const stop = Volume.subscribe(changeLevel);
    return () => {
      stop();
      Volume.takeKeys(false).catch(() => {});
    };
  }, [inChannel, changeLevel]);

  /**
   * The name is needed inside the connection handlers too, and those
   * are born once and would never see a name that arrived later.
   */
  const shownNameRef = useRef(shownName);
  useEffect(() => { shownNameRef.current = shownName; }, [shownName]);

  /**
   * Under which name to file the journal that arrives.
   *
   * In a ref because the message handler reads it, and that is born
   * once: on renaming the connection, without this it would keep
   * writing under the old name until the next reconnection.
   */
  const journalKeyRef = useRef('');
  useEffect(() => { journalKeyRef.current = pairFileKey(cfg?.pair); }, [cfg?.pair]);

  /**
   * The name that goes in front of the alerts: which connection they
   * arrived on.
   *
   * With a single connection there is nothing to tell apart and it
   * stays empty. With more than one it becomes "Home": without it, an
   * alert in the status bar says somebody is looking for you but not
   * which of the two or three you know, and to find out you have to
   * open the app.
   *
   * In a ref because the message handler reads it, and that is born
   * once and would never see a name changed afterwards.
   */
  const alertName = React.useMemo(
    () => (cfg && cfg.pairs.length > 1 ? pairName(cfg.pair) || '' : ''),
    [cfg],
  );
  const alertNameRef = useRef(alertName);
  useEffect(() => { alertNameRef.current = alertName; }, [alertName]);

  /**
   * The name of this connection, if I gave it one.
   *
   * It is shown where knowing which connection you are in is useful: on
   * the badge at the top, in place of the app's name, and in front of
   * the standing notification. With no name nothing appears: whoever
   * has a single connection has nothing to tell apart.
   */
  const connectionName = cfg?.pair?.label || '';

  /**
   * The picture to show in place of the other person's video.
   *
   * It depends on the pair alone, so it never changes; before the first
   * pairing it is of no use, but a value has to be there.
   */
  const face = React.useMemo(
    () => (cfg?.pair ? peerAvatar(cfg.pair.id, cfg.pair.side) : avatarFor('duetto')),
    [cfg?.pair],
  );

  useEffect(() => { inChannelRef.current = inChannel; }, [inChannel]);

  /**
   * The status to SHOW, which is not always the true one.
   *
   * Losing the server for a second is normal life for a phone that
   * moves: changing cell changes the address, and with it every open
   * connection dies - it happens to every app, only in the others there
   * is nothing visible hanging off that socket. Saying it at once
   * raises an alarm about something that sorts itself out in a couple
   * of seconds.
   *
   * So the bad news waits a few seconds before going on screen: if the
   * link comes back in the meantime, nothing is said. It is the same
   * breath the video's own notice already takes.
   *
   * It applies to what is SEEN - the card in the middle and the
   * notification - not to what is done: whoever decides to rebuild the
   * connection looks at the true status, which is the only one that
   * knows how things really stand.
   */
  const [shownStatus, setShownStatus] = useState<PresenceStatus>(status);
  useEffect(() => {
    if (status !== 'offline' && status !== 'connecting') {
      setShownStatus(status);
      return;
    }
    const t = setTimeout(() => setShownStatus(status), SERVER_GRACE_MS);
    return () => clearTimeout(t);
  }, [status]);

  const noticeText = React.useMemo(() => presenceLine({
    inChannel,
    peerActive: status === 'together',
    peerPresent,
    detached: peerDetached,
    tornDown: peerTornDown,
    name: shownName,
    server: shownStatus === 'offline' ? 'down'
      : shownStatus === 'connecting' ? 'connecting' : 'ok',
    // `status` is READ here, so it belongs in this list: without it a
    // change of status alone left the line on its old words until
    // something else happened to move. It was masked - `shownStatus`
    // follows `status` a breath later and dragged the line along - but
    // masked is not cured.
  }), [inChannel, status, shownStatus, peerPresent, peerDetached, peerTornDown, shownName]);

  /**
   * Since when we have been without a server, or 0 when we have one.
   *
   * A single number instead of the previous state: it says both when to
   * write the journal lines and how long it has lasted - which is the
   * only good measure for deciding to rebuild everything.
   */
  const noServerSince = useRef(0);

  /**
   * When our own link to the server last came back.
   *
   * Whoever comes back from an outage finds the other person there and
   * has no way, from the presence alone, of telling "they came back"
   * from "we came back": the two look identical from here. The moment
   * of our own return says which of the two it was.
   */
  const serverBackAt = useRef(0);

  /**
   * How long a return of ours goes on explaining the other person's.
   *
   * Long enough for the answer to the first question after reconnecting
   * to arrive, short enough that a real return a minute later is still
   * told.
   */
  const OUR_RETURN_MS = 20_000;

  const noticeTextRef = useRef(noticeText);
  /**
   * The line is only written when the presence is really there.
   *
   * `setText` does not merely change the text: it goes through
   * `startForegroundService`, and a stopped service is started again by
   * it. Without this check, making yourself unavailable would have
   * brought the notification back a moment after it was taken away -
   * and before pairing at all, one would have appeared for a presence
   * that does not exist.
   */
  const presenceLive = !!cfg && isPaired(cfg) && isServerConfigured(cfg) && available;
  const presenceLiveRef = useRef(presenceLive);
  /**
   * The line we know is really on the screen, or null if none is.
   *
   * The difference between this and `noticeTextRef` is the whole point:
   * one is what we want said, the other what was actually written down.
   * They came apart for a whole morning - the app knew perfectly well
   * that the other person was in the channel, and the shade went on
   * saying they were waiting - and nothing could ever notice, because
   * writing was attempted only when the words changed.
   */
  const writtenNotice = useRef<string | null>(null);
  const noticeRetry = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * Writes the line, and remembers whether the writing took.
   *
   * A failed write is retried a few times - the system can refuse to
   * start the service while the app is in the background - and what is
   * written is always read afresh from the ref, so a retry carries the
   * words of the moment it fires rather than the ones that failed.
   */
  const writeNotice = useCallback((left = 3) => {
    if (noticeRetry.current) { clearTimeout(noticeRetry.current); noticeRetry.current = null; }
    if (!presenceLiveRef.current) return;
    const text = noticeTextRef.current;
    Foreground.setText(text, alertNameRef.current).then(() => {
      writtenNotice.current = text;
    }).catch(() => {
      if (left <= 0) return;
      noticeRetry.current = setTimeout(() => writeNotice(left - 1), NOTICE_RETRY_MS);
    });
  }, []);

  /**
   * Says again what the shade should be saying, if it is not saying it.
   *
   * Called where there is reason to believe the writing can succeed now
   * and may not have succeeded before: coming back to the foreground,
   * and at the heartbeat. A line identical to the one really written is
   * never written again - that is what keeps a notification somebody
   * swept away from being born again a minute later, which is the trap
   * the old rewrite-every-minute fell into. Only a line that DIFFERS
   * from what we managed to write is worth another try.
   */
  const catchUpNotice = useCallback(() => {
    if (!presenceLiveRef.current) return;
    if (writtenNotice.current === noticeTextRef.current) return;
    Journal.mark(`notice:again:${noticeTextRef.current}`).catch(() => { /* noop */ });
    writeNotice();
  }, [writeNotice]);
  const catchUpNoticeRef = useRef(catchUpNotice);
  useEffect(() => { catchUpNoticeRef.current = catchUpNotice; }, [catchUpNotice]);

  useEffect(() => {
    noticeTextRef.current = noticeText;
    presenceLiveRef.current = presenceLive;
    if (!presenceLive) return;
    // Into the journal, because it is the one thing the journal never
    // said: what the shade was told to show. Without it, a line that
    // stayed behind cannot be told from a line that was never sent.
    Journal.mark(`notice:${noticeText}`).catch(() => { /* noop */ });
    writeNotice();
    return () => {
      if (noticeRetry.current) { clearTimeout(noticeRetry.current); noticeRetry.current = null; }
    };
  }, [noticeText, alertName, presenceLive, writeNotice]);

  /**
   * If we stay without a server too long, everything is rebuilt.
   *
   * The ordinary reconnection tries again every half second up to four,
   * and nearly always that is enough. It is not enough when the socket
   * is neither alive nor dead: to the system it is still opening, no
   * event arrives any more, and the wait never ends - the app sits
   * there saying "no link to the server" with the phone perfectly
   * online.
   *
   * It is counted from the last WORKING connection, not from how long
   * the current state has lasted. Counting the state, this net never
   * fired once - zero lines in days of journal: a failed attempt
   * changes state every couple of seconds, `offline -> opening ->
   * offline`, and the countdown started again every time without ever
   * reaching the end. Somebody who has been without a server for half a
   * minute has been, however many times they tried in between.
   */
  useEffect(() => {
    if (!available) return;
    if (status !== 'offline' && status !== 'connecting') return;
    const t = setInterval(() => {
      // If we are not counting yet, we start now: we are here because
      // there is no link, and the worst case - the socket that stays
      // "opening" for ever, with never a drop to record - is precisely
      // the one that would start no count at all.
      const since = noServerSince.current || (noServerSince.current = Date.now());
      const stuck = Date.now() - since;
      if (stuck < NO_SERVER_WAIT_MS) return;
      Journal.mark(`server:rebuilt:${Math.round(stuck / 1000)}s`)
        .catch(() => { /* noop */ });
      // The count starts again now: rebuilding is an attempt, and if it
      // is not enough another will follow after as long again.
      noServerSince.current = Date.now();
      signalingRef.current?.rebuild();
    }, SERVER_CHECK_MS);
    return () => clearInterval(t);
  }, [status, available]);

  /**
   * The connection's watchdog, shared with the headless presence.
   *
   * The listening and the judging live in watchdog.ts: here we only
   * hold the handle, to tell it when the server has answered and to
   * stop it when the interface steps aside.
   */
  const watchdog = useRef<Watchdog | null>(null);

  /**
   * "Their app was closed on them" holds while they stay waiting.
   *
   * The moment they enter the channel, or disappear altogether, that
   * explanation no longer describes the present.
   */
  useEffect(() => {
    if (!peerPresent || status === 'together') setPeerTornDown(false);
  }, [peerPresent, status]);


  /**
   * The watchdog watches over the connection: the network's changes and
   * the native heartbeat, the only alarm clock that rings with the
   * screen off. The whole story is in watchdog.ts - the same ears also
   * serve the headless presence, which for years ran deaf without them.
   */
  useEffect(() => {
    if (!available) return;
    const w = attachWatchdog(() => signalingRef.current, {
      onNoServer: () => {
        noServerSince.current = noServerSince.current || Date.now();
      },
      /**
       * The beat also looks at the link between the two, not only at
       * the socket to the server.
       *
       * Every repair of a fallen link used to hang from JavaScript
       * timers, which stand still with the screen off: a call that
       * died in a pocket, with the socket in perfect health, was
       * repaired at the exact instant the screen came back on. The
       * beat ticks with the screen off (in the channel the service
       * holds the CPU), so the same medicine as the safety net below
       * is given from here: the asking side asks, the offering side
       * rebuilds. And the beat quickens while the link is sick, so the
       * repair comes within seconds, not within the minute.
       */
      onBeat: () => {
        // The one clock that ticks with the screen off: if the shade
        // stayed behind, this is where it is caught up with.
        catchUpNoticeRef.current?.();
        if (!inChannelRef.current || !peerActiveRef.current) return;
        const sess = sessionRef.current;
        if (!sess) return;
        const sick = !sess.isPeerHealthy() || sess.isStalled();
        Heartbeat.fast(sick).catch(() => { /* noop */ });
        if (!sick) { beatSickTwice.current = false; return; }
        // Patience here too: one sick beat may be a stitch halfway
        // done. Two in a row - fifteen seconds at the quick pace - are
        // a sickness worth operating on.
        if (!beatSickTwice.current) { beatSickTwice.current = true; return; }
        beatSickTwice.current = false;
        // Not on the ladder's toes: a repair set off moments ago -
        // screen on, timers running - is left to work.
        if (Date.now() - recoveryBegunAt.current < 15_000) return;
        recoveryBegunAt.current = Date.now();
        Journal.mark('heartbeat:peer-sick').catch(() => { /* noop */ });
        if (politeRef.current) signalingRef.current?.sendSignal({ kind: 'renegotiate' });
        else attachPeerRef.current?.(true);
      },
      /**
       * The network changed under our feet: the link goes looking for
       * the roads the new network may have opened.
       *
       * Android often changes network without breaking anything - the
       * new one comes up before the old goes down - so no outage ever
       * told the link to look again. It kept walking a dead road
       * through the relay while the two phones sat on the same wifi:
       * video squeezed to nothing, the connection stumbling on every
       * consent check. An ICE restart is exactly the tool for this -
       * media keeps flowing on the old road until a better one is
       * ready. Only with a standing socket: with a broken one, the
       * rejoining already restarts everything.
       */
      onNetwork: (what) => {
        /**
         * The wifi is back in health while the lane is open: the lane
         * closes, but in no hurry - twenty seconds of proven health,
         * so the edge of the wifi's reach does not become a ping-pong.
         * Coming home a few seconds late was agreed to be no problem.
         */
        if (what === 'wifi-back') {
          if (!laneOpen.current || laneRelease.current) return;
          laneRelease.current = setTimeout(() => {
            laneRelease.current = null;
            closeLane('wifi-healthy-again');
          }, 20_000);
          return;
        }
        const sig = signalingRef.current;
        if (!sig?.connected) return;
        if (!inChannelRef.current || !peerActiveRef.current) return;
        if (!sessionRef.current?.hasPeer()) return;
        /**
         * A healthy link is not renegotiated over a twitch.
         *
         * On some phones the wifi rotates its private IPv6 addresses
         * every minute or so, and each rotation arrives here as an
         * `address` event: answering every one with an ICE restart
         * filled a quiet evening on the home wifi with churn that was
         * all ours - one side renegotiating, the other stumbling over
         * it, turn and turn about. Only a change of the DEFAULT
         * network reshuffles a healthy link's roads; a twitch that
         * really broke something brings the link down by itself, and
         * the patient machinery cures that in its own time.
         */
        if (what !== 'arrived'
            && (sessionRef.current?.isPeerHealthy() ?? false)
            && !sessionRef.current?.isStalled()) return;
        // A new network is the one moment a direct road may have
        // appeared: the escape from the relay earns a fresh try.
        relayRetried.current = false;
        recoveryBegunAt.current = Date.now();
        Journal.mark('network:ice-restart').catch(() => { /* noop */ });
        if (politeRef.current) sig.sendSignal({ kind: 'renegotiate' });
        else sessionRef.current?.restartIce();
      },
    });
    watchdog.current = w;
    return () => {
      watchdog.current = null;
      w.stop();
    };
  }, [available]);

  /**
   * The heartbeat quickens while we are without a server.
   *
   * With the screen off it is the only engine running, so its pace is
   * also the pace of the attempts: one a minute when all is well, one
   * every fifteen seconds when there is something to put right.
   */
  useEffect(() => {
    const without = status === 'offline' || status === 'connecting';
    Heartbeat.fast(available && without).catch(() => { /* noop */ });
  }, [status, available]);

  /**
   * Every so often we ask the server again whether they are there.
   *
   * Only while waiting for them: once they enter the channel there is
   * nothing left to ask, and outside the channel there is no screen
   * saying anything about it.
   *
   * The first quarter of an hour is when one is really waiting, often
   * watching the screen: there, a question a minute is a small thing.
   * After that the wait has become a background and it thins out to
   * five minutes, which is the pace of the server's own heartbeat.
   */
  useEffect(() => {
    if (!inChannel || status !== 'alone') return;
    const start = Date.now();
    let timer: ReturnType<typeof setTimeout>;
    const round = () => {
      signalingRef.current?.askPresence();
      const wait = Date.now() - start >= PRESENCE_PATIENCE_MS
        ? PRESENCE_SPARSE_MS : PRESENCE_OFTEN_MS;
      timer = setTimeout(round, wait);
    };
    // Not straight away: entering the channel, the server's answer has
    // just arrived, and asking again in the same instant would be
    // asking twice.
    timer = setTimeout(round, PRESENCE_OFTEN_MS);
    return () => clearTimeout(timer);
  }, [inChannel, status]);

  /**
   * When the interface is born and when it dies, written out in full.
   *
   * It looks redundant - the "listening" line is already there - and
   * yet it is precisely the ambiguity of that line that cost a night:
   * "listening" is written both by whoever leaves the channel and by an
   * interface starting over, and telling the two apart is the
   * difference between "they closed it" and "it rebuilt itself while
   * they were asleep".
   *
   * The teardown is written while the JavaScript engine is already
   * closing: the line sets off, but if the process dies in the same
   * instant it may not reach the file. Better an uncertain line than
   * none.
   */
  useEffect(() => {
    Journal.mark('ui-started').catch(() => { /* noop */ });
    return () => {
      Journal.mark('ui-torn-down').catch(() => { /* noop */ });
      // If we are not leaving on purpose, the connection is lost here:
      // the JavaScript engine dies with the interface, and nobody knows
      // except us, in this instant. We hand over to the headless
      // presence, which opens it again.
      //
      // The foreground service is not enough: it keeps the process
      // alive, not the connection. They are two different things, and
      // the other side needs only one of them to see you disappear.
      if (!sayGoodbye.current) {
        /**
         * The reason is only told when it mattered.
         *
         * If the window is torn down while IN THE CHANNEL, the other
         * person sees you disappear with no explanation and deserves to
         * know it was not you: that is the case this message exists
         * for. If instead you had already left and the app was in the
         * background, being torn down is ordinary business - on some
         * phones it happens a few seconds after every exit - and saying
         * so made them read "their phone closed the app on them" right
         * after an exit they had chosen. True, and misleading.
         */
        interfaceInCharge(false, inChannelRef.current);
        Foreground.resumePresence().catch(() => { /* noop */ });
      }
    };
  }, []);

  /**
   * The journal follows the state: without it the lines would say how
   * far the phone had come down without saying what the app was doing,
   * which is the one thing that makes those figures comparable.
   */
  useEffect(() => {
    const state = !inChannel ? 'waiting' : videoOn ? 'channel+video' : 'channel';
    Journal.state(state).catch(() => {});
    // A line at every change of state: it marks the border between two
    // stretches, and without borders neither can be measured.
    Journal.mark(state).catch(() => {});
  }, [inChannel, videoOn]);

  /**
   * "I died, and this is why."
   *
   * Nobody can give warning while dying: a process killed by the system
   * gets no notice at all. But on starting again the phone remembers
   * how it went, and then we tell the other side - who meanwhile saw a
   * person disappear with no way of knowing whether it was a tunnel, a
   * phone switched off or an app that died.
   *
   * Told once only: the same death told at every reconnection would
   * become a refrain.
   */
  const deathToTell =
    useRef<{ when: number; cause: string; back: number } | null>(null);

  /**
   * Since when the other person has been gone, and the return to
   * announce.
   *
   * Disappearing and coming back are both worth telling, but not at
   * every hiccup of the network: an absence of a few seconds is a
   * change of cell, and saying it would be noise. Over a minute,
   * though, something happened, and whoever was waiting deserves to
   * know it is over.
   *
   * The return is announced a few seconds late, because if that absence
   * was a death the story of why arrives too, and that says everything
   * already: two pieces of news for one fact are one too many.
   */
  const awaySince = useRef(0);
  const returnDue = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ABSENCE_WORTH_TELLING_MS = 60_000;
  const TELLING_DELAY_MS = 6_000;

  const forgetReturn = useCallback(() => {
    if (returnDue.current) {
      clearTimeout(returnDue.current);
      returnDue.current = null;
    }
  }, []);

  useEffect(() => {
    /**
     * Without a server, they are not absent: they are unknown.
     *
     * The count used to start from "we cannot see them", which is also
     * true while the app is starting up and while our own link is down.
     * From there came the sentence told about the wrong person: the
     * phone that had been away was this one, and the moment the server
     * answered - "they are there" - it read a whole absence of theirs
     * and announced their return.
     */
    if (status === 'connecting' || status === 'offline') {
      awaySince.current = 0;
      forgetReturn();
      return;
    }
    if (!peerPresent) {
      if (awaySince.current === 0) awaySince.current = Date.now();
      forgetReturn();
      return;
    }
    const gone = awaySince.current;
    awaySince.current = 0;
    if (!gone || Date.now() - gone < ABSENCE_WORTH_TELLING_MS) return;
    // Our own link has just come back: what looks like their return is
    // ours. Theirs, if it happens, will be told when it happens.
    if (Date.now() - serverBackAt.current < OUR_RETURN_MS) return;
    forgetReturn();
    returnDue.current = setTimeout(() => {
      returnDue.current = null;
      const who = shownNameRef.current || t('presence.theOther');
      // With the time to the second: a notification found later,
      // without it, does not say whether they came back a minute ago or
      // this morning.
      const at = new Date().toLocaleTimeString(undefined, {
        hour: '2-digit', minute: '2-digit', second: '2-digit',
      });
      // In the shade only: inside the app the same sentence would
      // appear twice, once in the card and once in the notification
      // behind it.
      Foreground.note(alertNameRef.current, t('news.reachableAgain', { who, at }))
        .catch(() => {});
    }, TELLING_DELAY_MS);
  }, [peerPresent, status, forgetReturn]);

  /**
   * "Reachable again" stops being true when they disappear again.
   *
   * The notice expires by itself after ten minutes anyway, but if they
   * go before that there is no sense leaving it there: whoever pulls
   * the shade down would read the opposite of what the standing
   * notification says two lines below.
   */
  useEffect(() => {
    if (peerPresent) return;
    Foreground.clearNote().catch(() => { /* noop */ });
  }, [peerPresent]);

  const readOwnDeath = useCallback(async () => {
    try {
      const m = await Journal.lastDeath();
      if (!m || !m.when) return;
      // An update of the app is not a death: it is the normal way an
      // app gets replaced, and announcing it would be an alarm about
      // something wanted.
      if (/installPackage|PackageUpdate/i.test(m.description || '')) return;
      const told = await readWithBridge(DEATH_TOLD_KEY, OLD_KEYS.death);
      if (Number(told) >= m.when) return;
      // The time of the return is now: the app is starting again at
      // this very moment, and this is the only phone that can know it.
      deathToTell.current = { when: m.when, cause: m.cause, back: Date.now() };
    } catch { /* if the phone does not know, it does not know */ }
  }, []);

  useEffect(() => {
    if (!peerPresent) return;
    const death = deathToTell.current;
    const sig = signalingRef.current;
    if (!death || !sig?.connected) return;
    sig.sendSignal({
      kind: 'death', when: death.when, cause: death.cause, back: death.back,
    });
    deathToTell.current = null;
    AsyncStorage.setItem(DEATH_TOLD_KEY, String(death.when)).catch(() => {});
  }, [peerPresent, status]);

  /**
   * Sends the other side the journal lines that have not gone yet.
   *
   * It is there so that both journals can be read by plugging in one
   * phone: the other one, in somebody else's hands, no cable ever
   * reaches. Only the new lines are sent; if the file has been rotated
   * and now holds fewer lines than we had sent, we start again.
   *
   * It sits outside the periodic effect because leaving calls it too:
   * that is the last useful moment, with the connection still open and
   * about to stop being so.
   */
  const sendJournal = useCallback(async () => {
    const sig = signalingRef.current;
    if (!sig?.connected) return;
    const key = sentKeyFor(cfg?.pair?.id ?? '');
    try {
      const lines = await Journal.lines();
      const mine = await readWithBridge(key, `${OLD_KEYS.sent}.${cfg?.pair?.id ?? ''}`);
      // The single key of old is the starting point for whoever was
      // already here: without it, the first exchange after the update
      // would send months of lines the other side already has.
      const older = mine === null
        ? await AsyncStorage.getItem(OLD_KEYS.sent)
        : null;
      let sent = Number(mine ?? older) || 0;
      if (sent > lines) sent = 0;
      if (lines <= sent) return;

      const text = await Journal.read(sent);
      if (!text) return;
      sig.sendSignal({ kind: 'journal', text });
      await AsyncStorage.setItem(key, String(lines));
    } catch {
      /* the journal is not worth an error in anybody's face */
    }
  }, [cfg?.pair?.id]);

  useEffect(() => {
    if (!peerPresent) return;
    // Only with diagnostics on: it is a few hundred bytes every five
    // minutes, but it is bytes on somebody else's phone, spent on
    // something neither of you has asked to read.
    if (!cfg?.diagnostics) return;
    let alive = true;

    const send = () => { if (alive) sendJournal(); };

    // The first round TEN SECONDS after finding each other, not a
    // minute.
    //
    // The minute was wasted caution: a round costs a few hundred bytes.
    // And above all it worked against us in exactly the case the
    // journal is for - a phone whose app keeps dying - because that
    // phone did not stay connected long enough to reach the first send,
    // and the lines explaining its deaths never left.
    //
    // It is enough that the other side is CONNECTED, not that you are
    // in the channel: journals are exchanged while merely waiting too.
    const first = setTimeout(send, 10_000);
    const timer = setInterval(send, JOURNAL_SWAP_MS);
    return () => { alive = false; clearTimeout(first); clearInterval(timer); };
  }, [peerPresent, sendJournal, cfg?.diagnostics]);

  /**
   * If we are going through the relay, the direct road is tried once.
   *
   * ICE does not go back on its own: once it has chosen a road that
   * works it never reconsiders, not even when a far better one appears
   * - coming back onto wifi the link went on bouncing off the server
   * for ever. A renegotiation gathers the candidates again and has the
   * pairs re-scored: if the local one is there, it wins on priority.
   *
   * Once per link: if the relay stays even so, it means there is
   * nothing better, and insisting would cost interruptions.
   */
  useEffect(() => {
    // The mark is NOT cleared here. Clearing it at every exit from
    // "connected" set off a loop: the attempt interrupts the
    // connection, the interruption re-enables the attempt, and from
    // outside one saw "link interrupted" every ten seconds for ever. It
    // is only tried again after a real change of network - see
    // `onJoined`.
    if (connState !== 'connected') return;
    if (videoStats.path !== 'relay' || relayRetried.current) return;
    const t = setTimeout(() => {
      if (!inChannelRef.current || !peerActiveRef.current) return;
      relayRetried.current = true;
      rtcLog('going through the relay: looking for a direct road');
      if (politeRef.current) signalingRef.current?.sendSignal({ kind: 'renegotiate' });
      else sessionRef.current?.restartIce();
    }, 8000);
    return () => clearTimeout(t);
  }, [connState, videoStats.path]);

  // Which profile the interface is REALLY showing: it tells "it did not
  // arrive" from "it arrived but cannot be seen".
  useEffect(() => {
    if (cfg) uiLog('profile shown:', cfg.videoQuality);
  }, [cfg?.videoQuality]);

  // Knowing whether we are in the foreground decides whether to show a
  // notification.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      const wasActive = appStateRef.current === 'active';
      appStateRef.current = s;
      if (s !== 'active') return;

      Foreground.clearNotification().catch(() => {});
      // The fixed line, if the shade is not showing what it should: a
      // write refused while we were in the background, or a service
      // put back on its feet underneath us with the words of before.
      catchUpNoticeRef.current?.();
      // Opening the app again is already saying "I am here": if you had
      // detached, the presence comes back by itself. Whoever wants to
      // stay invisible does not open it. Said to the native side too,
      // where the choice survives a reboot.
      setAvailable(true);
      Foreground.setAvailable(true).catch(() => {});
      /**
       * The battery exemption is looked at again, every time.
       *
       * It was asked for once, during setup - but the system, or one of
       * the makers' "optimizers", can quietly take it back, and its
       * loss is the classic way of becoming unreachable without
       * knowing. The check costs one cheap read; the warning is given
       * once per opening of the app, not at every glance.
       */
      Foreground.isBatteryUnrestricted().then((ok: boolean) => {
        if (ok || batteryWarned.current || !signalingRef.current) return;
        batteryWarned.current = true;
        Journal.mark('battery:restricted').catch(() => {});
        Alert.alert(
          t('errors.batteryRestricted'),
          t('errors.batteryRestrictedBody'),
          [
            { text: t('settings.cancel'), style: 'cancel' },
            {
              text: t('errors.batteryRestrictedAction'),
              onPress: () => { Foreground.requestBatteryUnrestricted().catch(() => {}); },
            },
          ],
        );
      }).catch(() => {});
      // Coming back to the foreground there is no sense waiting for the
      // next scheduled attempt: we try again now.
      signalingRef.current?.reconnectNow();
      // And we ask again where the other person is: the phone may have
      // slept for hours, and the countdowns sleep with it. Whoever
      // turns the screen back on looks at that line first, and has to
      // find it fresh, not frozen at how it was before the night.
      if (inChannelRef.current) signalingRef.current?.askPresence();
      // Coming back to the foreground - from the icon or by touching
      // the notification - means wanting to be in the channel: we go
      // back in without asking anything.
      if (!wasActive && !inChannelRef.current && signalingRef.current) {
        enterChannelRef.current?.();
      }
    });
    return () => sub.remove();
  }, []);

  // What this phone can do: asked once, at start-up.
  useEffect(() => {
    Codecs.hasHardwareVp9Encoder().then((v: boolean) => {
      setLocalVp9(!!v);
      sessionRef.current?.setLocalVp9(!!v);
    }).catch(() => {});
  }, []);

  /**
   * We tell the other side when we stop watching, so they can switch
   * their sending off: a video towards a dark screen costs about
   * 300 kB/s to whoever sends it, which on a mobile network is paid
   * for.
   *
   * We do not use AppState: on Android it reports the activity being
   * paused, and in Picture-in-Picture the activity is paused while
   * being perfectly visible.
   */
  useEffect(() => {
    Visibility.get().then((v: boolean) => {
      sessionRef.current?.setLocalWatching(!!v);
    }).catch(() => {});
    return Visibility.subscribe((visible: boolean) => {
      sessionRef.current?.setLocalWatching(visible);
    });
  }, []);

  // --- start-up ------------------------------------------------------------
  useEffect(() => {
    (async () => {
      // Before the configuration: if it arrived later, the little
      // square would appear where it was born and then jump.
      await loadPipPosition();
      let c = await loadConfig();
      setCfg(c);
      readOwnDeath();
      // The notification channel has to be made ready before it is
      // needed: it is born with
      // sound and vibration inside it, and creating it at the first
      // alert would mean creating it while it is being used.
      Alerts.configure(c.alertVibration, c.alertSound, c.alertSoundUri).catch(() => {});
      // No server yet: the welcome, which asks for the server and
      // for nothing else until the server says what it needs.
      if (!isServerConfigured(c)) setScreen('welcome');
      // No pair yet: the pairing, if the server has said what we are
      // to it; otherwise the welcome, which knocks and finds out.
      // No pair yet: the settings, where the server is and the two
      // ways to a pair - not the code itself, which opens a room on
      // the server at every start and leaves it there if nobody comes.
      else if (!isPaired(c)) setScreen(opensHere(c) ? 'settings' : 'welcome');
      // The system settings are offered once, as soon as there is a
      // pair: before that there would be no sense explaining them.
      else if (!c.setupShown) setScreen('setup');
      // Opening the app means wanting to be in the channel: no buttons
      // in between. The "waiting" state is for after pressing Leave.
      else setScreen('channel');
    })();
  }, []);

  /**
   * What, on changing, really forces the connection to be rebuilt.
   *
   * The effect used to depend on the whole of `cfg`: changing the video
   * quality - which is only an encoder parameter - tore signalling and
   * session down and rebuilt them. You saw your own video go off, the
   * other side read "link interrupted", and the preferences closed by
   * themselves because going back into the channel changes screen.
   */
  // The key and the invitation go in the first message to the
  // server: written after the connection was made, they reached it
  // only at the next one, whenever that was - which is how an
  // invitation typed one evening was never used.
  const connKey = cfg
    ? [
        cfg.serverUrl, cfg.serverKey, cfg.invitation, cfg.displayName,
        cfg.pair?.id, cfg.pair?.side, cfg.pair?.key,
      ].join('|')
    : '';

  /**
   * The other person's real name, remembered in the connection.
   *
   * At pairing the name can be missing - it is optional - or be changed
   * later. With several connections in the list it is the only thing
   * that tells them apart: the room's fingerprint means nothing to
   * anybody. It is written only when it really changes, so doing it at
   * every entry costs nothing.
   */
  /**
   * Says which Duetto is on this phone, in the encrypted envelope.
   *
   * Sent when the two find each other, from both sides, so that neither
   * has to ask. It costs a few dozen bytes once per meeting, and it is
   * what lets the warning about different versions be shown while
   * merely waiting - before going in, which is when it is worth
   * something.
   */
  const sayHello = useCallback(() => {
    signalingRef.current?.sendSignal({ kind: 'hello', version: VERSION, build: BUILD });
  }, []);

  const noteName = useCallback((n: string) => {
    setPeerName(n);
    setCfg((prev) => {
      if (!prev?.pair) return prev;
      const next = rememberPeerName(prev, prev.pair.id, n);
      if (!next) return prev;
      return saveCfg(next);
    });
  }, [saveCfg]);

  // --- the standing connection --------------------------------------------
  // It lives as long as there is a pair: moving from "waiting" to "in
  // the channel" reconnects nothing, it only changes the state declared
  // to the server.
  useEffect(() => {
    if (!cfg || !isPaired(cfg) || !isServerConfigured(cfg) || !available) return;
    const pair = cfg.pair!;

    // If the presence was being kept alive by the headless service
    // (after a reboot), the app takes over now: two connections from
    // the same device would push each other out.
    stopListening();
    let cancelled = false;

    (async () => {
      const perms = await requestAllPermissions();
      cameraGranted.current = perms.camera;
      if (!perms.mic) {
        Alert.alert(t('errors.permissionDenied'), t('errors.noMicrophone'));
        setScreen('settings');
        // Listening needs no microphone - only entering the channel
        // does. The headless connection was closed above to make room
        // for ours; without this, refusing the permission silently cost
        // the phone its reachability as well.
        startListening().catch(() => {});
        return;
      }
      if (cancelled) return;

      Foreground.start(noticeTextRef.current, false).catch(() => {});
      // There is a pair and a connection to watch over: the watchdog
      // alarm's net goes up (it may have been lowered while unpaired).
      Foreground.watchdogWanted(true).catch(() => {});

      const sig = new Signaling(
        {
          serverUrl: cfg.serverUrl.trim(),
          serverKey: cfg.serverKey,
          invitation: cfg.invitation,
          room: pair.id,
          displayName: cfg.displayName || 'Someone',
          key: pair.key,
          side: pair.side,
          mode: 'listening',
        },
        {
          onStatus: (st, detail) => {
            setStatus(st);
            if (st === 'offline') signalingWasDown.current = true;
            /**
             * The drops of the link to the server, in the journal.
             *
             * It was the one thing we did not record: what you do, what
             * they do, when the app dies, when they fall - and not when
             * the server disappears for us. It is the hole that cost
             * two days on another front. The code says who closed: 1006
             * a network drop, 1000 an orderly close, 4xxx a refusal
             * from the server.
             *
             * The return is measured from when we were left without,
             * not from the previous step. Looking only at the state
             * before, `server:ok` demanded a direct jump from "offline"
             * to "connected" - but one always passes through "opening",
             * so that line was never written, and the journal could not
             * say when the link had come back. Which is exactly the
             * question the journal exists for.
             */
            if (st === 'offline') {
              if (!noServerSince.current) {
                noServerSince.current = Date.now();
                Journal.mark(`server:down:${detail ?? '?'}`).catch(() => {});
              }
            } else if (st !== 'connecting' && noServerSince.current) {
              const howLong = Math.round((Date.now() - noServerSince.current) / 1000);
              noServerSince.current = 0;
              serverBackAt.current = Date.now();
              Journal.mark(`server:ok:after ${howLong}s`).catch(() => {});
            }
          },

          onJoined: ({
            peerPresent: present, peerActive, peerName: n, turn, stun, owner, opens,
          }) => {
            setCanInvite(owner);
            setCanAddPair(opens);
            // The word the door gave is kept true by every join: what
            // the pairing screen shows next time hangs on it.
            const role = owner ? 'owner' : opens ? 'member' : 'guest';
            setCfg((prev) => (prev && prev.serverRole !== role
              ? saveCfg({ ...prev, serverRole: role })
              : prev));
            // Finding them connected, whatever they had done before no
            // longer counts.
            if (present) {
              setPeerDetached(false);
              sayHello();
            }
            // The relay is configured by the server: nothing is typed
            // on the phones. The same goes for a STUN of the house, if
            // the operator names one - it comes before the hardcoded
            // public fallback.
            serverTurnRef.current = [stun, turn].filter(Boolean) as any[];
            sessionRef.current?.setServerIceServers(serverTurnRef.current);
            // If we had been left without a server, any offer that went
            // out meanwhile was lost: we start from scratch.
            const afterOutage = signalingWasDown.current;
            signalingWasDown.current = false;
            // Only a real change of network makes looking for a direct
            // road worthwhile: it is the one moment when one that was
            // not there before may have appeared.
            if (afterOutage) relayRetried.current = false;
            // The role CANNOT depend on who comes in first: the
            // connection reattaches at every change of network, and
            // whoever was "first" can find themselves second. Two
            // unlucky reconnections were enough for both to think
            // themselves the offering side, and for the offers to
            // collide.
            //
            // The side of the pairing, on the other hand, is fixed for
            // good and is by construction different on the two phones.
            politeRef.current = pair.side === 'A';
            peerActiveRef.current = peerActive;
            setPeerPresent(present);
            if (n) noteName(n);
            if (peerActive && inChannelRef.current) {
              if (afterOutage) resumeAfterOutage(); else attachPeer();
            }
          },

          onPeerJoined: (n, mode) => {
            Journal.mark(`peer-back:${mode === 'active' ? 'channel' : 'waiting'}`)
              .catch(() => { /* noop */ });
            setPeerPresent(true);
            setPeerDetached(false);
            noteName(n);
            sayHello();
            // They are back: the wait that was about to forget them is off.
            stopWaiting();
            peerActiveRef.current = mode === 'active';
            if (mode === 'active' && inChannelRef.current) attachPeer(true);
          },

          onPeerLeft: (why) => {
            // Into the journal, because it is the question one asks
            // afterwards: "they disappeared - did they close it or did
            // they drop?". The notification says it on the spot to
            // whoever is watching; this line says it to whoever reads
            // tomorrow with a cable, and it sits on the phone over
            // here, so it can be read without waiting for any exchange.
            Journal.mark(`peer-gone:${why}`).catch(() => { /* noop */ });
            setPeerPresent(false);
            setPeerSeen(false);
            setPeerDetached(why === 'bye');
            peerActiveRef.current = false;
            sessionRef.current?.detachPeer();
            // If they said goodbye they really left; if they dropped,
            // their seat is kept for a few seconds, which is how long a
            // change of network takes.
            forgetPeer(why === 'bye');
            setConnState('new');
          },

          /**
           * The answer to "are they still there?".
           *
           * Usually it confirms what was already known. When it does
           * not - they turn out to be in the channel and we had not
           * noticed - it means an announcement was lost, and this is
           * the chance to catch up instead of sitting in front of a
           * waiting screen while they wait for us.
           */
          onPresence: ({ peerPresent: present, peerActive, peerName: n }) => {
            // The server has answered: whatever doubt we had about the
            // socket, it is alive. It goes for the probe after a change
            // of network, for the heartbeat's own, and for the
            // emergency lane's, which reads the time below.
            watchdog.current?.noteAnswer();
            lastPresenceAt.current = Date.now();
            setPeerPresent(present);
            if (present) {
              setPeerDetached(false);
              sayHello();
            }
            if (n) noteName(n);
            peerActiveRef.current = peerActive;
            if (peerActive) {
              stopWaiting();
              setStatus('together');
              if (inChannelRef.current) attachPeer();
            }
          },

          onPeerMode: (mode, n) => {
            if (n) noteName(n);
            peerActiveRef.current = mode === 'active';
            if (mode === 'active') {
              stopWaiting();
              if (inChannelRef.current) attachPeer();
            } else {
              sessionRef.current?.detachPeer();
              // A deliberate exit: they pressed Leave and went back to waiting.
              forgetPeer(true);
              setConnState('new');
            }
          },

          onNotify: (reason, n) => {
            Journal.mark(reason === 'knock' ? 'peer-knocks' : 'peer-enters').catch(() => {});
            noteName(n);
            setKnockPending(false);
            // The name is optional: without one we avoid writing
            // "Someone".
            const who = n;
            const hasName = isRealName(n);
            // With several connections set up, "somebody is calling
            // you" is not enough: only one of the two or three you know
            // is calling, and knowing which is half the information.
            // With a single connection the name stays empty, since
            // there is nothing to tell apart.
            const title = alertNameRef.current;

            if (reason === 'knock') {
              // An explicit call always goes through, even with the app
              // open: whoever knocks does it precisely because the
              // other one is not answering, and the phone may be lying
              // lit on a table with nobody in front of it.
              Foreground.notify(
                title,
                hasName ? t('alert.callingYouFrom', { who }) : t('alert.callingYou'),
              ).catch(() => {});
              // The vibration is no longer done here: it lives in the
              // notification channel, together with the sound, because
              // that is where they can be adjusted - and because
              // vibrating ourselves as well, with the channel's
              // vibration on, would be felt twice.
              return;
            }

            // Their arrival, on the other hand, is plain to see in the
            // foreground: notifying it would be noise.
            if (appStateRef.current !== 'active') {
              Foreground.notify(
                title,
                hasName ? t('alert.joinedNamed', { who }) : t('alert.joined'),
              ).catch(() => {});
            }
          },

          onSignal: async (msg) => {
            /**
             * First what has nothing to do with the connection.
             *
             * Below there is a session to hand the message to, and
             * without one there is nothing to do - one is not in the
             * channel. But four of these messages have never needed it:
             * a journal to file away, a death to tell, a sound to play,
             * a window taken apart. Sitting after that guard, they were
             * dropped in silence at exactly the moment they matter -
             * with the other person merely waiting, which is where a
             * sound is sent to get somebody up from their chair.
             */
            // Which Duetto they have: it arrives as soon as you find
            // each other, waiting or not.
            if (msg.kind === 'hello') {
              setPeerState((prev) => ({
                ...prev,
                version: msg.version,
                build: msg.build,
              }));
              return;
            }

            // "I did not leave, the app was closed on me."
            if (msg.kind === 'tornDown') {
              setPeerTornDown(true);
              Journal.mark('peer-torn-down').catch(() => {});
              return;
            }

            // They died and are back now: say it, without sounding
            // anything. It is news, not a call.
            if (msg.kind === 'death') {
              // This story already contains the return: the generic
              // announcement is no longer needed.
              forgetReturn();
              const story = deathStory(
                Number(msg.when), String(msg.cause), shownNameRef.current,
                Number(msg.back) || 0,
              );
              Foreground.note(alertNameRef.current, story).catch(() => {});
              setNotice(story);
              Journal.mark(`peer-death:${msg.cause}`).catch(() => {});
              return;
            }

            // A sound to wake us: this phone plays it, loud, from the
            // alarm volume. It can only come from the one person this
            // phone is paired with, in the channel or waiting.
            if (msg.kind === 'alarm') {
              Alarm.play(String(msg.sound ?? '')).catch(() => {});
              Journal.mark(`alarm:${msg.sound}`).catch(() => {});
              // Outside the channel it also says who it is: a rooster
              // going off on a phone lying on a table, with nothing on
              // the screen, is a riddle. It is the same case as a call
              // - somebody wants you - and it gets the same words.
              if (!inChannelRef.current) {
                const who = shownNameRef.current;
                Foreground.notify(
                  alertNameRef.current,
                  isRealName(who)
                    ? t('alert.callingYouFrom', { who })
                    : t('alert.callingYou'),
                ).catch(() => { /* noop */ });
              }
              return;
            }

            // The other phone's journal of what it consumed, which ends
            // up in a file beside ours: so that connecting ONE phone
            // gives you both. It travels in the encrypted envelope like
            // everything else: the server forwards it without being able
            // to read it.
            if (msg.kind === 'journal') {
              Journal.appendOther(String(msg.text ?? ''), journalKeyRef.current)
                .catch(() => {});
              return;
            }

            const sess = sessionRef.current;
            if (!sess) return;
            // They have been left without a connection and ask us to
            // make the offer again: it is up to us, the offering side.
            if (msg.kind === 'renegotiate') {
              if (!politeRef.current && inChannelRef.current) attachPeer(true);
              return;
            }
            // They changed the quality: it holds for both, so that one
            // does not end up with two different settings without
            // knowing which of them is on screen. It is not sent back:
            // that would bounce for ever.
            if (msg.kind === 'quality') {
              applyQuality(msg.value as DuoConfig['videoQuality'], false);
              return;
            }
            // Like the resolution: it holds for both, and whoever
            // receives it does not send it back.
            if (msg.kind === 'audio') {
              applyAudio(msg.richer, false);
              return;
            }
            // If they rebuilt before us, their offer arrives when we
            // still have nothing to receive it with and would be thrown
            // away: first we get ready, then we deal with it.
            if (!sess.hasPeer() && inChannelRef.current && peerActiveRef.current) {
              try { await sess.attachPeer(politeRef.current); } catch { /* noop */ }
            }
            sess.onSignal(msg);
          },

          onKnockResult: (ok, error) => {
            if (ok) {
              // Only a confirmation on screen: the button stays
              // pressable, because insisting is exactly what one wants
              // to do when the first call got no answer.
              setKnockPending(true);
              setTimeout(() => setKnockPending(false), 2000);
            }
            // No little window when the server answers "not there":
            // the button is already dim and unpressable when their
            // phone is not connected, so either you never got here, or
            // they have just dropped - and for that there is already
            // the line saying how they are, without stopping whatever
            // one was doing.
          },

          // The other side broke this pair: it cannot work any more,
          // and the screen must stop saying "waiting" for somebody who
          // is not coming.
          onPairBroken: (room) => {
            // The room named, when it is: one may be told of a pair
            // other than the one in use, from another room.
            const id = room || cfgRef.current?.pair?.id;
            const pair = cfgRef.current?.pairs.find((p) => p.id === id);
            if (!id || !pair || pair.brokenByPeer) return;
            Journal.mark(`pair-broken:${pair.peerName || id.slice(0, 8)}`).catch(() => { /* noop */ });
            setCfg((prev) => (prev ? saveCfg(markPairBroken(prev, id)) : prev));
          },
          // Taken off the list by the owner: what this phone is here
          // has changed, and the buttons hang on it. Out of the channel
          // and to the welcome, which knocks and finds out.
          onRemoved: () => {
            Journal.mark('removed-from-server').catch(() => { /* noop */ });
            const server = displayServer(cfgRef.current?.serverUrl || '');
            setCfg((prev) => (prev ? saveCfg({ ...prev, serverRole: 'stranger' }) : prev));
            leaveChannelRef.current?.();
            setScreen('welcome');
            Alert.alert(t('errors.removed'), t('errors.removedBody', { server }));
          },
          onPeople: (list, waiting) => {
            setPeople(list);
            setInvitations(waiting);
            // Rooms of ours the server still keeps and this phone no
            // longer has a pair for: broken here, never told there. The
            // list that comes back after has them gone.
            const me = list.find((p) => p.you);
            const pairs = cfgRef.current?.pairs ?? [];
            for (const r of me?.theirs ?? []) {
              if (r.room && !pairs.some((p) => p.id === r.room) && !forgottenRooms.current.has(r.room)) {
                forgottenRooms.current.add(r.room);
                sig.forgetRoom(r.room);
              }
            }
          },
          onInvited: (name, code) => {
            // The list follows on its own: the server sends it right
            // after, with this invitation already in it.
            setFreshInvite({ name, code });
          },

          onError: (code, reason) => {
            if (code === 'room-full' || code === 'replaced') {
              // Nearly always transient: the previous connection has
              // not been declared dead yet, or the phone reattached
              // somewhere else. The automatic reattachment takes care
              // of it: a notice here would be pure alarmism.
            }
            else if (code === 'decrypt-failed') {
              Alert.alert(t('errors.differentKeys'), t('errors.differentKeysBody'));
            }
            // The server does not know us: it is not a fault of the
            // pair, and trying again would change nothing until
            // somebody writes the key down.
            else if (code === 'not-allowed') {
              // The server says why, when it can: a stranger is not
              // somebody with the wrong key, and an invitation that did
              // not work is not a missing one.
              if (reason === 'stranger') {
                // And the word is kept true: the buttons hang on it.
                setCfg((prev) => (prev && prev.serverRole !== 'stranger'
                  ? saveCfg({ ...prev, serverRole: 'stranger' }) : prev));
                Alert.alert(t('errors.stranger'), t('errors.strangerBody'));
              } else if (reason === 'bad-invite') {
                Alert.alert(t('errors.badInvite'), t('errors.badInviteBody'));
              } else {
                Alert.alert(t('errors.notAllowed'), t('errors.notAllowedBody'));
              }
            }
          },
        },
      );

      signalingRef.current = sig;
      // From here on the connection is ours: the listening without an
      // interface must know, or it would open a second one that would
      // push this one out.
      interfaceInCharge(true);
      sig.connect();

      // Automatic entry. setMode updates the declared state even
      // before the WebSocket is open, and the join that follows carries
      // it already right: there is no need to wait for the connection.
      if (!cancelled) await enterChannel();
    })();

    return () => {
      cancelled = true;
      sessionRef.current?.leaveChannel();
      sessionRef.current = null;
      // We say goodbye only if we are really leaving, that is if
      // somebody chose to become unavailable or broke up the pair.
      // All the other teardowns are hand-overs, and the other person
      // must not read "they went offline" for a connection that is
      // being remade.
      interfaceInCharge(false);
      const goodbye = sayGoodbye.current;
      sayGoodbye.current = false;
      signalingRef.current?.close(goodbye);
      signalingRef.current = null;
      /**
       * The service stops ONLY if we are really leaving.
       *
       * It used to stop at every teardown, and that includes the case
       * where the user swipes the app out of the recents: there React
       * Native tears everything down, this line switched the service
       * off, and from that moment the process was an empty shell
       * waiting to be recycled. It shows plainly in the journal -
       * "exit", and a quarter of an hour later the death - and it was
       * the fault that remained after removing the shortcut from the
       * recents inside the service itself: there were two shortcuts,
       * and I had removed only one.
       */
      if (stopService.current) {
        stopService.current = false;
        Foreground.stop().catch(() => {});
      } else if (inChannelRef.current) {
        // Torn down while still in the channel (a change of pair): the
        // service stays for the next connection, the wake lock does not.
        Foreground.setInChannel(false).catch(() => {});
      }
      closeLane('torn-down');
      try { InCallManager.stop(); } catch { /* noop */ }
      Audio.useCallVolumeKeys(false).catch(() => {});
    };
    // attachPeer is stable: it only uses refs. `cfg` is read from the
    // closure but is not a dependency: only connKey must redo it all.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connKey, available]);

  const absenceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopWaiting = useCallback(() => {
    if (absenceTimer.current) {
      clearTimeout(absenceTimer.current);
      absenceTimer.current = null;
    }
  }, []);

  /**
   * They are gone: their microphone and camera are nobody's any more.
   *
   * As long as that state stays on, the big place keeps waiting for a
   * video that will not come: that is what kept one's own video small
   * after the other person had left.
   *
   * @param now true if they left, false if the network dropped
   */
  const forgetPeer = useCallback((now: boolean) => {
    stopWaiting();
    const clear = () => {
      setPeerState({ audio: true, video: false });
      // "I have seen them" as well: without it, it stayed true while
      // their state was empty, and since an old Duetto is recognised
      // precisely by not declaring its version, once out of the channel
      // they were credited with an old version they never had.
      setPeerSeen(false);
    };
    if (now) { clear(); return; }
    absenceTimer.current = setTimeout(() => {
      absenceTimer.current = null;
      clear();
    }, RETURN_WAIT_MS);
  }, [stopWaiting]);

  useEffect(() => stopWaiting, [stopWaiting]);

  /**
   * Makes sure a live direct connection exists, when we are both in the
   * channel.
   *
   * `force` is for when they have just reconnected: their connection is
   * new by definition, so ours has to be remade anyway, even if from
   * our side it still looked good.
   *
   * Without this, after a network outage a dead connection stayed up
   * and nothing was seen any more until the app was closed: the code
   * found a connection already there and did nothing.
   */
  const attachPeer = useCallback(async (force = false) => {
    const sig = signalingRef.current;
    const s = sessionRef.current;
    if (!sig || !s) return;
    if (force || !s.isPeerHealthy()) s.detachPeer();

    // The answering side rebuilds nothing on its own initiative: it
    // waits for the offer, which will bring the connection to life at
    // the right moment (see onSignal). Rebuilding at once would mean
    // demolishing, an instant later, precisely the one the incoming
    // offer is creating: that is how three rebuilds in two seconds were
    // born.
    if (politeRef.current) return;

    try {
      await s.attachPeer(politeRef.current);
      s.broadcastState();
    } catch (e: any) {
      // The microphone is opened in here now too, and it can be denied
      // (permission revoked while the app was open). It used to be an
      // impossible error that could be ignored: now, if we keep quiet,
      // the other person comes in and nothing connects, with nothing to
      // explain it.
      rtcLog('attachPeer failed:', String(e?.message ?? e));
      // Only if the microphone was the one missing. The other failures
      // of attachPeer happen during reconnections and sort themselves
      // out: a notice at every attempt would be noise, and would cover
      // this one.
      if (!s.hasMic()) Alert.alert(t('errors.micError'), String(e?.message ?? e));
    }
  }, []);

  /**
   * The network is back: ICE is restarted, everything is not rebuilt.
   *
   * Rebuilding destroys the other person's track, and with it the
   * surface that was drawing it: hence the black screen at every change
   * of network. Restarting ICE, instead, leaves decoder and surface
   * standing and the picture holds still on the last frame until the
   * packets resume - which is what the other apps are seen to do.
   *
   * The rebuild stays as a safety net: if after six seconds we are not
   * connected, it is demolished and made again. It used to be the main
   * road, because an offer sent while the server was unreachable is
   * lost; but here the server has just come back, and the offer leaves
   * now.
   */
  const resumeAfterOutage = useCallback(() => {
    const s = sessionRef.current;
    if (!s || !s.hasPeer()) { attachPeer(true); return; }

    rtcLog('network back: restarting ICE without rebuilding');
    if (politeRef.current) signalingRef.current?.sendSignal({ kind: 'renegotiate' });
    else s.restartIce();

    clearRecovery();
    recoveryBegunAt.current = Date.now();
    hardTimer.current = setTimeout(() => {
      if (connStateRef.current === 'connected') return;
      if (!inChannelRef.current || !peerActiveRef.current) return;
      rtcLog('the restart was not enough: rebuilding');
      attachPeer(true);
    }, 6000);
  }, [attachPeer, clearRecovery]);

  // --- coming into the channel and going out ------------------------------
  const enterChannel = useCallback(async () => {
    const sig = signalingRef.current;
    if (!sig || !cfg) return;

    if (!sessionRef.current) {
      sessionRef.current = new ChannelSession(cfg, sig, {
        onLocalStream: (st) => {
          setLocalStream(st);
          // The proportions are read again at every change of our own
          // picture, not only when the video is switched on: changing
          // profile reopens the camera inside the session, without
          // coming through here, and the little square kept the old
          // shape.
          setLocalAspect(sessionRef.current?.getLocalVideoAspect());
        },
        onRemoteStream: setRemoteStream,
        onConnectionState: (st) => {
          setConnState(st);
          connStateRef.current = st;

          if (st === 'connected') {
            clearRecovery();
            // The death undid itself: the waiting cure is called off,
            // and the nets' memories of sickness are wiped - "sick
            // twice in a row" must mean twice in the SAME illness, or
            // the beat's slow pace aliases across two separate deaths
            // and hands out medicine at the second one's first breath.
            if (failedTimer.current) {
              clearTimeout(failedTimer.current);
              failedTimer.current = null;
            }
            beatSickTwice.current = false;
            netSickTicks.current = 0;
            return;
          }
          if (st !== 'failed' && st !== 'disconnected') return;

          // The emergency lane's own clock: mid-conversation a minute
          // of silence was not agreed to by anybody. See `laneOpen`.
          maybeOpenLane();

          /**
           * Medicine only for a death that stays dead.
           *
           * On this class of network the pair rises again by itself
           * within a couple of seconds, almost every time: the timer
           * waits the death out, and if the link is back before it
           * fires, nobody is ever told. Only the death that stays dead
           * gets the ordinary medicine, with the hard rebuild as its
           * net. (The gears that used to shift here are gone: see the
           * note at the timer.)
           */
          if (st === 'failed' && inChannelRef.current && peerActiveRef.current
              && !failedTimer.current) {
            failedTimer.current = setTimeout(() => {
              failedTimer.current = null;
              if (connStateRef.current === 'connected') return;
              if (!inChannelRef.current || !peerActiveRef.current) return;
              const s0 = sessionRef.current;
              const sig0 = signalingRef.current;
              if (!s0 || !sig0) return;
              recoveryBegunAt.current = Date.now();
              if (politeRef.current) sig0.sendSignal({ kind: 'renegotiate' });
              else s0.restartIce();
              hardTimer.current = setTimeout(() => {
                if (connStateRef.current === 'connected') return;
                if (inChannelRef.current && peerActiveRef.current) attachPeer(true);
              }, 8000);
            }, FAILED_PATIENCE_MS);
          }

          // On `failed`, the timer above is the ONE clock. The ladder
          // below fired its own copy at the very same patient hour,
          // and the two negotiations tripped on each other - a chain
          // of rebuilds, one phone and then the other.
          if (st === 'failed') return;

          // ICE often recovers by itself: demolishing at once cut
          // audio and video precisely while things were sorting
          // themselves out. We wait, we try the light repair, and only
          // if that is not enough do we rebuild.
          clearRecovery();
          recoveryBegunAt.current = Date.now();
          softTimer.current = setTimeout(async () => {
            if (connStateRef.current === 'connected') return;
            if (signalingWasDown.current) return;
            if (!inChannelRef.current || !peerActiveRef.current) return;

            if (politeRef.current) {
              // We cannot offer: we ask the other side to.
              signalingRef.current?.sendSignal({ kind: 'renegotiate' });
            } else {
              await sessionRef.current?.restartIce();
            }

            hardTimer.current = setTimeout(() => {
              if (connStateRef.current === 'connected') return;
              if (signalingWasDown.current) return;
              if (inChannelRef.current && peerActiveRef.current) attachPeer(true);
            }, 8000);
            // Only `disconnected` comes this way now - `failed` is the
            // gear timer's alone - and a wobble deserves the longer
            // wait it always had.
          }, 12000);
        },
        onVideoStats: setVideoStats,
        onPeerState: (st) => {
          setPeerSeen(true);
          // Only the changes: the state arrives even when nothing has
          // changed, and a line for every message would be a journal
          // that tells of silence.
          const before = peerStateRef.current;
          if (before.audio !== st.audio) {
            Journal.mark(`peer-audio:${st.audio ? 'on' : 'off'}`).catch(() => {});
          }
          if (before.video !== st.video) {
            Journal.mark(`peer-video:${st.video ? 'on' : 'off'}`).catch(() => {});
          }
          if (st.camera && before.camera !== st.camera) {
            Journal.mark(`peer-camera:${st.camera}`).catch(() => {});
          }
          if (st.output && before.output !== st.output) {
            Journal.mark(`peer-audio-output:${st.output}`).catch(() => {});
          }
          if ((before.busy === true) !== (st.busy === true)) {
            Journal.mark(`peer-busy:${st.busy ? 'on' : 'off'}`).catch(() => {});
          }
          peerStateRef.current = {
            audio: st.audio, video: st.video, camera: st.camera, output: st.output,
            busy: st.busy,
          };
          // If they send us their state they are back, whatever the
          // countdown was saying: without stopping it, a moment later
          // it would clear a state that has only just arrived.
          stopWaiting();
          setPeerState(st);
          setPeerVp9(st.hwVp9 === true);
        },
        onRemoteVideo: (present) => {
          setRemoteHasVideo(present);
          // Only when the video COMES BACK after having been missing.
          //
          // Recreating the view keeps us from hanging on to a dead
          // surface, which would stay black. But doing it at every
          // confirmation of "video present" - and one arrives at every
          // change of resolution, when the encoder steps down or back
          // up - destroyed and rebuilt the picture continuously: a
          // flash that looks like a reconnection, and is not.
          if (present && !hadRemoteVideo.current) {
            setRemoteVideoKey((k) => k + 1);
          }
          hadRemoteVideo.current = present;
        },
      });
    }
    sessionRef.current.setServerIceServers(serverTurnRef.current);
    // The microphone is not opened here: the session opens it when the
    // other person really arrives. Whoever comes in first may wait a
    // long time, and during that wait there is nothing to send.
    setAudioOn(sessionRef.current.isAudioEnabled());

    try {
      InCallManager.start({ media: 'audio' });
    } catch { /* noop */ }
    // From here on the CPU must not doze: the service holds the wake
    // lock only while one is really in the channel.
    Foreground.setInChannel(true).catch(() => { /* noop */ });
    // On switching the audio back on, InCallManager takes the output
    // back to the default one: this pair's choice has to be put back
    // now, not before.
    reapplyRouteRef.current?.();

    // The volume keys have to be claimed by hand: without that, on
    // some phones they adjust the media volume and have no effect on
    // the other person's voice.
    Audio.useCallVolumeKeys(true).catch(() => {});

    setInChannel(true);
    inChannelRef.current = true;
    setScreen('channel');
    sig.setMode('active');

    if (peerActiveRef.current) attachPeer();

    /**
     * Coming back in right after going out: things resume as they were.
     *
     * The microphone is put back here; the camera a moment later,
     * because switching it on needs the permission and the service with
     * the right type, and at this instant the session is still taking
     * its place.
     */
    const mine = cfg.pair?.id;
    // The drawers are read from disk at start-up, and the entry into
    // the channel is automatic: the two raced, and on a quick phone the
    // entry could win and find nothing. Not before the reading is done.
    await howItWasLoading.current;
    const before = mine ? howItWas.current[mine] : undefined;
    if (before) {
      const still = Date.now() - before.when;
      // The microphone: as it was left, however long ago. The clock
      // below judges only the camera.
      if (!before.audio) {
        Journal.mark(`resume-mic:after ${Math.round(still / 1000)}s`)
          .catch(() => { /* noop */ });
        const on = sessionRef.current?.toggleAudio();
        if (on !== undefined) setAudioOn(on);
      }
      // The camera's minute is for whoever left and came back: a live
      // drawer - written at a touch, left behind by an app that was
      // killed - says how the channel WAS, and the time since the last
      // touch says nothing.
      if (before.video && (before.live || still < RESUME_VIDEO_MS)) {
        Journal.mark(`resume-video:after ${Math.round(still / 1000)}s`)
          .catch(() => { /* noop */ });
        setTimeout(() => { turnVideoBackOnRef.current?.(); }, 300);
      }
      // The drawer used to be emptied here, and filled again only at
      // the next touch of a button: two updates in a row with nothing
      // touched in between, and the second one found it empty - the
      // mute survived the first and died at the second. Written again
      // now, with how things stand after the restoring.
      noteHowItIsRef.current?.();
    }
  }, [cfg, attachPeer, stopWaiting]);

  useEffect(() => { enterChannelRef.current = enterChannel; }, [enterChannel]);
  useEffect(() => { attachPeerRef.current = attachPeer; }, [attachPeer]);

  /**
   * Switching the camera back on after an immediate return.
   *
   * It lives in a reference because whoever calls it - the entry into
   * the channel - is born before the function that turns the video on.
   */
  const turnVideoBackOnRef = useRef<(() => void) | null>(null);
  /** Writes down how the channel stands: see noteHowItIs. */
  const noteHowItIsRef = useRef<(() => void) | null>(null);

  /**
   * How long we wait at most before leaving anyway.
   *
   * With the network slow or absent, the journal does not go: "wait a
   * moment" must never become "the app will not leave".
   */
  const LEAVING_CAP_MS = 2000;
  /**
   * A breath between the send and the closing of the socket.
   *
   * Sending a message and closing in the same instant risks closing
   * before it has really left: what is gained by writing it would be
   * lost by not posting it.
   */
  const BREATH_MS = 250;

  /**
   * How the conversation stood when it was put away, one drawer per
   * connection.
   *
   * Leaving and coming straight back is nearly always not a choice: it
   * is a wrong touch, or the phone closing the app. And even when it is
   * a choice - I put it down a moment, I am back - finding the video
   * off and having to switch it on by hand is a nuisance. Things resume
   * as they were, the microphone for good and the camera within its minute:
   * see RESUME_VIDEO_MS.
   *
   * With a name on each drawer, because moving to another connection is
   * a way of leaving too, and there whoever goes out and whoever comes
   * in are two different people: with a single drawer, going from Anna
   * to Bruno you would find Bruno's microphone off because you had
   * switched it off with Anna - and going Anna, Bruno, Anna the memory
   * of Anna would have been overwritten on the way past.
   */
  /**
   * `live` says how the drawer was filled.
   *
   * Leaving or switching connection fills it and the app goes on
   * living, so the time that has passed is what decides whether to
   * restore: coming back after an hour, the microphone is not put back
   * on mute by surprise.
   *
   * An app that is killed - an update, or the phone closing it - fills
   * nothing: the drawer left behind is the one written at the last
   * touch of the buttons, and there the time says nothing, because
   * nobody went anywhere. What it says is "this is how the channel was
   * when the app disappeared", and that is worth restoring whenever it
   * comes back.
   */
  type HowItWas = { when: number; video: boolean; audio: boolean; live?: boolean };
  const howItWas = useRef<Record<string, HowItWas>>({});

  /**
   * How the channel stands right now, written down at every touch.
   *
   * Without this the update lost the mute: putting the channel away is
   * what fills the drawer, and an app that is killed does not put
   * anything away - it is simply not there any more.
   */
  const noteHowItIs = useCallback((pairId: string | undefined) => {
    if (!pairId) return;
    howItWas.current[pairId] = {
      when: Date.now(),
      video: sessionRef.current?.isVideoEnabled() === true,
      audio: sessionRef.current?.isAudioEnabled() !== false,
      live: true,
    };
    saveHowItWasRef.current?.();
  }, []);
  // By way of a reference, because the video button is born before this
  // function and could not name it.
  const noteHowItIsPair = useRef<string | undefined>(undefined);
  useEffect(() => { noteHowItIsPair.current = cfg?.pair?.id; }, [cfg?.pair?.id]);
  noteHowItIsRef.current = () => noteHowItIs(noteHowItIsPair.current);

  /** Puts the drawers away, without anybody waiting for it. */
  const saveHowItWas = useCallback(() => {
    AsyncStorage.setItem(HOW_IT_WAS_KEY, JSON.stringify(howItWas.current))
      .catch(() => { /* a lost drawer costs one switch by hand */ });
  }, []);
  const saveHowItWasRef = useRef<(() => void) | null>(null);
  saveHowItWasRef.current = saveHowItWas;

  /**
   * And takes them out again at start-up, throwing away the old ones.
   *
   * Older than the longest of the two waits, a drawer can no longer be
   * used by anybody: keeping it would only mean carrying it around for
   * ever.
   */
  /** the reading of the drawers, for whoever must not get there first */
  const howItWasLoading = useRef<Promise<void>>(Promise.resolve());
  useEffect(() => {
    howItWasLoading.current = (async () => {
      try {
        const raw = await AsyncStorage.getItem(HOW_IT_WAS_KEY);
        if (!raw) return;
        const stored = JSON.parse(raw) as Record<string, HowItWas>;
        const fresh: Record<string, HowItWas> = {};
        for (const [id, was] of Object.entries(stored)) {
          // Nothing expires here any more: the microphone is restored
          // however long ago it was left, and the camera judges its own
          // minute at the moment of use.
          if (was) fresh[id] = was;
        }
        howItWas.current = fresh;
      } catch { /* nothing to take out */ }
    })();
  }, []);

  /**
   * Putting the channel away: what leaving and switching have in
   * common.
   *
   * They are the same act - the channel is let go, the session comes
   * down, one goes elsewhere - so the same three things are done, in
   * the same order: the line in the journal, the memory of how it was,
   * and the last exchange of journals while the connection is still
   * open. Leaving first, the story of what one had just done stayed on
   * this phone - and if the app died in the meantime, nobody read it
   * any more.
   *
   * What the two do NOT share stays with the callers: leaving hides the
   * app's window, switching does not.
   */
  const putAwayChannel = useCallback(async (reason: string, pairId?: string) => {
    // The line is written BEFORE sending, otherwise everything goes
    // except the very thing one is doing.
    await Journal.mark(reason).catch(() => { /* noop */ });

    if (pairId) {
      howItWas.current[pairId] = {
        when: Date.now(),
        video: sessionRef.current?.isVideoEnabled() === true,
        audio: sessionRef.current?.isAudioEnabled() !== false,
        live: false,
      };
      saveHowItWas();
    }

    setLeaving(true);
    try {
      const wait = (ms: number) => new Promise<void>((r) => { setTimeout(r, ms); });
      await Promise.race([
        (async () => {
          await sendJournal();
          await wait(BREATH_MS);
        })(),
        wait(LEAVING_CAP_MS),
      ]);
    } finally {
      setLeaving(false);
    }
  }, [sendJournal]);

  /** Leaving the channel, after putting the journal in a safe place. */
  const leaveChannel = useCallback(async (stayAvailable = true) => {
    await putAwayChannel(
      stayAvailable ? 'left-channel' : 'unavailable', cfg?.pair?.id,
    );

    const sig = signalingRef.current;
    sessionRef.current?.leaveChannel();
    sessionRef.current = null;
    try { InCallManager.stop(); } catch { /* noop */ }
    Audio.useCallVolumeKeys(false).catch(() => {});
    Foreground.setCameraActive(false).catch(() => {});
    // Waiting again: the wake lock goes, the watchdog alarm remains -
    // and the emergency lane, which belongs to the conversation, goes
    // with it.
    closeLane('left-channel');
    Foreground.setInChannel(false).catch(() => {});
    setLocalStream(null);
    setRemoteStream(null);
    setRemoteHasVideo(false);
    setVideoOn(false);
    setLocalAspect(undefined);
    setConnState('new');
    setInChannel(false);
    inChannelRef.current = false;
    sig?.setMode('listening');
    // Detaching is not something to do by hand here: it is enough to
    // declare ourselves unavailable, and the connection effect tears
    // everything down by itself - session, signalling, foreground
    // service - as it does at every change of pair.
    if (!stayAvailable) {
      sayGoodbye.current = true;
      // Here the presence really does end: nobody is left to reach.
      // The native side is told as well: the choice used to live in the
      // interface's memory alone, and a reboot made the phone reachable
      // again against an explicit request.
      stopService.current = true;
      setAvailable(false);
      Foreground.setAvailable(false).catch(() => {});
    }

    // Leaving the channel is leaving the app: the window disappears.
    // The process stays alive, though, so that you remain reachable and
    // get the notification when the other person comes in. Opening the
    // app again brings you straight back into the channel.
    AppWindow.minimize().catch(() => {});
  }, [putAwayChannel, cfg?.pair?.id]);

  /**
   * A safety net against the connection that does not come back.
   *
   * The answering side cannot offer: if it is left without a
   * connection and the other one does not notice - because from over
   * there everything looks fine - it would wait for ever. Every few
   * seconds, whoever finds themselves without a connection while both
   * are in the channel deals with it: the offering side rebuilds, the
   * answering side asks for it.
   */
  useEffect(() => {
    if (screen !== 'channel') return;
    let refresh = 0;
    const timer = setInterval(() => {
      /**
       * The drawer is kept fresh while one is in the channel.
       *
       * It used to be written only when a button was touched, so its
       * clock said "last touch", not "last seen alive": an update that
       * killed the app minutes after the touch read as an interruption
       * of minutes, and a camera put back on after seconds found its
       * minute already spent. Refreshed every few ticks, the clock
       * measures the interruption itself.
       */
      refresh += 1;
      if (inChannelRef.current && refresh % 3 === 0) noteHowItIsRef.current?.();
      const sess = sessionRef.current;
      const sig = signalingRef.current;
      if (!sess || !sig?.connected) return;
      if (!inChannelRef.current || !peerActiveRef.current) return;
      // Sick, or stalled: a connection whose negotiation met silence
      // stays NEW for ever, which this net used to read as health.
      if (sess.isPeerHealthy() && !sess.isStalled()) {
        netSickTicks.current = 0;
        return;
      }
      // A plain `failed` belongs to the gear timer, which owns the one
      // patient clock for deaths: this net racing it just moved the
      // medicine's hour around at random. What is left to this net is
      // its original prey - the sickness no state ever declares: the
      // stalled, and the healthy-looking that carry nothing.
      if (connStateRef.current === 'failed') return;
      // Patience: it rises again by itself within a couple of seconds
      // almost every time, and this net used to demolish the very pair
      // that was stitching itself back together. Two sick rounds in a
      // row are a real sickness.
      netSickTicks.current += 1;
      if (netSickTicks.current < 2) return;
      netSickTicks.current = 0;

      // Noted for the heartbeat's sake: its medicine and this one are
      // the same, and they must not demolish on each other's toes.
      recoveryBegunAt.current = Date.now();
      if (politeRef.current) sig.sendSignal({ kind: 'renegotiate' });
      else attachPeer(true);
    }, 5000);
    return () => clearInterval(timer);
  }, [screen, attachPeer]);

  // --- the Back key: Picture-in-Picture ------------------------------------
  const pipSupported = useRef(false);
  useEffect(() => {
    Pip.isSupported().then((v) => { pipSupported.current = v; }).catch(() => {});
  }, []);

  /**
   * Whether we are inside the little window right now.
   *
   * The screen used to work it out from its own width, and on a good
   * many phones React Native goes on reporting the full screen while
   * the window has shrunk: the buttons and the technical lines were
   * drawn onto a postage stamp. The activity is the only one told the
   * truth, and this is where it arrives.
   */
  const [inPip, setInPip] = useState(false);
  useEffect(() => Pip.subscribe(setInPip), []);

  const stageAspect =
    (peerState.video ? peerState.aspect : undefined) ??
    (videoOn ? localAspect : undefined) ??
    9 / 16;

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      // From the settings the Back key takes you into the channel,
      // instead of closing the app and leaving you without a way out.
      if (screen === 'settings' && cfg && isPaired(cfg)) {
        setScreen('channel');
        return true;
      }
      // From the pairing you always go back to the settings: from
      // there you come back into the channel, or change server.
      // Without this, the Back key on the "Connect the two phones"
      // screen closed the app - and whoever had got there to add a
      // connection had no way of going back where they came from.
      if (screen === 'pairing') {
        setScreen('settings');
        return true;
      }
      if (screen !== 'channel') return false;
      if (!pipSupported.current) return false;
      Pip.enter(stageAspect).catch(() => {});
      return true;
    });
    return () => sub.remove();
  }, [screen, stageAspect, cfg]);

  // Turning the phone changes the shape of our own video: it has to be
  // told again.
  useEffect(() => {
    if (screen !== 'channel') return;
    const sub = Dimensions.addEventListener('change', () => {
      const s = sessionRef.current;
      if (!s || !s.isVideoEnabled()) return;
      setLocalAspect(s.getLocalVideoAspect());
      s.broadcastState();
    });
    return () => sub.remove();
  }, [screen]);

  const onToggleVideo = useCallback(async () => {
    const s = sessionRef.current;
    if (!s) return;
    if (s.isVideoEnabled()) {
      setVideoOn(await s.disableVideo());
      setLocalAspect(undefined);
      Foreground.setCameraActive(false).catch(() => {});
      noteHowItIsRef.current?.();
      return;
    }
    if (!cameraGranted.current) {
      const res = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CAMERA);
      cameraGranted.current = res === 'granted';
      if (!cameraGranted.current) {
        Alert.alert(t('errors.permissionDenied'), t('errors.noCamera'));
        return;
      }
    }
    await Foreground.setCameraActive(true).catch(() => {});
    try {
      setVideoOn(await s.enableVideo());
      setLocalAspect(s.getLocalVideoAspect());
      // The camera opens on the chosen one, which may have been
      // changed with the video off: here we only align the icon.
      setFrontCamera(s.isFrontCamera());
      noteHowItIsRef.current?.();
    } catch (e: any) {
      Foreground.setCameraActive(false).catch(() => {});
      Alert.alert(t('errors.cameraError'), String(e?.message ?? e));
    }
  }, []);

  /**
   * The immediate return switches the camera back on through here.
   *
   * By way of a reference, because the entry into the channel is born
   * before this function and could not name it.
   */
  useEffect(() => {
    turnVideoBackOnRef.current = () => {
      if (sessionRef.current?.isVideoEnabled()) return;
      onToggleVideo();
    };
  }, [onToggleVideo]);

  // --- saving --------------------------------------------------------------
  /**
   * Changes the video quality on BOTH phones.
   *
   * The profile acts on the encoder of whoever is sending, so on its
   * own it would only change what the other person sees. Keeping them
   * aligned, the choice means "how we look at each other", which is
   * what one intends; if it does not suit, the other side changes it
   * back and it is aligned again.
   */
  const applyQuality = useCallback(
    (q: DuoConfig['videoQuality'], tell: boolean) => {
      setCfg((prev) => {
        if (!prev || prev.videoQuality === q) return prev;
        return saveCfg({ ...prev, videoQuality: q });
      });
      sessionRef.current?.setVideoQuality(q);
      Journal.mark(`${tell ? '' : 'peer-'}quality:${q}`).catch(() => {});
      if (tell) signalingRef.current?.sendSignal({ kind: 'quality', value: q });
    },
    [saveCfg],
  );

  /**
   * The audio options, on both phones.
   *
   * "Richer voice" turned up on one side only improves one of the two
   * directions, and whoever turned it up hears no difference at all:
   * the audio they listen to is sent by the other person.
   */
  const applyAudio = useCallback((richer: boolean, tell: boolean) => {
    setCfg((prev) => {
      if (!prev || prev.richerAudio === richer) return prev;
      return saveCfg({ ...prev, richerAudio: richer });
    });
    sessionRef.current?.setAudioOptions(richer);
    Journal.mark(`${tell ? '' : 'peer-'}rich-voice:${richer ? 'yes' : 'no'}`)
      .catch(() => {});
    if (tell) signalingRef.current?.sendSignal({ kind: 'audio', richer });
  }, [saveCfg]);


  /**
   * What settings this connection started with.
   *
   * One line only, when we begin and at every change of connection. The
   * journal tells the actions line by line, but without knowing where
   * one starts from there is no telling what NOT changing them means:
   * if the camera stays the back one all evening, the line that
   * explains it is missing, because nobody turned it round.
   *
   * Only at a change of connection: writing it at every little
   * adjustment would repeat what the action's own line has just said.
   */
  const cfgRef = useRef<DuoConfig | null>(null);
  useEffect(() => { cfgRef.current = cfg; }, [cfg]);
  const levelRef = useRef(level);
  useEffect(() => { levelRef.current = level; }, [level]);
  // Said to the journal at every change: the periodic line carries the
  // system half already, and without the product nobody could say from
  // the file how loud it really was.
  useEffect(() => { Journal.level(Math.round(level * 100)).catch(() => {}); }, [level]);
  useEffect(() => {
    const c = cfgRef.current;
    if (!c?.pair) return;
    const bits = [
      `camera=${c.frontCamera !== false ? 'front' : 'back'}`,
      `output=${c.audioOutput}`,
      `quality=${c.videoQuality}`,
      `rich-voice=${c.richerAudio ? 'yes' : 'no'}`,
      `volume=${Math.round(levelRef.current * 100)}%`,
      `alert=${c.alertSound}`,
      `vibration=${c.alertVibration}`,
      `controls=${c.controls}`,
      `diagnostics=${c.diagnostics ? 'yes' : 'no'}`,
    ];
    Journal.mark(`settings:${bits.join(',')}`).catch(() => { /* noop */ });
  }, [cfg?.pair?.id]);

  /**
   * Diagnostics, wherever they reach.
   *
   * Four things follow this switch: the logs, which go quiet; the
   * journal's periodic sampling, which stops on the native side; the
   * pace at which the connection is measured; and the technical lines,
   * which are handed to the screen further down. The exchange of
   * journals is in the effect that sends them.
   *
   * It runs at the first reading of the settings as well, not only at a
   * change: before that the logs are silent, which is the quiet choice
   * for whoever never turns this on.
   */
  useEffect(() => {
    const on = !!cfg?.diagnostics;
    setLogging(on);
    Journal.sampling(on).catch(() => { /* noop */ });
    sessionRef.current?.setDiagnostics(on);
  }, [cfg?.diagnostics]);

  /**
   * The camera button follows the connection in use.
   *
   * Giving it to the session is not enough: the button is looked at
   * with the video off as well, and that is where it says which camera
   * will open.
   */
  useEffect(() => {
    if (cfg) setFrontCamera(cfg.frontCamera !== false);
  }, [cfg?.frontCamera, cfg?.pair?.id]);

  const resetPeerMemory = useCallback(() => {
    // The memory of how the other person was, too: this is somebody
    // else, and their first messages are not "changes" with respect to
    // the previous one.
    peerStateRef.current = {};
    // Our own buttons say what OUR session is doing, which may have
    // been put back already - the camera restored after an update
    // showed a lit picture under a dark button.
    setVideoOn(sessionRef.current?.isVideoEnabled() === true);
    setAudioOn(sessionRef.current?.isAudioEnabled() ?? true);
    setLocalStream(null);
    setLocalAspect(undefined);
    setRemoteStream(null);
    setRemoteHasVideo(false);
    setPeerState({ audio: true, video: false });
    setPeerSeen(false);
    setPeerVp9(false);
    setConnState('new');
  }, []);

  /**
   * Switches to another connection already set up.
   *
   * There is nothing to tear down by hand: changing the pair changes
   * `connKey`, and the connection effect starts again from scratch -
   * it closes the old one, opens the new one, comes back into the
   * channel. Here we only switch off what can be seen, which would
   * otherwise stay there showing the person one has just left.
   *
   * The controls go back to the state of a freshly opened connection:
   * microphone on, camera off, no pictures. The buttons used to stay as
   * you had left them with the other person, and a "video" button lit
   * over a video that is not there is not a graphical oversight: it is
   * the button telling a lie, and pressing it switches off something
   * that was never on.
   */
  const onSwitchPair = useCallback(async (id: string) => {
    if (!cfg) return;
    const next = switchToPair(cfg, id);
    if (next === cfg) return;
    // Moving is leaving: the same journal line, the same memory of how
    // it was, the same last exchange - and a goodbye, because from over
    // there you disappear by choice, not because the line dropped. The
    // service is not stopped: you stay reachable, on the other person.
    await putAwayChannel('pair-switch', cfg.pair?.id);
    sayGoodbye.current = true;
    setCfg(saveCfg(next));
    setPeerName(next.pair?.peerName || '');
    setPeerPresent(false);
    peerActiveRef.current = false;
    resetPeerMemory();
    stopWaiting();
    setScreen('channel');
  }, [cfg, stopWaiting, resetPeerMemory, putAwayChannel]);

  /**
   * The name I give a connection myself.
   *
   * It travels nowhere: the other person does not see it and will never
   * know it. It is needed here, where the connections stand in a row
   * and without a name they all look alike.
   */
  const onRenamePair = useCallback(async (id: string, name: string) => {
    if (!cfg) return;
    const next = renamePair(cfg, id, name);
    setCfg(saveCfg(next));
  }, [cfg]);

  /**
   * Sends the other person a sound to wake them.
   *
   * It does not go through the server the way the call does: it travels
   * inside the encrypted envelope of the conversation, which is already
   * there because you are both in the channel. The server does not even
   * know it happened.
   */
  const onAlarm = useCallback((sound: string) => {
    signalingRef.current?.sendSignal({ kind: 'alarm', sound });
    // It is heard on this side too: whoever sends a sound must know
    // what they sent, and hear that it really left. Here, though, it
    // comes out quietly and by way of the conversation, not the alarm:
    // at full volume it would go straight into one's own microphone and
    // come back to the other person doubled, on top of what is already
    // playing over there.
    Alarm.play(sound, true).catch(() => {});
    Journal.mark(`alarm-sent:${sound}`).catch(() => {});
  }, []);

  const onPaired = useCallback(async (pair: PairInfo) => {
    if (!cfg) return;
    setPairingCode('');
    // Moving to the new pair is leaving the one in use, exactly as a
    // switch is: the channel put away, its memory written under its
    // own name. Without this the session went on as it was - camera
    // on - into a pair that had never seen it, and the new pair opened
    // on video nobody had asked for.
    if (isPaired(cfg)) {
      await putAwayChannel('paired', cfg.pair?.id);
      sayGoodbye.current = true;
    }
    // It does not replace the previous connection: it stands beside it,
    // and moves to the front. Pairing with somebody else is not saying
    // you want to forget the first one.
    const next = addPair(cfg, pair);
    setCfg(saveCfg(next));
    setPeerName(pair.peerName);
    setPeerPresent(false);
    peerActiveRef.current = false;
    resetPeerMemory();
    stopWaiting();
    setScreen(next.setupShown ? 'channel' : 'setup');
  }, [cfg, putAwayChannel, resetPeerMemory, stopWaiting]);

  /**
   * Leaving the server, as a member: the pairs made on it go too,
   * because without the list they cannot work, and the welcome is
   * where one lands, as a stranger.
   */
  const onLeaveServer = useCallback(async () => {
    if (!cfg) return;
    try {
      await leaveServer(cfg.serverUrl, { key: cfg.serverKey, name: cfg.displayName });
    } catch (e: any) {
      Alert.alert(t('errors.leaveFailed'), t('errors.leaveFailedBody', { why: String(e?.message || '') }));
      return;
    }
    Journal.mark('left-server').catch(() => { /* noop */ });
    let next = cfg;
    for (const p of cfg.pairs) {
      if (!p.serverUrl || p.serverUrl === cfg.serverUrl) next = forgetPair(next, p.id);
    }
    if (!isPaired(next)) stopService.current = true;
    setCfg(saveCfg({ ...next, serverUrl: cfg.serverUrl, serverRole: 'stranger' }));
    setPeerName('');
    setPeerPresent(false);
    setScreen('welcome');
  }, [cfg]);

  /**
   * The word kept true while nobody is watching.
   *
   * A phone with no pair never joins, and so never hears that it was
   * taken off the list: it went on offering connections it could not
   * open. Opening the settings with no pair is the moment to ask.
   */
  useEffect(() => {
    if (screen !== 'settings' || !cfg || isPaired(cfg) || !isServerConfigured(cfg)) return;
    let gone = false;
    knock(cfg.serverUrl, { key: cfg.serverKey, name: cfg.displayName }).then((a) => {
      if (gone || a.role === 'unknown' || a.role === cfg.serverRole) return;
      Journal.mark(`door:${a.role}:refreshed`).catch(() => { /* noop */ });
      setCfg((prev) => (prev ? saveCfg({ ...prev, serverRole: a.role }) : prev));
      if (a.role === 'stranger') setScreen('welcome');
    }).catch(() => { /* not reachable: the word stays as it was */ });
    // And a thread kept at the door while one stays here: taken off
    // the list meanwhile, the screen resets by itself.
    const stop = opensHere(cfg)
      ? watchDoor(cfg.serverUrl, { key: cfg.serverKey, name: cfg.displayName }, (word) => {
        if (gone) return;
        Journal.mark(`door-watch:${word}`).catch(() => { /* noop */ });
        setCfg((prev) => (prev ? saveCfg({ ...prev, serverRole: 'stranger' }) : prev));
        setScreen('welcome');
        Alert.alert(t('errors.removed'), t('errors.removedBody', { server: displayServer(cfg.serverUrl) }));
      })
      : () => { /* nothing to watch */ };
    return () => { gone = true; stop(); };
  }, [screen]);

  useEffect(() => { leaveChannelRef.current = () => { leaveChannel(true); }; }, [leaveChannel]);

  const onForgetPair = useCallback(async (id: string) => {
    if (!cfg) return;
    // Breaking up a connection is a real goodbye: whoever is left on
    // the other side must know it was not a drop.
    if (cfg.pair?.id === id) sayGoodbye.current = true;
    const next = forgetPair(cfg, id);
    // The other side is told - now if they are there, at their next
    // join if not: a pair broken from one side alone went on looking
    // alive on the other, with no way of noticing.
    signalingRef.current?.tellBroken(id);
    // The room on the server goes with it, if we are the one who
    // opened it: a guest cannot, and the server would say so.
    if (opensHere(cfg)) {
      forgottenRooms.current.add(id);
      signalingRef.current?.forgetRoom(id);
    }
    // With nothing left to connect to, the presence ends here; if
    // another connection remains, the phone stays reachable there.
    if (cfg.pair?.id === id && !isPaired(next)) stopService.current = true;
    setCfg(saveCfg(next));
    if (cfg.pair?.id === id) {
      setPeerName(next.pair?.peerName || '');
      setPeerPresent(false);
      peerActiveRef.current = false;
      resetPeerMemory();
      // Breaking up the last one leaves nothing to connect to; if
      // another one remains, we have already moved to it.
      setScreen(isPaired(next) ? 'channel' : 'pairing');
    }
  }, [cfg, resetPeerMemory]);

  // --- what is drawn -------------------------------------------------------
  if (screen === 'loading' || !cfg) {
    return (
      <View style={styles.center}>
        <StatusBar barStyle="light-content" />
        <ActivityIndicator size="large" color="#2f7cf6" />
      </View>
    );
  }

  if (screen === 'welcome') {
    return (
      <View style={styles.safe}>
        <StatusBar barStyle="light-content" />
        <WelcomeScreen
          initial={cfg}
          onDone={(next, _answer, code) => {
            Journal.mark(`door:${next.serverRole || 'unknown'}`).catch(() => { /* noop */ });
            setPairingCode(code || '');
            setCfg(saveCfg(alignPairServer(next)));
            // Already paired: the pair has just moved to the new server
            // with us, and there is nothing to do but go back in. With
            // a code typed, the pairing, which runs it. Otherwise the
            // settings, where one sees where one has come in, and how,
            // before dictating a code.
            setScreen(isPaired(next) ? 'channel' : code ? 'pairing' : 'settings');
          }}
          // From the settings there is somewhere to go back to; at the
          // first start there is not.
          // Back is the settings, paired or not: a phone with no pair
          // used to be sent to the pairing, which opened on a code.
          onClose={isServerConfigured(cfg) ? () => setScreen('settings') : undefined}
        />
      </View>
    );
  }

  if (screen === 'settings') {
    return (
      <View style={styles.safe}>
        <StatusBar barStyle="light-content" />
        <SettingsScreen
          initial={cfg}
          onChangeServer={() => setScreen('welcome')}
          onLeaveServer={onLeaveServer}
          onForgetPair={onForgetPair}
          onSwitchPair={onSwitchPair}
          onRenamePair={onRenamePair}
          // No existing connection is touched: the new one is added, if
          // and when it succeeds.
          onRepair={() => { setPairingTyping(false); setScreen(opensHere(cfg) ? 'pairing' : 'welcome'); }}
          onHaveCode={() => { setPairingTyping(true); setScreen('pairing'); }}
          onClose={isPaired(cfg) ? () => setScreen('channel') : undefined}
          onOpenSetup={() => { setSetupFrom('settings'); setScreen('setup'); }}
          onQualityChange={(q) => applyQuality(q, true)}
          canInvite={canInvite}
        canAddPair={canAddPair}
        people={people}
        invitations={invitations}
        freshInvite={freshInvite}
        onAskPeople={() => signalingRef.current?.askPeople()}
        onInvite={(name) => signalingRef.current?.askInvite(name)}
        onForget={(name) => signalingRef.current?.forgetPerson(name)}
        onForgetInvitation={(code) => signalingRef.current?.forgetInvitation(code)}
        onLive={(patch) => setCfg((prev) => {
            if (!prev) return prev;
            const next = saveCfg({ ...prev, ...patch });
            // The audio options have to be applied as well: the
            // ceiling right away, the processing on reopening the
            // microphone.
            if ('richerAudio' in patch) applyAudio(next.richerAudio, true);
            // The call's sound and vibration live in the notification
            // channel, which has to be built again at every change.
            if ('alertVibration' in patch || 'alertSound' in patch || 'alertSoundUri' in patch) {
              Alerts.configure(next.alertVibration, next.alertSound, next.alertSoundUri)
                .catch(() => {});
            }
            return next;
          })}
          vp9Here={localVp9}
          vp9Peer={peerVp9}
        />
      </View>
    );
  }

  if (screen === 'setup') {
    return (
      <View style={styles.safe}>
        <StatusBar barStyle="light-content" />
        <SetupScreen
          onDone={async () => {
            if (!cfg.setupShown) {
              // `setupShown` belongs to the app - a screen shown once
              // in the phone's life - but the saving goes through there
              // all the same, so that the pair's settings stay in
              // line.
              setCfg(saveCfg({ ...cfg, setupShown: true }));
            }
            setScreen(setupFrom === 'settings' ? 'settings' : 'channel');
          }}
        />
      </View>
    );
  }

  if (screen === 'pairing') {
    return (
      <View style={styles.safe}>
        <StatusBar barStyle="light-content" />
        <PairingScreen
          cfg={cfg}
          role={cfg.serverRole}
          joinWith={pairingCode}
          startTyping={pairingTyping}
          onRefused={(reason) => {
            // Not what we thought we were here: the welcome knocks
            // again and finds out what we are now.
            Journal.mark(`refused:${reason}`).catch(() => { /* noop */ });
            setCfg((prev) => (prev ? saveCfg({ ...prev, serverRole: 'stranger' }) : prev));
            setPairingCode('');
            setScreen('welcome');
          }}
          onPaired={onPaired}
          // Before the first pairing, "change server" means the
          // welcome: there is nothing in the settings yet worth going
          // back to.
          onBack={() => setScreen(isPaired(cfg) ? 'settings' : 'welcome')}
        />
      </View>
    );
  }

  return (
    <View style={styles.safe}>
      <StatusBar barStyle="light-content" />
      <ChannelScreen
        pip={inPip}
        connectionName={connectionName}
        peerName={shownName}
        peerAvatar={face}
        peerPresent={peerPresent}
        peerDetached={peerDetached}
        peerTornDown={peerTornDown}
        videoStats={videoStats}
        peerSendDelay={peerState.sendDelay ?? null}
        peerRecvDelay={peerState.recvDelay ?? null}
        delayTotalOnly={cfg.delayTotalOnly}
        qualityLabel={t(`quality.${(VIDEO_PROFILES[cfg.videoQuality] ?? VIDEO_PROFILES.standard).key}`)}
        showStats={cfg.diagnostics}
        controls={cfg.controls}
        onSelectControls={(v) => setCfg((prev) => {
          if (!prev) return prev;
          // The same word as from the settings, said from the picture:
          // saved at once, for this connection like every setting.
          return saveCfg({ ...prev, controls: v });
        })}
        news={notice}
        onNewsRead={() => setNotice(null)}
        // The screen is given the LEVEL, not the gain: it is the number
        // that says how loud you are hearing the other person.
        gain={levelShowing ? level : null}
        peerGain={level}
        systemVolume={systemVolume}
        onChangeLevel={changeLevel}
        versionWarning={versionWarning}
        frontCamera={frontCamera}
        quality={cfg.videoQuality}
        onSelectQuality={(q) => applyQuality(q, true)}
        localStream={localStream}
        remoteStream={remoteStream}
        // The one to show, not the true one: see shownStatus.
        status={shownStatus}
        connectionState={connState}
        audioOn={audioOn}
        videoOn={videoOn}
        peerState={peerState}
        remoteHasVideo={remoteHasVideo && peerState.video}
        remoteVideoKey={remoteVideoKey}
        localAspect={localAspect}
        remoteAspect={peerState.aspect}
        knockPending={knockPending}
        audioRoute={audio.route}
        audioRoutes={audio.available}
        onToggleAudio={() => {
          const on = sessionRef.current?.toggleAudio() ?? false;
          setAudioOn(on);
          noteHowItIs(cfg?.pair?.id);
          Journal.mark(`audio:${on ? 'on' : 'off'}`).catch(() => {});
        }}
        onToggleVideo={onToggleVideo}
        onSwitchCamera={() => {
          const s = sessionRef.current;
          if (!s) return;
          // The truth lives in the session, with the video off too: it
          // is the session that remembers which camera will open.
          const front = s.switchCamera();
          setFrontCamera(front);
          // If the choice is not written down, the next session starts
          // from the front one again and it has to be turned round
          // every time.
          setCfg((prev) => (prev ? saveCfg({ ...prev, frontCamera: front }) : prev));
          Journal.mark(`camera:${front ? 'front' : 'back'}`).catch(() => {});
        }}
        onSelectRoute={audio.select}
        onKnock={() => {
          signalingRef.current?.knock();
          // Two knocks on a door, quietly, on this side too: the call
          // leaves towards a phone far away and from here nothing would
          // be heard - the button just blinks. Knowing that it left is
          // worth as much as sending it.
          Alarm.play('knock', true, KNOCK_ECHO_MS).catch(() => {});
          Journal.mark('knock').catch(() => {});
        }}
        onLeave={leaveChannel}
        leaving={leaving}
        onAlarm={onAlarm}
        /**
         * The zoom stays over here: it changes how I look, not what
         * they see. It goes into the journal all the same, because it
         * explains a framing that would not add up on rereading later.
         */
        onZoom={(z) => {
          Journal.mark(z > 1.01 ? `zoom:${z.toFixed(1)}x` : 'zoom:full')
            .catch(() => {});
        }}
        onOpenSettings={() => setScreen('settings')}
        onCall={onCall}
        pairBroken={!!cfg.pair?.brokenByPeer}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0b0e14' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0b0e14' },
});
