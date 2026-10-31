/*
 * Duetto - a permanent voice and video channel for two people.
 * Copyright (C) 2026 Paolo Benvenuto
 *
 * Free software under the GNU General Public License, version 3 or any
 * later version, and with no warranty of any kind. The full text is in
 * the LICENSE file at the root of the project, and at
 * <https://www.gnu.org/licenses/>.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Animated, BackHandler, StyleSheet } from 'react-native';

/**
 * A menu over the channel, in the channel's own window.
 *
 * The menus opened by holding a button down were a Modal, and on
 * Android a Modal is a window of its own: the volume keys went to it,
 * and from it to the system - the call volume and its bar - instead
 * of to Duetto, which takes them only in the activity's window (see
 * Volume.kt). React Native hands the activity the key's release only,
 * when the press has been dealt with already. Drawn here, over the
 * rest, the keys stay Duetto's while the menu is open.
 *
 * What a Modal did and this does too: it covers the whole screen of
 * whoever draws it - the channel's root, so it goes there - it fades in
 * and out, and the back key closes it (`onRequestClose`).
 */
export default function SheetLayer(p: {
  visible: boolean;
  onRequestClose: () => void;
  children: React.ReactNode;
}) {
  const opacity = useRef(new Animated.Value(0)).current;
  /** still drawn while it fades out */
  const [shown, setShown] = useState(p.visible);
  useEffect(() => {
    if (p.visible) setShown(true);
    Animated.timing(opacity, {
      toValue: p.visible ? 1 : 0,
      duration: 160,
      useNativeDriver: true,
    }).start(({ finished }) => { if (finished && !p.visible) setShown(false); });
  }, [p.visible, opacity]);

  // The back key, while it is open: added last, it is asked first.
  const close = useRef(p.onRequestClose);
  close.current = p.onRequestClose;
  useEffect(() => {
    if (!p.visible) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      close.current();
      return true;
    });
    return () => sub.remove();
  }, [p.visible]);

  if (!shown) return null;
  return (
    <Animated.View
      style={[styles.layer, { opacity }]}
      // Fading out it is no longer there for the fingers.
      pointerEvents={p.visible ? 'auto' : 'none'}>
      {p.children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // Over everything the channel draws, the controls' band included.
  layer: { ...StyleSheet.absoluteFillObject, zIndex: 1000, elevation: 1000 },
});
