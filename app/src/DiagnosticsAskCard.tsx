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
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { t } from './i18n';
import { said } from './diagnosticsAsk';

/**
 * The other person asks for this phone's diagnostics: see
 * diagnosticsAsk.ts. In the middle of the screen, with the three
 * answers; a touch beside it does nothing, since one of them is owed.
 */
export default function DiagnosticsAskCard({ name, onYes, onLater, onNo }: {
  /** who asks: their name, or nothing */
  name?: string;
  onYes: () => void;
  onLater: () => void;
  onNo: () => void;
}) {
  return (
    <View style={styles.veil}>
      <View style={styles.card}>
        <Text style={styles.title}>{said('diagAsk.title', name)}</Text>
        <Text style={styles.body}>{t('diagAsk.body')}</Text>
        <TouchableOpacity style={styles.yes} onPress={onYes}>
          <Text style={styles.yesText}>{t('diagAsk.yes')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.later} onPress={onLater}>
          <Text style={styles.laterText}>{t('diagAsk.notNow')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.no} onPress={onNo}>
          <Text style={styles.noText}>{t('diagAsk.never')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  veil: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 999,
    elevation: 999,
  },
  card: {
    width: '86%',
    maxWidth: 460,
    padding: 22,
    borderRadius: 20,
    backgroundColor: '#151a23',
    borderWidth: 2,
    borderColor: '#2f7cf6',
    gap: 12,
  },
  title: { color: '#fff', fontSize: 21, fontWeight: '700', textAlign: 'center' },
  body: { color: '#c9d2de', fontSize: 15, lineHeight: 21, textAlign: 'center' },
  yes: { backgroundColor: '#2f7cf6', borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 6 },
  yesText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  later: { borderWidth: 1, borderColor: '#2f7cf6', borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  laterText: { color: '#2f7cf6', fontSize: 16, fontWeight: '600' },
  no: { paddingVertical: 10, alignItems: 'center' },
  noText: { color: '#8892a0', fontSize: 15, fontWeight: '600' },
});
