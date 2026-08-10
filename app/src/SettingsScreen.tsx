import React, { useState } from 'react';
import {
  View, Text, TextInput, StyleSheet, ScrollView, TouchableOpacity,
  KeyboardAvoidingView, Platform, Alert,
} from 'react-native';
import type { DuoConfig } from './config';
import { isServerConfigured, isPaired } from './config';

type Props = {
  initial: DuoConfig;
  onSave: (cfg: DuoConfig) => void;
  onUnpair: () => void;
};

/**
 * Impostazioni. Qui si mette solo dove sta il server: la coppia non si
 * configura a mano, nasce dall'accoppiamento a codice.
 */
export default function SettingsScreen({ initial, onSave, onUnpair }: Props) {
  const [cfg, setCfg] = useState<DuoConfig>(initial);
  const set = (k: keyof DuoConfig) => (v: string) => setCfg({ ...cfg, [k]: v });
  const ready = isServerConfigured(cfg);
  const paired = isPaired(cfg);

  const confirmUnpair = () => {
    Alert.alert(
      'Sciogliere la coppia?',
      'Dovrete rifare l’accoppiamento con un codice nuovo su entrambi i telefoni.',
      [
        { text: 'Annulla', style: 'cancel' },
        { text: 'Sciogli', style: 'destructive', onPress: onUnpair },
      ],
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>DuoTalk</Text>
        <Text style={styles.subtitle}>
          Un canale solo per voi due. Entri e resti: quando entra anche l’altro,
          vi collegate da soli.
        </Text>

        <Text style={styles.section}>Server</Text>
        <Text style={styles.sectionHint}>
          Gli stessi valori sui due telefoni. Si digitano una volta sola.
        </Text>
        <Field
          label="Indirizzo del signaling"
          value={cfg.serverUrl}
          onChange={set('serverUrl')}
          placeholder="wss://tuodominio/duotalk/ws"
          autoCapitalize="none"
          hint="Deve cominciare con wss://"
        />
        <Field label="Access token" value={cfg.accessToken} onChange={set('accessToken')} secure />
        <Field
          label="Il tuo nome"
          value={cfg.displayName}
          onChange={set('displayName')}
          placeholder="Paolo"
          hint="Compare sull’altro telefono quando entri nel canale."
        />

        <Text style={styles.section}>Collegamento di riserva (TURN)</Text>
        <Text style={styles.sectionHint}>
          Facoltativo. Serve solo se le vostre reti impediscono il collegamento diretto.
        </Text>
        <Field label="TURN url" value={cfg.turnUrl} onChange={set('turnUrl')}
          placeholder="turn:tuodominio:3478" autoCapitalize="none" />
        <Field label="TURN utente" value={cfg.turnUser} onChange={set('turnUser')} autoCapitalize="none" />
        <Field label="TURN password" value={cfg.turnPass} onChange={set('turnPass')} secure />

        {paired ? (
          <>
            <Text style={styles.section}>Coppia</Text>
            <View style={styles.pairBox}>
              <Text style={styles.pairName}>
                {cfg.pair?.peerName || 'L’altra persona'}
              </Text>
              <Text style={styles.pairMeta}>
                Accoppiati dal{' '}
                {cfg.pair?.pairedAt
                  ? new Date(cfg.pair.pairedAt).toLocaleDateString()
                  : '—'}
              </Text>
            </View>
            <TouchableOpacity style={styles.danger} onPress={confirmUnpair}>
              <Text style={styles.dangerText}>Sciogli la coppia</Text>
            </TouchableOpacity>
          </>
        ) : null}

        <TouchableOpacity
          style={[styles.button, !ready && styles.buttonDisabled]}
          disabled={!ready}
          onPress={() => onSave(cfg)}>
          <Text style={styles.buttonText}>
            {paired ? 'Salva' : 'Salva e accoppia'}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  secure?: boolean;
  autoCapitalize?: 'none' | 'sentences';
  hint?: string;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{props.label}</Text>
      <TextInput
        style={styles.input}
        value={props.value}
        onChangeText={props.onChange}
        placeholder={props.placeholder}
        placeholderTextColor="#4a5462"
        secureTextEntry={props.secure}
        autoCapitalize={props.autoCapitalize ?? 'sentences'}
        autoCorrect={false}
      />
      {props.hint ? <Text style={styles.hint}>{props.hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#0b0e14' },
  container: { padding: 20, paddingBottom: 60 },
  title: { fontSize: 34, fontWeight: '800', color: '#fff', marginTop: 16 },
  subtitle: { color: '#8892a0', marginTop: 8, lineHeight: 21 },
  section: { color: '#7cc4ff', fontWeight: '700', fontSize: 16, marginTop: 26 },
  sectionHint: { color: '#6b7686', fontSize: 13, marginTop: 4, marginBottom: 12, lineHeight: 19 },
  field: { marginBottom: 14 },
  label: { color: '#c9d2de', marginBottom: 6, fontWeight: '600' },
  input: {
    backgroundColor: '#151a23', color: '#fff', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 16,
    borderWidth: 1, borderColor: '#252c38',
  },
  hint: { color: '#6b7686', fontSize: 12, marginTop: 5, lineHeight: 17 },
  pairBox: {
    backgroundColor: '#151a23', borderRadius: 12, padding: 16,
    borderWidth: 1, borderColor: '#252c38',
  },
  pairName: { color: '#e6ebf1', fontSize: 17, fontWeight: '700' },
  pairMeta: { color: '#6b7686', fontSize: 13, marginTop: 4 },
  danger: { marginTop: 12, paddingVertical: 12, alignItems: 'center' },
  dangerText: { color: '#e5484d', fontSize: 15, fontWeight: '600' },
  button: {
    backgroundColor: '#2f7cf6', borderRadius: 12, paddingVertical: 16,
    alignItems: 'center', marginTop: 30,
  },
  buttonDisabled: { backgroundColor: '#333c4a' },
  buttonText: { color: '#fff', fontSize: 17, fontWeight: '700' },
});
