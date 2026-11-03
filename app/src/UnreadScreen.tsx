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
import { ScrollView, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { t } from './i18n';

type Props = {
  /** a read asked by hand is under way */
  trying: boolean;
  onRetry: () => void;
};

/**
 * The configuration could not be read (see loadConfig).
 *
 * In its place the app holds the defaults - what a phone with nothing
 * stored gets - and it used to open the welcome on them: the person
 * found Duetto as on the first day, and whatever they did from there -
 * a server given, a setting, a new pair - was kept nowhere. A new pair
 * stayed on the other phone alone. Here they are told that their
 * connections are untouched, and the app reads again by itself every
 * few seconds (App.tsx, readAgain): read, it opens where it would have.
 */
export default function UnreadScreen({ trying, onRetry }: Props) {
  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.container}>
      <Text style={styles.brand}>Duetto</Text>
      <Text style={styles.title}>{t('unread.title')}</Text>
      <Text style={styles.body}>{t('unread.body')}</Text>
      <Text style={styles.body}>{t('unread.byItself')}</Text>
      <TouchableOpacity
        style={[styles.button, trying && styles.buttonTrying]}
        disabled={trying}
        onPress={onRetry}>
        <Text style={styles.buttonText}>{trying ? t('unread.trying') : t('unread.retry')}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#0b0e14' },
  container: { padding: 26, paddingTop: 60, paddingBottom: 40, alignItems: 'center' },
  brand: { color: '#fff', fontSize: 34, fontWeight: '800', marginBottom: 22 },
  title: { color: '#fff', fontSize: 25, fontWeight: '800', textAlign: 'center' },
  body: {
    color: '#8892a0', fontSize: 15, textAlign: 'center',
    marginTop: 12, marginBottom: 10, lineHeight: 22,
  },
  button: {
    backgroundColor: '#2f7cf6', borderRadius: 12, paddingVertical: 16,
    alignItems: 'center', width: '100%', marginTop: 16,
  },
  buttonTrying: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 17, fontWeight: '700', textAlign: 'center' },
});
