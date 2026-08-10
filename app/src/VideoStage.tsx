import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, StyleSheet, Animated, PanResponder, useWindowDimensions, Text,
} from 'react-native';
import { RTCView, MediaStream } from 'react-native-webrtc';
import { DEFAULT_ASPECT } from './webrtc';

/**
 * L'area video.
 *
 *  - chi e' a schermo intero non viene MAI tagliato: objectFit "contain",
 *    quindi si vedono eventuali bande nere ma l'immagine e' integra;
 *  - il secondo video sta in un riquadrino con le PROPORZIONI della sua
 *    camera (mai quadrato), trascinabile e ridimensionabile;
 *  - toccando il riquadrino i due si scambiano di posto;
 *  - se uno solo dei due ha il video acceso, quello va a schermo intero
 *    e il riquadrino non compare proprio.
 */

const MARGIN = 14;
const TOP_SAFE = 86;     // sotto la barra di stato dell'app
const BOTTOM_SAFE = 128; // sopra i controlli

/** Larghezza del riquadrino, come frazione della larghezza schermo. */
const START_FRACTION = 0.3;
const MIN_FRACTION = 0.18;
const MAX_FRACTION = 0.62;

const HANDLE = 34; // area di presa per ridimensionare

type Props = {
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  localHasVideo: boolean;
  remoteHasVideo: boolean;
  /** larghezza/altezza del proprio video, come viene mostrato */
  localAspect?: number;
  /** larghezza/altezza del video dell'altro */
  remoteAspect?: number;
  /** in Picture-in-Picture: solo il video grande, senza riquadrino */
  compact?: boolean;
  /** mostrato quando non c'e' nessun video */
  placeholder: React.ReactNode;
};

