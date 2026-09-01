/*
 * Duetto - a permanent voice and video channel for two people.
 * Copyright (C) 2026 Paolo Benvenuto
 *
 * Free software under the GNU General Public License, version 3 or any
 * later version, and with no warranty of any kind. The full text is in
 * the LICENSE file at the root of the project, and at
 * <https://www.gnu.org/licenses/>.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, StyleSheet, Animated, PanResponder, useWindowDimensions, Text, Pressable,
} from 'react-native';
import { RTCView, MediaStream } from 'react-native-webrtc';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEFAULT_ASPECT } from './webrtc';
import { t } from './i18n';

/**
 * The video area.
 *
 *  - whoever is full screen is NEVER cut: objectFit "contain", so black
 *    bands may show but the picture is whole;
 *  - the second video sits in a little square with the SHAPE of its own
 *    camera (never square), which can be dragged and resized;
 *  - touching the little square swaps the two;
 *  - if only one of the two has the video on, that one goes full screen
 *    and the little square does not appear at all.
 */

/**
 * Where the user put the little square, and how big.
 *
 * Outside the component on purpose: going into the settings tears the
 * channel screen down, and the chosen position went with it - coming
 * back, the little square jumped to the top right, where it is born. A
 * preference expressed by dragging is a preference all the same: it is
 * to be respected as long as the app is alive.
 *
 * What is remembered is the EDGE it rests against and the distance from
 * it, not the coordinates: what one chooses is "bottom left, a finger
 * clear", not "340 pixels from the corner of the screen". When the
 * shape of the video changes the black bands move, and its edges with
 * them: a little square resting at the bottom left must stay there, not
 * slide towards the middle.
 */
type Anchor = {
  /**
   * Which edge of the video it rests against, and how far from it.
   *
   * The distance is a FRACTION of the space the little square can move
   * in, not a measure in pixels: pictures come in different shapes - a
   * 4:3 and a 16:9 leave black bands of different heights - and the
   * same pixels would weigh differently in each.
   */
  ax: 'left' | 'right';
  ay: 'top' | 'bottom';
  ox: number;
  oy: number;
  /** the chosen width, as a fraction of the screen's width */
  fw: number;
};

let chosenPosition: Anchor | null = null;
const PIP_KEY = 'duetto.pip.v2';

/** A lazy write: dragging would save at every frame. */
let saveTimer: ReturnType<typeof setTimeout> | null = null;
function savePosition() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    if (chosenPosition) {
      AsyncStorage.setItem(PIP_KEY, JSON.stringify(chosenPosition)).catch(() => {});
    }
  }, 600);
}

/** Read again at start-up: the position is a preference, not a state. */
export async function loadPipPosition(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(PIP_KEY);
    if (!raw) return;
    const v = JSON.parse(raw);
    if (typeof v?.ox === 'number' && typeof v?.oy === 'number') chosenPosition = v;
  } catch { /* a lost position is not a fault */ }
}

const MARGIN = 14;
const TOP_SAFE = 58;     // just under the settings and the badge (14 + 36 + 8)
// Above the control panel: 8 of gap from the bottom + ~96 of panel
// (edges, buttons, labels) + air. The diagnostic lines, when on, add
// themselves through `insetBottom`.
const BOTTOM_SAFE = 114;

/** The little square's width, as a fraction of the screen's width. */
const START_FRACTION = 0.3;
const MIN_FRACTION = 0.18;
const MAX_FRACTION = 0.62;

const HANDLE = 34; // the grab area for resizing

/** How far the big video can be zoomed with a pinch. */
const MIN_ZOOM = 1;
const MAX_ZOOM = 5;
/** The double tap's zoom. */
const TAP_ZOOM = 2.5;
const DOUBLE_TAP_MS = 300;

/**
 * A finger resting half a second, without moving: a long press.
 *
 * Long enough that holding the phone does not open menus by itself,
 * short enough that asking for one does not feel like insisting.
 */
const LONG_PRESS_MS = 500;

