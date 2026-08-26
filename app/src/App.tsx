import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  StatusBar, Platform, PermissionsAndroid, Alert, View, AppState,
  ActivityIndicator, StyleSheet, BackHandler, Dimensions,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MediaStream } from 'react-native-webrtc';
import InCallManager from 'react-native-incall-manager';
import {
  Foreground, Pip, AppWindow, Visibility, Codecs, Audio, Avvisi, Diario, Volume, Rete,
  Battito,
  Sveglia,
} from 'duetto-platform';
import {
  DuoConfig, PairInfo, loadConfig, saveConfig,
  isServerConfigured, isPaired, VIDEO_PROFILES,
  addPair, switchToPair, forgetPair, rememberPeerName,
  alignPairServer, renamePair, pairFileKey, pairName,
  storeSettingsInPair,
} from './config';
import { Signaling, PresenceStatus, Mode } from './signaling';
import { useLanguage, t } from './i18n';
import { VERSION } from './version';
import { ChannelSession } from './webrtc';
import type { VideoStats } from './webrtc';
import SettingsScreen from './SettingsScreen';
import SetupScreen from './SetupScreen';
import PairingScreen from './PairingScreen';
import ChannelScreen from './ChannelScreen';
import { loadPipPosition } from './VideoStage';
import { useAudioRoute } from './audioRoute';
import {
  stopListening, presenceLine, deathStory, interfaceInCharge,
} from './presence';
import { avatarFor, peerAvatar } from './avatar';

// No screen in between: either you are setting things up, or pairing,
// or in the channel. Opening the app - from the icon or from a
// notification - means going in.
type Screen = 'loading' | 'settings' | 'pairing' | 'setup' | 'channel';

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
 * How long to wait, after a change of network, before rebuilding the
 * connection: the events arrive in a volley and one is enough.
 */
const NETWORK_SETTLE_MS = 700;

/**
 * How long we keep quiet before saying the server is gone.
 *
 * Five seconds: a change of cell sorts itself out in one or two and
 * does not deserve an alarm; a real fault lasts far longer and will be
 * seen anyway.
 */
const SERVER_GRACE_MS = 5_000;

/**
 * How long the server's answer is waited for before the link is given
 * up for dead, after the network has changed under our feet.
 */
const PROBE_WAIT_MS = 3_000;

/** Within this, an announced volume change is the echo of our own. */
const VOLUME_ECHO_MS = 2_000;

/**
 * Within this, coming back counts as carrying on rather than as a fresh
 * entry. Two different waits, because the two do not weigh the same.
 *
 * The microphone, five minutes: the length of an interruption - a door,
 * a phone call, a glance at another app - and finding it as it was
 * shows nothing to anybody.
 *
 * The camera, one minute: switching itself back on is another matter,
 * because it films a room and a face. Within the minute it is plainly
 * the same scene as before; beyond it you are starting again, and you
 * start with it off.
 */
