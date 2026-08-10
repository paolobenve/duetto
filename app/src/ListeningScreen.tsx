import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import type { PresenceStatus } from './signaling';

type Props = {
  peerName: string;
  status: PresenceStatus;
  peerPresent: boolean;
  knockPending: boolean;
  onEnter: () => void;
  onKnock: () => void;
  onSettings: () => void;
};

/**
 * Fuori dal canale ma raggiungibili: microfono chiuso, connessione al
 * server aperta. Se l'altro entra nel canale, arriva la notifica.
 */
export default function ListeningScreen(props: Props) {
  const {
    peerName, status, peerPresent, knockPending,
    onEnter, onKnock, onSettings,
  } = props;

  const name = peerName || 'L’altra persona';

  return (
    <View style={styles.root}>
      <TouchableOpacity style={styles.gear} onPress={onSettings}>
        <Text style={styles.gearText}>{'⚙'}</Text>
      </TouchableOpacity>

      <View style={styles.center}>
        {status === 'connecting' ? (
          <>
            <ActivityIndicator size="large" color="#2f7cf6" />
            <Text style={styles.title}>Mi collego…</Text>
          </>
        ) : status === 'offline' ? (
          <>
            <Text style={styles.icon}>{'\u{1F4F6}'}</Text>
            <Text style={styles.title}>Server irraggiungibile</Text>
            <Text style={styles.body}>Riprovo da solo, non serve fare nulla.</Text>
          </>
        ) : (
          <>
            <View style={[styles.dot, peerPresent ? styles.dotOn : styles.dotOff]} />
            <Text style={styles.title}>Sei in ascolto</Text>
            <Text style={styles.body}>
              {status === 'together'
                ? `${name} è nel canale adesso.`
                : peerPresent
                  ? `${name} è raggiungibile, ma non nel canale.`
                  : `${name} non è raggiungibile in questo momento.`}
              {'\n'}Ti avviso appena entra.
            </Text>
          </>
        )}
      </View>

      <View style={styles.actions}>
        <TouchableOpacity style={styles.primary} onPress={onEnter}>
          <Text style={styles.primaryText}>
            {status === 'together' ? 'Raggiungi nel canale' : 'Entra nel canale'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.secondary, (!peerPresent || knockPending) && styles.disabled]}
          disabled={!peerPresent || knockPending}
          onPress={onKnock}>
          <Text style={styles.secondaryText}>
            {knockPending ? 'Avvisato' : `Avvisa ${peerName || ''}`.trim()}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0b0e14', padding: 24 },
  gear: {
    position: 'absolute', top: 16, right: 16, width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center', backgroundColor: '#151a23', zIndex: 2,
  },
  gearText: { color: '#c9d2de', fontSize: 19 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  icon: { fontSize: 52, marginBottom: 16 },
  dot: { width: 18, height: 18, borderRadius: 9, marginBottom: 22 },
  dotOn: { backgroundColor: '#38d16a' },
  dotOff: { backgroundColor: '#3a4353' },
  title: { color: '#e6ebf1', fontSize: 24, fontWeight: '700', marginTop: 12 },
  body: {
    color: '#8892a0', fontSize: 15, textAlign: 'center',
    marginTop: 12, lineHeight: 22,
  },
  actions: { gap: 10 },
  primary: {
    backgroundColor: '#2f7cf6', borderRadius: 12, paddingVertical: 17, alignItems: 'center',
  },
  primaryText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  secondary: {
    borderRadius: 12, paddingVertical: 15, alignItems: 'center',
    borderWidth: 1, borderColor: '#2a313d',
  },
  secondaryText: { color: '#c9d2de', fontSize: 16, fontWeight: '600' },
  disabled: { opacity: 0.4 },
});