type Props = {
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  localHasVideo: boolean;
  remoteHasVideo: boolean;
  /** width/height of our own video, as it is shown */
  localAspect?: number;
  /** width/height of the other person's video */
  remoteAspect?: number;
  /** changes at every restart of the remote video: rebuilds the view */
  remoteVideoKey?: number;
  /**
   * Their video is expected but missing for the moment.
   *
   * It keeps us from promoting our own video to full screen during an
   * interruption: the big place stays theirs, so that on their return
   * one does not first see one's own grow and then shrink.
   */
  awaitingRemote?: boolean;
  /** a notice to lay over the video, e.g. during an interruption */
  notice?: string;
  /** in Picture-in-Picture: the big video alone, no little square */
  compact?: boolean;
  /**
   * Our own picture is to be flipped like a mirror.
   *
   * It holds for the front camera and only for it: whoever looks at
   * themselves expects a mirror, and that is how one straightens one's
   * hair. With the back camera one is framing the world, and a flipped
   * world is simply wrong: writing reads backwards and one moves the
   * opposite way from what one sees. The other person receives the
   * picture as the camera makes it in any case: the mirror is only in
   * the preview over here.
   */
  mirror?: boolean;
  /** shown when there is no video at all */
  placeholder: React.ReactNode;
  /**
   * How far it was zoomed, once the gesture is over.
   *
   * It is for the journal: during a pinch the number changes a hundred
   * times a second, and a hundred lines tell nothing. What counts is
   * where one decided to stay.
   */
  onZoom?: (zoom: number) => void;
  /**
   * A mark to put beside "Not you": the other person's audio state.
   * Only for their video, of course: on one's own it would say nothing
   * the buttons do not already say.
   */
  peerBadge?: React.ReactNode;
  /** the same, for one's own picture: the output and volume they hear us at */
  ownBadge?: React.ReactNode;
  /**
   * The shape of the full-screen video, `null` if there is none.
   *
   * Whoever draws the controls on top needs it: with "contain" the
   * video does not fill the screen, and a bar placed against the edges
   * of the screen ends up half on the picture and half on the black.
   */
  onBigAspect?: (aspect: number | null) => void;
  /**
   * How far the controls have come in from the edges of the screen.
   *
   * The controls follow the edge of the VIDEO, not that of the screen:
   * without knowing it, the little square would use keep-out zones
   * measured from the screen and would end up under the settings or
   * under the panel.
   */
  insetV?: number;
  insetH?: number;
  /** extra space taken at the bottom, e.g. the diagnostic lines */
  insetBottom?: number;
  /**
   * A touch on the big picture, the little square excepted.
   *
   * Whoever draws the controls on top needs it: a touch on the
   * background shows them or hides them. The little square stays out of
   * it because there a touch already has a meaning of its own - it
   * swaps big and small.
   */
  onBackground?: () => void;
  /**
   * A finger resting on the big picture (or on the empty screen), half
   * a second without moving. The little square stays out of this too,
   * for the same reason as above. It dies the moment the finger moves,
   * so zooming and dragging never trip over it.
   */
  onBackgroundLong?: () => void;
  /**
   * Who fills the big screen.
   *
   * The label is drawn by whoever makes the top bar, to keep it on the
   * name's line. It always holds, even with the little square there:
   * swapping the two videos with a touch, it is easy to lose track of
   * who one is looking at, and the little square alone does not say.
   */
  onOnlyBig?: (who: 'you' | 'peer' | null) => void;
  /**
   * What to write in the little square when there is no picture inside.
   *
   * Whoever sits above decides, because they are the ones who know how
   * the other person is: here we only know that a video is missing, and
   * "waiting" - which is what it always used to say - is true when
   * their picture is about to come back, but not when they are in the
   * channel with the camera off or are not reachable at all.
   */
  emptyLabel?: string;
};

