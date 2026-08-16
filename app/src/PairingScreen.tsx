import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, ActivityIndicator,
  ScrollView, KeyboardAvoidingView, Platform,
} from 'react-native';
import { DuoConfig, PairInfo, displayServer } from './config';
import { Signaling, PairMessage } from './signaling';
import {
  generateCode, normalizeCode, formatCode, isCodeComplete,
  pairIdFromCode, newKeyPair, deriveSharedKey, confirmationFor,
  keyToBase64, pubToBase64, pubFromBase64,
} from './pairing';
import { VERSION_LABEL } from './version';

type Props = {
  cfg: DuoConfig;
  onPaired: (pair: PairInfo) => void;
  onBack: () => void;
};

type Step = 'choose' | 'preparing' | 'create' | 'join' | 'exchanging' | 'error';

/** Se in un minuto e mezzo non succede nulla, meglio dirlo che restare a girare. */
const TIMEOUT_MS = 90_000;

/**
 * Attesa prima di poter ritentare dopo un fallimento.
 *
 * È qui che sta la difesa contro chi prova codici a tappeto, non nella
 * lentezza del calcolo: rende inutile insistere, senza far aspettare
 * nessuno quando le cose vanno bene.
 */
const RETRY_WAIT_S = 20;

export default function PairingScreen({ cfg, onPaired, onBack }: Props) {
  const [step, setStep] = useState<Step>('choose');
  const [code, setCode] = useState('');
  const [typed, setTyped] = useState('');
  const [message, setMessage] = useState('');
  const [retryIn, setRetryIn] = useState(0);

  const signalingRef = useRef<Signaling | null>(null);
  const keysRef = useRef(newKeyPair());
  const codeRef = useRef('');
  const pairIdRef = useRef('');
  const sharedRef = useRef<Uint8Array | null>(null);
  const sentPubRef = useRef(false);
  const peerNameRef = useRef('');
  const doneRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cleanup = useCallback(() => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    signalingRef.current?.close();
    signalingRef.current = null;
    sentPubRef.current = false;
    sharedRef.current = null;
  }, []);

  useEffect(() => cleanup, [cleanup]);

  const fail = useCallback((text: string) => {
    if (doneRef.current) return;
    cleanup();
    setMessage(text);
    setStep('error');
    setRetryIn(RETRY_WAIT_S);
  }, [cleanup]);

  // Conto alla rovescia prima di poter ritentare.
  useEffect(() => {
    if (retryIn <= 0) return;
    const t = setTimeout(() => setRetryIn((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [retryIn]);

  /** Connessione e scambio. Identico per chi crea e per chi si unisce. */
  const startExchange = useCallback(async (rawCode: string, side: 'A' | 'B') => {
    const clean = normalizeCode(rawCode);
    codeRef.current = clean;
    keysRef.current = newKeyPair();
    doneRef.current = false;
    sentPubRef.current = false;
    sharedRef.current = null;

    // Volutamente lento (vedi pairing.ts): un secondo circa, una volta sola.
    setStep('preparing');
    const pairId = await pairIdFromCode(clean);
    pairIdRef.current = pairId;
    if (doneRef.current) return;

    setStep(side === 'A' ? 'create' : 'exchanging');

    const otherSide: 'A' | 'B' = side === 'A' ? 'B' : 'A';

    const sendPubOnce = (sig: Signaling) => {
      if (sentPubRef.current) return;
      sentPubRef.current = true;
      sig.sendPair({
        kind: 'pubkey',
        pub: pubToBase64(keysRef.current.publicKey),
        name: cfg.displayName || '',
      });
    };

    const sig = new Signaling(
      {
        serverUrl: cfg.serverUrl.trim(),
        room: pairId,
        displayName: cfg.displayName || '',
        key: null,
        side,
        mode: 'listening',
      },
      {
        onJoined: ({ peerPresent }) => { if (peerPresent) sendPubOnce(sig); },
        onPeerJoined: () => sendPubOnce(sig),

        onPair: (msg: PairMessage) => {
          if (msg.kind === 'pubkey') {
            sendPubOnce(sig);
            if (sharedRef.current) return; // già calcolata
            try {
              peerNameRef.current = msg.name || '';
              const key = deriveSharedKey(
                keysRef.current.secretKey,
                pubFromBase64(msg.pub),
                codeRef.current,
              );
              sharedRef.current = key;
              setStep('exchanging');
              sig.sendPair({ kind: 'confirm', proof: confirmationFor(key, side) });
            } catch {
              fail('Lo scambio di chiavi non è riuscito. Riprova.');
            }
            return;
          }

          if (msg.kind === 'confirm') {
            const key = sharedRef.current;
            if (!key) return; // arrivata prima della chiave: aspettiamo
            if (msg.proof !== confirmationFor(key, otherSide)) {
              fail(
                'Il codice non coincide.\n\n' +
                'Controlla di aver digitato esattamente le cifre mostrate sull’altro telefono.',
              );
              return;
            }
            doneRef.current = true;
            cleanup();
            onPaired({
              id: pairIdRef.current,
              key: keyToBase64(key),
              side,
              peerName: peerNameRef.current,
              pairedAt: new Date().toISOString(),
            });
          }
        },

        onError: (err) => {
          if (err === 'room-full') {
            fail('Quel codice è già usato da due dispositivi.\n\nGeneratene uno nuovo.');
          }
        },
      },
    );

    signalingRef.current = sig;
    sig.connect();

    timerRef.current = setTimeout(() => {
      fail(
        'Nessuna risposta dall’altro telefono.\n\n' +
        'Verifica che sia collegato a internet e che abbia digitato lo stesso codice.',
      );
    }, TIMEOUT_MS);
  }, [cfg, fail, cleanup, onPaired]);

  const startCreate = useCallback(() => {
    const c = generateCode();
    setCode(c);
    startExchange(c, 'A');
  }, [startExchange]);

  const startJoin = useCallback(() => {
    if (!isCodeComplete(typed)) return;
    startExchange(typed, 'B');
  }, [typed, startExchange]);

  const reset = useCallback(() => {
    cleanup();
    doneRef.current = true; // ferma un calcolo eventualmente in corso
    setTyped('');
    setCode('');
    setStep('choose');
  }, [cleanup]);

  // --- schermate ----------------------------------------------------------

  if (step === 'error') {
    return (
      <Screen>
        <Text style={styles.icon}>{'\u{26A0}'}</Text>
        <Text style={styles.title}>Accoppiamento non riuscito</Text>
        <Text style={styles.body}>{message}</Text>
        <Primary
          label={retryIn > 0 ? `Riprova fra ${retryIn}\u00A0s` : 'Riprova'}
          disabled={retryIn > 0}
          onPress={reset}
        />
      </Screen>
    );
  }

  if (step === 'preparing') {
    return (
      <Screen>
        <ActivityIndicator size="large" color="#2f7cf6" />
        <Text style={[styles.title, { marginTop: 24 }]}>Un istante…</Text>
        <Text style={styles.body}>Sto preparando l’accoppiamento.</Text>
      </Screen>
    );
  }

  if (step === 'create') {
    return (
      <Screen>
        <Text style={styles.title}>Detta questo codice</Text>
        <Text style={styles.body}>
          Digitalo sull’altro telefono, alla voce «Ho un codice».
          {'\n'}Serve una volta sola: dopo non vi servirà mai più.
        </Text>
        <View style={styles.codeBox}>
          <Text style={styles.code}>{formatCode(code)}</Text>
        </View>
        <View style={styles.waitRow}>
          <ActivityIndicator color="#2f7cf6" />
          <Text style={styles.waitText}>In attesa dell’altro telefono…</Text>
        </View>
        <Text style={styles.hint}>
          Dettalo a voce o di persona, non per messaggio.
        </Text>
        <Secondary label="Annulla" onPress={reset} />
      </Screen>
    );
  }

  if (step === 'join') {
    return (
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Screen>
          <Text style={styles.title}>Digita il codice</Text>
          <Text style={styles.body}>Le otto cifre mostrate sull’altro telefono.</Text>
          <TextInput
            style={styles.codeInput}
            value={formatCode(typed)}
            onChangeText={(t) => setTyped(normalizeCode(t))}
            placeholder="0000 0000"
            placeholderTextColor="#3a4353"
            keyboardType="number-pad"
            autoCorrect={false}
            maxLength={9}
            // Si è qui per digitare: la tastiera non si fa aspettare.
            autoFocus
          />
          <Primary label="Accoppia" disabled={!isCodeComplete(typed)} onPress={startJoin} />
          <Secondary label="Indietro" onPress={reset} />
        </Screen>
      </KeyboardAvoidingView>
    );
  }

  if (step === 'exchanging') {
    return (
      <Screen>
        <ActivityIndicator size="large" color="#2f7cf6" />
        <Text style={[styles.title, { marginTop: 24 }]}>Accoppiamento in corso…</Text>
        <Text style={styles.body}>Sto stabilendo la chiave con l’altro telefono.</Text>
        <Secondary label="Annulla" onPress={reset} />
      </Screen>
    );
  }

  return (
    <Screen>
      <Text style={styles.big}>{'\u{1F517}'}</Text>
      <Text style={styles.title}>Collega i due telefoni</Text>
      <Text style={styles.body}>
        Da fare una volta sola. Su un telefono premi «Crea il codice»,
        sull’altro digita le cifre che appaiono.
      </Text>
      <Primary label="Crea il codice" onPress={startCreate} />
      <Primary label="Ho un codice" outline onPress={() => setStep('join')} />
      <Secondary label="Cambia server" value={displayServer(cfg.serverUrl)} onPress={onBack} />
      <Text style={styles.version}>{VERSION_LABEL}</Text>
    </Screen>
  );
}

// --- pezzi di interfaccia ---------------------------------------------------

function Screen({ children }: { children?: React.ReactNode }) {
  return (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled">
      {children}
    </ScrollView>
  );
}

function Primary(props: { label: string; onPress: () => void; disabled?: boolean; outline?: boolean }) {
  return (
    <TouchableOpacity
      style={[
        styles.button,
        props.outline && styles.buttonOutline,
        props.disabled && styles.buttonDisabled,
      ]}
      disabled={props.disabled}
      onPress={props.onPress}>
      <Text style={[styles.buttonText, props.outline && styles.buttonOutlineText]}>
        {props.label}
      </Text>
    </TouchableOpacity>
  );
}

function Secondary(props: { label: string; value?: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.link} onPress={props.onPress}>
      <Text style={styles.linkText}>
        {props.label}
        {/* Il server in uso accanto al comando che lo cambia: è la sola
            cosa che si vorrebbe sapere prima di toccarlo, e prima
            bisognava entrare per scoprire dove si era puntati. */}
        {props.value ? <Text style={styles.linkValue}>{`  ${props.value}`}</Text> : null}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#0b0e14' },
  container: { padding: 26, paddingTop: 70, paddingBottom: 40, alignItems: 'center' },
  big: { fontSize: 56, marginBottom: 18 },
  icon: { fontSize: 46, marginBottom: 14 },
  title: { color: '#fff', fontSize: 25, fontWeight: '800', textAlign: 'center' },
  body: {
    color: '#8892a0', fontSize: 15, textAlign: 'center',
    marginTop: 12, marginBottom: 26, lineHeight: 22,
  },
  codeBox: {
    backgroundColor: '#151a23', borderRadius: 16, paddingVertical: 26,
    paddingHorizontal: 26, borderWidth: 1, borderColor: '#2a313d', marginBottom: 24,
  },
  code: {
    color: '#7cc4ff', fontSize: 44, fontWeight: '800', letterSpacing: 6,
    fontVariant: ['tabular-nums'],
  },
  codeInput: {
    backgroundColor: '#151a23', color: '#fff', borderRadius: 14,
    paddingVertical: 18, paddingHorizontal: 20, fontSize: 34, fontWeight: '700',
    letterSpacing: 5, textAlign: 'center', borderWidth: 1, borderColor: '#2a313d',
    width: '100%', marginBottom: 22, fontVariant: ['tabular-nums'],
  },
  waitRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 18 },
  waitText: { color: '#c9d2de', fontSize: 15 },
  hint: { color: '#6b7686', fontSize: 13, textAlign: 'center', lineHeight: 19 },
  button: {
    backgroundColor: '#2f7cf6', borderRadius: 12, paddingVertical: 16,
    alignItems: 'center', width: '100%', marginTop: 12,
  },
  buttonOutline: { backgroundColor: 'transparent', borderWidth: 1, borderColor: '#2f7cf6' },
  buttonDisabled: { backgroundColor: '#333c4a', borderColor: '#333c4a' },
  buttonText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  buttonOutlineText: { color: '#7cc4ff' },
  link: { marginTop: 22, padding: 10 },
  linkText: { color: '#6b7686', fontSize: 15 },
  // Più spento del comando: è un'informazione, non una cosa da premere.
  linkValue: { color: '#4a5462', fontSize: 15 },
  version: { color: '#3a4353', fontSize: 12, marginTop: 20 },
});
