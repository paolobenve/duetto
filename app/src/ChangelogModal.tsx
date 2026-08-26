import React from 'react';
import {
  View, Text, StyleSheet, Modal, ScrollView, TouchableOpacity,
  useWindowDimensions,
} from 'react-native';
import { CHANGELOG } from './changelog';
import { VERSION_FULL } from './version';
import { t } from './i18n';

/**
 * The release notes, from a touch on the app's name.
 *
 * Whoever uses the app notices that something has changed - a different
 * icon, a new behaviour - and has nowhere to ask why. The notes live
 * behind the thing that already declares the version, which is where
 * one would go and look.
 */
export default function ChangelogModal({ visible, onClose }: {
  visible: boolean;
  onClose: () => void;
}) {
  /**
   * The sheet is measured in pixels, not in per cent.
   *
   * With `maxHeight: '85%'` the percentage refers to the parent, which
   * inside a Modal does not always have the height one expects: the
   * sheet grew past the screen and the list, having no limit, would not
   * scroll. With a height in pixels the limit is always there, and the
   * scrolling follows from it.
   */
  const { height } = useWindowDimensions();
  const listHeight = Math.max(160, Math.round(height * 0.62));

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      {/* Nothing in here competes with the list for the gesture.
          Closing on a touch of the background forced the sheet to put
          itself forward to handle the touch so as not to close itself,
          and that candidate sometimes won: the list would not scroll,
          and gave in only after a few seconds of insisting. It closes
          with the button and with the Back key, which are enough. */}
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={styles.title}>{t('news.title')}</Text>
          <Text style={styles.sub}>{VERSION_FULL}</Text>

          <ScrollView
            style={{ height: listHeight }}
            contentContainerStyle={styles.scrollBody}
            nestedScrollEnabled>
            {CHANGELOG.map((v) => (
              <View key={v.version} style={styles.block}>
                <Text style={styles.version}>{v.version}</Text>
                {v.paragraphs.map((p, i) => (
                  <Text key={i} style={styles.paragraph}>
                    {p.strong ? <Text style={styles.strong}>{p.strong} </Text> : null}
                    {p.text}
                  </Text>
                ))}
              </View>
            ))}
          </ScrollView>

          <TouchableOpacity style={styles.button} onPress={onClose}>
            <Text style={styles.buttonText}>{t('news.close')}</Text>
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
  title: { color: '#fff', fontSize: 22, fontWeight: '800' },
  sub: { color: '#6b7686', fontSize: 12.5, marginTop: 4, marginBottom: 12 },
  scrollBody: { paddingBottom: 4 },
  block: { marginBottom: 20 },
  version: {
    color: '#2f7cf6', fontSize: 15, fontWeight: '800', marginBottom: 8,
  },
  paragraph: { color: '#a9b3c0', fontSize: 14, lineHeight: 21, marginBottom: 10 },
  strong: { color: '#e6ebf1', fontWeight: '700' },
  button: {
    marginTop: 18, borderRadius: 12, paddingVertical: 13, alignItems: 'center',
    backgroundColor: '#2f7cf6',
  },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
