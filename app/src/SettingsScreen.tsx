import React, { useState } from 'react';
import {
  View, Text, TextInput, StyleSheet, ScrollView, TouchableOpacity,
  KeyboardAvoidingView, Platform, Alert,
} from 'react-native';
import type { DuoConfig, VideoQuality } from './config';
import { isServerConfigured, isPaired, normalizeServerUrl, VIDEO_PROFILES } from './config';
import { VERSION_LABEL } from './version';

type Props = {
  initial: DuoConfig;
  onSave: (cfg: DuoConfig) => void;
  onUnpair: () => void;
  /** torna indietro senza salvare; assente se non c'è dove tornare */
  onClose?: () => void;
  /** riapre la schermata delle impostazioni di sistema */
  onOpenSetup: () => void;
  /**
   * VP9 in hardware, sui due telefoni separatamente.
   *
   * L'opzione si mostra sempre, ma è selezionabile solo con entrambi:
   * le preferenze di codec valgono per l'intera sessione, quindi
   * sceglierlo perché lo sa fare uno solo costringerebbe l'altro a
   * encodare via software. Mostrarla in grigio dicendo di chi è il
   * limite è più utile che nasconderla.
   */
  vp9Here?: boolean;
  vp9Peer?: boolean;
};

/**
 * Impostazioni. In primo piano c'è una cosa sola: dove sta il server.
 * Tutto il resto è facoltativo e sta sotto "Altre impostazioni".
 */
