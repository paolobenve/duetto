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
import { View, Text, StyleSheet, Modal, TouchableOpacity } from 'react-native';
import type { Update } from './releases';
import { t } from './i18n';

/**
 * A newer Duetto is out: said once, at a quiet moment, with the way to
 * it a touch away.
 *
 * The line in the settings was not enough: the testers did not update,
 * and who opens the settings of an app that works? So the app asks -
 * not while the two are talking, and once a version, or again a few
 * days after "Later" (see App). The words say what the touch will do,
 * which depends on where this Duetto came from: F-Droid opens, a file
 * is downloaded, or the release's page opens (see updateFor).
 */
export default function UpdateModal({ update, onUpdate, onLater }: {
  update: Update | null;
  onUpdate: () => void;
  onLater: () => void;
}) {
  if (!update) return null;
  const how = update.via === 'fdroid' ? t('update.bodyFdroid')
    : update.via === 'apk' ? t('update.bodyApk')
      : t('update.bodyPage');
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onLater}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={styles.title}>{t('update.title', { v: update.version })}</Text>
          <Text style={styles.body}>{how}</Text>
          <Text style={styles.body}>{t('update.kept')}</Text>
          <TouchableOpacity style={styles.button} onPress={onUpdate}>
            <Text style={styles.buttonText}>{t('update.now')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.later} onPress={onLater}>
            <Text style={styles.laterText}>{t('update.later')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center', padding: 20,
  },
  sheet: {
    backgroundColor: '#151a23', borderRadius: 18, padding: 20,
    borderWidth: 1, borderColor: '#252c38',
  },
  title: { color: '#fff', fontSize: 22, fontWeight: '800', marginBottom: 12 },
  body: { color: '#a9b3c0', fontSize: 15, lineHeight: 22, marginBottom: 10 },
  button: {
    marginTop: 12, borderRadius: 12, paddingVertical: 13, alignItems: 'center',
    backgroundColor: '#2f7cf6',
  },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  later: { marginTop: 8, paddingVertical: 12, alignItems: 'center' },
  laterText: { color: '#6ab0ff', fontSize: 15, fontWeight: '600' },
});
