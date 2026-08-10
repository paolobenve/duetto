import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import type { DuoConfig } from './config';
import { isConfigComplete } from './config';

type Props = {
  initial: DuoConfig;
  onSave: (cfg: DuoConfig) => void;
};

/** Schermata di configurazione: gli stessi valori vanno messi su entrambi i telefoni. */
export default function SettingsScreen({ initial, onSave }: Props) {
  const [cfg, setCfg] = useState<DuoConfig>(initial);
  const set = (k: keyof DuoConfig) => (v: string) => setCfg({ ...cfg, [k]: v });
  const ready = isConfigComplete(cfg);

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>DuoTalk</Text>
        <Text style={styles.subtitle}>
          Metti gli stessi valori sui due telefoni. La "passphrase" resta segreta:
          non viene mai inviata al server e cifra tutto lo scambio.
        </Text>

        <Field label="Server (wss://)" value={cfg.serverUrl} onChange={set('serverUrl')}
          placeholder="wss://tuodominio/duotalk/ws" autoCapitalize="none" />
        <Field label="Access token (uguale al server)" value={cfg.accessToken}
          onChange={set('accessToken')} secure />
        <Field label="Stanza (uguale sui due telefoni)" value={cfg.room}
          onChange={set('room')} autoCapitalize="none" />
        <Field label="Passphrase segreta condivisa" value={cfg.secret}
          onChange={set('secret')} secure hint="Almeno 8 caratteri. Piu' e' lunga, meglio e'." />

        <Text style={styles.section}>TURN di fallback (opzionale)</Text>
        <Field label="TURN url" value={cfg.turnUrl} onChange={set('turnUrl')}
          placeholder="turn:tuodominio:3478" autoCapitalize="none" />
        <Field label="TURN utente" value={cfg.turnUser} onChange={set('turnUser')} autoCapitalize="none" />
        <Field label="TURN password" value={cfg.turnPass} onChange={set('turnPass')} secure />

        <TouchableOpacity
          style={[styles.button, !ready && styles.buttonDisabled]}
          disabled={!ready}
          onPress={() => onSave(cfg)}>
          <Text style={styles.buttonText}>Salva e connetti</Text>
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
        placeholderTextColor="#667"
        secureTextEntry={props.secure}
        autoCapitalize={props.autoCapitalize ?? 'sentences'}
        autoCorrect={false}
      />
      {props.hint ? <Text style={styles.hint}>{props.hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#0e1117' },
  container: { padding: 20, paddingBottom: 60 },
  title: { fontSize: 34, fontWeight: '800', color: '#fff', marginTop: 20 },
  subtitle: { color: '#9aa4b2', marginTop: 8, marginBottom: 16, lineHeight: 20 },
  section: { color: '#7cc4ff', fontWeight: '700', marginTop: 18, marginBottom: 4 },
  field: { marginBottom: 14 },
  label: { color: '#c9d2de', marginBottom: 6, fontWeight: '600' },
  input: {
    backgroundColor: '#1a1f29', color: '#fff', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 16,
    borderWidth: 1, borderColor: '#2a313d',
  },
  hint: { color: '#6b7686', fontSize: 12, marginTop: 4 },
  button: {
    backgroundColor: '#2f7cf6', borderRadius: 12, paddingVertical: 16,
    alignItems: 'center', marginTop: 24,
  },
  buttonDisabled: { backgroundColor: '#3a4353' },
  buttonText: { color: '#fff', fontSize: 17, fontWeight: '700' },
});