export default function VideoStage(props: Props) {
  const {
    localStream, remoteStream, localHasVideo, remoteHasVideo,
    localAspect, remoteAspect, remoteVideoKey, compact, placeholder, peerBadge, ownBadge,
    mirror = true, onZoom, emptyLabel,
    awaitingRemote, notice,
  } = props;
  const { width, height } = useWindowDimensions();
  const { onBigAspect, insetV = 0, insetH = 0, insetBottom = 0, onBackground, onBackgroundLong, onOnlyBig } = props;

  // false = they are big (the default), true = I am the big one
  const [selfBig, setSelfBig] = useState(false);
  const bothHaveVideo = localHasVideo && remoteHasVideo;

  /**
   * We go back to the default only when there is nothing of ours to
   * show.
   *
   * It used to go back as soon as the videos were not two, and with the
   * camera on alone the swap would not hold: you touched the little
   * square, your own picture rose and in the same instant came down
   * again. But there the choice does exist - your own picture big, or
   * the summary of where the other person is with your own picture in
   * the little square - and it belongs to whoever is watching.
   *
   * It is NOT reset during an interruption: there their video is
   * missing only for a moment, and resetting would mean finding the
   * layout changed at every drop of the network.
   */
  useEffect(() => {
    if (!localHasVideo && selfBig && !awaitingRemote) setSelfBig(false);
  }, [localHasVideo, selfBig, awaitingRemote]);

  // --- Who goes where -----------------------------------------------------
  let bigStream: MediaStream | null = null;
  let bigIsSelf = false;
  let pipStream: MediaStream | null = null;
  let pipIsSelf = false;
  // The little square is drawn anyway, even with no picture inside:
  // removing it and putting it back at every interruption makes the
  // layout dance.
  let pipEmpty = false;

  if (bothHaveVideo) {
    bigIsSelf = selfBig;
    bigStream = selfBig ? localStream : remoteStream;
    pipIsSelf = !selfBig;
    pipStream = selfBig ? remoteStream : localStream;
  } else if (remoteHasVideo) {
    bigStream = remoteStream;
  } else if (awaitingRemote && localHasVideo) {
    // An interruption under way: the chosen layout is kept, so that
    // nothing moves on the return.
    if (selfBig) {
      // You had put yourself in front: you stay in front, and their
      // little square stays where it is, waiting for the picture.
      bigStream = localStream;
      bigIsSelf = true;
      pipEmpty = true;
    } else {
      // The big place stays theirs, empty with the notice over it:
      // promoting one's own would show it growing and then shrinking as
      // soon as they come back.
      pipStream = localStream;
      pipIsSelf = true;
    }
  } else if (localHasVideo) {
    /**
     * Only my camera on: as a rule my picture sits in the LITTLE SQUARE
     * and the big place is left to the summary.
     *
     * My face used to take the whole screen, and with it went the one
     * thing that said where the other person was: switching the video
     * on, there was no telling any more whether they were in the
     * channel, waiting or unreachable. One's own picture is for
     * checking the framing, and for that a little square is more than
     * enough.
     *
     * But it is the rule, not a ban: a touch on the little square takes
     * one's own picture full screen, and the little square stays there
     * empty - with the mark of how the other person is - to go back.
     */
    if (selfBig) {
      bigStream = localStream;
      bigIsSelf = true;
      pipEmpty = true;
    } else {
      pipStream = localStream;
      pipIsSelf = true;
    }
  }

  /**
   * The little square is being drawn right now.
   *
   * It keeps us from moving what is not there: a position written while
   * the view does not exist is seen by nobody, and stays diverging from
   * the one that is drawn.
   */
  const pipAlive = !compact && (!!pipStream || pipEmpty);

  // Whoever looks from outside needs to know how much room the big
  // video really takes, so as not to rest the controls half on it.
  const bigAspect = bigStream
    ? (bigIsSelf ? localAspect : remoteAspect) || DEFAULT_ASPECT
    : null;
  useEffect(() => { onBigAspect?.(bigAspect); }, [bigAspect, onBigAspect]);

  const onlyBig = bigStream
    ? (bigIsSelf ? 'you' : 'peer') as 'you' | 'peer'
    : null;
  useEffect(() => { onOnlyBig?.(onlyBig); }, [onlyBig, onOnlyBig]);

  // The shape is ALWAYS that of the camera the little square shows.
  const pipAspect =
    (pipIsSelf ? localAspect : remoteAspect) || DEFAULT_ASPECT;

  // --- Size ---------------------------------------------------------------
  const [pipWidth, setPipWidth] = useState(
    () => Math.round(width * (chosenPosition?.fw ?? START_FRACTION)),
  );
  useEffect(() => {
    if (chosenPosition) {
      chosenPosition = { ...chosenPosition, fw: pipWidth / width };
      savePosition();
    }
  }, [pipWidth, width]);
  const pipHeight = Math.max(1, Math.round(pipWidth / pipAspect));

  // Needed inside the PanResponders, which do not see the fresh state.
  const sizeRef = useRef({ w: pipWidth, h: pipHeight });
  useEffect(() => { sizeRef.current = { w: pipWidth, h: pipHeight }; }, [pipWidth, pipHeight]);

  const aspectRef = useRef(pipAspect);
  useEffect(() => { aspectRef.current = pipAspect; }, [pipAspect]);

  /**
   * Changes the width, updating the reference size AT ONCE.
   *
   * Going through the state alone, `sizeRef` fell into line one frame
   * later: resizing quickly, the limits were worked out on the previous
   * size - a smaller one - and the little square could end up past the
   * edge.
   */
  const applyWidth = useCallback((w: number) => {
    const h = Math.max(1, Math.round(w / (aspectRef.current || DEFAULT_ASPECT)));
    sizeRef.current = { w, h };
    setPipWidth(w);
  }, []);

  /**
   * How wide it may be: beyond the limits of taste, it must never leave
   * the space between the bars - and what decides how much room it
   * takes in height is the shape, not the width.
   */
  const clampWidth = useCallback(
    (w: number) => {
      const a = aspectRef.current || DEFAULT_ASPECT;
      const maxByWidth = width - 2 * MARGIN - 2 * insetH;
      const maxByHeight = (height - TOP_SAFE - BOTTOM_SAFE - insetBottom - 2 * insetV) * a;
      const ceiling = Math.min(width * MAX_FRACTION, maxByWidth, maxByHeight);
      return Math.round(
        Math.min(Math.max(w, width * MIN_FRACTION), Math.max(width * MIN_FRACTION, ceiling)),
      );
    },
    [width, height, insetV, insetH, insetBottom],
  );

  // --- Position -----------------------------------------------------------

  /**
   * The space the little square may sit in: the edges of the VIDEO, not
   * of the screen, less the areas the controls take up.
   */
  const room = useCallback(() => {
    const { w, h } = sizeRef.current;
    const minX = MARGIN + insetH;
    // The controls follow the edge of the video: so does the keep-out
    // zone, or the little square ends up under the settings.
    const minY = TOP_SAFE + insetV;
    return {
      minX,
      minY,
      maxX: Math.max(minX, width - w - MARGIN - insetH),
      maxY: Math.max(minY, height - h - BOTTOM_SAFE - insetBottom - insetV),
    };
  }, [width, height, insetV, insetH, insetBottom]);

  const startPos = useRef<{ x: number; y: number } | null>(null);
  if (startPos.current === null) {
    const w = Math.round(width * (chosenPosition?.fw ?? START_FRACTION));
    const minX = MARGIN + insetH;
    const minY = TOP_SAFE + insetV;
    const maxX = Math.max(minX, width - w - MARGIN - insetH);
    const maxY = Math.max(minY, height - Math.round(w / DEFAULT_ASPECT) - BOTTOM_SAFE - insetBottom - insetV);
    const a = chosenPosition;
    startPos.current = a
      ? {
          x: a.ax === 'left'
            ? minX + a.ox * (maxX - minX) : maxX - a.ox * (maxX - minX),
          y: a.ay === 'top'
            ? minY + a.oy * (maxY - minY) : maxY - a.oy * (maxY - minY),
        }
      : { x: maxX, y: minY };  // top right
  }
  const pan = useRef(new Animated.ValueXY(startPos.current)).current;
  // Where it really starts from, not from (0,0): the first realignment
  // read this value and would have taken the little square to the top
  // left.
  const posRef = useRef({ ...startPos.current });
  const dragged = useRef(false);

  /**
   * Records which edge it rests against and how far from it.
   *
   * The NEAREST edge is always chosen: whoever puts the little square
   * at the bottom left is expressing "bottom left", and there it must
   * stay even when the picture changes shape.
   */
  const remember = useCallback(() => {
    const { minX, minY, maxX, maxY } = room();
    const dx = Math.max(1, maxX - minX);
    const dy = Math.max(1, maxY - minY);
    const fromLeft = posRef.current.x - minX;
    const fromRight = maxX - posRef.current.x;
    const fromTop = posRef.current.y - minY;
    const fromBottom = maxY - posRef.current.y;
    const fraction = (v: number, total: number) =>
      Math.min(1, Math.max(0, v / total));
    chosenPosition = {
      ax: fromLeft <= fromRight ? 'left' : 'right',
      ay: fromTop <= fromBottom ? 'top' : 'bottom',
      ox: fraction(Math.min(fromLeft, fromRight), dx),
      oy: fraction(Math.min(fromTop, fromBottom), dy),
      fw: sizeRef.current.w / width,
    };
    savePosition();
  }, [room, width]);

  /**
   * A safety net: the position cannot be outside, however it got there.
   *
   * Until now the little square was put back inside only at the end of
   * a gesture or at a change of the picture's shape. Every road that
   * moved it without going through there - and three of them turned up
   * in one night, each for a different reason - left it outside. Here
   * the value itself is watched, which is the one point they all pass
   * through.
   *
   * Not during a gesture: there the finger is in charge, and it is put
   * back inside on release.
   */
  /** true while it is us writing the position, not the finger */
  const weAreFixing = useRef(false);

  useEffect(() => {
    /**
     * Reattached every time the little square comes back.
     *
     * This is not an excess of caution: in React Native, when an
     * animated view is torn down, the value detaches - and on detaching
     * it throws away ALL its listeners. It reads, in
     * Libraries/Animated/nodes/AnimatedNode.js:
     *
     *     __detach(): void {
     *       this.removeAllListeners();
     *
     * Switching the video off made the little square disappear, the
     * value detached and this listener died for good: the view went on
     * moving - the value moves it all the same - but nobody told the
     * code where it had got to any more. The code stayed frozen at the
     * last position it had seen, and at the next drag the little square
     * jumped there.
     *
     * So: it reattaches on reappearance, and starts again from the true
     * value - the animated one, not our copy, because that is the one
     * that moved the view while we were not listening.
     */
    posRef.current = {
      x: (pan.x as any).__getValue(),
      y: (pan.y as any).__getValue(),
    };
    const id = pan.addListener((v) => {
      posRef.current = v;
      if (gestureUnderWay.current || weAreFixing.current) return;
      const { minX, minY, maxX, maxY } = room();
      const x = Math.min(Math.max(v.x, minX), maxX);
      const y = Math.min(Math.max(v.y, minY), maxY);
      if (Math.abs(x - v.x) > 1 || Math.abs(y - v.y) > 1) {
        // Writing in here fires this very listener again: without the
        // guard, each correction calls another and the call stack runs
        // out - the app fell over when the video was switched on.
        weAreFixing.current = true;
        posRef.current = { x, y };
        pan.setValue({ x, y });
        weAreFixing.current = false;
      }
    });
    return () => pan.removeListener(id);
  }, [pan, room, pipAlive]);

  /**
   * Puts the little square back where the user chose it, worked out
   * again on the video's present edges. When the shape changes the
   * black bands move: staying still in pixels, the little square would
   * leave the video or come away from the edge it was resting against.
   */
  const reposition = useCallback((animate = true) => {
    if (gestureUnderWay.current) return;
    const { minX, minY, maxX, maxY } = room();
    const a = chosenPosition;
    const dx = maxX - minX;
    const dy = maxY - minY;
    const x = !a ? maxX : a.ax === 'left'
      ? minX + a.ox * dx : maxX - a.ox * dx;
    const y = !a ? minY : a.ay === 'top'
      ? minY + a.oy * dy : maxY - a.oy * dy;
    if (Math.abs(x - posRef.current.x) < 0.5 && Math.abs(y - posRef.current.y) < 0.5) return;
    posRef.current = { x, y };
    if (animate) {
      Animated.spring(pan, {
        toValue: { x, y }, useNativeDriver: false, friction: 8,
      }).start();
    } else {
      pan.setValue({ x, y });
    }
  }, [pan, room]);

  /**
   * The same coordinates, brought back inside the edges.
   *
   * It is needed DURING the gesture, not only at its end: the little
   * square used to be draggable anywhere and came back on release,
   * which holds as long as the release arrives. If the gesture is
   * stolen by another, or the little square stops existing under the
   * finger, that return never happens and the little square stays off
   * the screen - with nothing left to bring it back, because all the
   * safety nets keep quiet while a gesture is under way. Stopping it at
   * the edge as it moves, the position is always good: there is no
   * moment at which somebody has to put it right.
   */
  const inside = useCallback((x: number, y: number) => {
    const { minX, minY, maxX, maxY } = room();
    return {
      x: Math.min(Math.max(x, minX), maxX),
      y: Math.min(Math.max(y, minY), maxY),
    };
  }, [room]);

  const clampIntoScreen = useCallback((animate = true) => {
    const { minX, minY, maxX, maxY } = room();
    const x = Math.min(Math.max(posRef.current.x, minX), maxX);
    const y = Math.min(Math.max(posRef.current.y, minY), maxY);
    if (x === posRef.current.x && y === posRef.current.y) { remember(); return; }
    // The final position is recorded at once: waiting for the end of
    // the animation would remember the starting one.
    posRef.current = { x, y };
    remember();
    if (animate) {
      Animated.spring(pan, {
        toValue: { x, y }, useNativeDriver: false, friction: 8,
      }).start();
    } else {
      pan.setValue({ x, y });
    }
  }, [pan, room, remember]);

  // On a change of screen, shape or size of the little square, we go
  // back to the CHOSEN position worked out on the new edges - the old
  // one is not brought back inside, because it was expressed in the
  // pixels of another picture. Without animation: while resizing, this
  // fires at every frame and the spring would lag behind the finger.
  // One could see the little square sliding to the right as it grew -
  // because it grows from the top left corner - and going back into
  // place only on release. Repositioning it at once, the edge it is
  // anchored to stays put and the growth goes inwards.
  useEffect(() => {
    // Not while the little square is not there: see below.
    if (!pipAlive) return;
    reposition(false);
  }, [pipAlive, width, height, pipWidth, pipHeight, insetV, insetH, reposition]);

  /**
   * On reappearing, the little square puts itself where it belongs.
   *
   * One frame later, not at once: the view has only just been born, and
   * the frame it has to sit in - black bands, the room taken by the
   * technical lines - settles along with it.
   */
  useEffect(() => {
    if (!pipAlive) return;
    const id = requestAnimationFrame(() => reposition(false));
    return () => cancelAnimationFrame(id);
  }, [pipAlive, reposition]);

  // --- Dragging (and a two-finger pinch to resize) ------------------------
  const pinchStart = useRef<{ dist: number; w: number } | null>(null);
  const dragStart = useRef({ x: 0, y: 0 });
  /**
   * How far the finger had moved at the gesture's first movement.
   *
   * It is not zero as one would expect. React Native's count starts
   * again from zero when the gesture is granted, but the bookmark of
   * which movements it has already counted is only cleared on release:
   * whoever receives the gesture at the TOUCH - the little square and
   * its handle - sees the leftovers of the previous touches arrive at
   * the first movement, and it used to jump elsewhere all at once and
   * then follow the finger properly.
   *
   * That first value is taken as the zero point and counted from
   * there.
   */
  const fingerStart = useRef<{ dx: number; dy: number } | null>(null);
  /**
   * A finger is resting on the little square.
   *
   * While it is moving, the automatic repositioning must not step in:
   * the new anchor is recorded only on release, so it would take the
   * little square back to the old one - and from outside one sees it
   * jump by itself under the finger.
   */
  const gestureUnderWay = useRef(false);

  const twoFingerDistance = (touches: any[]) => {
    const [a, b] = touches;
    return Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY);
  };

  const dragResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_e, g) =>
          Math.abs(g.dx) > 3 || Math.abs(g.dy) > 3,
        onPanResponderGrant: () => {
          gestureUnderWay.current = true;
          dragged.current = false;
          pinchStart.current = null;
          fingerStart.current = null;
          // No `extractOffset`: the position stays in absolute
          // coordinates for the whole gesture. With the offset on, the
          // automatic repositioning - which writes absolute coordinates
          // - was ADDED to the offset instead of replacing it, and
          // during a pinch the little square shot off the screen only
          // to come back on release.
          dragStart.current = { ...posRef.current };
        },
        onPanResponderMove: (e, g) => {
          const touches = e.nativeEvent.touches ?? [];

          // Two fingers: it resizes, it does not move.
          if (touches.length >= 2) {
            dragged.current = true;
            // With one finger lifted we go back to dragging: from
            // here, not from where the drag began before the pinch.
            fingerStart.current = null;
            dragStart.current = { ...posRef.current };
            const dist = twoFingerDistance(touches);
            if (!pinchStart.current) {
              pinchStart.current = { dist, w: sizeRef.current.w };
            } else if (pinchStart.current.dist > 0) {
              const ratio = dist / pinchStart.current.dist;
              applyWidth(clampWidth(pinchStart.current.w * ratio));
              // As it grows, the little square runs past the edge it
              // rests against: the automatic repositioning does not
              // step in here, because a gesture is under way.
              pan.setValue(inside(posRef.current.x, posRef.current.y));
            }
            return;
          }

          pinchStart.current = null;
          if (!fingerStart.current) fingerStart.current = { dx: g.dx, dy: g.dy };
          const dx = g.dx - fingerStart.current.dx;
          const dy = g.dy - fingerStart.current.dy;
          if (Math.abs(dx) > 4 || Math.abs(dy) > 4) dragged.current = true;
          pan.setValue(inside(
            dragStart.current.x + dx,
            dragStart.current.y + dy,
          ));
        },
        onPanResponderRelease: () => {
          gestureUnderWay.current = false;
          pinchStart.current = null;
          if (dragged.current) {
            // clampIntoScreen records the final position itself.
            clampIntoScreen();
          } else {
            // A sharp touch: it swaps big and small.
            setSelfBig((v) => !v);
          }
        },
        onPanResponderTerminate: () => {
          gestureUnderWay.current = false;
          pinchStart.current = null;
          clampIntoScreen();
        },
      }),
    [pan, inside, clampIntoScreen, clampWidth, applyWidth],
  );

  // --- A corner handle for resizing with one finger -----------------------
  const resizeStart = useRef(0);
  /** the finger's zero point on the handle, like `fingerStart` */
  const handleStart = useRef<number | null>(null);
  const resizeResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          resizeStart.current = sizeRef.current.w;
          handleStart.current = null;
        },
        onPanResponderMove: (_e, g) => {
          // As with the drag: the first movement carries leftovers
          // with it, and without the zero point the little square
          // changed size with a jerk as soon as the handle was
          // touched.
          if (handleStart.current === null) handleStart.current = g.dx;
          applyWidth(clampWidth(resizeStart.current + g.dx - handleStart.current));
          pan.setValue(inside(posRef.current.x, posRef.current.y));
        },
        onPanResponderRelease: () => clampIntoScreen(),
        onPanResponderTerminate: () => clampIntoScreen(),
      }),
    [pan, inside, clampWidth, clampIntoScreen, applyWidth],
  );

  // --- Zoom on the big video ----------------------------------------------
  // A pinch to zoom in, a drag to move around inside the zoom, a double
  // tap to go back to the full picture.
  const zoom = useRef(new Animated.Value(1)).current;
  const zoomRef = useRef(1);
  const shift = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const shiftRef = useRef({ x: 0, y: 0 });
  const zoomStart = useRef(1);
  const pinchBase = useRef(0);
  const shiftStart = useRef({ x: 0, y: 0 });
  const lastTap = useRef(0);
  const movedInGesture = useRef(false);
  /** the wait that tells a single tap from the first of a double one */
  const tapWait = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** the wait that turns a resting finger into a long press */
  const longWait = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** the long press fired: the release must not count as a tap too */
  const longFired = useRef(false);

  /**
   * How far we are zoomed in, according to us.
   *
   * The real zooming is done by the native engine, which does not
   * account for that number to us: the listeners below stop being
   * called as soon as the value moves to the native side, and our copy
   * stays at 1 while the screen is at 2.5. From there, three troubles
   * in a row: the pinch started again from 100%, the release believed
   * you had not zoomed and pulled everything back like an elastic, and
   * the double tap never returned to the full picture.
   *
   * The copy has to be written by us, in the same instant in which we
   * move the picture: we are the ones deciding that number, there is no
   * reason to go and ask somebody who may not answer.
   *
   * The listeners stay: while the value has not yet moved to the native
   * side they work, and two sources that agree do no harm.
   */
  const noteZoom = useCallback((z: number) => {
    zoomRef.current = z;
  }, []);
  const noteShift = useCallback((x: number, y: number) => {
    shiftRef.current = { x, y };
  }, []);

  useEffect(() => {
    const z = zoom.addListener((v) => { zoomRef.current = v.value; });
    const p2 = shift.addListener((v) => { shiftRef.current = v; });
    return () => { zoom.removeListener(z); shift.removeListener(p2); };
  }, [zoom, shift]);

  const resetZoom = useCallback(() => {
    noteZoom(1);
    noteShift(0, 0);
    Animated.parallel([
      Animated.timing(zoom, { toValue: 1, duration: 180, useNativeDriver: true }),
      Animated.timing(shift, { toValue: { x: 0, y: 0 }, duration: 180, useNativeDriver: true }),
    ]).start();
  }, [zoom, shift, noteZoom, noteShift]);

  /**
   * When WHO is on the big screen changes, the zoom no longer makes
   * sense: you were looking at a detail of another picture.
   *
   * It does not hold when their picture is merely rebuilt - which
   * happens at every coming and going of their video, and on a mobile
   * network that is often: it is the same person, and whoever was
   * looking at a detail did not ask to go back.
  useEffect(() => { resetZoom(); }, [bigIsSelf, resetZoom]);

  /** Do not let the zoomed picture leave the edges. */
  const clampShift = useCallback(() => {
    const z = zoomRef.current;
    const maxX = Math.max(0, (width * (z - 1)) / 2);
    const maxY = Math.max(0, (height * (z - 1)) / 2);
    const x = Math.min(Math.max(shiftRef.current.x, -maxX), maxX);
    const y = Math.min(Math.max(shiftRef.current.y, -maxY), maxY);
    if (x !== shiftRef.current.x || y !== shiftRef.current.y) {
      shiftRef.current = { x, y };
      Animated.spring(shift, {
        toValue: { x, y }, useNativeDriver: true, friction: 8,
      }).start();
    }
  }, [shift, width, height]);

  const zoomResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (e, g) =>
          (e.nativeEvent.touches?.length ?? 0) >= 2 ||
          (zoomRef.current > 1.01 && (Math.abs(g.dx) > 3 || Math.abs(g.dy) > 3)),
        onPanResponderGrant: () => {
          movedInGesture.current = false;
          zoomStart.current = zoomRef.current;
          shiftStart.current = { ...shiftRef.current };
          pinchBase.current = 0;
          // The long press arms here and dies at the first movement:
          // zooming and dragging never meet it.
          longFired.current = false;
          if (longWait.current) clearTimeout(longWait.current);
          longWait.current = onBackgroundLong
            ? setTimeout(() => {
              longWait.current = null;
              if (movedInGesture.current) return;
              longFired.current = true;
              onBackgroundLong();
            }, LONG_PRESS_MS)
            : null;
        },
        onPanResponderMove: (e, g) => {
          const touches = e.nativeEvent.touches ?? [];
          if (touches.length >= 2 || Math.abs(g.dx) > 8 || Math.abs(g.dy) > 8) {
            if (longWait.current) {
              clearTimeout(longWait.current);
              longWait.current = null;
            }
          }
          if (touches.length >= 2) {
            movedInGesture.current = true;
            const [a, b] = touches;
            const dist = Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY);
            if (!pinchBase.current) {
              pinchBase.current = dist;
              zoomStart.current = zoomRef.current;
              return;
            }
            const next = Math.min(
              Math.max((dist / pinchBase.current) * zoomStart.current, MIN_ZOOM),
              MAX_ZOOM,
            );
            zoom.setValue(next);
            noteZoom(next);
            return;
          }
          if (zoomRef.current > 1.01) {
            if (Math.abs(g.dx) > 4 || Math.abs(g.dy) > 4) movedInGesture.current = true;
            const sx = shiftStart.current.x + g.dx;
            const sy = shiftStart.current.y + g.dy;
            shift.setValue({ x: sx, y: sy });
            noteShift(sx, sy);
          }
        },
        onPanResponderRelease: () => {
          if (longWait.current) {
            clearTimeout(longWait.current);
            longWait.current = null;
          }
          // The menu is already open: the finger lifting is not a tap.
          if (longFired.current) {
            longFired.current = false;
            return;
          }
          if (!movedInGesture.current) {
            // A double tap: it zooms in, or goes back to the full picture.
            const now = Date.now();
            if (now - lastTap.current < DOUBLE_TAP_MS) {
              lastTap.current = 0;
              if (tapWait.current) {
                clearTimeout(tapWait.current);
                tapWait.current = null;
              }
              if (zoomRef.current > 1.01) resetZoom();
              else {
                noteZoom(TAP_ZOOM);
                Animated.timing(zoom, {
                  toValue: TAP_ZOOM, duration: 180, useNativeDriver: true,
                }).start();
              }
              onZoom?.(zoomRef.current);
              return;
            }
            lastTap.current = now;
            // A single tap: it shows or hides the controls, but only
            // after ruling out that it is the first of a double tap -
            // which means zooming, and is another thing.
            if (tapWait.current) clearTimeout(tapWait.current);
            tapWait.current = setTimeout(() => {
              tapWait.current = null;
              onBackground?.();
            }, DOUBLE_TAP_MS);
            return;
          }
          if (zoomRef.current <= 1.01) resetZoom();
          else clampShift();
          onZoom?.(zoomRef.current);
        },
        onPanResponderTerminate: () => {
          if (longWait.current) {
            clearTimeout(longWait.current);
            longWait.current = null;
          }
          clampShift();
        },
      }),
    [zoom, shift, resetZoom, clampShift, onBackground, onBackgroundLong, noteZoom, noteShift, onZoom],
  );

  return (
    <View style={styles.root}>
      {bigStream ? (
        <Animated.View
          {...zoomResponder.panHandlers}
          style={[
            styles.big,
            {
              transform: [
                { translateX: shift.x },
                { translateY: shift.y },
                { scale: zoom },
              ],
            },
          ]}>
          <RTCView
            key={bigIsSelf ? 'big-self' : `big-remote-${remoteVideoKey ?? 0}`}
            streamURL={bigStream.toURL()}
            style={styles.bigVideo}
            objectFit="contain"
            mirror={bigIsSelf && mirror}
            zOrder={0}
          />
        </Animated.View>
      ) : (
        <Pressable
          style={[styles.big, styles.placeholder]}
          onPress={onBackground}
          onLongPress={onBackgroundLong}
          delayLongPress={LONG_PRESS_MS}>
          {/* During an interruption: black, not the summary.
              Their video is about to come back, and putting the "they
              are in the channel" screen up again at every change of
              network turns it into a flicker. Black says nothing, and
              that is exactly what is wanted: nothing has happened that
              is worth telling.
              With a notice laid over it the same holds: two overlapping
              messages would say the same thing. */}
          {notice || awaitingRemote ? null : placeholder}
        </Pressable>
      )}

      {notice ? (
        <View style={styles.notice} pointerEvents="none">
          <Text style={styles.noticeText}>{notice}</Text>
        </View>
      ) : null}

      {(pipStream || pipEmpty) && !compact ? (
        <Animated.View
          {...dragResponder.panHandlers}
          style={[
            styles.pip,
            {
              width: pipWidth,
              height: pipHeight,
              transform: [{ translateX: pan.x }, { translateY: pan.y }],
            },
          ]}>
          {/* "contain" here too: the little square already has the
              right shape, so there is nothing to cut. */}
          {pipStream ? (
            <RTCView
              key={pipIsSelf ? 'pip-self' : `pip-remote-${remoteVideoKey ?? 0}`}
              streamURL={pipStream.toURL()}
              style={styles.pipVideo}
              objectFit="contain"
              mirror={pipIsSelf && mirror}
              zOrder={1}
            />
          ) : (
            <View style={styles.pipWaiting} />
          )}
          <View style={styles.pipTag} pointerEvents="none">
            <Text style={styles.pipTagText}>
              {pipStream
                ? (pipIsSelf ? t('channel.you') : t('channel.notYou'))
                : (emptyLabel || t('channel.waiting'))}
            </Text>
            {pipIsSelf ? ownBadge : peerBadge}
          </View>
        </Animated.View>
      ) : null}

      {/* The handle is the little square's SISTER, not its child:
          Android does not deliver touches to a child that lies past its
          parent's edges, and inside it would be covered by the video's
          surface. */}
      {(pipStream || pipEmpty) && !compact ? (
        <Animated.View
          {...resizeResponder.panHandlers}
          style={[
            styles.handle,
            {
              transform: [
                { translateX: Animated.add(pan.x, pipWidth - HANDLE / 2) },
                { translateY: Animated.add(pan.y, pipHeight - HANDLE / 2) },
              ],
            },
          ]}>
          <View style={styles.handleGrip} />
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFillObject },
  big: { ...StyleSheet.absoluteFillObject, backgroundColor: '#000' },
  bigVideo: { flex: 1 },
  placeholder: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#0b0e14' },
  pip: {
    position: 'absolute', top: 0, left: 0,
    /**
     * Sharp corners, on purpose.
     *
     * RTCView is a SurfaceView: it draws on a graphics layer of its own
     * and no parent can clip it - neither `overflow: hidden` nor
     * `borderRadius` touch it. With a rounded frame its square corners
     * stuck out, and the only remedy was to shrink the video inside a
     * margin. Better a clean rectangle than a rounding the video cannot
     * respect.
     */
    backgroundColor: '#000',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)',
    shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  pipVideo: { flex: 1 },
  pipWaiting: { flex: 1, backgroundColor: '#14171d' },
  notice: {
    position: 'absolute', left: 0, right: 0, top: '46%',
    alignItems: 'center', paddingHorizontal: 24,
  },
  noticeText: {
    color: '#e6ebf1', fontSize: 15, textAlign: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 20,
    paddingVertical: 10, paddingHorizontal: 18, overflow: 'hidden',
  },
  /**
   * A pill, not a band.
   *
   * The grey strip from edge to edge covered a slice of picture and
   * looked nothing like the big video's label, which is the same thing
   * said at the same moment.
   */
  pipTag: {
    position: 'absolute', top: 5, left: 5,
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 10,
    paddingHorizontal: 7, paddingVertical: 3,
  },
  pipTagText: { color: '#e6ebf1', fontSize: 10, fontWeight: '700' },
  /**
   * The handle sits OUTSIDE the corner, not over the video.
   *
   * The little square's video uses `zOrder={1}`, that is it is drawn
   * above the ordinary views - it has to be, or it would end up behind
   * the big video, which is a native surface as well. But that covered
   * the handle: it was there and pressable, merely invisible, and one
   * ended up dragging the little square instead of resizing it.
   */
  handle: {
    position: 'absolute', top: 0, left: 0,
    width: HANDLE, height: HANDLE,
    alignItems: 'center', justifyContent: 'center',
  },
  /** A little button, not a corner: outside the frame it needs to be seen. */
  handleGrip: {
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: 'rgba(20,22,28,0.92)',
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.75)',
  },
});
