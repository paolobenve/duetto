/*
 * Duetto - a permanent voice and video channel for two people.
 * Copyright (C) 2026 Paolo Benvenuto
 *
 * Free software under the GNU General Public License, version 3 or any
 * later version, and with no warranty of any kind. The full text is in
 * the LICENSE file at the root of the project, and at
 * <https://www.gnu.org/licenses/>.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { BellRingingIcon } from './Icons';
import { t, around } from './i18n';

/** How long the call stays in the middle of the screen, if not touched away. */
export const CALL_ALERT_MS = 30_000;

/**
 * A call from the other side, in the middle of the screen.
 *
 * The notification says it in the shade, and the sound says it once:
 * in a noisy room both go unnoticed, and whoever looks at the phone a
 * moment later sees the picture as if nothing had happened. This says
 * it big, over everything - the video, the hidden controls - for half
 * a minute, or until it is touched.
 */
export default function CallAlert({ text, onClose, switchName, onSwitch }: {
  text: string;
  onClose: () => void;
  /**
   * From a connection not in use: the button that moves to it and goes
   * in, with the channel's name - null when it has none.
   */
  switchName?: string | null;
  onSwitch?: () => void;
}) {
  const [before, after] = around('alert.switchToChannel', 'name');
  return (
    <Pressable style={styles.veil} onPress={onClose}>
      <View style={styles.card}>
        <BellRingingIcon size={72} color="#1e1f22" />
        <Text style={styles.text}>{text}</Text>
        {onSwitch && switchName !== undefined ? (
          <TouchableOpacity style={styles.switch} onPress={onSwitch}>
            <Text style={styles.switchText}>
              {switchName ? (
                <>{before}<Text style={styles.switchName}>{switchName}</Text>{after}</>
              ) : t('alert.switchToCalled')}
            </Text>
          </TouchableOpacity>
        ) : null}
        <Text style={styles.hint}>{t('alert.tapToClose')}</Text>
      </View>
    </Pressable>
  );
}

/**
 * The same call in the little window of picture-in-picture.
 *
 * Nothing there can be touched - a touch only makes the window bigger -
 * so no veil and no button. A band at the bottom, three small lines,
 * cut the words before the channel's name and the time, which are half
 * the news: the yellow takes the whole little window instead, over the
 * picture, and the words are as big as fits, shrinking until they are
 * all there. The card waits for the full screen.
 */
export function CallBand({ text }: { text: string }) {
  return (
    <View style={styles.band} pointerEvents="none">
      <BellRingingIcon size={22} color="#1e1f22" />
      <Text
        style={styles.bandText}
        numberOfLines={8}
        adjustsFontSizeToFit
        minimumFontScale={0.3}>
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  band: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center', justifyContent: 'center', gap: 4,
    padding: 8,
    backgroundColor: '#ffc83d',
    zIndex: 1000,
    elevation: 1000,
  },
  bandText: {
    flexShrink: 1, alignSelf: 'stretch',
    color: '#1e1f22', fontSize: 26, fontWeight: '700',
    textAlign: 'center', textAlignVertical: 'center',
  },
  veil: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    elevation: 1000,
  },
  card: {
    width: '86%',
    maxWidth: 460,
    paddingVertical: 28,
    paddingHorizontal: 22,
    borderRadius: 24,
    backgroundColor: '#ffc83d',
    alignItems: 'center',
    gap: 16,
  },
  text: { color: '#1e1f22', fontSize: 26, fontWeight: '700', textAlign: 'center' },
  hint: { color: '#3a3320', fontSize: 14, textAlign: 'center' },
  switch: {
    backgroundColor: '#1e1f22', borderRadius: 14, paddingVertical: 14, paddingHorizontal: 22,
    alignSelf: 'stretch', alignItems: 'center',
  },
  switchText: { color: '#ffc83d', fontSize: 20, fontWeight: '500', textAlign: 'center' },
  switchName: { fontWeight: '800' },
});