export default function VideoStage(props: Props) {
  const {
    localStream, remoteStream, localHasVideo, remoteHasVideo,
    localAspect, remoteAspect, compact, placeholder,
  } = props;
  const { width, height } = useWindowDimensions();

  // false = l'altro e' grande (default), true = sono io ad essere grande
  const [selfBig, setSelfBig] = useState(false);
  const bothHaveVideo = localHasVideo && remoteHasVideo;

  // Con un solo video acceso lo scambio non ha senso: si torna al default.
  useEffect(() => {
    if (!bothHaveVideo && selfBig) setSelfBig(false);
  }, [bothHaveVideo, selfBig]);

  // --- Chi va dove --------------------------------------------------------
  let bigStream: MediaStream | null = null;
  let bigIsSelf = false;
  let pipStream: MediaStream | null = null;
  let pipIsSelf = false;

  if (bothHaveVideo) {
    bigIsSelf = selfBig;
    bigStream = selfBig ? localStream : remoteStream;
    pipIsSelf = !selfBig;
    pipStream = selfBig ? remoteStream : localStream;
  } else if (remoteHasVideo) {
    bigStream = remoteStream;
  } else if (localHasVideo) {
    bigStream = localStream;
    bigIsSelf = true;
  }

  // Le proporzioni sono SEMPRE quelle della camera che il riquadrino mostra.
  const pipAspect =
    (pipIsSelf ? localAspect : remoteAspect) || DEFAULT_ASPECT;

  // --- Dimensione ---------------------------------------------------------
  const [pipWidth, setPipWidth] = useState(() => Math.round(width * START_FRACTION));
  const pipHeight = Math.max(1, Math.round(pipWidth / pipAspect));

  // Serve dentro i PanResponder, che non vedono lo stato aggiornato.
  const sizeRef = useRef({ w: pipWidth, h: pipHeight });
  useEffect(() => { sizeRef.current = { w: pipWidth, h: pipHeight }; }, [pipWidth, pipHeight]);

  const clampWidth = useCallback(
    (w: number) => Math.round(
      Math.min(Math.max(w, width * MIN_FRACTION), width * MAX_FRACTION),
    ),
    [width],
  );

  // --- Posizione ----------------------------------------------------------
  const pan = useRef(new Animated.ValueXY({
    x: width - Math.round(width * START_FRACTION) - MARGIN,
    y: TOP_SAFE,
  })).current;
  const posRef = useRef({ x: 0, y: 0 });
  const dragged = useRef(false);

  useEffect(() => {
    const id = pan.addListener((v) => { posRef.current = v; });
    return () => pan.removeListener(id);
  }, [pan]);

  const clampIntoScreen = useCallback((animate = true) => {
    const { w, h } = sizeRef.current;
    const maxX = Math.max(MARGIN, width - w - MARGIN);
    const maxY = Math.max(TOP_SAFE, height - h - BOTTOM_SAFE);
    const x = Math.min(Math.max(posRef.current.x, MARGIN), maxX);
    const y = Math.min(Math.max(posRef.current.y, TOP_SAFE), maxY);
    if (x === posRef.current.x && y === posRef.current.y) return;
    if (animate) {
      Animated.spring(pan, {
        toValue: { x, y }, useNativeDriver: false, friction: 8,
      }).start();
    } else {
      pan.setValue({ x, y });
    }
  }, [pan, width, height]);

  // Se ruoti il telefono, o il riquadrino cresce, va riportato dentro.
  useEffect(() => { clampIntoScreen(); }, [width, height, pipWidth, pipHeight, clampIntoScreen]);

  // --- Trascinamento (e pizzico a due dita per ridimensionare) ------------
  const pinchStart = useRef<{ dist: number; w: number } | null>(null);

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
          dragged.current = false;
          pinchStart.current = null;
          pan.extractOffset();
        },
        onPanResponderMove: (e, g) => {
          const touches = e.nativeEvent.touches ?? [];

          // Due dita: si ridimensiona, non si sposta.
          if (touches.length >= 2) {
            dragged.current = true;
            const dist = twoFingerDistance(touches);
            if (!pinchStart.current) {
              pinchStart.current = { dist, w: sizeRef.current.w };
            } else if (pinchStart.current.dist > 0) {
              const ratio = dist / pinchStart.current.dist;
              setPipWidth(clampWidth(pinchStart.current.w * ratio));
            }
            return;
          }

          pinchStart.current = null;
          if (Math.abs(g.dx) > 4 || Math.abs(g.dy) > 4) dragged.current = true;
          pan.setValue({ x: g.dx, y: g.dy });
        },
        onPanResponderRelease: () => {
          pan.flattenOffset();
          pinchStart.current = null;
          if (dragged.current) {
            clampIntoScreen();
          } else {
            // Tocco secco: scambia grande e piccolo.
            setSelfBig((v) => !v);
          }
        },
        onPanResponderTerminate: () => {
          pan.flattenOffset();
          pinchStart.current = null;
          clampIntoScreen();
        },
      }),
    [pan, clampIntoScreen, clampWidth],
  );

  // --- Maniglia d'angolo per ridimensionare con un dito -------------------
  const resizeStart = useRef(0);
  const resizeResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: () => { resizeStart.current = sizeRef.current.w; },
        onPanResponderMove: (_e, g) => {
          setPipWidth(clampWidth(resizeStart.current + g.dx));
        },
        onPanResponderRelease: () => clampIntoScreen(),
        onPanResponderTerminate: () => clampIntoScreen(),
      }),
    [clampWidth, clampIntoScreen],
  );

  return (
    <View style={styles.root}>
      {bigStream ? (
        <RTCView
          streamURL={bigStream.toURL()}
          style={styles.big}
          objectFit="contain"
          mirror={bigIsSelf}
          zOrder={0}
        />
      ) : (
        <View style={[styles.big, styles.placeholder]}>{placeholder}</View>
      )}

      {pipStream && !compact ? (
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
          {/* Anche qui "contain": il riquadrino ha gia' le proporzioni
              giuste, quindi non c'e' nulla da tagliare. */}
          <RTCView
            streamURL={pipStream.toURL()}
            style={styles.pipVideo}
            objectFit="contain"
            mirror={pipIsSelf}
            zOrder={1}
          />
          <View style={styles.pipTag} pointerEvents="none">
            <Text style={styles.pipTagText}>{pipIsSelf ? 'Tu' : 'Lui/Lei'}</Text>
          </View>
          <View {...resizeResponder.panHandlers} style={styles.handle}>
            <View style={styles.handleGrip} />
          </View>
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFillObject },
  big: { ...StyleSheet.absoluteFillObject, backgroundColor: '#000' },
  placeholder: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#0b0e14' },
  pip: {
    position: 'absolute', top: 0, left: 0,
    borderRadius: 14, overflow: 'hidden',
    backgroundColor: '#000',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)',
    elevation: 8,
    shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  pipVideo: { flex: 1 },
  pipTag: {
    position: 'absolute', left: 0, right: 0, top: 0,
    backgroundColor: 'rgba(0,0,0,0.45)', paddingVertical: 2, alignItems: 'center',
  },
  pipTagText: { color: '#e6ebf1', fontSize: 10, fontWeight: '600' },
  handle: {
    position: 'absolute', right: 0, bottom: 0,
    width: HANDLE, height: HANDLE,
    alignItems: 'flex-end', justifyContent: 'flex-end', padding: 5,
  },
  handleGrip: {
    width: 14, height: 14,
    borderRightWidth: 2.5, borderBottomWidth: 2.5,
    borderColor: 'rgba(255,255,255,0.85)',
    borderBottomRightRadius: 3,
  },
});