const RESUME_MIC_MS = 5 * 60_000;
const RESUME_VIDEO_MS = 60_000;

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
    const con = storeSettingsInPair(next);
    saveConfig(con).catch(() => { /* noop */ });
    return con;
  }, []);

  const [inChannel, setInChannel] = useState(false);
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
   * or breaking a connection - and lowered by the close itself.
   */
  const sayGoodbye = useRef(false);
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
   * Quanto stiamo alzando la voce dell'altro, 1 = com'è arrivata.
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
    /** where the sound comes out over there: they say so */
    output?: string;
    /** which Duetto they have; missing if older than this field */
    version?: string;
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
  /** enterChannel is needed inside an effect that is born before it */
  const enterChannelRef = useRef<(() => void) | null>(null);
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
   * L'uscita audio la ricorda il connectionName, non l'app.
   *
   * Il gancio non se la salva più da sé: la riceve da qui e ci
   * restituisce le scelte, che finiscono nel connectionName in uso.
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
  const isRealName = (n?: string | null) =>
    !!n && n !== 'Qualcuno' && n !== 'Someone';
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
    audio?: boolean; video?: boolean; camera?: string; output?: string;
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
    if (!v || v === peerVersionSeen.current) return;
    peerVersionSeen.current = v;
    Diario.segna(`peer-version:${v}`).catch(() => { /* noop */ });
  }, [peerState.version]);

  const versionWarning = React.useMemo(() => {
    if (!peerSeen) return null;
    const sua = peerState.version;
    if (!sua) return `Versioni diverse: qui ${VERSION}, di là una più vecchia`;
    if (sua === VERSION) return null;
    return `Versioni diverse: qui ${VERSION}, di là ${sua}`;
  }, [peerSeen, peerState.version]);

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
      Volume.leggi().then((v) => {
        if (alive && v && v.max > 0) setSystemVolume({ volume: v.volume, max: v.max });
      }).catch(() => { /* noop */ });
    };
    reread();
    /**
     * If somebody else moves the volume, our gain goes away.
     *
     * Whoever adjusts the volume from another app - or from the system
     * panel - is saying how loudly they want to hear, right now. Our
     * multiplier is the leftover of an earlier choice, and leaving it
     * there to multiply the new one falsifies it: you set the voice to
     * half and find yourself at three quarters, with no way of seeing
     * why. Cleared, Duetto's level goes back to being exactly the
     * phone's.
     *
     * Our own change does not count: when it is us moving the knob we
     * remember it for a moment, and let that announcement through.
     */
    const stop = Volume.ascoltaSistema((value) => {
      reread();
      const ours = ourOwnSet.current;
      const fromUs = ours
        && Math.abs(ours.v - value) < 0.5
        && Date.now() - ours.t < VOLUME_ECHO_MS;
      if (fromUs) return;
      setCfg((prev) => {
        if (!prev) return prev;
        const output = audioRouteRef.current;
        const now = prev.gains?.[output] ?? 1;
        if (now === 1) return prev;
        /**
         * Nobody else lifts the mute.
         *
         * Clearing the gain means going back to the phone's volume, and
         * for somebody who has silenced the other person that would be
         * making them speak again by the hand of any app at all. The
         * mute is lifted from Duetto, and then one starts again from
         * whatever volume the phone has at that moment.
         */
        if (now === 0) return prev;
        Diario.segna('gain-cleared:volume-from-outside').catch(() => { /* noop */ });
        return saveCfg({
          ...prev,
          gains: { ...(prev.gains ?? {}), [output]: 1 },
        });
      });
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
      // We remember it: the announcement the system will send is the
      // echo of this, not somebody else's choice.
      ourOwnSet.current = { v, t: Date.now() };
      setSystemVolume({ ...phone, volume: v });
      Volume.metti(v).catch(() => { /* noop */ });
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
    Volume.prendiTasti(true).catch(() => {});
    const stop = Volume.subscribe(changeLevel);
    return () => {
      stop();
      Volume.prendiTasti(false).catch(() => {});
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
  }), [inChannel, shownStatus, peerPresent, peerDetached, peerTornDown, shownName]);

  /**
   * Since when we have been without a server, or 0 when we have one.
   *
   * A single number instead of the previous state: it says both when to
   * write the journal lines and how long it has lasted - which is the
   * only good measure for deciding to rebuild everything.
   */
  const noServerSince = useRef(0);

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
  useEffect(() => {
    noticeTextRef.current = noticeText;
    if (!presenceLive) return;
    let alive = true;
    let retry: ReturnType<typeof setTimeout> | null = null;
    /**
     * If the write does not succeed it is tried again - but a line
     * identical to the one already there is never rewritten.
     *
     * It used to be rewritten every minute regardless, to make up for a
     * lost update: but a rewritten notification is a notification that
     * is BORN AGAIN, and whoever had swept it away found it back a
     * minute later. The only case worth covering was the failed write -
     * the system can refuse to start the service with the app in the
     * background - and that one announces itself, without disturbing
     * everybody else.
     */
    const write = (left: number) => {
      Foreground.setText(noticeText, alertName).catch(() => {
        if (!alive || left <= 0) return;
        retry = setTimeout(() => write(left - 1), NOTICE_RETRY_MS);
      });
    };
    write(3);
    return () => {
      alive = false;
      if (retry) clearTimeout(retry);
    };
  }, [noticeText, alertName, presenceLive]);

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
      // Se non stiamo già contando, si comincia adesso: siamo qui
      // perché il connectionName non c'è, e il caso peggiore - il socket
      // che resta "in apertura" per sempre, senza mai una caduta da
      // segnare - è proprio quello che non farebbe partire nessun
      // conto.
      const da = noServerSince.current || (noServerSince.current = Date.now());
      const fermo = Date.now() - da;
      if (fermo < NO_SERVER_WAIT_MS) return;
      Diario.segna(`server:rifaccio:${Math.round(fermo / 1000)}s`)
        .catch(() => { /* noop */ });
      // Il conto riparte da adesso: rifare da capo è un tentativo, e se
      // non basta se ne farà un altro fra altrettanto tempo.
      noServerSince.current = Date.now();
      signalingRef.current?.rebuild();
    }, SERVER_CHECK_MS);
    return () => clearInterval(t);
  }, [status, available]);

  /**
   * L'ultima domanda mandata al server e l'ultima risposta ricevuta.
   *
   * Servono al battito: due numeri al posto di un cronometro, perché un
   * cronometro qui non si può usare - a schermo spento non scade.
   * Confrontandoli a ogni battito si sa se quello di prima è rimasto
   * senza risposta, e una domanda senza risposta è un socket morto.
   */
  const probeSent = useRef(0);
  const answerSeen = useRef(0);

  /**
   * "Gli hanno chiuso l'app" vale finché resta in attesa.
   *
   * Appena entra nel canale, o appena sparisce del tutto, quella
   * spiegazione non racconta più il presente.
   */
  useEffect(() => {
    if (!peerPresent || status === 'together') setPeerTornDown(false);
  }, [peerPresent, status]);

  /**
   * L'ultimo volume di systemVolume messo da noi, con l'ora.
   *
   * Serve a riconoscere l'eco: il systemVolume annuncia ogni cambio, compresi
   * i nostri, e senza questo confronto ogni tocco dei tasti sembrerebbe
   * la scelta di un'altra app.
   */
  const ourOwnSet = useRef<{ v: number; t: number } | null>(null);

  /** Battiti di fila finiti male: al secondo si chiama in causa la rete. */
  const emptyBeats = useRef(0);

  /** La prova in corso dopo un cambio di rete, se ce n'è una. */
  const networkProbe = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stopNetworkProbe = useCallback(() => {
    if (!networkProbe.current) return;
    clearTimeout(networkProbe.current);
    networkProbe.current = null;
  }, []);

  /**
   * La rete è cambiata: si controlla che il connectionName sia ancora vivo.
   *
   * Nessuna connessione TCP sopravvive a un cambio di indirizzo, e
   * cambiando cella l'indirizzo cambia sempre: il socket verso il
   * server è morto anche se sembra aperto, e la notizia della sua morte
   * può arrivare minuti dopo. Chi lo sa per primo è Android, che il
   * cambio lo ha appena fatto - ma "la rete è cambiata" non vuol dire
   * "la connessione è morta", e demolirla per sospetto costa all'altro
   * una sparizione. Quindi si domanda al server, e si rifà da capo solo
   * se non risponde.
   *
   * Un momento di respiro prima di rifare: al cambio di rete gli eventi
   * arrivano a raffica - arrivata, indirizzo, valida - e rifare tre
   * volte non serve a niente.
   */
  useEffect(() => {
    if (!available) return;
    let quando: ReturnType<typeof setTimeout> | null = null;
    const stop = Rete.subscribe((cosa) => {
      if (cosa === 'persa') return;
      if (quando) clearTimeout(quando);
      quando = setTimeout(() => {
        quando = null;
        Diario.segna(`rete:${cosa}`).catch(() => { /* noop */ });
        const sig = signalingRef.current;
        if (!sig) return;
        // Già senza server: non c'è niente da salvare, si rifà e basta.
        if (!sig.connected) {
          noServerSince.current = noServerSince.current || Date.now();
          sig.rebuild();
          return;
        }
        /**
         * Sembra viva: prima si chiede se lo è davvero.
         *
         * Buttare giù una connessione sana non è gratis - l'altro ti
         * vede sparire e tornare - e la prima versione di questo pezzo
         * lo faceva a ogni sospiro della rete: i due telefoni si
         * sparivano a vicenda ogni pochi secondi. Il server risponde
         * alla domanda sulla presenza, e quella risposta è la prova che
         * il socket è vivo: se non arriva entro qualche secondo, allora
         * sì che era morto.
         */
        stopNetworkProbe();
        sig.askPresence();
        networkProbe.current = setTimeout(() => {
          networkProbe.current = null;
          Diario.segna('rete:muto').catch(() => { /* noop */ });
          noServerSince.current = noServerSince.current || Date.now();
          signalingRef.current?.rebuild();
        }, PROBE_WAIT_MS);
      }, NETWORK_SETTLE_MS);
    });
    return () => {
      if (quando) clearTimeout(quando);
      stopNetworkProbe();
      stop();
    };
  }, [available, stopNetworkProbe]);

  /**
   * Il battito nativo: l'unica sveglia che suona a schermo spento.
   *
   * A ogni battito si guarda il connectionName. Se il socket è già
   * dichiarato morto si rifà e basta. Se sembra vivo gli si fa una
   * domanda, e la risposta si controlla al battito DOPO: un cronometro
   * qui non servirebbe a niente, perché i cronometri di JavaScript a
   * schermo spento non scadono - ed è esattamente il buco che questo
   * battito viene a tappare.
   *
   * Costa un messaggio di poche decine di byte al minuto, e in cambio
   * tiene aperta anche la strada nei router di mezzo, che chiudono le
   * connessioni ferme.
   */
  useEffect(() => {
    if (!available) return;
    probeSent.current = 0;
    answerSeen.current = Date.now();
    return Battito.subscribe(() => {
      const sig = signalingRef.current;
      if (!sig) return;
      const rifai = (perche: string) => {
        Diario.segna(`battito:${perche}`).catch(() => { /* noop */ });
        noServerSince.current = noServerSince.current || Date.now();
        probeSent.current = 0;
        emptyBeats.current += 1;
        /**
         * Due battiti a vuoto: si dice ad Android di guardare la rete.
         *
         * È il caso di chi esce di casa: il wifi, che funziona
         * benissimo, diventa debole e smette di far passare dati, ma il
         * telefono ci resta agganciato - a schermo spento anche per
         * mezzo minuto buono. Noi lo sappiamo prima del systemVolume, perché
         * i nostri tentativi falliscono uno dopo l'altro: glielo
         * diciamo, la verifica la fa lui, e se quella rete non porta a
         * internet sposta il traffico da sé.
         */
        if (emptyBeats.current === 2) {
          Diario.segna('rete:non-passa').catch(() => { /* noop */ });
          Rete.segnalaCheNonPassa().catch(() => { /* noop */ });
        }
        sig.rebuild();
      };
      if (!sig.connected) { rifai('senza-socket'); return; }
      // La domanda di prima è rimasta senza risposta: il socket sembra
      // vivo ma non porta più niente.
      if (probeSent.current && answerSeen.current < probeSent.current) {
        rifai('muto');
        return;
      }
      emptyBeats.current = 0;
      probeSent.current = Date.now();
      sig.askPresence();
    });
  }, [available]);

  /**
   * Il battito si infittisce mentre siamo senza server.
   *
   * A schermo spento è l'unico motore che gira, quindi il suo passo è
   * anche il passo dei tentativi: uno al minuto quando va tutto bene,
   * uno ogni quindici secondi quando c'è da rimettersi in piedi.
   */
  useEffect(() => {
    const senza = status === 'offline' || status === 'connecting';
    Battito.fitto(available && senza).catch(() => { /* noop */ });
  }, [status, available]);

  /**
   * Ogni tanto si torna a chiedere al server se l'altro c'è.
   *
   * Solo mentre lo si aspetta: appena entra nel canale non serve più
   * chiedere niente, e fuori dal canale non c'è nessuna schermata che
   * lo stia dicendo.
   *
   * Il primo quarto d'ora è quello in cui si sta davvero aspettando,
   * spesso guardando lo schermo: lì una domanda al minuto è poca cosa.
   * Dopo, l'attesa è diventata un sottofondo e si dirada a cinque
   * minuti, che è il passo del battito del server.
   */
  useEffect(() => {
    if (!inChannel || status !== 'alone') return;
    const inizio = Date.now();
    let timer: ReturnType<typeof setTimeout>;
    const giro = () => {
      signalingRef.current?.askPresence();
      const atteso = Date.now() - inizio >= PRESENCE_PATIENCE_MS
        ? PRESENCE_SPARSE_MS : PRESENCE_OFTEN_MS;
      timer = setTimeout(giro, atteso);
    };
    // Non subito: entrando nel canale la risposta del server è appena
    // arrivata, e richiederla nello stesso istante sarebbe chiederla due
    // volte.
    timer = setTimeout(giro, PRESENCE_OFTEN_MS);
    return () => clearTimeout(timer);
  }, [inChannel, status]);

  /**
   * Quando l'interfaccia nasce e quando muore, scritto per esteso.
   *
   * Sembra ridondante - la riga "ascolto" c'è già - e invece è proprio
   * l'ambiguità di quella riga ad aver fatto perdere una notte: "ascolto"
   * la scrive sia chi esce dal canale sia un'interfaccia che riparte da
   * capo, e distinguere le due cose e' la differenza fra "l'ha chiusa
   * lui" e "si e' ricostruita da sola mentre dormiva".
   *
   * Lo smontaggio si scrive mentre il motore JavaScript sta gia'
   * chiudendo: la riga parte, ma se il processo muore nello stesso
   * istante puo' non arrivare al file. Meglio una riga incerta che
   * nessuna.
   */
  useEffect(() => {
    Diario.segna('interfaccia-avviata').catch(() => { /* noop */ });
    return () => {
      Diario.segna('interfaccia-smontata').catch(() => { /* noop */ });
      // Se non ce ne stiamo andando di proposito, qui si perde la
      // connessione: il motore JavaScript muore con l'interfaccia, e
      // nessuno lo sa tranne noi, in questo istante. Si passa la mano
      // all'ascolto senza interfaccia, che la riapre.
      //
      // Il servizio in primo piano non basta: quello tiene vivo il
      // processo, non la connessione. Sono due cose diverse, e all'altro
      // ne serve una sola per vederti sparire.
      if (!sayGoodbye.current) {
        /**
         * Il perché lo si dice solo se contava.
         *
         * Se la finestra viene smontata mentre si è NEL CANALE, l'altro
         * ti vede sparire senza spiegazione e merita di sapere che non
         * sei stato tu: è la condizione per cui questo messaggio esiste.
         * Se invece eri già uscito e l'app stava in secondo piano,
         * essere smontata è ordinaria amministrazione - su certi
         * telefoni succede pochi secondi dopo ogni uscita - e dirlo
         * faceva leggere «il suo telefono gli ha chiuso l'app» subito
         * dopo un'uscita che aveva scelto lui. Vero, e fuorviante.
         */
        interfaceInCharge(false, inChannelRef.current);
        Foreground.riprendiPresenza().catch(() => { /* noop */ });
      }
    };
  }, []);

  /**
   * Il diario segue lo stato: senza, le righe direbbero quanto è sceso
   * il telefono senza dire cosa stava facendo l'app, che è l'unica cosa
   * che rende quei numeri confrontabili fra loro.
   */
  useEffect(() => {
    const stato = !inChannel ? 'ascolto' : videoOn ? 'canale+video' : 'canale';
    Diario.stato(stato).catch(() => {});
    // Una riga al cambio di stato: segna il confine fra due periodi, e
    // senza confini non si può misurare né l'uno né l'altro.
    Diario.segna(stato).catch(() => {});
  }, [inChannel, videoOn]);

  /**
   * "Sono morta, ed ecco perché."
   *
   * Nessuno può avvisare mentre muore: un processo ucciso dal systemVolume
   * non riceve nessun preavviso. Ma riaccendendosi il telefono si
   * ricorda com'è andata, e allora lo si dice all'altro - che intanto
   * ha visto sparire una persona e non aveva modo di sapere se fosse un
   * tunnel, un telefono spento o un'app morta.
   *
   * Si racconta una volta sola: la stessa morte raccontata a ogni
   * riconnessione diventerebbe un ritornello.
   */
  const deathToTell =
    useRef<{ quando: number; causa: string; tornato: number } | null>(null);

  /**
   * Da quando l'altro non c'è più, e il ritorno da annunciare.
   *
   * Sparire e tornare vanno raccontati tutti e due, ma non a ogni
   * singhiozzo di rete: un'assenza di pochi secondi è un cambio di
   * cella, e dirla sarebbe rumore. Sopra il minuto invece è successo
   * qualcosa, e chi aspettava merita di sapere che è finita.
   *
   * Il ritorno si annuncia con qualche secondo di ritardo, perché se
   * quell'assenza era una morte arriva anche il racconto del perché, e
   * quello dice già tutto: due notizie per lo stesso fatto sono una di
   * troppo.
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
    if (!peerPresent) {
      if (awaySince.current === 0) awaySince.current = Date.now();
      forgetReturn();
      return;
    }
    const via = awaySince.current;
    awaySince.current = 0;
    if (!via || Date.now() - via < ABSENCE_WORTH_TELLING_MS) return;
    forgetReturn();
    returnDue.current = setTimeout(() => {
      returnDue.current = null;
      const chi = shownNameRef.current || 'L’altro';
      // Con l'ora al secondo: una notifica trovata dopo, senza, non dice
      // se è tornato un minuto fa o stamattina.
      const adesso = new Date().toLocaleTimeString(undefined, {
        hour: '2-digit', minute: '2-digit', second: '2-digit',
      });
      const testo = `${chi} è di nuovo raggiungibile (${adesso}).`;
      // Il titolo dice su quale connectionName, come per gli avvisi: con
      // più di uno configurato, "è di nuovo raggiungibile" da solo non
      // dice chi.
      // Solo in tendina: dentro l'app comparirebbe la stessa frase due
      // volte, una nel riquadro e una nella notifica dietro.
      Foreground.nota(alertNameRef.current, testo).catch(() => {});
    }, TELLING_DELAY_MS);
  }, [peerPresent, forgetReturn]);

  /**
   * «È di nuovo raggiungibile» smette di valere quando risparisce.
   *
   * La notizia scade anche da sola dopo dieci minuti, ma se se ne va
   * prima non ha senso lasciarla lì: chi apre la tendina leggerebbe il
   * contrario di quello che dice la notifica fissa due righe sotto.
   */
  useEffect(() => {
    if (peerPresent) return;
    Foreground.togliNota().catch(() => { /* noop */ });
  }, [peerPresent]);

  const readOwnDeath = useCallback(async () => {
    try {
      const m = await Diario.ultimaMorte();
      if (!m || !m.quando) return;
      // Un aggiornamento dell'app non è una morte: è il modo normale in
      // cui un'app viene sostituita, e annunciarlo sarebbe un allarme
      // per una cosa voluta.
      if (/installPackage|PackageUpdate/i.test(m.descrizione || '')) return;
      const grezzo = await readWithBridge(DEATH_TOLD_KEY, OLD_KEYS.death);
      if (Number(grezzo) >= m.quando) return;
      // L'ora del ritorno è adesso: l'app sta ripartendo proprio ora, e
      // questo è l'unico telefono che possa saperla.
      deathToTell.current = { quando: m.quando, causa: m.causa, tornato: Date.now() };
    } catch { /* se il telefono non lo sa, non lo sa */ }
  }, []);

  useEffect(() => {
    if (!peerPresent) return;
    const da = deathToTell.current;
    const sig = signalingRef.current;
    if (!da || !sig?.connected) return;
    sig.sendSignal({
      kind: 'death', when: da.quando, cause: da.causa, back: da.tornato,
    });
    deathToTell.current = null;
    AsyncStorage.setItem(DEATH_TOLD_KEY, String(da.quando)).catch(() => {});
  }, [peerPresent, status]);

  /**
   * Ogni tanto il proprio diario va all'altro telefono.
   *
   * Serve a poterli leggere tutti e due collegandone uno solo: l'altro
   * telefono, in mano a un'altra persona, a un cavo non ci arriva mai.
   * Si mandano solo le righe nuove; se il file è stato ruotato e adesso
   * ne ha meno di quante ne avevamo mandate, si riparte da capo.
   */
  /**
   * Manda all'altro le righe di diario non ancora partite.
   *
   * Sta fuori dall'effetto periodico perché la chiama anche l'uscita:
   * lì è l'ultimo momento utile, la connessione è ancora aperta e da lì
   * a poco non lo sarà più.
   */
  const sendJournal = useCallback(async () => {
    const sig = signalingRef.current;
    if (!sig?.connected) return;
    const chiave = sentKeyFor(cfg?.pair?.id ?? '');
    try {
      const righe = await Diario.righe();
      const suo = await readWithBridge(chiave, `${OLD_KEYS.sent}.${cfg?.pair?.id ?? ''}`);
      // La chiave unica di prima fa da punto di partenza per chi c'era
      // già: senza, il primo scambio dopo l'aggiornamento rimanderebbe
      // da capo mesi di righe che l'altro ha già.
      const vecchio = suo === null
        ? await AsyncStorage.getItem(OLD_KEYS.sent)
        : null;
      let inviate = Number(suo ?? vecchio) || 0;
      if (inviate > righe) inviate = 0;
      if (righe <= inviate) return;

      const text = await Diario.leggi(inviate);
      if (!text) return;
      sig.sendSignal({ kind: 'journal', text });
      await AsyncStorage.setItem(chiave, String(righe));
    } catch {
      /* il diario non vale un errore in faccia a nessuno */
    }
  }, [cfg?.pair?.id]);

  useEffect(() => {
    if (!peerPresent) return;
    let vivo = true;

    const manda = () => { if (vivo) sendJournal(); };

    // Il primo giro DIECI SECONDI dopo essersi trovati, non un minuto.
    //
    // Il minuto era prudenza sprecata: un giro costa qualche centinaio
    // di byte. E soprattutto era controproducente proprio nel caso in
    // cui il diario serve - un telefono la cui app muore di continuo -
    // perche' quel telefono non restava collegato abbastanza a lungo da
    // arrivare al primo invio, e le righe che spiegavano le sue morti
    // non partivano mai.
    //
    // Basta che l'altro sia COLLEGATO, non che siate nel canale: i
    // diari si scambiano anche mentre state solo in attesa.
    const primo = setTimeout(manda, 10_000);
    const timer = setInterval(manda, JOURNAL_SWAP_MS);
    return () => { vivo = false; clearTimeout(primo); clearInterval(timer); };
  }, [peerPresent, sendJournal]);

  /**
   * Se stiamo passando dal relay, si tenta una volta la strada diretta.
   *
   * ICE non torna indietro da solo: scelta una strada che funziona, non
   * la riconsidera più, nemmeno quando ne ricompare una molto migliore -
   * tornando sul wifi il connectionName continuava a rimbalzare dal server
   * all'infinito. Una rinegoziazione rifà la raccolta dei candidatesById e fa
   * rivalutare le coppie: se la locale c'è, vince per priorità.
   *
   * Una volta sola per connectionName: se anche così resta il relay, vuol
   * dire che di meglio non c'è, e insistere costerebbe interruzioni.
   */
  useEffect(() => {
    // Il contrassegno NON si azzera qui. Azzerandolo a ogni uscita da
    // "connected" si innescava un ciclo: il tentativo interrompe la
    // connessione, l'interruzione riabilita il tentativo, e da fuori si
    // vedeva "connectionName interrotto" ogni dieci secondi per sempre.
    // Si riprova solo dopo un vero cambio di rete - vedi `onJoined`.
    if (connState !== 'connected') return;
    if (videoStats.path !== 'relay' || relayRetried.current) return;
    const t = setTimeout(() => {
      if (!inChannelRef.current || !peerActiveRef.current) return;
      relayRetried.current = true;
      console.log('[duetto-rtc]', 'passiamo dal relay: provo a cercare una strada diretta');
      if (politeRef.current) signalingRef.current?.sendSignal({ kind: 'renegotiate' });
      else sessionRef.current?.restartIce();
    }, 8000);
    return () => clearTimeout(t);
  }, [connState, videoStats.path]);

  // Quale profilo l'interfaccia sta DAVVERO mostrando: distingue "non è
  // arrivato" da "è arrivato ma non si vede".
  useEffect(() => {
    if (cfg) console.log('[duetto-ui]', 'profilo mostrato:', cfg.videoQuality);
  }, [cfg?.videoQuality]);

  // Sapere se siamo in primo piano decide se mostrare una notifica o no.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      const wasActive = appStateRef.current === 'active';
      appStateRef.current = s;
      if (s !== 'active') return;

      Foreground.clearNotification().catch(() => {});
      // Riaprire l'app è già dire "ci sono": se ci si era staccati, la
      // presenza torna da sé. Chi vuole restare invisibile non riapre.
      setAvailable(true);
      // Tornando in primo piano non ha senso aspettare il prossimo
      // tentativo programmato: si riprova subito.
      signalingRef.current?.reconnectNow();
      // E si ridomanda dov'è l'altro: il telefono può aver dormito per
      // ore, e i conti alla rovescia dormono con lui. Chi riaccende lo
      // schermo guarda quella riga per prima cosa, e deve trovarla
      // fresca, non ferma a com'era prima della notte.
      if (inChannelRef.current) signalingRef.current?.askPresence();
      // Tornare in primo piano - da icona o toccando la notifica - vuol
      // dire voler stare nel canale: si rientra senza chiedere nulla.
      if (!wasActive && !inChannelRef.current && signalingRef.current) {
        enterChannelRef.current?.();
      }
    });
    return () => sub.remove();
  }, []);

  // Cosa sa fare questo telefono: si chiede una volta sola all'avvio.
  useEffect(() => {
    Codecs.hasHardwareVp9Encoder().then((v: boolean) => {
      setLocalVp9(!!v);
      sessionRef.current?.setLocalVp9(!!v);
    }).catch(() => {});
  }, []);

  /**
   * Diciamo all'altro quando smettiamo di guardare, così spegne la sua
   * trasmissione: un video verso uno schermo spento costa ~300 kB/s a chi
   * lo manda, che su rete cellulare si paga.
   *
   * Non usiamo AppState: su Android segnala la pausa dell'activity, e in
   * Picture-in-Picture l'activity è in pausa pur essendo visibile.
   */
  useEffect(() => {
    Visibility.get().then((v: boolean) => {
      sessionRef.current?.setLocalWatching(!!v);
    }).catch(() => {});
    return Visibility.subscribe((visible: boolean) => {
      sessionRef.current?.setLocalWatching(visible);
    });
  }, []);

  // --- avvio ---------------------------------------------------------------
  useEffect(() => {
    (async () => {
      // Prima della configurazione: se arrivasse dopo, il riquadrino
      // comparirebbe al suo posto di nascita e poi salterebbe.
      await loadPipPosition();
      let c = await loadConfig();
      setCfg(c);
      readOwnDeath();
      // Il canale di notifica va preparato prima che serva: nasce con
      // suono e vibrazione dentro, e crearlo al primo notice vorrebbe
      // dire farlo mentre lo si sta già usando.
      Avvisi.configura(c.alertVibration, c.alertSound, c.alertSoundUri).catch(() => {});
      if (!isServerConfigured(c)) setScreen('settings');
      else if (!isPaired(c)) setScreen('pairing');
      // Le impostazioni di systemVolume si propongono una volta sola, appena
      // c'è una pairStat: prima non avrebbe senso spiegarle.
      else if (!c.setupShown) setScreen('setup');
      // Aprire l'app significa voler entrare nel canale: niente pulsanti
      // di mezzo. Lo stato "in ascolto" resta per dopo aver premuto Esci.
      else setScreen('channel');
    })();
  }, []);

  /**
   * Cosa, cambiando, obbliga davvero a rifare la connessione.
   *
   * Prima l'effetto dipendeva da `cfg` intero: cambiare la qualità video
   * - che è solo un parametro dell'encoder - abbatteva signaling e
   * sessione e li ricostruiva. Si vedeva il proprio video spegnersi,
   * l'altro leggeva "connectionName interrotto", e le preferenze si
   * chiudevano da sole perché rientrare nel canale cambia schermata.
   */
  const connKey = cfg
    ? [
        cfg.serverUrl, cfg.displayName,
        cfg.pair?.id, cfg.pair?.side, cfg.pair?.key,
      ].join('|')
    : '';

  /**
   * Il nome vero dell'altro, ricordato nel connectionName.
   *
   * All'accoppiamento il nome può mancare - è facoltativo - o essere
   * cambiato dopo. Con più collegamenti in elenco è l'unica cosa che li
   * distingue: l'impronta della stanza non dice niente a nessuno. Si
   * scrive solo quando cambia davvero, quindi non costa nulla farlo a
   * ogni ingresso.
   */
  const noteName = useCallback((n: string) => {
    setPeerName(n);
    setCfg((prev) => {
      if (!prev?.pair) return prev;
      const next = rememberPeerName(prev, prev.pair.id, n);
      if (!next) return prev;
      return saveCfg(next);
    });
  }, [saveCfg]);

  // --- connessione persistente --------------------------------------------
  // Vive finché c'è una pairStat: passare da "in ascolto" a "nel canale"
  // non riconnette nulla, cambia solo lo stato dichiarato al server.
  useEffect(() => {
    if (!cfg || !isPaired(cfg) || !isServerConfigured(cfg) || !available) return;
    const pair = cfg.pair!;

    // Se la presenza era tenuta viva dal servizio senza interfaccia
    // (riavvio del telefono), ora il comando passa all'app: due
    // connessioni dallo stesso dispositivo si scalzerebbero a vicenda.
    stopListening();
    let cancelled = false;

    (async () => {
      const perms = await requestAllPermissions();
      cameraGranted.current = perms.camera;
      if (!perms.mic) {
        Alert.alert('Permesso negato', 'Senza microfono non puoi usare il canale.');
        setScreen('settings');
        return;
      }
      if (cancelled) return;

      Foreground.start(noticeTextRef.current, false).catch(() => {});

      const sig = new Signaling(
        {
          serverUrl: cfg.serverUrl.trim(),
          room: pair.id,
          displayName: cfg.displayName || 'Qualcuno',
          key: pair.key,
          side: pair.side,
          mode: 'listening',
        },
        {
          onStatus: (st, dettaglio) => {
            setStatus(st);
            if (st === 'offline') signalingWasDown.current = true;
            /**
             * Le cadute del connectionName al server, nel diario.
             *
             * Era l'unica cosa che non registravamo: cosa fai tu, cosa fa
             * lui, quando muore l'app, quando cade lui - e non quando il
             * server sparisce per noi. È il buco che ha fatto perdere due
             * giorni su un altro fronte. Il codice dice chi ha chiuso:
             * 1006 caduta di rete, 1000 chiusura ordinata, 4xxx rifiuto
             * del server.
             */
            /**
             * Il ritorno si misura da quando si è rimasti senza, non dal
             * passo precedente.
             *
             * Guardando solo lo stato di prima, `server:ok` pretendeva un
             * salto diretto da "offline" a "collegato" - ma si passa
             * sempre da "in apertura", quindi quella riga non si è
             * scritta mai, e il diario non sapeva dire quando il
             * connectionName fosse tornato. Che è esattamente la domanda
             * per cui il diario esiste.
             */
            if (st === 'offline') {
              if (!noServerSince.current) {
                noServerSince.current = Date.now();
                Diario.segna(`server:giu:${dettaglio ?? '?'}`).catch(() => {});
              }
            } else if (st !== 'connecting' && noServerSince.current) {
              const quanto = Math.round((Date.now() - noServerSince.current) / 1000);
              noServerSince.current = 0;
              emptyBeats.current = 0;
              Diario.segna(`server:ok:dopo ${quanto}s`).catch(() => {});
            }
          },

          onJoined: ({ peerPresent: present, peerActive, peerName: n, turn }) => {
            // Ritrovandolo collegato, qualunque cosa avesse fatto prima
            // non conta più.
            if (present) setPeerDetached(false);
            // Il relay lo configura il server: sui telefoni non si digita nulla.
            serverTurnRef.current = turn ? [turn] : [];
            sessionRef.current?.setServerIceServers(serverTurnRef.current);
            // Se eravamo rimasti senza server, qualunque offerta partita
            // nel frattempo è andata persa: si riparte da zero.
            const afterOutage = signalingWasDown.current;
            signalingWasDown.current = false;
            // Solo un vero cambio di rete rende sensato ricercare una
            // strada diretta: è l'unico momento in cui può esserne
            // comparsa una che prima non c'era.
            if (afterOutage) relayRetried.current = false;
            // Il ruolo NON può dipendere da chi entra per primo: la
            // connessione si riaggancia a ogni cambio di rete, e chi era
            // "primo" può ritrovarsi secondo. Sono bastate due
            // riconnessioni sfortunate perché entrambi si credessero
            // quello che deve offrire, e le offerte si scontrassero.
            //
            // Il lato dell'accoppiamento invece è fissato per sempre e
            // per costruzione è diverso sui due telefoni.
            politeRef.current = pair.side === 'A';
            peerActiveRef.current = peerActive;
            setPeerPresent(present);
            if (n) noteName(n);
            if (peerActive && inChannelRef.current) {
              if (afterOutage) riprendiDopoCaduta(); else attachPeer();
            }
          },

          onPeerJoined: (n, mode) => {
            Diario.segna(`altro-torna:${mode === 'active' ? 'canale' : 'attesa'}`)
              .catch(() => { /* noop */ });
            setPeerPresent(true);
            setPeerDetached(false);
            noteName(n);
            // È tornato: l'attesa che stava per dimenticarlo si annulla.
            stopWaiting();
            peerActiveRef.current = mode === 'active';
            if (mode === 'active' && inChannelRef.current) attachPeer(true);
          },

          onPeerLeft: (motivo) => {
            // Nel diario, perché è la domanda che ci si fa dopo: "l'altro
            // è sparito - ha chiuso lui o è caduto?". La notifica lo dice
            // sul momento a chi sta guardando; questa riga lo dice a chi
            // leggerà domani col cavo, e sta sul telefono di qua, quindi
            // si legge senza aspettare nessuno scambio.
            Diario.segna(`altro-via:${motivo}`).catch(() => { /* noop */ });
            setPeerPresent(false);
            setPeerSeen(false);
            setPeerDetached(motivo === 'bye');
            peerActiveRef.current = false;
            sessionRef.current?.detachPeer();
            // Se ha salutato è uscito davvero; se è caduto gli si tiene il
            // posto qualche secondo, che è il tempo di un cambio di rete.
            forgetPeer(motivo === 'bye');
            setConnState('new');
          },

          /**
           * La risposta a "c'è ancora?".
           *
           * Di solito conferma quello che già si sapeva. Quando non lo
           * conferma - l'altro risulta nel canale e noi non ce n'eravamo
           * accorti - vuol dire che un annuncio è andato perso, e questa
           * è l'occasione per rimettersi in pari invece di restare a
           * guardare una schermata di attesa mentre lui aspetta noi.
           */
          onPresence: ({ peerPresent: present, peerActive, peerName: n }) => {
            // Il server ha risposto: qualunque dubbio avessimo sul
            // socket, è vivo. Vale per la prova dopo un cambio di rete
            // e per quella del battito.
            stopNetworkProbe();
            answerSeen.current = Date.now();
            setPeerPresent(present);
            if (present) setPeerDetached(false);
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
              // Uscita voluta: ha premuto "Esci" ed è tornato in ascolto.
              forgetPeer(true);
              setConnState('new');
            }
          },

          onNotify: (reason, n) => {
            Diario.segna(reason === 'knock' ? 'altro-avvisa' : 'altro-entra').catch(() => {});
            noteName(n);
            setKnockPending(false);
            // Il nome è facoltativo: senza, si evita di scrivere "Qualcuno".
            const named = n && n !== 'Qualcuno';
            // Con più collegamenti configurati, "ti stanno chiamando" non
            // basta: chiama uno solo dei due o tre che conosci, e sapere
            // quale è metà dell'informazione. Con un connectionName solo il
            // titolo resta "Duetto", che non ha niente da disambiguare.
            const titolo = alertNameRef.current;

            if (reason === 'knock') {
              // Un richiamo esplicito passa sempre, anche con l'app aperta:
              // chi bussa lo fa proprio perché l'altro non risponde, e il
              // telefono può essere acceso sul tavolo senza nessuno davanti.
              Foreground.notify(
                titolo,
                named ? `${n} ti sta chiamando` : 'Ti stanno chiamando',
              ).catch(() => {});
              // La vibrazione non si fa più da qui: sta nel canale della
              // notifica, insieme al suono, perché è lì che si possono
              // regolare - e perché vibrando anche di nostro, con la
              // vibrazione del canale accesa, si sentirebbe due volte.
              return;
            }

            // L'arrivo dell'altro, invece, in primo piano si vede già:
            // notificarlo sarebbe solo rumore.
            if (appStateRef.current !== 'active') {
              Foreground.notify(
                titolo,
                named ? `${n} è nel canale` : 'C’è qualcuno nel canale',
              ).catch(() => {});
            }
          },

          onSignal: async (msg) => {
            const sess = sessionRef.current;
            if (!sess) return;
            // L'altro è rimasto senza connectionName e ci chiede di
            // rifare l'offerta: tocca a noi, che siamo quelli che offrono.
            if (msg.kind === 'renegotiate') {
              if (!politeRef.current && inChannelRef.current) attachPeer(true);
              return;
            }
            // L'altro ha cambiato la qualità: vale per tutti e due, così
            // non ci si ritrova con due impostazioni diverse senza sapere
            // quale delle due si sta vedendo. Non si rimanda indietro:
            // sarebbe un rimpallo senza fine.
            if (msg.kind === 'quality') {
              applyQuality(msg.value as DuoConfig['videoQuality'], false);
              return;
            }
            // Come la risoluzione: vale per tutti e due, e chi la riceve
            // non la rimanda indietro.
            if (msg.kind === 'audio') {
              applyAudio(msg.richer, false);
              return;
            }
            // Il diario dei consumi dell'altro telefono, che finisce in
            // un file accanto al nostro: così collegando UN solo telefono
            // si leggono tutti e due. Passa dalla busta cifrata come il
            // resto: il server lo inoltra senza poterlo leggere.
            // L'altro è morto e ora è tornato: dirlo, senza far suonare
            // niente. È una notizia, non una chiamata.
            // "Non sono uscito io, mi hanno chiuso l'app."
            if (msg.kind === 'tornDown') {
              setPeerTornDown(true);
              Diario.segna('altro-smontata').catch(() => {});
              return;
            }

            if (msg.kind === 'death') {
              // Questo racconto contiene già il ritorno: l'annuncio
              // generico non serve più.
              forgetReturn();
              const testo = deathStory(
                Number(msg.when), String(msg.cause), shownNameRef.current,
                Number(msg.back) || 0,
              );
              Foreground.nota(alertNameRef.current, testo).catch(() => {});
              setNotice(testo);
              Diario.segna(`morte-altrui:${msg.cause}`).catch(() => {});
              return;
            }

            // Un suono per svegliarci: lo suona questo telefono, forte,
            // dal volume della sveglia. Arriva solo da chi è nel canale
            // con noi, cioè da una persona sola al mondo.
            if (msg.kind === 'alarm') {
              Sveglia.suona(String(msg.sound ?? '')).catch(() => {});
              Diario.segna(`sveglia:${msg.sound}`).catch(() => {});
              return;
            }

            if (msg.kind === 'journal') {
              Diario.aggiungiAltro(String(msg.text ?? ''), journalKeyRef.current)
                .catch(() => {});
              return;
            }
            // Se l'altro ha ricostruito prima di noi, la sua offerta
            // arriva quando ancora non abbiamo nulla per riceverla e
            // verrebbe scartata: prima ci prepariamo, poi la trattiamo.
            if (!sess.hasPeer() && inChannelRef.current && peerActiveRef.current) {
              try { await sess.attachPeer(politeRef.current); } catch { /* noop */ }
            }
            sess.onSignal(msg);
          },

          onKnockResult: (ok, error) => {
            if (ok) {
              // Solo una conferma a schermo: il pulsante resta premibile,
              // perché insistere è precisamente ciò che si vuole fare
              // quando il primo notice non ha ottenuto risposta.
              setKnockPending(true);
              setTimeout(() => setKnockPending(false), 2000);
            }
            // Niente finestrella quando il server risponde "non c'è":
            // il pulsante è già spento e non premibile quando il suo
            // telefono non è collegato, quindi o non ci si è arrivati,
            // o è appena caduto - e per quello c'è già la riga che dice
            // com'è messo, senza fermare quello che si stava facendo.
          },

          onError: (code) => {
            if (code === 'room-full' || code === 'replaced') {
              // Quasi sempre transitorio: la connessione precedente non è
              // ancora stata dichiarata morta, o il telefono si è riagganciato
              // altrove. Il riaggancio automatico ci pensa da solo: un notice
              // qui sarebbe solo allarmismo.
            }
            else if (code === 'decrypt-failed') {
              Alert.alert(
                'Chiavi diverse',
                'I due telefoni non condividono la stessa chiave: rifate l’accoppiamento.',
              );
            }
          },
        },
      );

      signalingRef.current = sig;
      // Da qui in poi la connessione è nostra: l'ascolto senza
      // interfaccia deve saperlo, o se ne aprirebbe una seconda che
      // scalzerebbe questa.
      interfaceInCharge(true);
      sig.connect();

      // Ingresso automatico. setMode aggiorna lo stato dichiarato anche
      // prima che il WebSocket sia aperto, e il join che parte dopo lo
      // porta già corretto: non serve aspettare la connessione.
      if (!cancelled) await enterChannel();
    })();

    return () => {
      cancelled = true;
      sessionRef.current?.leaveChannel();
      sessionRef.current = null;
      // Si saluta solo se ce ne andiamo davvero, cioè se qualcuno ha
      // scelto di rendersi non available o ha sciolto il connectionName.
      // Tutte le altre chiusure sono passaggi di mano, e l'altro non
      // deve leggere "si è staccato" per una connessione che si rifà.
      interfaceInCharge(false);
      const addio = sayGoodbye.current;
      sayGoodbye.current = false;
      signalingRef.current?.close(addio);
      signalingRef.current = null;
      /**
       * Il servizio si ferma SOLO se ce ne andiamo davvero.
       *
       * Prima si fermava a ogni smontaggio, e questo comprende il caso
       * in cui l'utente toglie l'app dai recenti: lì React Native
       * smonta tutto, questa riga spegneva il servizio, e da quel
       * momento il processo era un guscio vuoto in attesa di essere
       * riciclato. Nel diario si vede benissimo - "uscita", e un quarto
       * d'ora dopo la morte - ed era il difetto che restava dopo aver
       * tolto la scorciatoia dai recenti nel servizio stesso: la
       * scorciatoia era due, e ne avevo tolta una sola.
       */
      if (addio) Foreground.stop().catch(() => {});
      try { InCallManager.stop(); } catch { /* noop */ }
      Audio.useCallVolumeKeys(false).catch(() => {});
    };
    // attachPeer è stabile: usa solo ref. `cfg` si legge dalla chiusura
    // ma non è una dipendenza: solo connKey deve far rifare tutto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connKey, available]);

  /**
   * Assicura un connectionName diretto vivo, quando siamo entrambi nel canale.
   *
   * `force` serve quando l'altro si è appena ricollegato: la sua
   * connessione è nuova per definizione, quindi la nostra è comunque da
   * rifare, anche se dal nostro lato sembrasse ancora buona.
   *
   * Senza questo, dopo un'interruzione di rete restava in piedi una
   * connessione morta e non si vedeva più nulla finché non si chiudeva
   * l'app: il codice trovava una connessione già presente e non faceva
   * nulla.
   */
  const timerAssenza = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopWaiting = useCallback(() => {
    if (timerAssenza.current) {
      clearTimeout(timerAssenza.current);
      timerAssenza.current = null;
    }
  }, []);

  /**
   * L'altro non c'è più: microfono e camera suoi non sono più di nessuno.
   *
   * Finché quello stato resta acceso, il posto grande continua ad
   * aspettare un video che non arriverà: è quello che teneva il proprio
   * video piccolo dopo che l'altro era uscito.
   *
   * @param subito vero se se n'è andato lui, falso se è caduta la rete
   */
  const forgetPeer = useCallback((subito: boolean) => {
    stopWaiting();
    const spegni = () => {
      setPeerState({ audio: true, video: false });
      // Anche "l'ho visto": senza, restava vero mentre il suo stato era
      // vuoto, e siccome un Duetto vecchio si riconosce proprio dal non
      // dichiarare la versione, uscito dal canale gli veniva attribuita
      // una versione vecchia che non ha mai avuto.
      setPeerSeen(false);
    };
    if (subito) { spegni(); return; }
    timerAssenza.current = setTimeout(() => {
      timerAssenza.current = null;
      spegni();
    }, RETURN_WAIT_MS);
  }, [stopWaiting]);

  useEffect(() => stopWaiting, [stopWaiting]);

  const attachPeer = useCallback(async (force = false) => {
    const sig = signalingRef.current;
    const s = sessionRef.current;
    if (!sig || !s) return;
    if (force || !s.isPeerHealthy()) s.detachPeer();

    // Chi risponde non ricostruisce nulla di propria iniziativa: aspetta
    // l'offerta, che farà nascere la connessione al momento giusto
    // (vedi onSignal). Ricostruirla subito significherebbe demolire, un
    // istante dopo, proprio quella che l'offerta in arrivo sta creando:
    // è così che nascevano tre ricostruzioni in due secondi.
    if (politeRef.current) return;

    try {
      await s.attachPeer(politeRef.current);
      s.broadcastState();
    } catch (e: any) {
      // Qui dentro ora si apre anche il microfono, che può essere negato
      // (permesso revocato mentre l'app era aperta). Prima era un errore
      // impossibile e si poteva ignorare: ora se si tace, l'altro entra e
      // non si collega niente, senza che nulla lo spieghi.
      console.log('[duetto-rtc]', 'attachPeer fallita:', String(e?.message ?? e));
      // Solo se è mancato il microfono. Le altre cadute di attachPeer
      // capitano durante le riconnessioni e si risolvono da sole: un
      // notice a ogni tentativo sarebbe rumore, e coprirebbe questo.
      if (!s.hasMic()) Alert.alert('Errore microfono', String(e?.message ?? e));
    }
  }, []);

  /**
   * Ritorno della rete: si riaccende ICE, non si ricostruisce tutto.
   *
   * Ricostruire distrugge la traccia dell'altro, e con lei la superficie
   * che la disegnava: da qui lo schermo nero a ogni cambio di rete.
   * Riaccendendo ICE invece decodificatore e superficie restano in piedi
   * e l'immagine resta ferma sull'ultimo fotogramma finché i pacchetti
   * non riprendono - che è quello che si vede fare alle altre app.
   *
   * La ricostruzione resta come rete di sicurezza: se dopo sei secondi
   * non siamo collegati, si demolisce e si rifà. Era la via principale
   * perché un'offerta mandata mentre il server era irraggiungibile va
   * persa; ma qui il server è appena tornato, e l'offerta parte adesso.
   */
  const riprendiDopoCaduta = useCallback(() => {
    const s = sessionRef.current;
    if (!s || !s.hasPeer()) { attachPeer(true); return; }

    console.log('[duetto-rtc]', 'rete tornata: riaccendo ICE senza ricostruire');
    if (politeRef.current) signalingRef.current?.sendSignal({ kind: 'renegotiate' });
    else s.restartIce();

    clearRecovery();
    hardTimer.current = setTimeout(() => {
      if (connStateRef.current === 'connected') return;
      if (!inChannelRef.current || !peerActiveRef.current) return;
      console.log('[duetto-rtc]', 'la riaccensione non è bastata: ricostruisco');
      attachPeer(true);
    }, 6000);
  }, [attachPeer, clearRecovery]);

  // --- entrare e uscire dal canale ----------------------------------------
  const enterChannel = useCallback(async () => {
    const sig = signalingRef.current;
    if (!sig || !cfg) return;

    if (!sessionRef.current) {
      sessionRef.current = new ChannelSession(cfg, sig, {
        onLocalStream: (st) => {
          setLocalStream(st);
          // Le proporzioni si rileggono a ogni cambio della propria
          // ripresa, non solo accendendo il video: cambiando profilo la
          // camera si riapre dentro la sessione, senza passare di qui, e
          // il riquadrino restava della forma vecchia.
          setLocalAspect(sessionRef.current?.getLocalVideoAspect());
        },
        onRemoteStream: setRemoteStream,
        onConnectionState: (st) => {
          setConnState(st);
          connStateRef.current = st;

          if (st === 'connected') { clearRecovery(); return; }
          if (st !== 'failed' && st !== 'disconnected') return;

          // ICE si riprende spesso da solo, anche da "failed": nel log si
          // è visto passare da failed a connected senza alcun aiuto.
          // Demolire subito interrompeva audio e video proprio mentre si
          // stava risistemando, ed era la causa della maggior parte delle
          // interruzioni visibili. Ora: si aspetta, si tenta la riparazione
          // leggera, e solo se non basta si ricostruisce.
          clearRecovery();
          softTimer.current = setTimeout(async () => {
            if (connStateRef.current === 'connected') return;
            if (signalingWasDown.current) return;
            if (!inChannelRef.current || !peerActiveRef.current) return;

            if (politeRef.current) {
              // Non possiamo offrire: lo chiediamo all'altro.
              signalingRef.current?.sendSignal({ kind: 'renegotiate' });
            } else {
              await sessionRef.current?.restartIce();
            }

            hardTimer.current = setTimeout(() => {
              if (connStateRef.current === 'connected') return;
              if (signalingWasDown.current) return;
              if (inChannelRef.current && peerActiveRef.current) attachPeer(true);
            }, 8000);
          }, st === 'failed' ? 4000 : 12000);
        },
        onVideoStats: setVideoStats,
        onPeerState: (st) => {
          setPeerSeen(true);
          // Solo i cambiamenti: lo stato arriva anche quando non è
          // cambiato niente, e una riga per ogni messaggio sarebbe un
          // diario che racconta il silenzio.
          const prima = peerStateRef.current;
          if (prima.audio !== st.audio) {
            Diario.segna(`altro-audio:${st.audio ? 'on' : 'off'}`).catch(() => {});
          }
          if (prima.video !== st.video) {
            Diario.segna(`altro-video:${st.video ? 'on' : 'off'}`).catch(() => {});
          }
          if (st.camera && prima.camera !== st.camera) {
            Diario.segna(`altro-camera:${st.camera}`).catch(() => {});
          }
          if (st.output && prima.output !== st.output) {
            Diario.segna(`altro-uscita-audio:${st.output}`).catch(() => {});
          }
          peerStateRef.current = {
            audio: st.audio, video: st.video, camera: st.camera, output: st.output,
          };
          // Se ci manda il suo stato è tornato, qualunque cosa dicesse il
          // conto alla rovescia: senza fermarlo, poco dopo spegnerebbe uno
          // stato appena arrivato.
          stopWaiting();
          setPeerState(st);
          setPeerVp9(st.hwVp9 === true);
        },
        onRemoteVideo: (present) => {
          setRemoteHasVideo(present);
          // Solo quando il video RICOMPARE dopo essere mancato.
          //
          // Ricreare la vista serve a non riagganciarsi a una superficie
          // morta, che resterebbe nera. Ma farlo a ogni conferma di
          // "video presente" - e ne arriva una a ogni cambio di
          // risoluzione, quando l'encoder scende o risale - distruggeva e
          // ricostruiva l'immagine di continuo: un lampo che sembra un
          // ricollegamento, e non lo è.
          if (present && !hadRemoteVideo.current) {
            setRemoteVideoKey((k) => k + 1);
          }
          hadRemoteVideo.current = present;
        },
      });
    }
    sessionRef.current.setServerIceServers(serverTurnRef.current);
    // Il microfono non si apre qui: lo apre la sessione quando l'altro
    // arriva davvero. Chi entra per primo può aspettare a lungo, e in
    // quell'attesa non c'è nulla da trasmettere.
    setAudioOn(sessionRef.current.isAudioEnabled());

    try {
      InCallManager.start({ media: 'audio' });
    } catch { /* noop */ }
    // Riaccendendo l'audio, InCallManager riporta l'uscita a quella
    // predefinita: la scelta di questo connectionName va rimessa adesso,
    // non prima.
    reapplyRouteRef.current?.();

    // I tasti del volume vanno detti a mano: senza, su certi telefoni
    // regolano il multimedia e non hanno effetto sulla voce dell'altro.
    Audio.useCallVolumeKeys(true).catch(() => {});

    setInChannel(true);
    inChannelRef.current = true;
    setScreen('channel');
    sig.setMode('active');

    if (peerActiveRef.current) attachPeer();

    /**
     * Rientro subito dopo un'uscita: si riprende com'era.
     *
     * Il microfono lo si rimette qui; la camera un attimo dopo, perché
     * accenderla richiede il permesso e il servizio con il tipo giusto,
     * e in questo istante la sessione sta ancora prendendo posto.
     */
    const prima = howItWas.current;
    howItWas.current = null;
    if (prima) {
      const fermo = Date.now() - prima.quando;
      if (!prima.audio && fermo < RESUME_MIC_MS) {
        Diario.segna(`riprendo-microfono:dopo ${Math.round(fermo / 1000)}s`)
          .catch(() => { /* noop */ });
        const acceso = sessionRef.current?.toggleAudio();
        if (acceso !== undefined) setAudioOn(acceso);
      }
      if (prima.video && fermo < RESUME_VIDEO_MS) {
        Diario.segna(`riprendo-video:dopo ${Math.round(fermo / 1000)}s`)
          .catch(() => { /* noop */ });
        setTimeout(() => { turnVideoBackOnRef.current?.(); }, 300);
      }
    }
  }, [cfg, attachPeer, stopWaiting]);

  useEffect(() => { enterChannelRef.current = enterChannel; }, [enterChannel]);

  /**
   * Riaccendere la camera dopo un rientro immediato.
   *
   * Sta in un riferimento perché chi lo chiama - l'ingresso nel canale -
   * nasce prima della funzione che accende il video.
   */
  const turnVideoBackOnRef = useRef<(() => void) | null>(null);

  /**
   * Quanto si aspetta al massimo prima di uscire comunque.
   *
   * Con la rete lenta o assente, il diario non parte: "attendi un
   * momento" non deve mai diventare "l'app non esce".
   */
  const LEAVING_CAP_MS = 2000;
  /**
   * Un respiro fra l'invio e la chiusura del socket.
   *
   * Mandare un messaggio e chiudere nello stesso istante rischia di
   * chiudere prima che sia partito davvero: quello che si guadagna
   * scrivendolo si perderebbe nel non spedirlo.
   */
  const BREATH_MS = 250;

  /**
   * Uscire dal canale, dopo aver messo al sicuro il diario.
   *
   * L'ordine conta: prima si scrive la riga dell'uscita, poi la si
   * manda all'altro telefono finché la connessione è ancora aperta, e
   * solo allora si esce davvero. Uscendo prima, il racconto di quello
   * che si è appena fatto restava su questo telefono - e se l'app
   * moriva nel frattempo, non lo leggeva più nessuno.
   */
  /**
   * Com'era la conversazione all'ultima uscita, e quando.
   *
   * Uscire e rientrare subito quasi sempre non è una scelta: è un tocco
   * sbagliato, o il telefono che ha chiuso l'app. E anche quando è una
   * scelta - metto giù un momento, torno - ritrovarsi il video spento e
   * da riaccendere a mano è una seccatura. Si riprende com'era, con
   * due attese diverse per il microfono e per la camera: vedi
   * RESUME_MIC_MS.
   */
  const howItWas = useRef<{ quando: number; video: boolean; audio: boolean } | null>(null);

  const leaveChannel = useCallback(async (restaDisponibile = true) => {
    // La riga dell'uscita si scrive PRIMA di mandare, altrimenti parte
    // tutto tranne la cosa che si sta facendo.
    await Diario.segna(restaDisponibile ? 'uscita-canale' : 'non-available')
      .catch(() => { /* noop */ });

    // Prima di smontare tutto: com'era, per poterlo rimettere se si
    // rientra subito.
    howItWas.current = {
      quando: Date.now(),
      video: sessionRef.current?.isVideoEnabled() === true,
      audio: sessionRef.current?.isAudioEnabled() !== false,
    };

    setLeaving(true);
    try {
      const attendi = (ms: number) => new Promise<void>((r) => { setTimeout(r, ms); });
      await Promise.race([
        (async () => {
          await sendJournal();
          await attendi(BREATH_MS);
        })(),
        attendi(LEAVING_CAP_MS),
      ]);
    } finally {
      setLeaving(false);
    }

    const sig = signalingRef.current;
    sessionRef.current?.leaveChannel();
    sessionRef.current = null;
    try { InCallManager.stop(); } catch { /* noop */ }
    Audio.useCallVolumeKeys(false).catch(() => {});
    Foreground.setCameraActive(false).catch(() => {});
    setLocalStream(null);
    setRemoteStream(null);
    setRemoteHasVideo(false);
    setVideoOn(false);
    setLocalAspect(undefined);
    setConnState('new');
    setInChannel(false);
    inChannelRef.current = false;
    sig?.setMode('listening');
    // Staccarsi non è una cosa da fare a mano qui: basta dichiararsi non
    // disponibili, e l'effetto della connessione smonta tutto da sé -
    // sessione, signaling, servizio in primo piano - come fa a ogni
    // cambio di pairStat.
    if (!restaDisponibile) {
      sayGoodbye.current = true;
      setAvailable(false);
    }

    // Uscire dal canale è uscire dall'app: la finestra sparisce. Il
    // processo però resta vivo, così continui a essere raggiungibile e
    // ricevi la notifica quando l'altro entra. Riaprendo l'app si rientra
    // direttamente nel canale.
    AppWindow.minimize().catch(() => {});
  }, [sendJournal]);

  /**
   * Rete di sicurezza contro il connectionName che non riparte.
   *
   * Chi risponde non può offrire: se resta senza connessione e l'altro
   * non se ne accorge - perché dal suo lato sembra tutto a posto -
   * aspetterebbe all'infinito. Ogni pochi secondi, chi si trova senza
   * connectionName mentre entrambi sono nel canale se ne occupa: chi offre
   * ricostruisce, chi risponde lo chiede.
   */
  useEffect(() => {
    if (screen !== 'channel') return;
    const timer = setInterval(() => {
      const sess = sessionRef.current;
      const sig = signalingRef.current;
      if (!sess || !sig?.connected) return;
      if (!inChannelRef.current || !peerActiveRef.current) return;
      if (sess.isPeerHealthy()) return;

      if (politeRef.current) sig.sendSignal({ kind: 'renegotiate' });
      else attachPeer(true);
    }, 5000);
    return () => clearInterval(timer);
  }, [screen, attachPeer]);

  // --- tasto Indietro: Picture-in-Picture ----------------------------------
  const pipSupported = useRef(false);
  useEffect(() => {
    Pip.isSupported().then((v) => { pipSupported.current = v; }).catch(() => {});
  }, []);

  const stageAspect =
    (peerState.video ? peerState.aspect : undefined) ??
    (videoOn ? localAspect : undefined) ??
    9 / 16;

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      // Dalle impostazioni il tasto Indietro riporta nel canale, invece
      // di chiudere l'app lasciandoti senza via d'uscita.
      if (screen === 'settings' && cfg && isPaired(cfg)) {
        setScreen('channel');
        return true;
      }
      // Dall'accoppiamento si torna sempre alle impostazioni: da lì si
      // rientra nel canale, o si cambia server. Senza questo, il tasto
      // Indietro sulla schermata «Collega i due telefoni» chiudeva
      // l'app - e chi ci era arrivato per aggiungere un connectionName non
      // aveva nessun modo di tornare da dove era venuto.
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

  // Ruotando cambiano le proporzioni del proprio video: vanno ricomunicate.
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
      return;
    }
    if (!cameraGranted.current) {
      const res = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CAMERA);
      cameraGranted.current = res === 'granted';
      if (!cameraGranted.current) {
        Alert.alert('Permesso negato', 'Serve il permesso camera per attivare il video.');
        return;
      }
    }
    await Foreground.setCameraActive(true).catch(() => {});
    try {
      setVideoOn(await s.enableVideo());
      setLocalAspect(s.getLocalVideoAspect());
      // La camera si apre su quella scelta, che può essere stata cambiata
      // a video spento: qui si allinea solo l'icona.
      setFrontCamera(s.isFrontCamera());
    } catch (e: any) {
      Foreground.setCameraActive(false).catch(() => {});
      Alert.alert('Errore camera', String(e?.message ?? e));
    }
  }, []);

  /**
   * Il rientro immediato riaccende la camera passando di qui.
   *
   * Attraverso un riferimento, perché l'ingresso nel canale nasce prima
   * di questa funzione e non potrebbe nominarla.
   */
  useEffect(() => {
    turnVideoBackOnRef.current = () => {
      if (sessionRef.current?.isVideoEnabled()) return;
      onToggleVideo();
    };
  }, [onToggleVideo]);

  // --- salvataggi ----------------------------------------------------------
  /**
   * Cambia la qualità video su ENTRAMBI i telefoni.
   *
   * Il profilo agisce sull'encoder di chi trasmette, quindi da solo
   * cambierebbe solo cosa vede l'altro. Tenendoli allineati la scelta
   * significa "come guardiamo", che è quello che uno intende; se non va
   * bene, l'altro la ricambia e torna allineata di nuovo.
   */
  const applyQuality = useCallback(
    (q: DuoConfig['videoQuality'], tell: boolean) => {
      setCfg((prev) => {
        if (!prev || prev.videoQuality === q) return prev;
        return saveCfg({ ...prev, videoQuality: q });
      });
      sessionRef.current?.setVideoQuality(q);
      Diario.segna(`${tell ? '' : 'altro-'}qualita:${q}`).catch(() => {});
      if (tell) signalingRef.current?.sendSignal({ kind: 'quality', value: q });
    },
    [saveCfg],
  );

  /**
   * Le opzioni audio, su tutti e due i telefoni.
   *
   * "Voce più ricca" alzata da una parte sola migliora solo una delle
   * due direzioni, e chi l'ha alzata non sente nessuna differenza:
   * l'audio che ascolta lo manda l'altro.
   */
  const applyAudio = useCallback((migliore: boolean, tell: boolean) => {
    setCfg((prev) => {
      if (!prev || prev.richerAudio === migliore) return prev;
      return saveCfg({ ...prev, richerAudio: migliore });
    });
    sessionRef.current?.setAudioOptions(migliore);
    Diario.segna(`${tell ? '' : 'altro-'}voce-ricca:${migliore ? 'si' : 'no'}`)
      .catch(() => {});
    if (tell) signalingRef.current?.sendSignal({ kind: 'audio', richer: migliore });
  }, [saveCfg]);

  const onSaveSettings = useCallback(async (scritta: DuoConfig) => {
    Diario.segna('impostazioni-salvate').catch(() => { /* noop */ });
    // Il server appena scritto è il server di questa pairStat: se resta
    // solo nell'app, tornando qui da un altro connectionName si
    // riporterebbe dietro l'indirizzo vecchio.
    const next = alignPairServer(scritta);
    setCfg(saveCfg(next));
    // La qualità è già stata applicata al tocco, ma applicarla di nuovo
    // non costa nulla e copre il caso di una config arrivata da altrove.
    applyQuality(next.videoQuality, true);
    setScreen(isPaired(next) ? 'channel' : 'pairing');
  }, [applyQuality]);

  const onPaired = useCallback(async (pair: PairInfo) => {
    if (!cfg) return;
    // Non sostituisce il connectionName di prima: gli si affianca, e passa
    // in testa. Chi si accoppia con qualcun altro non sta dicendo di
    // volersi dimenticare del primo.
    const next = addPair(cfg, pair);
    setCfg(saveCfg(next));
    setPeerName(pair.peerName);
    setScreen(next.setupShown ? 'channel' : 'setup');
  }, [cfg]);

  /**
   * Passa a un altro connectionName già configurato.
   *
   * Non c'è niente da smontare a mano: cambiando la pairStat cambia
   * `connKey`, e l'effetto della connessione si rifà da capo - chiude il
   * vecchio, apre il nuovo, rientra nel canale. Qui si spegne solo ciò
   * che si vede, che altrimenti resterebbe a mostrare la persona
   * appena lasciata.
   */
  /**
   * Riporta i comandi allo stato di una connessione appena aperta.
   *
   * Cambiando connectionName la sessione si rifà da capo: microfono
   * acceso, camera spenta, niente immagini. I pulsanti però restavano
   * come li avevi lasciati con l'altra persona, e un pulsante "video"
   * acceso sopra a un video che non c'è non è una svista grafica: è il
   * pulsante che dice il falso, e premendolo si spegne una cosa mai
   * accesa.
   */
  /**
   * Con che impostazioni è partito questo connectionName.
   *
   * Una riga sola, quando si comincia e a ogni cambio di connectionName.
   * Le azioni le racconta il diario riga per riga, ma senza sapere da
   * dove si parte non si capisce cosa vuol dire non averle cambiate: se
   * la camera resta la posteriore per tutta la sera, la riga che lo
   * spiega non c'è, perché nessuno l'ha girata.
   *
   * Solo al cambio di connectionName: scriverla a ogni ritocco sarebbe
   * ripetere quello che la riga dell'azione ha appena detto.
   */
  const cfgRef = useRef<DuoConfig | null>(null);
  useEffect(() => { cfgRef.current = cfg; }, [cfg]);
  const levelRef = useRef(level);
  useEffect(() => { levelRef.current = level; }, [level]);
  useEffect(() => {
    const c = cfgRef.current;
    if (!c?.pair) return;
    const pezzi = [
      `camera=${c.frontCamera !== false ? 'frontale' : 'posteriore'}`,
      `uscita=${c.audioOutput}`,
      `qualita=${c.videoQuality}`,
      `voce-ricca=${c.richerAudio ? 'si' : 'no'}`,
      `volume=${Math.round(levelRef.current * 100)}%`,
      `notice=${c.alertSound}`,
      `vibra=${c.alertVibration}`,
      `controls=${c.controls}`,
      `diagnostica=${c.showDiagnostics ? 'si' : 'no'}`,
    ];
    Diario.segna(`impostazioni:${pezzi.join(',')}`).catch(() => { /* noop */ });
  }, [cfg?.pair?.id]);

  /**
   * Il pulsante della camera segue il connectionName in uso.
   *
   * Non basta darlo alla sessione: il pulsante lo si guarda anche a
   * video spento, ed è lì che dice con quale camera si aprirà.
   */
  useEffect(() => {
    if (cfg) setFrontCamera(cfg.frontCamera !== false);
  }, [cfg?.frontCamera, cfg?.pair?.id]);

  const resetPeerMemory = useCallback(() => {
    // Anche la memoria di com'era l'altro: è un'altra persona, e i suoi
    // primi messaggi non sono "cambiamenti" rispetto al precedente.
    peerStateRef.current = {};
    setVideoOn(false);
    setAudioOn(true);
    setLocalStream(null);
    setLocalAspect(undefined);
    setRemoteStream(null);
    setRemoteHasVideo(false);
    setPeerState({ audio: true, video: false });
    setPeerSeen(false);
    setPeerVp9(false);
    setConnState('new');
  }, []);

  const onSwitchPair = useCallback(async (id: string) => {
    if (!cfg) return;
    const next = switchToPair(cfg, id);
    if (next === cfg) return;
    setCfg(saveCfg(next));
    setPeerName(next.pair?.peerName || '');
    setPeerPresent(false);
    peerActiveRef.current = false;
    resetPeerMemory();
    stopWaiting();
    setScreen('channel');
  }, [cfg, stopWaiting, resetPeerMemory]);

  /**
   * Il nome che do io a un connectionName.
   *
   * Non viaggia da nessuna parte: l'altro non lo vede e non lo saprà
   * mai. Serve qui, dove i collegamenti stanno in fila e senza un nome
   * si assomigliano tutti.
   */
  const onRenamePair = useCallback(async (id: string, nome: string) => {
    if (!cfg) return;
    const next = renamePair(cfg, id, nome);
    setCfg(saveCfg(next));
  }, [cfg]);

  /**
   * Manda all'altro un suono che lo svegli.
   *
   * Non passa dal server come l'notice: viaggia dentro la busta cifrata
   * della conversazione, che c'è già perché siete tutti e due nel
   * canale. Il server non sa nemmeno che è successo.
   */
  const onSveglia = useCallback((suono: string) => {
    signalingRef.current?.sendSignal({ kind: 'alarm', sound: suono });
    // Lo si sente anche da questa parte: chi manda un suono deve sapere
    // cos'ha mandato, e sentire che è partito davvero. Qui però esce
    // piano e dalla via della conversazione, non dalla sveglia: al
    // volume pieno finirebbe dritto nel proprio microfono e tornerebbe
    // all'altro raddoppiato, sopra a quello che sta già suonando da lui.
    Sveglia.suona(suono, true).catch(() => {});
    Diario.segna(`sveglia-mandata:${suono}`).catch(() => {});
  }, []);

  const onForgetPair = useCallback(async (id: string) => {
    if (!cfg) return;
    // Sciogliere un connectionName è un addio vero: chi resta dall'altra
    // parte deve sapere che non si tratta di una caduta.
    if (cfg.pair?.id === id) sayGoodbye.current = true;
    const next = forgetPair(cfg, id);
    setCfg(saveCfg(next));
    if (cfg.pair?.id === id) {
      setPeerName(next.pair?.peerName || '');
      setPeerPresent(false);
      peerActiveRef.current = false;
      resetPeerMemory();
      // Sciogliendo l'ultimo non resta nulla a cui collegarsi; se invece
      // ne resta un altro si è già passati a quello.
      setScreen(isPaired(next) ? 'channel' : 'pairing');
    }
  }, [cfg, resetPeerMemory]);

  // --- resa ----------------------------------------------------------------
  if (screen === 'loading' || !cfg) {
    return (
      <View style={styles.center}>
        <StatusBar barStyle="light-content" />
        <ActivityIndicator size="large" color="#2f7cf6" />
      </View>
    );
  }

  if (screen === 'settings') {
    return (
      <View style={styles.safe}>
        <StatusBar barStyle="light-content" />
        <SettingsScreen
          initial={cfg}
          onSave={onSaveSettings}
          onForgetPair={onForgetPair}
          onSwitchPair={onSwitchPair}
          onRenamePair={onRenamePair}
          // Non si tocca nessun connectionName esistente: quello nuovo si
          // aggiunge, se e quando riesce.
          onRepair={() => setScreen('pairing')}
          onClose={isPaired(cfg) ? () => setScreen('channel') : undefined}
          onOpenSetup={() => { setSetupFrom('settings'); setScreen('setup'); }}
          onQualityChange={(q) => applyQuality(q, true)}
          onLive={(patch) => setCfg((prev) => {
            if (!prev) return prev;
            const next = saveCfg({ ...prev, ...patch });
            // Le opzioni audio vanno anche applicate: il tetto a caldo,
            // le elaborazioni riaprendo il microfono.
            if ('richerAudio' in patch) applyAudio(next.richerAudio, true);
            // Suono e vibrazione dell'notice stanno nel canale di
            // notifica, che va rifatto da capo a ogni cambiamento.
            if ('alertVibration' in patch || 'alertSound' in patch || 'alertSoundUri' in patch) {
              Avvisi.configura(next.alertVibration, next.alertSound, next.alertSoundUri)
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
              // `setupShown` è dell'app - una schermata mostrata una
              // volta nella vita del telefono - ma il salvataggio passa
              // di lì lo stesso, così le impostazioni della pairStat
              // restano allineate.
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
          onPaired={onPaired}
          onBack={() => setScreen('settings')}
        />
      </View>
    );
  }

  return (
    <View style={styles.safe}>
      <StatusBar barStyle="light-content" />
      <ChannelScreen
        connectionName={connectionName}
        peerName={shownName}
        peerAvatar={face}
        peerPresent={peerPresent}
        peerDetached={peerDetached}
        peerTornDown={peerTornDown}
        videoStats={videoStats}
        qualityLabel={t(`quality.${(VIDEO_PROFILES[cfg.videoQuality] ?? VIDEO_PROFILES.standard).key}`)}
        showStats={cfg.showDiagnostics}
        controls={cfg.controls}
        news={notice}
        onNewsRead={() => setNotice(null)}
        // Alla schermata va il LIVELLO, non il gain: è il numero
        // che dice a che volume stai sentendo l'altro.
        gain={levelShowing ? level : null}
        peerGain={level}
        volumeSistema={systemVolume}
        onGuadagno={changeLevel}
        versionWarning={versionWarning}
        frontCamera={frontCamera}
        quality={cfg.videoQuality}
        onSelectQuality={(q) => applyQuality(q, true)}
        localStream={localStream}
        remoteStream={remoteStream}
        // Quello da mostrare, non quello vero: vedi shownStatus.
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
          const acceso = sessionRef.current?.toggleAudio() ?? false;
          setAudioOn(acceso);
          Diario.segna(`audio:${acceso ? 'on' : 'off'}`).catch(() => {});
        }}
        onToggleVideo={onToggleVideo}
        onSwitchCamera={() => {
          const s = sessionRef.current;
          if (!s) return;
          // La verità sta nella sessione, anche a video spento: è lei che
          // ricorda con quale camera si aprirà.
          const frontale = s.switchCamera();
          setFrontCamera(frontale);
          // Se la scelta non si scrive, la sessione dopo riparte dalla
          // frontale e la si deve rigirare ogni volta.
          setCfg((prev) => (prev ? saveCfg({ ...prev, frontCamera: frontale }) : prev));
          Diario.segna(`camera:${frontale ? 'frontale' : 'posteriore'}`).catch(() => {});
        }}
        onSelectRoute={audio.select}
        onKnock={() => {
          signalingRef.current?.knock();
          // Due colpi su una porta, piano, anche da questa parte:
          // l'notice parte verso un telefono lontano e da qui non si
          // sentirebbe niente - il pulsante lampeggia e basta. Sapere
          // che è partito vale quanto mandarlo.
          Sveglia.suona('bussata', true, KNOCK_ECHO_MS).catch(() => {});
          Diario.segna('avvisa').catch(() => {});
        }}
        onLeave={leaveChannel}
        leaving={leaving}
        onSveglia={onSveglia}
        /**
         * L'ingrandimento resta di qua: cambia come guardo io, non cosa
         * vede lui. Nel diario ci va lo stesso, perché spiega
         * un'inquadratura che a rileggerla dopo non tornerebbe.
         */
        onIngrandimento={(z) => {
          Diario.segna(z > 1.01 ? `ingrandimento:${z.toFixed(1)}x` : 'ingrandimento:pieno')
            .catch(() => {});
        }}
        onOpenSettings={() => setScreen('settings')}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0b0e14' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0b0e14' },
});
