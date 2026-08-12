import React from 'react';
import {
  View, Text, StyleSheet, Modal, Pressable, ScrollView, TouchableOpacity,
} from 'react-native';
import { CHANGELOG } from './changelog';
import { VERSION_FULL } from './version';

/**
 * Le note di versione, da toccare il nome dell'app.
 *
 * Chi usa l'app si accorge che qualcosa è cambiato - un'icona diversa,
 * un comportamento nuovo - e non ha nessun posto dove chiedere perché.
 * Le note stanno dietro alla cosa che già dichiara la versione, che è
 * dove uno andrebbe a guardare.
 */
export default function ChangelogModal({ visible, onClose }: {
  visible: boolean;
  onClose: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        {/* Una vista, non un secondo Pressable: quello si candidava a
            gestire il tocco e ogni tanto vinceva lui invece dello
            scorrimento - da cui una lista che scorreva a volte sì e a
            volte no. `onStartShouldSetResponder` viene interrogato dopo
            i figli, quindi ferma il tocco diretto sul foglio senza
            togliere niente alla lista. */}
        <View
          style={styles.sheet}
          onStartShouldSetResponder={() => true}>
          <Text style={styles.title}>Novità</Text>
          <Text style={styles.sub}>{VERSION_FULL}</Text>

          <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollBody}>
            {CHANGELOG.map((v) => (
              <View key={v.versione} style={styles.blocco}>
                <Text style={styles.versione}>{v.versione}</Text>
                {v.paragrafi.map((p, i) => (
                  <Text key={i} style={styles.paragrafo}>
                    {p.forte ? <Text style={styles.forte}>{p.forte} </Text> : null}
                    {p.testo}
                  </Text>
                ))}
              </View>
            ))}
          </ScrollView>

          <TouchableOpacity style={styles.button} onPress={onClose}>
            <Text style={styles.buttonText}>Chiudi</Text>
          </TouchableOpacity>
        </View>
      </Pressable>
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
    borderWidth: 1, borderColor: '#252c38', maxHeight: '85%',
  },
  title: { color: '#fff', fontSize: 22, fontWeight: '800' },
  sub: { color: '#6b7686', fontSize: 12.5, marginTop: 4, marginBottom: 12 },
  // `flexShrink` e non `flexGrow`: senza, la lista prende l'altezza del
  // suo contenuto, sfora il foglio e non scorre - non avendo un limite
  // da cui scorrere.
  scroll: { flexShrink: 1 },
  scrollBody: { paddingBottom: 6 },
  blocco: { marginBottom: 20 },
  versione: {
    color: '#2f7cf6', fontSize: 15, fontWeight: '800', marginBottom: 8,
  },
  paragrafo: { color: '#a9b3c0', fontSize: 14, lineHeight: 21, marginBottom: 10 },
  forte: { color: '#e6ebf1', fontWeight: '700' },
  button: {
    marginTop: 6, borderRadius: 12, paddingVertical: 13, alignItems: 'center',
    backgroundColor: '#2f7cf6',
  },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
