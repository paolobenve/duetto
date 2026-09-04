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
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Animated,
  useWindowDimensions, Modal, Pressable,
} from 'react-native';
import type { GestureResponderEvent } from 'react-native';
import { MediaStream } from 'react-native-webrtc';
import { Journal, Proximity } from 'duetto-platform';
import { t } from './i18n';
import type { PresenceStatus } from './signaling';
import VideoStage from './VideoStage';
import { AudioRoute, routeLabel } from './audioRoute';
import { VERSION_LABEL } from './version';
import ChangelogModal from './ChangelogModal';
import type { Avatar } from './avatar';
import { VIDEO_PROFILES } from './config';
import type { VideoQuality } from './config';
import type { VideoStats } from './webrtc';
import {
  VideoIcon, MicrophoneIcon, BellIcon, BellRingingIcon, LeaveIcon,
  SettingsIcon, FrontCameraIcon, BackCameraIcon,
  SpeakerIcon, EarpieceIcon, HeadphonesIcon, BluetoothIcon,
} from './Icons';

/**
 * How long a piece of news stays on screen before fading.
 *
 * Ten seconds: long enough to read it without having to clear it by
 * hand.
 */
const NEWS_MS = 10_000;

/**
 * How the buttons go out: at once, but slowly.
 *
 * They used to stand still for a few seconds and then drop all at once:
 * a jump that catches the eye exactly when one wants to look at
 * something else. A continuous ten-second fade has no instant at which
 * something happens, and by the time you notice they are dim they have
 * been dim for a while.
 */
const FADE_MS = 10000;

/**
 * After how long the controls fall asleep.
 *
 * Faded and untouched for a minute: from there on the first touch only
 * wakes them, without pressing anything. It is the same rule as for the
 * invisible controls, extended to the faded ones: a phone left on with
 * Duetto in front must not be able to leave the channel because
 * something came to rest on it.
 */
const SLEEP_MS = 60000;

/**
 * How visible the controls stay once the fade is over.
 *
 * Forty per cent is the usual one: they can be read, but they do not
 * weigh. Fifteen reduces them to a shadow, for whoever is watching the
 * picture and wants nothing on top of it but not a darkness in which
 * the buttons have to be found from memory. Zero removes them
 * altogether.
 */
const CONTROLS_OPACITY: Record<'none' | 'dim' | 'faint' | 'hidden', number> = {
  /** they never step aside: whoever wants them there always, has them */
  none: 1,
  dim: 0.4,
  faint: 0.15,
  hidden: 0,
};

/**
 * The degrees of fading, for the settings and for the menu a long
 * press on the picture opens: one list, so the two can never disagree.
 */
export const FADING_CHOICES = (): {
  value: 'none' | 'dim' | 'faint' | 'hidden'; label: string; note: string;
}[] => [
  { value: 'none', label: t('settings.controlsNone'), note: t('settings.controlsNoneNote') },
  { value: 'dim', label: t('settings.controlsDim'), note: t('settings.controlsDimNote') },
  { value: 'faint', label: t('settings.controlsFaint'), note: t('settings.controlsFaintNote') },
  { value: 'hidden', label: t('settings.controlsHidden'), note: t('settings.controlsHiddenNote') },
];

/**
 * The "You"/"Not you" label never goes below this.
 *
 * Who one is looking at is the one thing the screen itself does not
 * tell, so it stays legible even when everything else has gone.
 */
const LABEL_DIM = 0.4;

/**
 * Below this width we are in the Picture-in-Picture window: controls
 * and badges would not fit there, so we show the video alone.
 */
const COMPACT_WIDTH = 340;

/**
 * An icon on a light pill: a dark drawing.
 *
 * The background colour is needed by the crossing-out bar as well,
 * which stands apart from the drawing thanks to a thread of the same
 * colour it rests on.
 */
const ON_LIGHT = { color: '#1e1f22', background: 'rgb(243,243,243)' } as const;

/** The drawing for each audio output, for the pill and for the menu. */
const OUTPUT_ICON: Record<
  AudioRoute,
  (p: { size?: number; color?: string; off?: boolean; background?: string }) => JSX.Element
> = {
  SPEAKER_PHONE: SpeakerIcon,
  EARPIECE: EarpieceIcon,
  WIRED_HEADSET: HeadphonesIcon,
  BLUETOOTH: BluetoothIcon,
};

/**
 * The sounds for calling back somebody who is in the channel but does
 * not answer.
 *
 * A handful, and quite unlike one another: you choose without having to
 * listen to them one by one. The technical name is known to the phone
 * on the other side too, which is the one that plays it.
 */
/**
 * Built while drawing, not once at import: a list made at the top of the
 * file freezes the language it was born in, and changing language it
 * would go on speaking the old one under a screen that had changed.
 */
const ALARMS = (): { name: string; label: string; note: string }[] => [
  { name: 'drumroll', label: t('alarms.drums'), note: t('alarms.drumsNote') },
  { name: 'drumkit', label: t('alarms.kit'), note: t('alarms.kitNote') },
  { name: 'fanfare', label: t('alarms.fanfare'), note: t('alarms.fanfareNote') },
  { name: 'horn', label: t('alarms.horn'), note: t('alarms.hornNote') },
  { name: 'rooster', label: t('alarms.rooster'), note: t('alarms.roosterNote') },
];

type Props = {
  /**
   * We are inside the system's little window, says the activity.
   *
   * Not worked out from the width: on a good many phones React Native
   * goes on reporting the full screen while the window has shrunk, and
   * the buttons and the technical lines were drawn onto it.
   */
  pip?: boolean;
  /**
   * The name given to this connection, if it has one.
   *
   * It takes the place of the app's name on the pill at the top: with
   * several connections set up, knowing which one you are in is worth
   * more than reading "Duetto" again.
   */
  connectionName: string;
  peerName: string;
  /** the other person's picture, when they have no name */
  peerAvatar: Avatar;
  /**
   * They are connected to the server, even if not in the channel.
   *
   * It is the difference between waiting for somebody who may turn up
   * at any moment and waiting for somebody whose phone is not even on:
   * in the first case the call reaches them, in the second it does not.
   */
  peerPresent: boolean;
  /**
   * They are not there because they disconnected, not because the line
   * dropped.
   *
   * The server tells whoever says goodbye from whoever disappears, and
   * for whoever is left the difference is everything: you come out of a
   * tunnel, you do not come out of a decision.
   */
  peerDetached: boolean;
  /**
   * They are waiting because their phone closed the app on them.
   *
   * It is not their choice, and it is the opposite of what "waiting"
   * suggests: some phones tear the app down by themselves, at night
   * too, and whoever reads it deserves to know.
   */
  peerTornDown?: boolean;
  /** the real resolution and bandwidth, outgoing and incoming */
  videoStats: VideoStats;
  /** the two halves the other phone times; null if it does not say */
  peerSendDelay?: number | null;
  peerRecvDelay?: number | null;
  /** show only the total, not the two directions */
  delayTotalOnly?: boolean;
  /** the chosen profile: without it those numbers depend on nothing */
  qualityLabel: string;
  /** the two technical lines under the buttons, off by default */
  showStats: boolean;
  /** how far the controls step aside; 'none' = they never do */
  controls: 'none' | 'dim' | 'faint' | 'hidden';
  /**
   * A long press on the picture asks to change the fading: the choice
   * lands here, and whoever sits above saves it like any setting.
   */
  onSelectControls?: (v: 'none' | 'dim' | 'faint' | 'hidden') => void;
  /**
   * A piece of news to read: their app died and came back, or they are
   * back after a long absence.
   *
   * Outside the app the same thing is said by a silent notification,
   * which however lives in the shade - that is, in a place whoever is
   * looking at this screen does not look. Here it stands in front, and
   * goes away when touched.
   */
  news?: string | null;
  onNewsRead?: () => void;
  /**
   * How loud the other person is being heard, while pressing.
   *
   * `null` nearly always: it is shown only on phones where the call
   * volume does not move and the app takes care of it, and only for the
   * couple of seconds that follow the press. Without it, pressing would
   * produce nothing visible and the keys would look broken all the
   * same.
   */
  gain?: number | null;
  /**
   * The level right now, for the audio menu.
   *
   * There is a control by hand there because the keys are not enough
   * everywhere: on some phones the call volume index moves and nothing
   * changes to the ear, and from outside that case cannot be told from
   * one that works.
   *
   * It is the product of the two halves: the phone's call volume and
   * Duetto's gain. See `systemVolume`.
   */
  peerGain?: number;
  /**
   * The phone's call volume and its maximum.
   *
   * It is shown among the technical lines, because it is the other half
   * of the level: knowing that the phone sits at 3 out of 12 explains
   * on its own an "I cannot hear you" that no percentage, alone, would
   * explain.
   */
  systemVolume?: { volume: number; max: number };
  onChangeLevel?: (direction: number) => void;
  /**
   * The two sides have different versions of Duetto.
   *
   * `null` when they are the same, which is the normal case and does
   * not deserve a line. When they are not, it explains half the
   * oddities on its own - something that is here and not there - and it
   * belongs where one goes to look when something does not add up:
   * among the technical lines.
   */
  versionWarning?: string | null;
  /** which camera is filming: the "Flip" icon says so */
  frontCamera: boolean;
  /** profile in use and how to change it: opens by holding "Video" */
  quality: VideoQuality;
  onSelectQuality: (q: VideoQuality) => void;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  status: PresenceStatus;
  connectionState: string;
  audioOn: boolean;
  videoOn: boolean;
  /** `output`: where the sound comes out over there, if they say so */
  peerState: {
    audio: boolean; video: boolean; aspect?: number; output?: string;
    /** how loud they are hearing US: 1 = as we send it */
    volume?: number;
    /** in another call on their phone */
    busy?: boolean;
  };
  /** in another call on THIS phone: Duetto is silent until it ends */
  onCall?: boolean;
  /** the other side broke this pair: it cannot work any more */
  pairBroken?: boolean;
  /** the battery, with the diagnostics on: percent and charger */
  battery?: { percent: number; charging: boolean } | null;
  /** the other person's video track really arriving */
  remoteHasVideo: boolean;
  /** changes at every restart of the remote video, to rebuild the view */
  remoteVideoKey: number;
  /** the shape of the two videos, for the shape of the little square */
  localAspect?: number;
  remoteAspect?: number;
  knockPending: boolean;
  audioRoute: AudioRoute;
  /** the audio outputs really connected right now */
  audioRoutes: AudioRoute[];
  onToggleAudio: () => void;
  onToggleVideo: () => void;
  onSwitchCamera: () => void;
  onSelectRoute: (r: AudioRoute) => void;
  onKnock: () => void;
  /**
   * Leaves the channel.
   *
   * `available` says whether to stay reachable: leaving, one keeps
   * receiving the other person's call, unless one chooses to disconnect
   * altogether.
   */
  onLeave: (available: boolean) => void;
  /**
   * The exit is under way: the journal is being put in a safe place.
   *
   * It lasts a few tenths of a second. Without saying so, the button
   * looks as though it had done nothing, and whoever sees no reaction
   * presses again.
   */
  leaving?: boolean;
  /**
   * Sends the other person a loud sound to call them back.
   *
   * It only makes sense while you are both in the channel: if they are
   * not, the sound has nowhere to play, and that is what the call is
   * for.
   */
  onAlarm: (sound: string) => void;
  /** how far the big video was zoomed, once the gesture is over */
  onZoom?: (zoom: number) => void;
  onOpenSettings: () => void;
};

