import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, StyleSheet, Animated, PanResponder, useWindowDimensions, Text,
} from 'react-native';
import { RTCView, MediaStream } from 'react-native-webrtc';

/**
 * L'area video.
 *
 * Regole:
 *  - chi e' a schermo intero non viene MAI tagliato: objectFit "contain",
 *    quindi si vedono eventuali bande nere ma l'immagine e' integra;
 *  - il secondo video sta in un riquadrino trascinabile;
 *  - toccando il riquadrino i due si scambiano di posto;
 *  - se uno solo dei due ha il video acceso, quello va a schermo intero
 *    e il riquadrino non compare proprio.
 */

const PIP_W = 112;
const PIP_H = 158;
const MARGIN = 14;
const TOP_SAFE = 86;     // sotto la barra di stato dell'app
const BOTTOM_SAFE = 132; // sopra i controlli
/** Il riquadrino e' una miniatura: qui riempire e' meglio che lasciare bande. */
const PIP_FIT = 'cover' as const;

type Props = {
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  localHasVideo: boolean;
  remoteHasVideo: boolean;
  /** mostrato quando non c'e' nessun video */
  placeholder: React.ReactNode;
};

export default function VideoStage(props: Props) {
  const { localStream, remoteStream, localHasVideo, remoteHasVideo, placeholder } = props;
  const { width, height } = useWindowDimensions();

  // false = l'altro e' grande (default), true = sono io ad essere grande
  const [selfBig, setSelfBig] = useState(false);

  const bothHaveVideo = localHasVideo && remoteHasVideo;

  // Con un solo video acceso lo scambio non ha senso: si torna al default.
  useEffect(() => {
    if (!bothHaveVideo && selfBig) setSelfBig(false);
  }, [bothHaveVideo, selfBig]);

  const pan = useRef(new Animated.ValueXY({
    x: width - PIP_W - MARGIN,
    y: TOP_SAFE,
  })).current;
  const posRef = useRef({ x: width - PIP_W - MARGIN, y: TOP_SAFE });
  const dragged = useRef(false);

  useEffect(() => {
    const id = pan.addListener((v) => { posRef.current = v; });
    return () => pan.removeListener(id);
  }, [pan]);

  const clampIntoScreen = useCallback(() => {
    const maxX = width - PIP_W - MARGIN;
    const maxY = height - PIP_H - BOTTOM_SAFE;
    const x = Math.min(Math.max(posRef.current.x, MARGIN), Math.max(MARGIN, maxX));
    const y = Math.min(Math.max(posRef.current.y, TOP_SAFE), Math.max(TOP_SAFE, maxY));
    if (x !== posRef.current.x || y !== posRef.current.y) {
      Animated.spring(pan, {
        toValue: { x, y },
        useNativeDriver: false,
        friction: 8,
      }).start();
    }
  }, [pan, width, height]);

  // Se ruoti il telefono il riquadrino potrebbe finire fuori: lo riporto dentro.
  useEffect(() => { clampIntoScreen(); }, [width, height, clampIntoScreen]);

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_e, g) =>
          Math.abs(g.dx) > 3 || Math.abs(g.dy) > 3,
        onPanResponderGrant: () => {
          dragged.current = false;
          pan.extractOffset();
        },
        onPanResponderMove: (_e, g) => {
          if (Math.abs(g.dx) > 4 || Math.abs(g.dy) > 4) dragged.current = true;
          pan.setValue({ x: g.dx, y: g.dy });
        },
        onPanResponderRelease: () => {
          pan.flattenOffset();
          if (dragged.current) {
            clampIntoScreen();
          } else {
            // Tocco senza trascinamento: scambia grande e piccolo.
            setSelfBig((v) => !v);
          }
        },
        onPanResponderTerminate: () => {
          pan.flattenOffset();
          clampIntoScreen();
        },
      }),
    [pan, clampIntoScreen],
  );

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

      {pipStream ? (
        <Animated.View
          {...responder.panHandlers}
          style={[
            styles.pip,
            { transform: [{ translateX: pan.x }, { translateY: pan.y }] },
          ]}>
          <RTCView
            streamURL={pipStream.toURL()}
            style={styles.pipVideo}
            objectFit={PIP_FIT}
            mirror={pipIsSelf}
            zOrder={1}
          />
          <View style={styles.pipTag}>
            <Text style={styles.pipTagText}>{pipIsSelf ? 'Tu' : 'Lui/Lei'}</Text>
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
    width: PIP_W, height: PIP_H,
    borderRadius: 14, overflow: 'hidden',
    backgroundColor: '#000',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)',
    elevation: 8,
    shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  pipVideo: { flex: 1 },
  pipTag: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)', paddingVertical: 3, alignItems: 'center',
  },
  pipTagText: { color: '#e6ebf1', fontSize: 11, fontWeight: '600' },
});
