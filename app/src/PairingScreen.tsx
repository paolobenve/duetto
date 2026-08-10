import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, ActivityIndicator,
  ScrollView, KeyboardAvoidingView, Platform,
} from 'react-native';
import { DuoConfig, PairInfo } from './config';
import { Signaling, PairMessage } from './signaling';
import {
  generateCode, normalizeCode, formatCode, isCodeComplete,
  pairIdFromCode, newKeyPair, deriveSharedKey, confirmationFor,
  keyToBase64, pubToBase64, pubFromBase64,
} from './pairing';

type Props = {
  cfg: DuoConfig;
  onPaired: (pair: PairInfo) => void;
  onBack: () => void;
};

type Step = 'choose' | 'create' | 'join' | 'exchanging' | 'error';

/** Se in un minuto e mezzo non succede nulla, meglio dirlo che restare a girare. */
const TIMEOUT_MS = 90_000;

export default function PairingScreen({ cfg, onPaired, onBack }: Props) {
  const [step, setStep] = useState<Step>('choose');
  const [code, setCode] = useState('');
  const [typed, setTyped] = useState('');
  const [message, setMessage] = useState('');
  const [waiting, setWaiting] = useState(false);

  const signalingRef = useRef<Signaling | null>(null);
  const keysRef = useRef(newKeyPair());
  const sideRef = useRef<'A' | 'B'>('A');
  const codeRef = useRef('');
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
  }, [cleanup]);

  /** Avvia la connessione e lo scambio. Uguale per chi crea e chi si unisce. */
  const startExchange = useCallback((rawCode: string, side: 'A' | 'B') => {
    const clean = normalizeCode(rawCode);
    codeRef.current = clean;
    sideRef.current = side;
    keysRef.current = newKeyPair();
    doneRef.current = false;
    sentPubRef.current = false;
    sharedRef.current = null;
    setWaiting(true);

    const otherSide: 'A' | 'B' = side === 'A' ? 'B' : 'A';

    const sendPubOnce = (sig: Signaling) => {
      if (sentPubRef.current) return;
      sentPubRef.current = true;
      sig.sendPair({
        kind: 'pubkey',
        pub: pubToBase64(keysRef.current.publicKey),
        name: cfg.displayName || 'Qualcuno',
      });
    };

    const sig = new Signaling(
      {
        serverUrl: cfg.serverUrl.trim(),
        accessToken: cfg.accessToken,
        room: pairIdFromCode(clean),
        displayName: cfg.displayName || 'Qualcuno',
        key: null,
        mode: 'listening',
      },
      {
        onJoined: ({ peerPresent }) => {
          if (peerPresent) sendPubOnce(sig);
        },
        onPeerJoined: () => sendPubOnce(sig),

        onPair: (msg: PairMessage) => {
          if (msg.kind === 'pubkey') {
            // L'altro c'e': se non l'abbiamo ancora fatto, tocca a noi.
            sendPubOnce(sig);
            if (sharedRef.current) return; // gia' calcolata
            try {
              peerNameRef.current = msg.name || 'Qualcuno';
              const key = deriveSharedKey(
                keysRef.current.secretKey,
                pubFromBase64(msg.pub),
                codeRef.current,
              );
              sharedRef.current = key;
              sig.sendPair({ kind: 'confirm', proof: confirmationFor(key, side) });
            } catch {
              fail('Lo scambio di chiavi non è riuscito. Riprova.');
            }
            return;
          }

          if (msg.kind === 'confirm') {
            const key = sharedRef.current;
            if (!key) return; // la conferma è arrivata prima della chiave: aspettiamo
            if (msg.proof !== confirmationFor(key, otherSide)) {
              // Chiavi diverse: il codice digitato non coincide.
              fail(
                'Il codice non coincide.\n\n' +
                'Controlla di aver digitato esattamente quello mostrato sull’altro telefono.',
              );
              return;
            }
            doneRef.current = true;
            cleanup();
            onPaired({
              id: pairIdFromCode(codeRef.current),
              key: keyToBase64(key),
              side,
              peerName: peerNameRef.current,
              pairedAt: new Date().toISOString(),
            });
          }
        },

        onError: (err) => {
          if (err === 'bad-token') fail('Access token non valido: controllalo nelle impostazioni.');
          else if (err === 'room-full') {
            fail('Quel codice è già usato da due dispositivi.\n\nGenerane uno nuovo.');
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
    setStep('create');
    startExchange(c, 'A');
  }, [startExchange]);

  const startJoin = useCallback(() => {
    if (!isCodeComplete(typed)) return;
    setStep('exchanging');
    startExchange(typed, 'B');
  }, [typed, startExchange]);

  const reset = useCallback(() => {
    cleanup();
    setWaiting(false);
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
        <Primary label="Riprova" onPress={reset} />
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
          <Text style={styles.code}>{code}</Text>
        </View>
        <View style={styles.waitRow}>
          <ActivityIndicator color="#2f7cf6" />
          <Text style={styles.waitText}>In attesa dell’altro telefono…</Text>
        </View>
        <Text style={styles.hint}>
          Dettalo a voce o di persona. Chi lo intercetta, e sa anche dov’è il tuo
          server, potrebbe prendere il posto dell’altra persona.
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
          <Text style={styles.body}>Quello mostrato sull’altro telefono.</Text>
          <TextInput
            style={styles.codeInput}
            value={formatCode(typed)}
            onChangeText={(t) => setTyped(normalizeCode(t))}
            placeholder="ABCD-EFGH"
            placeholderTextColor="#4a5462"
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={9}
          />
          <Primary
            label="Accoppia"
            disabled={!isCodeComplete(typed)}
            onPress={startJoin}
          />
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
      <Text style={styles.title}>Accoppia i due telefoni</Text>
      <Text style={styles.body}>
        Da fare una volta sola. Su un telefono crei la coppia, sull’altro digiti
        il codice che appare.
      </Text>
      <Primary label="Crea la coppia" onPress={startCreate} />
      <Primary label="Ho un codice" outline onPress={() => setStep('join')} />
      <Secondary label="Impostazioni" onPress={onBack} />
      {waiting ? null : null}
    </Screen>
  );
}

// --- pezzi di interfaccia ---------------------------------------------------

function Screen({ children }: { children: React.ReactNode }) {
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

function Secondary(props: { label: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.link} onPress={props.onPress}>
      <Text style={styles.linkText}>{props.label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#0b0e14' },
  container: { padding: 26, paddingTop: 60, paddingBottom: 40, alignItems: 'center' },
  big: { fontSize: 56, marginBottom: 18 },
  icon: { fontSize: 46, marginBottom: 14 },
  title: { color: '#fff', fontSize: 25, fontWeight: '800', textAlign: 'center' },
  body: {
    color: '#8892a0', fontSize: 15, textAlign: 'center',
    marginTop: 12, marginBottom: 26, lineHeight: 22,
  },
  codeBox: {
    backgroundColor: '#151a23', borderRadius: 16, paddingVertical: 26,
    paddingHorizontal: 30, borderWidth: 1, borderColor: '#2a313d', marginBottom: 24,
  },
  code: { color: '#7cc4ff', fontSize: 40, fontWeight: '800', letterSpacing: 4 },
  codeInput: {
    backgroundColor: '#151a23', color: '#fff', borderRadius: 14,
    paddingVertical: 18, paddingHorizontal: 20, fontSize: 30, fontWeight: '700',
    letterSpacing: 3, textAlign: 'center', borderWidth: 1, borderColor: '#2a313d',
    width: '100%', marginBottom: 22,
  },
  waitRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 20 },
  waitText: { color: '#c9d2de', fontSize: 15 },
  hint: {
    color: '#6b7686', fontSize: 13, textAlign: 'center', lineHeight: 19, marginBottom: 10,
  },
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
});