export default function SettingsScreen({
  initial, onSave, onUnpair, onClose, onOpenSetup, vp9Here, vp9Peer,
}: Props) {
  const vp9Available = !!vp9Here && !!vp9Peer;
  const vp9Motivo = vp9Available
    ? 'Stessa immagine con circa un terzo di dati in meno.'
    : !vp9Here && !vp9Peer
      ? 'Nessuno dei due telefoni ha l’encoder VP9 in hardware.'
      : !vp9Here
        ? 'Questo telefono non ha l’encoder VP9 in hardware.'
        : 'L’altro telefono non ha l’encoder VP9 in hardware. Serve su entrambi: ' +
          'il codec è uno solo per tutta la sessione.';
  const [cfg, setCfg] = useState<DuoConfig>(initial);
  const [advanced, setAdvanced] = useState(false);
  const set = (k: keyof DuoConfig) => (v: string) => setCfg({ ...cfg, [k]: v });

  const ready = isServerConfigured(cfg);
  const paired = isPaired(cfg);
  const resolved = normalizeServerUrl(cfg.serverUrl);

  const confirmUnpair = () => {
    Alert.alert(
      'Sciogliere la coppia?',
      'Dovrete rifare l’accoppiamento con un codice nuovo.\n\n' +
      'Ricordati di sciogliere la coppia anche sull’altro telefono, ' +
      'altrimenti continuerà a cercarti.',
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
        <View style={styles.header}>
          {onClose ? (
            <TouchableOpacity style={styles.back} onPress={onClose}>
              <Text style={styles.backText}>{'\u2039'}</Text>
            </TouchableOpacity>
          ) : null}
          <Text style={styles.title}>DuoTalk</Text>
        </View>
        <Text style={styles.subtitle}>
          Un canale solo per voi due. Entri e resti: quando entra anche l’altro,
          vi collegate da soli.
        </Text>

        <View style={styles.field}>
          <Text style={styles.label}>Server</Text>
          <TextInput
            style={styles.input}
            value={cfg.serverUrl}
            onChangeText={set('serverUrl')}
            placeholder="iltuoserver.org"
            placeholderTextColor="#4a5462"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />
          <Text style={styles.hint}>
            {cfg.serverUrl.trim()
              ? `Mi collegherò a: ${resolved}`
              : 'Basta il nome: al resto dell’indirizzo penso io.'}
          </Text>
        </View>

        {paired ? (
          <>
            <Text style={styles.section}>Coppia</Text>
            <View style={styles.pairBox}>
              <Text style={styles.pairName}>
                {cfg.pair?.peerName || 'Accoppiato'}
              </Text>
              <Text style={styles.pairMeta}>
                Dal{' '}
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

        <Text style={styles.subsection}>Qualità del video</Text>
        <Text style={styles.sectionHint}>
          Vale per tutti e due i telefoni: cambiandola qui cambia anche
          all’altro, così non vi ritrovate con due impostazioni diverse senza
          sapere quale delle due state guardando. Se non gli va bene, la
          ricambia lui.
        </Text>
        <Text style={styles.sectionHint}>
          La banda dipende da risoluzione, fotogrammi al secondo e tetto di
          bitrate — non dal codec. Meno di tutti e tre significa meno dati e
          meno batteria, da entrambe le parti.
        </Text>
        {(Object.keys(VIDEO_PROFILES) as VideoQuality[]).map((q) => (
          <TouchableOpacity
            key={q}
            style={[styles.choice, cfg.videoQuality === q && styles.choicePicked]}
            onPress={() => setCfg({ ...cfg, videoQuality: q })}>
            <View style={[styles.radio, cfg.videoQuality === q && styles.radioPicked]} />
            <View style={styles.choiceText}>
              <Text style={styles.choiceLabel}>{VIDEO_PROFILES[q].etichetta}</Text>
              <Text style={styles.choiceNote}>{VIDEO_PROFILES[q].nota}</Text>
            </View>
          </TouchableOpacity>
        ))}
        <Text style={styles.sectionHint}>
          L’inquadratura non cambia mai: si riduce ciò che esce dall’encoder,
          non ciò che la camera riprende.
        </Text>

        <TouchableOpacity
          disabled={!vp9Available}
          style={[
            styles.choice,
            vp9Available && cfg.videoCodec === 'vp9' && styles.choicePicked,
            !vp9Available && styles.choiceOff,
          ]}
          onPress={() => setCfg({
            ...cfg,
            videoCodec: cfg.videoCodec === 'vp9' ? 'auto' : 'vp9',
          })}>
          <View style={[
            styles.radio,
            vp9Available && cfg.videoCodec === 'vp9' && styles.radioPicked,
          ]} />
          <View style={styles.choiceText}>
            <Text style={[styles.choiceLabel, !vp9Available && styles.textOff]}>
              Codifica VP9
            </Text>
            <Text style={[styles.choiceNote, !vp9Available && styles.textOff]}>
              {vp9Motivo}
            </Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity style={styles.toggle} onPress={() => setAdvanced(!advanced)}>
          <Text style={styles.toggleText}>
            {advanced ? '▾' : '▸'}  Altre impostazioni
          </Text>
        </TouchableOpacity>

        {advanced ? (
          <View style={styles.advanced}>
            <Text style={styles.sectionHint}>
              Nulla di obbligatorio: senza, funziona lo stesso.
            </Text>
            <Field
              label="Il tuo nome"
              value={cfg.displayName}
              onChange={set('displayName')}
              placeholder="Paolo"
              hint="Se lo metti, compare nelle notifiche dell’altro."
            />
            <Field
              label="Access token"
              value={cfg.accessToken}
              onChange={set('accessToken')}
              secure
              hint="Solo se sul server hai impostato ACCESS_TOKEN."
            />
            <Text style={styles.subsection}>Collegamento di riserva (TURN)</Text>
            <Text style={styles.sectionHint}>
              Serve solo se le vostre reti impediscono il collegamento diretto.
            </Text>
            <Field label="TURN url" value={cfg.turnUrl} onChange={set('turnUrl')}
              placeholder="turn:iltuoserver.org:3478" autoCapitalize="none" />
            <Field label="TURN utente" value={cfg.turnUser} onChange={set('turnUser')} autoCapitalize="none" />
            <Field label="TURN password" value={cfg.turnPass} onChange={set('turnPass')} secure />
          </View>
        ) : null}

        <TouchableOpacity
          style={[styles.button, !ready && styles.buttonDisabled]}
          disabled={!ready}
          onPress={() => onSave({ ...cfg, serverUrl: resolved })}>
          <Text style={styles.buttonText}>
            {paired ? 'Salva' : 'Avanti'}
          </Text>
        </TouchableOpacity>

        <Text style={styles.section}>Restare raggiungibili</Text>
        <Text style={styles.sectionHint}>
          Due impostazioni di sistema, senza le quali il telefono chiude DuoTalk
          e smetti di ricevere gli avvisi. Si perdono reinstallando l’app o
          cambiando telefono.
        </Text>
        <TouchableOpacity style={styles.rowButton} onPress={onOpenSetup}>
          <Text style={styles.rowButtonText}>Rivedi le impostazioni di sistema</Text>
          <Text style={styles.rowButtonArrow}>{'\u203A'}</Text>
        </TouchableOpacity>

        <Text style={styles.section}>Sicurezza</Text>
        <View style={styles.infoBox}>
          <Text style={styles.infoLine}>
            {'\u{1F512}'}  Audio e video viaggiano <Text style={styles.infoStrong}>cifrati
            end-to-end</Text> direttamente fra i due telefoni.
          </Text>
          <Text style={styles.infoLine}>
            {'\u{1F512}'}  Anche lo scambio iniziale è cifrato: il server inoltra buste
            che non può aprire, quindi non può inserirsi nella conversazione.
          </Text>
          <Text style={styles.infoLine}>
            {'\u{1F511}'}  La chiave è a 256 bit e nasce dall'accoppiamento. Non è una
            password: non è indovinabile per tentativi.
          </Text>
          <Text style={styles.infoLine}>
            {'\u{1F441}'}  Il server sa <Text style={styles.infoStrong}>quando</Text> siete
            collegati, non <Text style={styles.infoStrong}>cosa</Text> vi dite.
          </Text>
        </View>

        <Text style={styles.version}>{VERSION_LABEL}</Text>
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
  container: { padding: 20, paddingTop: 40, paddingBottom: 60 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  back: {
    width: 40, height: 40, borderRadius: 20, marginLeft: -8,
    alignItems: 'center', justifyContent: 'center', backgroundColor: '#151a23',
  },
  backText: { color: '#c9d2de', fontSize: 26, lineHeight: 30, marginTop: -4 },
  title: { fontSize: 34, fontWeight: '800', color: '#fff' },
  subtitle: { color: '#8892a0', marginTop: 8, marginBottom: 28, lineHeight: 21 },
  section: { color: '#7cc4ff', fontWeight: '700', fontSize: 16, marginTop: 24 },
  subsection: { color: '#c9d2de', fontWeight: '700', fontSize: 15, marginTop: 18 },
  choice: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#151a23', borderRadius: 12, padding: 14, marginTop: 8,
    borderWidth: 1, borderColor: '#252c38',
  },
  choicePicked: { borderColor: '#2f7cf6', backgroundColor: '#16203050' },
  choiceOff: { opacity: 0.45 },
  textOff: { color: '#6b7480' },
  radio: {
    width: 20, height: 20, borderRadius: 10,
    borderWidth: 2, borderColor: '#3a4351',
  },
  radioPicked: { borderColor: '#2f7cf6', borderWidth: 6 },
  choiceText: { flex: 1 },
  choiceLabel: { color: '#e6ebf1', fontSize: 16, fontWeight: '700' },
  choiceNote: { color: '#7d8794', fontSize: 13, marginTop: 3 },
  sectionHint: { color: '#6b7686', fontSize: 13, marginTop: 4, marginBottom: 12, lineHeight: 19 },
  field: { marginBottom: 16 },
  label: { color: '#c9d2de', marginBottom: 6, fontWeight: '600' },
  input: {
    backgroundColor: '#151a23', color: '#fff', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 13, fontSize: 16,
    borderWidth: 1, borderColor: '#252c38',
  },
  hint: { color: '#6b7686', fontSize: 12, marginTop: 6, lineHeight: 17 },
  pairBox: {
    backgroundColor: '#151a23', borderRadius: 12, padding: 16, marginTop: 10,
    borderWidth: 1, borderColor: '#252c38',
  },
  pairName: { color: '#e6ebf1', fontSize: 17, fontWeight: '700' },
  pairMeta: { color: '#6b7686', fontSize: 13, marginTop: 4 },
  rowButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#151a23', borderRadius: 12, paddingVertical: 15,
    paddingHorizontal: 16, borderWidth: 1, borderColor: '#252c38',
  },
  rowButtonText: { color: '#e6ebf1', fontSize: 16, fontWeight: '600' },
  rowButtonArrow: { color: '#6b7686', fontSize: 22, lineHeight: 24 },
  danger: { marginTop: 10, paddingVertical: 12, alignItems: 'center' },
  dangerText: { color: '#e5484d', fontSize: 15, fontWeight: '600' },
  toggle: { marginTop: 20, paddingVertical: 10 },
  toggleText: { color: '#7cc4ff', fontSize: 15, fontWeight: '600' },
  advanced: { borderLeftWidth: 2, borderLeftColor: '#252c38', paddingLeft: 14 },
  button: {
    backgroundColor: '#2f7cf6', borderRadius: 12, paddingVertical: 16,
    alignItems: 'center', marginTop: 30,
  },
  buttonDisabled: { backgroundColor: '#333c4a' },
  buttonText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  version: { color: '#3a4353', fontSize: 12, textAlign: 'center', marginTop: 24 },
  infoBox: {
    backgroundColor: '#151a23', borderRadius: 12, padding: 16, marginTop: 10,
    borderWidth: 1, borderColor: '#252c38', gap: 12,
  },
  infoLine: { color: '#8892a0', fontSize: 13.5, lineHeight: 20 },
  infoStrong: { color: '#c9d2de', fontWeight: '700' },
});