/**
 * The channel screen. There is nothing to "call": you are inside, and
 * you see whether the other person is inside too. If they are not, you
 * can call them.
 */
export default function ChannelScreen(props: Props) {
  const {
    connectionName, peerName, peerAvatar, peerPresent, peerDetached, peerTornDown, videoStats, peerSendDelay, peerRecvDelay, delayTotalOnly, qualityLabel, showStats, controls, onSelectControls, news, onNewsRead, gain, peerGain, systemVolume, onChangeLevel,
    versionWarning, frontCamera, quality, onSelectQuality, localStream, remoteStream, status, connectionState,
    audioOn, videoOn, peerState, remoteHasVideo, remoteVideoKey, localAspect, remoteAspect,
    knockPending, audioRoute, audioRoutes,
    onToggleAudio, onToggleVideo, onSwitchCamera, onSelectRoute, onKnock, onLeave, leaving,
    onAlarm, onZoom, onOpenSettings, onCall, pairBroken, battery,
  } = props;

  // In Picture-in-Picture the window is tiny: no controls. The width
  // is kept as a second witness for the phones where the activity's
  // word arrives late.
  const { width: winWidth, height: winHeight } = useWindowDimensions();
  const compact = props.pip || winWidth < COMPACT_WIDTH;

  /**
   * The rectangle the video really takes up.
   *
   * The video sits "inside" the screen without being cut, so it leaves
   * two black bands. Resting the controls against the edges of the
   * SCREEN put them half on the picture and half on the black: resting
   * them against the edges of the VIDEO keeps them all inside, which is
   * what an overlay is meant to be.
   *
   * With no video at all the rectangle is the whole screen, and rightly
   * so: there is no edge there to line up with.
   */
  const [bigAspect, setBigAspect] = useState<number | null>(null);

  /**
   * The declared shape, corrected by the frames that really arrive.
   *
   * The shape each side declares is the CAMERA's: when the encoder
   * squeezes the picture under a thin road, the coded frame comes out
   * a slightly different rectangle (multiples of sixteen: 1920×1072 is
   * not the shape of 480×256), and the controls stood lined up with
   * the edge of a picture that was no longer there. The statistics
   * carry the real measures; only the RATIO is taken from them - the
   * encoder reports frames unrotated, so which side is up is still the
   * declaration's to say.
   */
  const refine = (declared?: number, real?: { w: number; h: number }) => {
    if (!declared || !real || !real.w || !real.h) return declared;
    const ratio = Math.max(real.w, real.h) / Math.min(real.w, real.h);
    return declared < 1 ? 1 / ratio : ratio;
  };
  const localAspectShown = refine(localAspect, videoOn ? videoStats.out : undefined);
  const remoteAspectShown = refine(remoteAspect, remoteHasVideo ? videoStats.in : undefined);
  /**
   * The last known inset, kept even with no video.
   *
   * Switching the last camera off makes the video's rectangle disappear
   * and the inset would go to zero: the controls slid to the bottom of
   * the screen and the little square changed area, for a change that
   * from the watcher's point of view never happened. They stay where
   * they are, waiting for the picture to come back.
   */
  const lastInset = useRef({ v: 0, h: 0 });
  const inset = React.useMemo(() => {
    if (winWidth <= 0 || winHeight <= 0) return lastInset.current;
    if (!bigAspect) return lastInset.current;
    const screen = winWidth / winHeight;
    const v = bigAspect > screen
      ? { v: Math.round((winHeight - winWidth / bigAspect) / 2), h: 0 }
      : { v: 0, h: Math.round((winWidth - winHeight * bigAspect) / 2) };
    lastInset.current = v;
    return v;
  }, [bigAspect, winWidth, winHeight]);

  const [routeMenu, setRouteMenu] = useState(false);
  const [changelogOpen, setChangelogOpen] = useState(false);
  const [qualityMenu, setQualityMenu] = useState(false);
  /** the two ways out, by holding "Leave" */
  const [leaveMenu, setLeaveMenu] = useState(false);
  /** the fading menu, opened by holding a finger on the picture */
  const [fadeMenu, setFadeMenu] = useState(false);
  /** the sounds for calling the other person back, by holding "Call" */
  const [alarmMenu, setAlarmMenu] = useState(false);
  /** who fills the screen when there is only one video: 'you', 'peer', or nothing */
  const [onlyBig, setOnlyBig] = useState<'you' | 'peer' | null>(null);

  const together = status === 'together';
  const linked = connectionState === 'connected';
  /**
   * The link carries, whatever its state is called.
   *
   * An ICE restart - the search for a road the new network may have
   * opened - takes the state away from "connected" while the old road
   * goes on carrying every word: the screen said "establishing the
   * connection" over a conversation nobody had interrupted. Coming
   * home, where the phone changes network two or three times on the
   * doorstep, it said it three times. What is said now follows the
   * packets, which are the thing one actually lives through.
   */
  const carrying = videoStats.carrying === true;
  const speaking = linked || carrying;

  /**
   * An interruption under way: they are there but the direct connection
   * is not. It is not a "nobody is here": it is a wait, and it should
   * be said instead of leaving a black screen with no explanation.
   */
  const serverLost = status === 'offline';

  /**
   * A REAL interruption, not a renegotiation.
   *
   * Renegotiating - a change of resolution, the search for a direct
   * road, a change of cell - takes the connection into "connecting" for
   * a few seconds without anything having broken: the frames come back
   * by themselves. Counting that state as an interruption showed
   * "connection interrupted" precisely while the connection was
   * working.
   *
   * Only "failed" and "disconnected" are interruptions, which is what
   * ICE says when the packets really are not arriving.
   */
  const broken = connectionState === 'failed' || connectionState === 'disconnected';
  const notConnected = serverLost || (together && broken && !carrying);

  /**
   * An interruption is declared only if it lasts.
   *
   * The delay holds both for the notice and for the LAYOUT of the
   * squares, and the second matters more: the notice used to wait while
   * the layout rearranged itself at once, so the little square jumped
   * to full screen and came back at every renegotiation - the search
   * for a direct road, a change of resolution - without anything having
   * really happened.
   *
   * Three seconds: below that, interruptions close up by themselves,
   * and the only thing worse than a video that stops for a moment is an
   * interface that rearranges itself twice to say so.
   */
  const [showNotice, setShowNotice] = useState(false);
  useEffect(() => {
    if (!notConnected) { setShowNotice(false); return; }
    const t = setTimeout(() => setShowNotice(true), 3000);
    return () => clearTimeout(t);
  }, [notConnected]);

  /**
   * The big place stays theirs as long as they declare they are
   * sending.
   *
   * This does NOT wait the notice's three seconds: the wait is for the
   * message, which is an alarm, not for the layout. Delaying it here
   * too left a window in which one's own video rose to full screen only
   * to come back down when the other's arrived - the very dance one
   * wanted to avoid, moved three seconds later.
   *
   * If their camera is off, on the other hand, one's own at full screen
   * is the right thing: there we are waiting for nothing.
   */
  const interrupted = peerState.video && !remoteHasVideo;

  /**
   * The call has somewhere to land.
   *
   * It is enough that their phone be connected to the server: in the
   * channel or waiting makes no difference, the call goes through in
   * both cases. If they are not connected - disconnected on purpose, or
   * without a network - there is nobody to knock for.
   */
  const reachable = peerPresent || status === 'together';

  // Without this, losing the server left a mute black screen: their
  // video is still there but no frame arrives any more, and nothing
  // explained it.
  const notice = !showNotice
    ? undefined
    : serverLost
      ? t('channel.connectionLost')
      : (connectionState === 'failed'
          ? t('channel.linkLost')
          : t('channel.linkInterrupted'));
  // remoteHasVideo arrives as a prop: it is an explicit event of the
  // session, because the tracks come into the same MediaStream and
  // React would not notice by looking at the reference.
  const localHasVideo =
    !!localStream && videoOn && localStream.getVideoTracks().length > 0;

  /**
   * The news is read and goes: ten seconds, then it fades.
   *
   * It used to stay until touched, and since news ages fast - "reachable
   * again" while meanwhile they have gone out again - the box ended up
   * saying things that were no longer true in the very place the eye
   * goes first. It can still be touched to clear it at once.
   */
  const newsOpacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!news) return;
    newsOpacity.setValue(1);
    const anim = Animated.timing(newsOpacity, {
      toValue: 0,
      delay: NEWS_MS,
      duration: 700,
      useNativeDriver: true,
    });
    anim.start(({ finished }) => { if (finished) onNewsRead?.(); });
    return () => anim.stop();
  }, [news, newsOpacity, onNewsRead]);

  // The buttons ALWAYS stay on the screen: they never disappear, they
  // only fade, and they come back full at the first touch.
  const opacity = useRef(new Animated.Value(1)).current;
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * When the fade under way will reach the bottom.
   *
   * It is needed to read a touch on the picture: while the controls are
   * still fading they can be seen, and whoever touches wants them gone;
   * once at the bottom they cannot be seen, and whoever touches wants
   * them back.
   *
   * A plain "are they full yes/no" was not enough: it became "no" as
   * soon as the fade started, that is after a tenth of a second, and
   * from there on a touch called them back instead of clearing them -
   * which is the fault one could see, controls that would not go away.
   */
  const fadeEnd = useRef(0);

  /**
   * Controls gone altogether: from there on they cannot be pressed.
   *
   * With "hidden" they stayed pressable even while invisible, and a
   * finger resting where a button used to be switched the video off or
   * left the channel with nothing to announce it. A control that cannot
   * be seen is not a control: the first touch calls them back, and from
   * there one decides by looking.
   *
   * It holds only for absolute zero: faded to 15% they can still be
   * seen, and whoever knows where they are has the right to press them
   * without two touches.
   */
  const [gone, setGone] = useState(false);

  /** The fade: it starts at once and lasts ten seconds. */
  const fade = useCallback((duration = FADE_MS) => {
    if (idleTimer.current) clearTimeout(idleTimer.current);
    fadeEnd.current = Date.now() + duration;
    const target = CONTROLS_OPACITY[controls] ?? CONTROLS_OPACITY.dim;
    Animated.timing(opacity, {
      toValue: target,
      duration,
      useNativeDriver: true,
    }).start(({ finished }) => {
      // Only once the fade is over: on the way down they can still be seen.
      if (finished && target === 0) setGone(true);
    });
  }, [opacity, controls]);

  /**
   * There is something to look at under the controls.
   *
   * With no video the controls cover nothing, and fading them would
   * leave a dark screen with faded buttons on it: they step aside to
   * let a picture be seen, and if there is no picture there is no
   * reason.
   */
  const toWatch = localHasVideo || remoteHasVideo;

  const wake = useCallback(() => {
    setGone(false);
    fadeEnd.current = 0;
    if (idleTimer.current) clearTimeout(idleTimer.current);
    Animated.timing(opacity, {
      toValue: 1, duration: 120, useNativeDriver: true,
    }).start(({ finished }) => {
      // The fade starts again as soon as they are full: no standing
      // wait, and so no instant at which they "snap" away.
      if (finished && toWatch) fade();
    });
  }, [opacity, fade, toWatch]);

  /**
   * The label follows the others as they fade, but no further.
   *
   * With "Hide the controls" the others go to zero; this one does not,
   * because the one piece of information the screen itself does not
   * give is precisely who one is looking at.
   */
  const labelOpacity = opacity.interpolate({
    inputRange: [0, 1],
    outputRange: [LABEL_DIM, 1],
  });

  /**
   * A touch on the picture: if the controls can be seen, it clears them
   * out of the way.
   *
   * Waiting the ten seconds of the automatic fade, when all one wants
   * is to look at the picture, is a small imprisonment.
   */
  const touch = useCallback(() => {
    const still = Date.now() - lastTouch.current;
    lastTouch.current = Date.now();
    // A touch on the picture counts as a waking too, and if it came
    // after a long silence it is worth knowing: it is the good twin of
    // the touch nobody meant.
    if (still > SLEEP_MS) {
      Journal.mark(`controls-woken:still ${Math.round(still / 1000)}s`)
        .catch(() => { /* noop */ });
    }
    // Asking for them to go is not the same as letting them fade: here
    // one wants to see the picture now.
    if (Date.now() < fadeEnd.current) fade(400); else wake();
  }, [fade, wake]);

  // `wake` changes when `toWatch` changes: switching the last camera
  // off brings the controls back to full and there they stay.
  useEffect(() => {
    wake();
    return () => { if (idleTimer.current) clearTimeout(idleTimer.current); };
  }, [wake]);

  /** When the screen was last touched. */
  const lastTouch = useRef(Date.now());

  /**
   * Every press brings the buttons back to the front and then does its
   * work - except the first after a long silence, which only wakes
   * them.
   *
   * It guards against the touch nobody meant: one night, on the other
   * phone, an exit from the channel appeared at 4:46 that nobody had
   * pressed, and the Leave button does its work at the first touch
   * without asking anything. With the controls faded and untouched for
   * a minute, that touch now does not press: it lights.
   */
  const press = useCallback(
    (action: () => void) => () => {
      // The screen is covered: whatever touched the glass, it is
      // nobody's choice.
      if (coveredRef.current) {
        Journal.mark('command:ignored-screen-covered').catch(() => { /* noop */ });
        return;
      }
      const still = Date.now() - lastTouch.current;
      lastTouch.current = Date.now();
      const faded = toWatch && (CONTROLS_OPACITY[controls] ?? 0.4) < 1;
      if (faded && still > SLEEP_MS) {
        wake();
        Journal.mark(`controls-woken:still ${Math.round(still / 1000)}s`)
          .catch(() => { /* noop */ });
        return;
      }
      wake();
      action();
    },
    [wake, toWatch, controls],
  );

  /**
   * A bell that rings the instant "Call" is pressed.
   *
   * `knockPending` comes from the server, and with a slow network it
   * can be late: the finger would be left without an answer at the very
   * moment one waits for it. This is only the reply to the touch; the
   * real confirmation is still the server's, which then keeps the bell
   * ringing for its two seconds.
   */
  const [justKnocked, setJustKnocked] = useState(false);
  const knockTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (knockTimer.current) clearTimeout(knockTimer.current);
  }, []);
  /**
   * How the other person is listening, to put beside "Not you".
   *
   * The icon says where their sound comes out - speaker, ear,
   * headphones, bluetooth - and is crossed out when their microphone is
   * off. They are the two things one asks aloud during a conversation
   * ("can you hear me?", "are you on speaker?") and that the phone
   * already knows.
   *
   * If they have a version that does not declare them, `output` does
   * not arrive and the speaker is shown, which is the normal case on
   * coming into the channel.
   */
  const peerMark = React.useCallback((size: number, background: string) => {
    const where = (peerState.output as AudioRoute) ?? 'SPEAKER_PHONE';
    const Icon = OUTPUT_ICON[where] ?? OUTPUT_ICON.SPEAKER_PHONE;
    // The background is what lets the crossing-out bar stand apart from
    // the drawing: it changes with whatever the mark rests on.
    return <Icon size={size} color="#e6ebf1" off={!peerState.audio} background={background} />;
  }, [peerState.output, peerState.audio]);
  /**
   * The two pills say who one is looking at; with the technical lines
   * on they also say how that phone over there sounds.
   *
   * Each describes its own: where the sound comes out and how loud
   * whoever holds it is hearing. On "Not you", then, there is their
   * output and their volume - that is, how loud they hear YOU - which
   * is the only one of the four things you could not know in any other
   * way, and the only one that explains "I cannot hear you" without
   * having to ask aloud.
   */
  const percent = (v?: number) => `${Math.round((v ?? 1) * 100)}%`;

  const peerBadge = React.useMemo(() => (
    <>
      {peerMark(13, '#1b1d21')}
      {showStats && peerState.volume != null ? (
        <Text style={styles.pillVolume}>{percent(peerState.volume)}</Text>
      ) : null}
    </>
  ), [peerMark, showStats, peerState.volume]);

  /** Where the sound comes out HERE, as `peerMark` does for theirs. */
  const ownOutputMark = React.useCallback((size: number, background: string) => {
    const Icon = OUTPUT_ICON[audioRoute] ?? OUTPUT_ICON.SPEAKER_PHONE;
    return <Icon size={size} color="#e6ebf1" off={!audioOn} background={background} />;
  }, [audioRoute, audioOn]);

  const ownBadge = React.useMemo(() => {
    return (
      <>
        {ownOutputMark(13, '#1b1d21')}
        {showStats ? (
          <Text style={styles.pillVolume}>{percent(peerGain)}</Text>
        ) : null}
      </>
    );
  }, [ownOutputMark, showStats, peerGain]);

  /**
   * Something is covering the screen: a pocket, a closed cover.
   *
   * While it is covered the controls cannot be pressed. A phone in a
   * pocket receives touches that are nobody's choices - the journal
   * showed exits from the channel with contacts of forty milliseconds,
   * while the other person was leaving home with the phone in a pocket
   * and the speaker on, which is the state in which the system does not
   * switch the screen off.
   *
   * In a reference as well as in a state: the touch handlers read it,
   * and they are born once only.
   */
  const [covered, setCovered] = useState(false);
  const coveredRef = useRef(false);
  useEffect(() => {
    if (compact) return;
    let alive = true;
    Proximity.get().then((v) => {
      if (!alive) return;
      coveredRef.current = !!v;
      setCovered(!!v);
    }).catch(() => { /* noop */ });
    const stop = Proximity.subscribe((v) => {
      coveredRef.current = v;
      setCovered(v);
    });
    return () => { alive = false; stop(); };
  }, [compact]);

  /**
   * The signature of a touch on a panel row.
   *
   * The round buttons write it themselves; the panel rows did not, and
   * the exit - the very thing under investigation - went through there
   * leaving no trace. There is no contact duration here, because a
   * panel row has no separate initial touch: there is the point, which
   * is already something.
   */
  const signTouch = useCallback((what: string, e: GestureResponderEvent) => {
    const x = Math.round(e?.nativeEvent?.pageX ?? -1);
    const y = Math.round(e?.nativeEvent?.pageY ?? -1);
    Journal.mark(
      `command:${what} ${x},${y} covered=${coveredRef.current ? 'yes' : 'no'}`,
    ).catch(() => { /* noop */ });
  }, []);

  /** True if the touch is to be dropped: the screen is covered. */
  const toIgnore = useCallback(() => {
    if (!coveredRef.current) return false;
    Journal.mark('command:ignored-screen-covered').catch(() => { /* noop */ });
    return true;
  }, []);

  /** The flash of the bell: it says something really left. */
  const knockFlash = useCallback(() => {
    setJustKnocked(true);
    if (knockTimer.current) clearTimeout(knockTimer.current);
    knockTimer.current = setTimeout(() => setJustKnocked(false), 700);
  }, []);

  const knock = useCallback(() => {
    knockFlash();
    onKnock();
  }, [knockFlash, onKnock]);

  return (
    // The touch is gathered inside VideoStage, on the big picture
    // alone: on the little square it already means swapping the two
    // videos, and on the controls it means pressing them.
    <View style={styles.root}>
      <VideoStage
        localStream={localStream}
        remoteStream={remoteStream}
        localHasVideo={localHasVideo}
        remoteHasVideo={remoteHasVideo}
        remoteVideoKey={remoteVideoKey}
        awaitingRemote={interrupted}
        notice={notice}
        // The empty little square - when you are the only one with a
        // camera and you have gone full screen - is the one thing left
        // to say where the other person is: let it say the true thing,
        // not a "waiting" good for all seasons.
        emptyLabel={peerWord(status, peerName, peerPresent, peerDetached)}
        localAspect={localAspectShown}
        remoteAspect={remoteAspectShown}
        compact={compact}
        mirror={frontCamera}
        onBigAspect={setBigAspect}
        insetV={compact ? 0 : inset.v}
        insetH={compact ? 0 : inset.h}
        insetBottom={
          !compact && showStats
            ? statsLineCount(videoStats, localHasVideo || remoteHasVideo) * STATS_LINE_H
            : 0
        }
        onBackground={touch}
        onBackgroundLong={
          // Not in the little window: there is nothing to press there.
          compact || !onSelectControls ? undefined : () => setFadeMenu(true)
        }
        onOnlyBig={setOnlyBig}
        onZoom={onZoom}
        peerBadge={peerBadge}
        ownBadge={ownBadge}
        placeholder={compact ? (
          /* In the Picture-in-Picture window the big summary does not
             fit: it runs past the edges and half a word can be read.
             There the face and a single word are enough, which is all
             one can read in a rectangle the size of a thumb. */
          <PresenceMini
            status={status}
            peerName={peerName}
            peerAvatar={peerAvatar}
            peerPresent={peerPresent}
            peerDetached={peerDetached}
          />
        ) : (
          <PresenceCard
            connectionName={connectionName}
            peerMark={
              <View style={styles.cardMarkRow}>
                {peerMark(17, '#0b0e14')}
                {showStats ? (
                  <>
                    {battery ? (
                      <Text style={styles.cardVolume}>
                        {t(battery.charging ? 'channel.batteryCharging' : 'channel.battery',
                          { pct: battery.percent })}
                        {' · '}
                      </Text>
                    ) : null}
                    {peerState.volume != null ? (
                      <Text style={styles.cardVolume}>
                        {t('channel.hearsYou', { pct: percent(peerState.volume) })}
                      </Text>
                    ) : null}
                    <Text style={styles.cardVolume}>
                      {peerState.volume != null ? '· ' : ''}
                      {t('channel.youHear', { pct: percent(peerGain) })}
                    </Text>
                    {/* The output's mark stands beside the number of
                        whoever is listening: theirs before theirs, mine
                        after mine. There used to be a single one, at
                        the head, and it looked as though it held for
                        the whole line. */}
                    {ownOutputMark(17, '#0b0e14')}
                  </>
                ) : null}
              </View>
            }
            peerPresent={peerPresent}
            peerDetached={peerDetached}
            peerTornDown={peerTornDown}
            status={status}
            // What the card calls "linked" is the link CARRYING: during
            // a restart the state leaves "connected" while every word
            // still gets through, and the card used to deny a
            // conversation that was going on.
            linked={speaking}
            connectionState={connectionState}
            peerName={peerName}
            peerAvatar={peerAvatar}
            peerAudio={peerState.audio}
            peerBusy={peerState.busy === true}
            onCall={onCall}
            pairBroken={pairBroken}
          />
        )}
      />

      {/*
        The reminder of the wait, over the video too.
        With no video the summary in the middle of the screen says it;
        with the camera on that summary is gone, and only one's own
        picture was left, with nothing to explain why nothing is
        happening. The other person's face does not belong here: over
        the picture it would weigh, and whoever is watching already
        knows who they are waiting for.
        It fades along with the controls: it is a reminder, not an
        alarm, and whoever waits a long time wants to see the picture,
        not the words.
      */}
      {!compact && onlyBig && status === 'alone' && !notice ? (
        <Animated.View style={[styles.waitOver, { opacity }]} pointerEvents="none">
          <Text style={styles.waitText}>
            {t('channel.youAreInChannel')}{'\n'}
            {peerStatusLine(peerName, peerPresent, peerDetached)}
            {peerPresent ? (
              <>
                {t('channel.touchPrefix')}
                <Text style={styles.bold}>{t('buttons.call')}</Text>
                {t('channel.touchSuffix')}
              </>
            ) : peerDetached ? (
              t('channel.detachedOnPurpose')
            ) : (
              t('channel.phoneNotConnected')
            )}
          </Text>
        </Animated.View>
      ) : null}

      {/* The news stands above everything and does not fade with the
          controls: it is not a control, it is something to read once.
          Under the top bar, so as not to cover the settings. */}
      {!compact && news ? (
        <Animated.View
          style={[
            styles.newsOver,
            { top: 62 + inset.v, left: 14 + inset.h, right: 14 + inset.h },
            { opacity: newsOpacity },
          ]}>
          <TouchableOpacity activeOpacity={0.85} onPress={onNewsRead}>
            <Text style={styles.newsText}>{news}</Text>
            <Text style={styles.newsDismiss}>{t('channel.tapToDismiss')}</Text>
          </TouchableOpacity>
        </Animated.View>
      ) : null}

      {/* "Leaving": it covers the screen and stops the touches, so
          that nobody presses anything else while the journal is on its
          way. */}
      {leaving ? (
        <View style={styles.leavingOver}>
          <Text style={styles.leavingText}>
            {t('channel.leaving')}
          </Text>
        </View>
      ) : null}

      {/* The other person's volume, while it is being changed. It sits
          in the middle and cannot be touched: it is a reply, not a
          control. */}
      {!compact && gain != null ? (
        <View style={styles.volumeOver} pointerEvents="none">
          <Text style={styles.volumeText}>
            {t('channel.peerVoice')}{'  '}
            <Text style={styles.volumeFigure}>
              {gain === 0 ? t('channel.muted') : `${Math.round(gain * 100)}%`}
            </Text>
          </Text>
        </View>
      ) : null}

      {/* In PiP it ends here: the little window shows the video alone. */}
      {compact ? null : (
        <>
      {/* The top bar: connection + state. It sits inside the video
          too: outside, on the black band, it looks detached from the
          picture it belongs to. The little square makes room for it by
          moving down, not the bar by moving up. */}
      {/* "You/Not you" fades with the other controls but never
          disappears: it says WHO is being watched full screen, and a
          touch on the little square swaps the two - it is easy to lose
          track. Even at its faintest it stays legible, which is all
          that is needed. */}
      {onlyBig ? (
        <Animated.View
          style={[
            styles.whoRow,
            { top: 14 + inset.v, left: 14 + inset.h, opacity: labelOpacity },
          ]}
          pointerEvents="none">
          <View style={styles.whoBadge}>
            <Text style={styles.whoText}>
              {onlyBig === 'you' ? t('channel.you') : t('channel.notYou')}
            </Text>
            {onlyBig === 'peer' ? peerBadge : ownBadge}
          </View>
          {/* No "Not you" pill when there is no picture of theirs at
              all: these labels say WHO is being watched, and one that
              names a video which does not exist looks like a second
              video that never arrives.

              With the technical lines on, though, one more pill is
              needed: if only they have video, the little square is not
              there, and with the little square went the only two things
              that say how you are hearing and how they hear you - the
              rest of the time the summary in the middle says it, and
              here that is covered by their video. This one promises no
              video: it carries the name and the two audio marks, and
              nothing else. */}
          {showStats && onlyBig === 'peer' && !localHasVideo ? (
            <View style={[styles.whoBadge, styles.whoBadgeAudio]}>
              <Text style={styles.whoTextFaint}>{t('channel.you')}</Text>
              {ownBadge}
            </View>
          ) : null}
        </Animated.View>
      ) : null}

      <Animated.View
        pointerEvents={gone ? 'none' : 'auto'}
        style={[styles.topBar, { opacity, top: 14 + inset.v, left: 14 + inset.h, right: 14 + inset.h }]}>
        <View style={styles.spacer} pointerEvents="none" />
        <TouchableOpacity
          style={styles.badge}
          // The name already carries the version: that is where one
          // goes to look for why something has changed.
          onPress={press(() => setChangelogOpen(true))}>
          <View style={[styles.dot, together ? styles.dotGreen : styles.dotGrey]} />
          {/* In italics when it is a name you gave: that tells it from
              a word of the app's, and it is the same shape it has at
              the head of the notifications. */}
          <Text style={[styles.badgeText, connectionName ? styles.badgeName : null]}>
            {connectionName || 'Duetto'}
          </Text>
          <Text style={styles.version}>  {VERSION_LABEL}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.gear} onPress={press(onOpenSettings)}>
          <SettingsIcon size={21} color="#e6ebf1" />
        </TouchableOpacity>
      </Animated.View>

      {/* The controls: always there, at the bottom, inside a dark panel */}
      <Animated.View
        pointerEvents={gone ? 'none' : 'auto'}
        style={[
          styles.panel,
          { opacity, bottom: 8 + inset.v, left: 12 + inset.h, right: 12 + inset.h },
        ]}>
        {/* Different versions: it is said whatever one is doing, and
            without asking for Diagnostics. It is not a technical
            number: it is the explanation of things one notices by
            using the app - a sound that does not go off over there, a
            piece of news that never arrives - and whoever never opens
            Diagnostics is exactly the person left without it. In sight
            while merely waiting as well, which is where one would
            rather know before going in. */}
        {versionWarning ? (
          <Text style={styles.versionLine} numberOfLines={1} adjustsFontSizeToFit
            minimumFontScale={0.7}>
            {versionWarning}
          </Text>
        ) : null}
        <View style={styles.controls}>
        <CircleButton
          covered={covered}
          label={t('buttons.video')}
          // Switched on, the button is a white pill, and then the
          // drawing goes dark: what is working is what has to be seen
          // most, not what is off.
          icon={<VideoIcon off={!videoOn} {...(videoOn ? ON_LIGHT : {})} />}
          active={videoOn}
          onPress={press(onToggleVideo)}
          // As with the audio: a touch switches on and off, a long
          // press opens the choices. Quality is judged by looking, and
          // going to fetch it in the settings loses sight of the very
          // thing being judged.
          onLongPress={press(() => setQualityMenu(true))}
        />
        <CircleButton
          covered={covered}
          // Touch: muted/unmuted. Long press: where the audio comes out.
          label={audioOn ? t('buttons.audio') : t('buttons.muted')}
          icon={<MicrophoneIcon off={!audioOn} {...(audioOn ? ON_LIGHT : {})} />}
          active={audioOn}
          onPress={press(onToggleAudio)}
          onLongPress={press(() => setRouteMenu(true))}
          badge={OUTPUT_ICON[audioRoute]}
        />
        <CircleButton
          covered={covered}
          label={t('buttons.flip')}
          // The icon says which camera is on: a single person for the
          // front one, several people for the back one, which is what
          // one usually finds oneself framing with it.
          // A white pill with the front camera, dim with the back one:
          // the only difference between the two outlines - one person
          // or several - has to be read, while full or empty is seen.
          icon={frontCamera ? <FrontCameraIcon {...ON_LIGHT} /> : <BackCameraIcon />}
          active={frontCamera}
          // Pressable with the video off too: there it turns nothing,
          // it chooses which camera will open. It is for framing
          // something without first showing, for an instant, one's own
          // face.
          disabled={false}
          onPress={press(onSwitchCamera)}
        />
        <CircleButton
          covered={covered}
          label={knockPending ? t('buttons.called') : t('buttons.call')}
          // For the two seconds that follow the press the bell rings:
          // it is the sign that the call has left. The wording alone
          // changed too little to be noticed.
          icon={justKnocked || knockPending ? <BellRingingIcon /> : <BellIcon />}
          /**
           * Lit as long as the call has somewhere to go.
           *
           * It used to go out when you were both in the channel, on the
           * idea that there was nothing to call about there. But the
           * button stays pressable precisely for that case - they are
           * there and do not answer - so going out said nothing true,
           * and made a working button look broken.
           *
           * It goes out instead when their phone is not connected to
           * the server: there the call has nowhere to land, and a blue
           * button promising to call them promises something that does
           * not happen.
           */
          highlight={!justKnocked && reachable}
          // Pressable as long as they are reachable: they may be in the
          // channel but distracted, and insisting is exactly what one
          // wants to do when the first call got no answer.
          disabled={!reachable}
          onPress={press(knock)}
          // Held down, the sounds for calling them back. As long as
          // they can be reached, not only while you are both in the
          // channel: the sound travels in the encrypted envelope and
          // their phone plays it while merely waiting too - which is
          // exactly when somebody has to be got up from a chair.
          onLongPress={reachable ? press(() => setAlarmMenu(true)) : undefined}
        />
        <CircleButton
          covered={covered}
          label={t('buttons.leave')}
          icon={<LeaveIcon background="#da373c" />}
          danger
          /**
           * A touch does not leave: it opens the two ways out, in the
           * middle of the screen.
           *
           * Leaving the channel was the one destructive thing this
           * screen could do, with a single touch, in a corner where
           * touches happen: exits appeared that nobody had pressed, at
           * night and in broad daylight. I had first tried with the
           * label turning into "Sure?", but that is small writing under
           * an icon, and it goes unseen.
           *
           * Now a touch opens the same panel as the long press: a big
           * question in the middle of the screen, with the two ways out
           * written in full, and one leaves by touching the one one
           * wants. A single touch no longer takes anybody out of
           * anywhere.
           */
          onPress={press(() => setLeaveMenu(true))}
          onLongPress={press(() => setLeaveMenu(true))}
        />
        </View>
        {showStats ? (
          // A fixed height: with the second line appearing only once
          // the path is known, the panel grew under one's fingers and
          // the buttons moved.
          <View style={[
            styles.statsBox,
            { height: statsLineCount(videoStats, localHasVideo || remoteHasVideo) * STATS_LINE_H },
          ]}>
            <StatsLine
              stats={videoStats}
              quality={qualityLabel}
              showUp={localHasVideo}
              showDown={remoteHasVideo}
              peerSend={peerSendDelay}
              peerRecv={peerRecvDelay}
              totalOnly={delayTotalOnly}
            />
          </View>
        ) : null}
      </Animated.View>
        </>
      )}

      <ChangelogModal visible={changelogOpen} onClose={() => setChangelogOpen(false)} />

      {/* Resolution: it opens by holding the Video button down. */}
      <Modal
        visible={qualityMenu}
        transparent
        animationType="fade"
        onRequestClose={() => setQualityMenu(false)}>
        <Pressable style={styles.sheetBack} onPress={() => setQualityMenu(false)}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>{t('channel.resolution')}</Text>
            {(Object.keys(VIDEO_PROFILES) as VideoQuality[]).map((q) => (
              <TouchableOpacity
                key={q}
                style={styles.sheetRow}
                onPress={() => { onSelectQuality(q); setQualityMenu(false); }}>
                <View style={styles.sheetText}>
                  <Text style={[styles.sheetLabel, q === quality && styles.sheetLabelOn]}>
                    {t(`quality.${VIDEO_PROFILES[q].key}`)}
                  </Text>
                  <Text style={styles.sheetNote}>
                    {t(`quality.${VIDEO_PROFILES[q].key}Note`)}
                  </Text>
                </View>
                {q === quality ? <Text style={styles.sheetCheck}>{'\u2713'}</Text> : null}
              </TouchableOpacity>
            ))}
            <Text style={styles.sheetHint}>{t('channel.resolutionHint')}</Text>
          </View>
        </Pressable>
      </Modal>

      {/* The sounds for calling back: opens by holding "Call" down. */}
      <Modal
        visible={alarmMenu}
        transparent
        animationType="fade"
        onRequestClose={() => setAlarmMenu(false)}>
        <Pressable style={styles.sheetBack} onPress={() => setAlarmMenu(false)}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>{t('channel.callThem')}</Text>
            {ALARMS().map((sv) => (
              <TouchableOpacity
                key={sv.name}
                style={styles.sheetRow}
                onPress={() => {
                  setAlarmMenu(false);
                  // The same flash of the bell: the sound plays over
                  // there, and from here nothing is heard.
                  knockFlash();
                  onAlarm(sv.name);
                }}>
                <View style={styles.sheetText}>
                  <Text style={styles.sheetLabel}>{sv.label}</Text>
                  <Text style={styles.sheetNote}>{sv.note}</Text>
                </View>
              </TouchableOpacity>
            ))}
            <Text style={styles.sheetHint}>{t('channel.alarmHint')}</Text>
          </View>
        </Pressable>
      </Modal>

      {/* How far the buttons step aside: opens by holding a finger on
          the picture. The same choices as the settings, one list for
          both, reachable without leaving what one is watching. */}
      <Modal
        visible={fadeMenu}
        transparent
        animationType="fade"
        onRequestClose={() => setFadeMenu(false)}>
        <Pressable style={styles.sheetBack} onPress={() => setFadeMenu(false)}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>{t('settings.controlsWhileWatching')}</Text>
            {FADING_CHOICES().map((c) => (
              <TouchableOpacity
                key={c.value}
                style={styles.sheetRow}
                onPress={() => { setFadeMenu(false); onSelectControls?.(c.value); }}>
                <View style={styles.sheetText}>
                  <Text style={[styles.sheetLabel, c.value === controls && styles.sheetLabelOn]}>
                    {c.label}
                  </Text>
                  <Text style={styles.sheetNote}>{c.note}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        </Pressable>
      </Modal>

      {/* The two ways out: opens by holding "Leave" down. */}
      <Modal
        visible={leaveMenu}
        transparent
        animationType="fade"
        onRequestClose={() => setLeaveMenu(false)}>
        <Pressable style={styles.sheetBack} onPress={() => setLeaveMenu(false)}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>{t('channel.leaveTitle')}</Text>
            <TouchableOpacity
              style={styles.sheetRow}
              onPress={(e) => {
                signTouch('leave-stay', e);
                if (toIgnore()) return;
                setLeaveMenu(false);
                onLeave(true);
              }}>
              <View style={styles.sheetText}>
                <Text style={styles.sheetLabel}>{t('channel.leaveStay')}</Text>
                <Text style={styles.sheetNote}>{t('channel.leaveStayNote')}</Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.sheetRow}
              onPress={(e) => {
                signTouch('leave-detach', e);
                if (toIgnore()) return;
                setLeaveMenu(false);
                onLeave(false);
              }}>
              <View style={styles.sheetText}>
                <Text style={styles.sheetLabel}>{t('channel.leaveDetach')}</Text>
                <Text style={styles.sheetNote}>{t('channel.leaveDetachNote')}</Text>
              </View>
            </TouchableOpacity>
            {/* Spelled out, for whoever ended up here without meaning
                to: touching outside works, but that is something one
                has to know, and whoever finds this question in front of
                them without having asked for it does not. */}
            <TouchableOpacity
              style={styles.sheetRow}
              onPress={(e) => { signTouch('leave-cancel', e); setLeaveMenu(false); }}>
              <View style={styles.sheetText}>
                <Text style={styles.sheetLabel}>{t('channel.stayInChannel')}</Text>
              </View>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>

      <Modal
        visible={routeMenu}
        transparent
        animationType="fade"
        onRequestClose={() => setRouteMenu(false)}>
        <Pressable style={styles.sheetBack} onPress={() => setRouteMenu(false)}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>{t('channel.audioOutput')}</Text>
            {audioRoutes.map((r) => (
              <TouchableOpacity
                key={r}
                style={styles.sheetRow}
                onPress={() => { onSelectRoute(r); setRouteMenu(false); }}>
                {React.createElement(OUTPUT_ICON[r], { size: 22, color: '#e6ebf1' })}
                <Text style={[styles.sheetLabel, r === audioRoute && styles.sheetLabelOn]}>
                  {routeLabel(r)}
                </Text>
                {r === audioRoute ? <Text style={styles.sheetCheck}>{'\u2713'}</Text> : null}
              </TouchableOpacity>
            ))}
            {audioRoutes.length < 2 ? (
              <Text style={styles.sheetHint}>{t('channel.moreOutputsHint')}</Text>
            ) : null}

            {/* The volume of the other person's voice, inside the app.
                The side keys do the same thing; this is for when one
                wants to see where one stands, and for the phones where
                the keys seem to do nothing.

                Not to be confused with the percentage on the "Not you"
                pill, which is the other half: that one is the volume at
                which THEY hear YOU. This is how loud you hear them. */}
            <Text style={styles.sheetTitle}>{t('channel.peerVoice')}</Text>
            <View style={styles.sheetRow}>
              <TouchableOpacity
                style={styles.step}
                onPress={() => onChangeLevel?.(-1)}>
                <Text style={styles.stepSign}>−</Text>
              </TouchableOpacity>
              <Text style={styles.stepValue}>
                {peerGain === 0
                  ? t('channel.muted')
                  : `${Math.round((peerGain ?? 1) * 100)}%`}
              </Text>
              <TouchableOpacity
                style={styles.step}
                onPress={() => onChangeLevel?.(+1)}>
                <Text style={styles.stepSign}>+</Text>
              </TouchableOpacity>
            </View>
            {showStats && systemVolume && systemVolume.max > 0 ? (
              // The two halves, for whoever looks at the numbers: the
              // phone's call volume and how much Duetto multiplies on
              // top of it. The total is the percentage above.
              <Text style={styles.sheetMeta}>
                {t('channel.phoneVolume', { volume: systemVolume.volume, max: systemVolume.max })}
                {systemVolume.volume >= systemVolume.max && (peerGain ?? 1) > 1
                  ? `  ·  Duetto ×${(peerGain ?? 1).toFixed(2).replace(/0$/, '')}`
                  : ''}
              </Text>
            ) : null}
            <Text style={styles.sheetHint}>{t('channel.voiceHint')}</Text>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

/**
 * How the other person is while one waits for them, in one line.
 *
 * "Waiting" means connected to the server and reachable by a call;
 * "unreachable" means their phone is not connected to the server, and
 * then the call has nowhere to go. They are the notification's own
 * words, on purpose: they are the same thing.
 */
function peerStatusLine(name: string, present: boolean, detached = false): string {
  const who = name || t('channel.theOther');
  if (present) return t('channel.peerIsWaiting', { who });
  return detached
    ? t('channel.peerMadeUnreachable', { who })
    : t('channel.peerUnreachable', { who });
}

/**
 * How the other person is, in a couple of words.
 *
 * It lives outside the components because two of them use it: the
 * little summary of the window mode and the label of the empty little
 * square. Two vocabularies for the same thing, on the same screen,
 * would be two things to learn instead of one.
 */
function peerWord(
  status: PresenceStatus, peerName: string, peerPresent: boolean, peerDetached: boolean,
): string {
  return status === 'connecting' ? t('channel.connecting')
    : status === 'offline' ? t('channel.noServer')
      : status === 'together' ? (peerName || t('channel.here'))
        : peerDetached ? t('channel.disconnected')
          : peerPresent ? t('channel.waiting') : t('channel.unreachable');
}

/**
 * The same summary, cut down to what fits in a thumb.
 *
 * It is for Picture-in-Picture: whoever pressed Back is not reading,
 * they are keeping an eye. A face and a word.
 */
function PresenceMini(props: {
  status: PresenceStatus;
  peerName: string;
  peerAvatar: Avatar;
  peerPresent: boolean;
  peerDetached: boolean;
}) {
  const { status, peerName, peerAvatar, peerPresent, peerDetached } = props;
  const text = peerWord(status, peerName, peerPresent, peerDetached);
  const initial = peerName.trim().charAt(0).toUpperCase();
  return (
    <View style={styles.miniCard}>
      <View
        style={[
          styles.miniFace,
          { backgroundColor: peerAvatar.color + '33', borderColor: peerAvatar.color },
        ]}>
        <Text style={styles.miniSymbol}>{initial || peerAvatar.symbol}</Text>
      </View>
      <Text style={styles.miniText} numberOfLines={1}>{text}</Text>
    </View>
  );
}

function PresenceCard(props: {
  status: PresenceStatus;
  /** the link is carrying: connected, or still delivering packets */
  linked: boolean;
  connectionState: string;
  peerName: string;
  peerAvatar: Avatar;
  peerAudio: boolean;
  /** in another call on their phone: nothing is heard either way */
  peerBusy?: boolean;
  /** in another call on THIS phone: Duetto is silent until it ends */
  onCall?: boolean;
  /** the other side broke this pair: it cannot work any more */
  pairBroken?: boolean;
  peerPresent: boolean;
  peerDetached: boolean;
  /** waiting because the phone closed the app on them, not by choice */
  peerTornDown?: boolean;
  /** the mark of their audio output, at the summary's size */
  peerMark: React.ReactNode;
  /** the name given to this connection, if there is more than one */
  connectionName?: string;
}) {
  const {
    status, linked, connectionState, peerName, peerAvatar, peerAudio, peerBusy, onCall, pairBroken, peerPresent,
    peerDetached, peerTornDown, peerMark, connectionName,
  } = props;

  if (status === 'connecting') {
    return (
      <View style={styles.card}>
        <ActivityIndicator size="large" color="#2f7cf6" />
        <Text style={styles.cardTitle}>{t('channel.connectingToChannel')}</Text>
      </View>
    );
  }

  if (status === 'offline') {
    return (
      <View style={styles.card}>
        <Text style={styles.avatarGhost}>{'\u{1F4F6}'}</Text>
        <Text style={styles.cardTitle}>{t('channel.serverUnreachable')}</Text>
        <Text style={styles.cardSub}>{t('channel.retryingAutomatically')}</Text>
      </View>
    );
  }

  if (status === 'alone') {
    return (
      <View style={styles.card}>
        <PeerFace name={peerName} avatar={peerAvatar} live={false} />
        <Text style={styles.cardTitle}>
          {t('channel.youAreInChannelShort')}
          {connectionName ? (
            <Text style={styles.cardName}>{'  '}{connectionName}</Text>
          ) : null}
        </Text>
        <Text style={styles.cardSub}>
          {peerStatusLine(peerName, peerPresent, peerDetached)}
          {peerPresent && peerTornDown ? (
            // It is not their choice: some phones tear the app down by
            // themselves, at night too, and saying so keeps us from
            // crediting them with a decision they never took.
            <>
              {t('channel.phoneClosedApp')}
              {'\n'}{t('channel.callArrivesAnyway')}
              <Text style={styles.bold}>{t('buttons.call')}</Text>
              {t('channel.touchSuffix')}
            </>
          ) : peerPresent ? (
            <>
              {t('channel.notInChannelButCall')}
              {'\n'}{t('channel.touchWord')}
              <Text style={styles.bold}>{t('buttons.call')}</Text>
              {t('channel.touchSuffix')}
            </>
          ) : peerDetached ? (
            <>
              {t('channel.detachedOnPurpose')}
              {'\n'}{t('channel.backWhenReopened')}
            </>
          ) : (
            <>
              {t('channel.phoneNotConnected')}
              {'\n'}{t('channel.untilBackNoCall')}
            </>
          )}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <PeerFace name={peerName} avatar={peerAvatar} live />
      <Text style={styles.cardTitle}>
        {t('channel.peerInChannel', { who: peerName || t('channel.theOther') })}
      </Text>
      {/* The line below already says whether their microphone is muted,
          but not where their sound comes out: the mark adds it without
          making the line longer. */}
      {linked ? <View style={styles.cardMark}>{peerMark}</View> : null}
      <Text style={styles.cardSub}>
        {linked
          ? peerBusy
            ? t('channel.peerOnCall', { who: peerName || t('channel.theOther') })
            : (peerAudio ? t('channel.audioLinkedNoVideo') : t('channel.micMuted'))
          : connectionState === 'failed'
            ? t('channel.directFailed')
            : t('channel.establishing')}
      </Text>
      {/* Our own call: said here, where the silence is felt. */}
      {onCall ? <Text style={styles.cardOnCall}>{t('channel.onPhoneCall')}</Text> : null}
      {/* The pair broken from the other side: nothing here can bring
          them back, and waiting would be waiting for nobody. */}
      {pairBroken ? (
        <Text style={styles.cardOnCall}>
          {t('channel.pairBrokenByPeer', { who: peerName || t('channel.theOther') })}
        </Text>
      ) : null}
      {/* The raw state helps to see where it stopped. */}
      {linked ? null : (
        <Text style={styles.cardTiny}>{t('channel.state', { state: connectionState })}</Text>
      )}
    </View>
  );
}

/**
 * The resolution and bandwidth really in play, under the controls.
 *
 * The chosen profile is a ceiling, not a promise: how much really goes
 * through depends on the network and on the scene, and knowing that one
 * is sending 1080p while receiving 640x352 explains at a glance why the
 * other person's picture is poor - without having to read a log.
 */
/**
 * How many technical lines there will be.
 *
 * The box has a fixed height and the video above it is inset by as
 * much: if the two disagree the buttons move under the finger when a
 * number appears. So they ask the same function.
 */
/**
 * How many technical lines there are, so the panel's height never
 * changes under one's fingers.
 *
 * The count follows the layout below: two lines with the voice alone,
 * three when a picture is flowing - the resolutions fill the first
 * line, and squeezing the waits in with everything else shrank the
 * type until the one number worth reading was the smallest thing on
 * the screen.
 */
export function statsLineCount(stats: VideoStats, hasVideo = false): number {
  let n = 1;                                    // the resolution: always there
  if (stats.path || stats.latency != null || stats.recvDelay != null
      || (hasVideo && stats.audioKbps != null)) n += 1;
  if (hasVideo && stats.recvDelay != null) n += 1;
  return n;
}

/** One line of the box is this tall; the height comes from the count. */
export const STATS_LINE_H = 18;

function StatsLine({
  stats, quality, showUp, showDown, peerSend, peerRecv, totalOnly,
}: {
  stats: VideoStats;
  quality: string;
  /** cameras really on: the statistics lag by one sample */
  showUp: boolean;
  showDown: boolean;
  /** the two halves the other phone times; null while it has not said */
  peerSend?: number | null;
  peerRecv?: number | null;
  /** only the total, for whoever wants one number and not two */
  totalOnly?: boolean;
}) {
  /**
   * Bytes a second, everywhere on these lines.
   *
   * It is the unit one watches data use in, and having the voice in
   * bits beside the video in bytes meant two numbers that could not be
   * compared at a glance - which is the whole reason they sit next to
   * each other.
   *
   * Below ten it gets a decimal: the voice lives around four, and
   * rounded to a whole number the difference between an ordinary voice
   * and a rich one would disappear.
   */
  const bytes = (kbps: number | null | undefined) => {
    if (kbps === null || kbps === undefined) return null;
    const kBs = kbps / 8;
    if (kBs >= 1000) return `${(kBs / 1000).toFixed(1)}MB/s`;
    return kBs < 10 ? `${kBs.toFixed(1)}kB/s` : `${Math.round(kBs)}kB/s`;
  };

  const fmt = (v?: { w: number; h: number; fps: number; kbps: number | null }) => {
    if (!v || !v.w || !v.h) return null;
    const band = bytes(v.kbps);
    return `${v.w}×${v.h}·${v.fps}fps${band ? `·${band}` : ''}`;
  };
  // Switching a camera off leaves its RTP stream among the statistics
  // with the last sizes seen: without this filter the line would go on
  // declaring a resolution that is no longer going anywhere.
  const up = showUp ? fmt(stats.out) : null;
  const down = showDown ? fmt(stats.in) : null;
  /**
   * Which way the traffic goes.
   *
   * With the two phones on different networks it is the figure that
   * explains all the rest: if the bandwidth is lopsided or the picture
   * is poor, "relay" says at once that it is the road and not the
   * phone. Reading it from a log in the other person's house is not
   * practicable.
   *
   * The latency holds without video too: it is shown along with the
   * path. The profile is always shown, with the video off as well: it
   * is the choice that explains the numbers beside it, which would
   * otherwise seem to come from nowhere.
   */
  /**
   * A journey, from the three pieces that make it.
   *
   * One phone's send half - encoder and queue - the road, and the other
   * phone's receive half - jitter buffer, decoder, loudspeaker. Each
   * phone times its own two and tells them; the road is the round trip,
   * halved, and either of them can measure that.
   *
   * Nothing here is guessed: what is missing is only what no API
   * offers, the camera and the microphone before the first byte. That
   * is what the tilde says.
   */
  const road = stats.latency != null ? stats.latency / 2 : null;
  /**
   * The receiving half is what a journey cannot do without.
   *
   * It holds the jitter buffer, which is the term that makes this
   * different from a ping, and it is always measurable on the phone
   * that plays the sound. The sending half is not always there: the
   * encoder's time exists for video and not for audio, and the wait in
   * the send queue is not offered by every build of libwebrtc. Missing
   * it, the journey is written without it - short by a few
   * milliseconds, which the tilde already promises - rather than not
   * written at all, which is what used to happen.
   */
  const journey = (send?: number | null, recv?: number | null) =>
    (recv != null && road != null
      ? Math.round((send ?? 0) + road + recv)
      : null);
  /** Up: ours goes out and lands on their loudspeaker. */
  const upDelay = journey(stats.sendDelay, peerRecv);
  /** Down: theirs goes out and lands on ours. */
  const downDelay = journey(peerSend, stats.recvDelay);

  /**
   * The wait in the two directions, like the bandwidth above.
   *
   * What this phone can measure is the wait of what REACHES it, which
   * is the arrow down. The one going up is measured by the other phone
   * - each can only time what arrives - and it is told to us: without
   * that, half of the conversation would be invisible from here.
   *
   * Which of the two is the bad one is the thing worth knowing: the
   * road is the same in both directions, but the phones at its ends are
   * not, and a wait that is all on one side is not looked for on the
   * other.
   *
   * Added up they make what one lives through talking: if the other
   * answers the instant you stop, what comes back has waited twice.
   * That is the number the setting leaves alone on the line.
   */
  const together = upDelay != null && downDelay != null ? upDelay + downDelay : null;

  /** A picture is flowing: the lines arrange themselves around it. */
  const hasVideo = !!(up || down);
  const voiceSaid = stats.audioKbps != null
    ? t('channel.audioRate', { rate: bytes(stats.audioKbps) ?? '' })
    : '';
  const waitSaid = totalOnly && together != null
    // Only the total, and it is still called the wait: it is the one
    // being lived through, the two arrows are its halves.
    ? t('channel.delay', { ms: together })
    : upDelay != null && downDelay != null
      ? t('channel.delayBoth', { up: upDelay, down: downDelay })
      : downDelay != null
        ? t('channel.delayDown', { ms: downDelay })
        : '';

  const path = stats.path === 'local'
    ? t('channel.pathLocal')
    : stats.path === 'direct'
      ? t('channel.pathDirect')
      : stats.path === 'relay'
        ? t('channel.pathRelay')
        : null;

  return (
    <>
      <Text
        style={styles.stats}
        numberOfLines={1}
        // With two videos on the line may not fit: better to shrink it
        // than to see it cut in the middle of a word.
        adjustsFontSizeToFit
        minimumFontScale={0.6}>
        {t('channel.resolutionLabel', { quality: quality.toLowerCase() })}
        {/* The voice's bandwidth goes where there is room: up here in
            the desert of an audio-only line, further down when the
            resolutions have taken the space. */}
        {!hasVideo && voiceSaid ? ` · ${voiceSaid}` : ''}
        {up ? ` · \u2191${up}` : ''}
        {down ? ` · \u2193${down}` : ''}
      </Text>
      {path || stats.latency != null || (hasVideo ? voiceSaid : waitSaid) ? (
        // Like the line above: with the latency at its end it went off
        // the screen, and a line cut in the middle of a number says
        // nothing.
        <Text
          style={styles.stats}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.6}>
          {/* On a relayed road, the leg that carries us to the relay:
              the number that says whether the carrier's NAT has a say. */}
          {path ? t('channel.linkLabel', { path })
            + (stats.path === 'relay' && stats.relayLeg ? ` (${stats.relayLeg})` : '') : ''}
          {hasVideo && voiceSaid ? ` · ${voiceSaid}` : ''}
          {stats.latency != null ? ` · ${t('channel.latency', { ms: stats.latency })}` : ''}
          {!hasVideo && waitSaid ? ` · ${waitSaid}` : ''}
        </Text>
      ) : null}
      {/* With a picture flowing, the waits get a line of their own:
          crowded in with the rest, the type shrank until the one
          number worth reading was the smallest thing on the screen. */}
      {hasVideo && waitSaid ? (
        <Text style={styles.stats} numberOfLines={1}>
          {waitSaid}
        </Text>
      ) : null}
    </>
  );
}

/**
 * The other person's face when their video is not there.
 *
 * Whoever had not set a name used to see a question mark, which looks
 * like an error. In its place a picture made from the pair: always the
 * same one, so it becomes "them" instead of being a placeholder.
 *
 * The name, if there is one, wins: an initial says more than a drawing.
 */
function PeerFace({ name, avatar, live }: { name: string; avatar: Avatar; live: boolean }) {
  const initial = name.trim().charAt(0).toUpperCase();
  return (
    <View
      style={[
        styles.avatar,
        { backgroundColor: avatar.color + '33', borderColor: avatar.color },
        live && styles.avatarLive,
      ]}>
      {initial
        ? <Text style={styles.avatarText}>{initial}</Text>
        : <Text style={styles.avatarSymbol}>{avatar.symbol}</Text>}
    </View>
  );
}

/**
 * A round control, and the signature of the touch that pressed it.
 *
 * The journal records every press with the point on the screen and how
 * long the contact lasted, because on a distant phone that is the only
 * way of knowing WHAT reached the app. It serves one precise question:
 * for days exits from the channel have been appearing that nobody
 * pressed, and in the code that line has a single source, a touch on
 * this button. A finger leaves a recognisable signature - slightly
 * different coordinates every time, a contact of tens or hundreds of
 * milliseconds - which a synthetic touch or a ghost of the digitiser
 * do not have.
 */
function CircleButton(props: {
  label: string;
  icon: React.ReactNode;
  /** the screen is covered: it is noted beside the touch */
  covered?: boolean;
  onPress: () => void;
  onLongPress?: () => void;
  /** a small corner symbol: used for the audio output in use */
  badge?: (p: { size?: number; color?: string }) => JSX.Element;
  active?: boolean;
  highlight?: boolean;
  danger?: boolean;
  disabled?: boolean;
}) {
  const down = useRef<{ t: number; x: number; y: number } | null>(null);
  const sign = (what: string) => {
    const g = down.current;
    const x = Math.round(g?.x ?? -1);
    const y = Math.round(g?.y ?? -1);
    const held = g ? Date.now() - g.t : -1;
    Journal.mark(
      `command:${what} ${x},${y} after ${held}ms covered=${props.covered ? 'yes' : 'no'}`,
    ).catch(() => { /* noop */ });
  };

  return (
    <TouchableOpacity
      style={styles.ctrlItem}
      onPressIn={(e) => {
        down.current = {
          t: Date.now(),
          x: e.nativeEvent.pageX,
          y: e.nativeEvent.pageY,
        };
      }}
      onPress={() => {
        sign(props.label.toLowerCase());
        props.onPress();
      }}
      onLongPress={props.onLongPress
        ? () => { sign(`${props.label.toLowerCase()}-long`); props.onLongPress?.(); }
        : undefined}
      delayLongPress={350}
      disabled={props.disabled}
      activeOpacity={0.6}>
      {/* The corner symbol lives OUTSIDE the pill, which clips what it
          contains: inside, jutting out, it would be cut in half. The
          box holds the two together. */}
      <View style={styles.circleBox}>
        <View
          style={[
            styles.circle,
            // As on Discord: the icon sits bare on the panel, and takes
            // a background only when the function is off or is to be
            // brought forward.
            props.danger
              ? styles.circleDanger
              : props.highlight
                ? styles.circleHighlight
                : props.active === true
                  ? styles.circleOn
                  : null,
            props.disabled && styles.circleDisabled,
          ]}>
          {props.icon}
        </View>
        {props.badge ? (
          <View style={[styles.miniBadge, props.disabled && styles.circleDisabled]}>
            <props.badge size={13} color="#e6ebf1" />
          </View>
        ) : null}
      </View>
      <Text style={styles.ctrlLabel}>{props.label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0b0e14' },

  card: { alignItems: 'center', paddingHorizontal: 32 },
  avatar: {
    width: 108, height: 108, borderRadius: 54,
    alignItems: 'center', justifyContent: 'center', marginBottom: 20, borderWidth: 3,
  },
  /** its own colour stays: inside the channel only the ring changes */
  avatarLive: { borderColor: '#38d16a' },
  avatarText: { color: '#e6ebf1', fontSize: 42, fontWeight: '700' },
  avatarSymbol: { fontSize: 52 },
  /** The height comes from statsLineCount: see there. */
  /**
   * The warning about versions, above the buttons.
   *
   * The colour of the technical warnings, but not their size: this one
   * is read by whoever has asked for nothing, so it is not a footnote.
   */
  versionLine: {
    color: '#e0b341', fontSize: 13, textAlign: 'center',
    marginBottom: 6, paddingHorizontal: 8,
  },
  statsBox: { justifyContent: 'center' },
  /**
   * The technical lines have to stay legible even when faded.
   *
   * They used to be a footnote grey: right at full brightness,
   * unreadable as soon as the controls begin to step aside, because
   * fading multiplies what little contrast there was. Now they are a
   * light grey, with a dark shadow under them that sets them apart even
   * when the panel behind has all but gone.
   */
  stats: {
    color: '#c9d2de', fontSize: 11, textAlign: 'center',
    letterSpacing: 0.2, lineHeight: 16,
    textShadowColor: 'rgba(0,0,0,0.9)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  /** warning yellow: the one technical line that asks to be read */
  statsWarning: { color: '#e8b33a', fontWeight: '700' },
  avatarGhost: { fontSize: 54, marginBottom: 16 },
  cardTitle: { color: '#e6ebf1', fontSize: 21, fontWeight: '700', textAlign: 'center' },
  cardSub: { color: '#8892a0', fontSize: 15, textAlign: 'center', marginTop: 10, lineHeight: 22 },
  cardOnCall: { color: '#ffb454', fontSize: 14, marginTop: 6, textAlign: 'center' },
  bold: { color: '#c9d2de', fontWeight: '700' },
  // Like VideoStage's notice: a pill in the middle, not a band, so
  // that as much of the picture as possible stays visible under it.
  leavingOver: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(11,14,20,0.82)',
    alignItems: 'center', justifyContent: 'center',
    zIndex: 10,
  },
  leavingText: {
    color: '#e6ebf1', fontSize: 16, fontWeight: '600',
  },
  volumeOver: {
    position: 'absolute', left: 0, right: 0, top: '46%', alignItems: 'center',
  },
  volumeText: {
    color: '#e6ebf1', fontSize: 15, fontWeight: '600',
    backgroundColor: 'rgba(0,0,0,0.72)', borderRadius: 18, overflow: 'hidden',
    paddingVertical: 10, paddingHorizontal: 20,
  },
  volumeFigure: { color: '#7cc4ff', fontWeight: '800' },
  newsOver: {
    position: 'absolute',
    backgroundColor: 'rgba(20,26,36,0.94)', borderRadius: 14,
    paddingVertical: 12, paddingHorizontal: 16,
    borderWidth: 1, borderColor: '#2f7cf6',
  },
  newsText: { color: '#e6ebf1', fontSize: 14.5, lineHeight: 20 },
  newsDismiss: { color: '#6b7686', fontSize: 12, marginTop: 6 },
  waitOver: {
    position: 'absolute', left: 0, right: 0, top: '42%',
    alignItems: 'center', paddingHorizontal: 24,
  },
  waitText: {
    color: '#e6ebf1', fontSize: 15, textAlign: 'center', lineHeight: 21,
    backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 20,
    paddingVertical: 10, paddingHorizontal: 18, overflow: 'hidden',
  },
  cardTiny: { color: '#4a5462', fontSize: 12, marginTop: 10 },
  cardMark: { marginTop: 12 },
  cardMarkRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardVolume: { color: '#7d8794', fontSize: 13 },

  miniCard: { alignItems: 'center', paddingHorizontal: 10 },
  miniFace: {
    width: 34, height: 34, borderRadius: 17, borderWidth: 2,
    alignItems: 'center', justifyContent: 'center', marginBottom: 6,
  },
  miniSymbol: { color: '#e6ebf1', fontSize: 15, fontWeight: '700' },
  miniText: { color: '#c9d2de', fontSize: 11, fontWeight: '600' },

  topBar: {
    position: 'absolute', top: 14, left: 14, right: 14,
    flexDirection: 'row', alignItems: 'center', gap: 8,
  },
  whoRow: { position: 'absolute', flexDirection: 'row', alignItems: 'center', gap: 8 },
  whoBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 14,
    paddingHorizontal: 10, paddingVertical: 5,
  },
  whoText: { color: '#e6ebf1', fontSize: 12.5, fontWeight: '700' },
  /** the connection's name: it is a name, not a word of the app's */
  badgeName: { fontStyle: 'italic' },
  /** the same name, in the summary in the middle */
  cardName: { fontStyle: 'italic', fontWeight: '400', color: '#9fb4c8' },
  /** the two halves of the level, under the number, with the technical lines */
  sheetMeta: {
    color: '#7d8794', fontSize: 12.5, textAlign: 'center', marginTop: 2,
  },
  /** one's own audio pill: it is there but does not compete with the first */
  whoBadgeAudio: { backgroundColor: 'rgba(0,0,0,0.42)' },
  whoTextFaint: { color: '#9fb4c8', fontSize: 12, fontWeight: '600' },
  /** the percentage beside the output's mark, when the technical lines
   *  are on */
  pillVolume: { color: '#9fb4c8', fontSize: 11, fontWeight: '700' },
  badge: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 18,
  },
  dot: { width: 9, height: 9, borderRadius: 5, marginRight: 7 },
  dotGreen: { backgroundColor: '#38d16a' },
  dotGrey: { backgroundColor: '#6b7686' },
  badgeText: { color: '#e6ebf1', fontSize: 13, fontWeight: '600' },
  spacer: { flex: 1 },
  gear: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  gearText: { color: '#e6ebf1', fontSize: 17 },
  version: { color: 'rgba(230,235,241,0.45)', fontSize: 10 },
  miniBadge: {
    position: 'absolute', right: -4, bottom: -4,
    backgroundColor: '#1e1f22', borderRadius: 10, padding: 2,
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.45)',
  },
  sheetBack: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end', padding: 16,
  },
  sheet: {
    backgroundColor: '#151a23', borderRadius: 16, padding: 8, paddingBottom: 16,
    borderWidth: 1, borderColor: '#252c38',
  },
  sheetTitle: {
    color: '#8892a0', fontSize: 13, fontWeight: '700',
    paddingHorizontal: 14, paddingTop: 12, paddingBottom: 8,
  },
  sheetRow: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingHorizontal: 14, paddingVertical: 15, borderRadius: 12,
  },
  sheetIcon: { fontSize: 20 },
  sheetLabel: { color: '#c9d2de', fontSize: 17, flex: 1 },
  sheetText: { flex: 1 },
  sheetNote: { color: '#6b7686', fontSize: 12.5, marginTop: 2 },
  sheetLabelOn: { color: '#7cc4ff', fontWeight: '700' },
  sheetCheck: { color: '#7cc4ff', fontSize: 18, fontWeight: '700' },
  step: {
    width: 52, height: 44, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#1e2531', borderWidth: 1, borderColor: '#2f3846',
  },
  stepSign: { color: '#e6ebf1', fontSize: 22, fontWeight: '700' },
  stepValue: {
    flex: 1, textAlign: 'center',
    color: '#7cc4ff', fontSize: 19, fontWeight: '800',
  },
  sheetHint: {
    color: '#5a6472', fontSize: 12, paddingHorizontal: 14, paddingTop: 6, lineHeight: 17,
  },

  panel: {
    position: 'absolute', bottom: 8, left: 12, right: 12,
    backgroundColor: 'rgba(30,31,34,0.94)',
    borderRadius: 28,
    paddingTop: 14, paddingBottom: 14, paddingHorizontal: 4,
  },
  controls: {
    flexDirection: 'row', justifyContent: 'space-evenly', alignItems: 'flex-start',
  },
  ctrlItem: { alignItems: 'center', flex: 1 },
  /**
   * Each control's pill.
   *
   * The four corners are declared one by one, and the pill clips what
   * it contains. With `borderRadius` alone the video button showed up
   * square when it was switched on - that one only, and only when on -
   * and on Android that happens: the background is redrawn while the
   * camera opens, and in that redraw the radius is lost. Declaring all
   * four and clipping takes the road that lost it out of the way.
   */
  circleBox: { width: 48, height: 48 },
  circle: {
    width: 48, height: 48,
    borderRadius: 16,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
    overflow: 'hidden',
    alignItems: 'center', justifyContent: 'center',
  },
  // Off: a light background, the way Discord shows a muted microphone.
  circleOn: { backgroundColor: 'rgba(255,255,255,0.92)' },
  circleHighlight: { backgroundColor: '#2f7cf6' },
  circleDanger: { backgroundColor: '#da373c' },
  circleDisabled: { opacity: 0.35 },
  circleIcon: { fontSize: 22 },
  ctrlLabel: {
    color: 'rgba(255,255,255,0.72)', marginTop: 6, fontSize: 10, fontWeight: '600',
  },
});
