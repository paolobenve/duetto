import React, { useState } from 'react';
import {
  View, Text, TextInput, StyleSheet, ScrollView, TouchableOpacity,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import type { DuoConfig } from './config';
import { isConfigComplete } from './config';

type Props = {
  initial: DuoConfig;
  onSave: (cfg: DuoConfig) => void;
};

/**
 * Configurazione. Attenzione ai due topic ntfy: sono INCROCIATI.
 * Il "tuo topic" di questo telefono deve essere il "topic dell'altro"
 * sull'altro telefono, e viceversa.
 */
export default function SettingsScreen({ initial, onSave }: Props) {
  const [cfg, setCfg] = useState<DuoConfig>(initial);
  const set = (k: keyof DuoConfig) => (v: string) => setCfg({ ...cfg, [k]: v });
  const ready = isConfigComplete(cfg);

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

        <Text style={styles.section}>Canale</Text>
        <Text style={styles.sectionHint}>Questi valori devono essere IDENTICI sui due telefoni.</Text>
        <Field label="Server" value={cfg.serverUrl} onChange={set('serverUrl')}
          placeholder="wss://tuodominio/duotalk/ws" autoCapitalize="none" />
        <Field label="Access token" value={cfg.accessToken} onChange={set('accessToken')} secure />
        <Field label="Nome del canale" value={cfg.channel} onChange={set('channel')}
          placeholder="casa" autoCapitalize="none" />
        <Field label="Passphrase segreta" value={cfg.secret} onChange={set('secret')} secure
          hint="Almeno 8 caratteri. Cifra tutto lo scambio: il server non puo’ leggerlo." />

        <Text style={styles.section}>Notifiche (ntfy)</Text>
        <Text style={styles.sectionHint}>
          Questi vanno INCROCIATI: il “tuo topic” qui dev’essere il “topic dell’altro”
          sull’altro telefono. Iscriviti al tuo topic nell’app ntfy per ricevere gli avvisi.
        </Text>
        <Field label="Il tuo nome" value={cfg.displayName} onChange={set('displayName')}
          placeholder="Paolo" hint="Compare nella notifica che riceve l’altro." />
        <Field label="Il tuo topic (ricevi qui)" value={cfg.myTopic} onChange={set('myTopic')}
          placeholder="duotalk-paolo-x7k2" autoCapitalize="none"
          hint="Iscrivilo nell’app ntfy di QUESTO telefono." />
        <Field label="Topic dell’altro (suoni qui)" value={cfg.peerTopic} onChange={set('peerTopic')}
          placeholder="duotalk-altro-9m4p" autoCapitalize="none" />

        <Text style={styles.section}>TURN di fallback (opzionale)</Text>
        <Text style={styles.sectionHint}>Serve solo se le vostre reti impediscono il collegamento diretto.</Text>
        <Field label="TURN url" value={cfg.turnUrl} onChange={set('turnUrl')}
          placeholder="turn:tuodominio:3478" autoCapitalize="none" />
        <Field label="TURN utente" value={cfg.turnUser} onChange={set('turnUser')} autoCapitalize="none" />
        <Field label="TURN password" value={cfg.turnPass} onChange={set('turnPass')} secure />

        <TouchableOpacity
          style={[styles.button, !ready && styles.buttonDisabled]}
          disabled={!ready}
          onPress={() => onSave(cfg)}>
          <Text style={styles.buttonText}>Entra nel canale</Text>
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
        placeholderTextColor="#5a6472"
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
  button: {
    backgroundColor: '#2f7cf6', borderRadius: 12, paddingVertical: 16,
    alignItems: 'center', marginTop: 30,
  },
  buttonDisabled: { backgroundColor: '#333c4a' },
  buttonText: { color: '#fff', fontSize: 17, fontWeight: '700' },
});
