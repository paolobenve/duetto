import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, ActivityIndicator,
  ScrollView, KeyboardAvoidingView, Platform,
} from 'react-native';
import { DuoConfig, PairInfo, displayServer, isPaired } from './config';
import { Signaling, PairMessage } from './signaling';
import {
  generateCode, normalizeCode, formatCode, isCodeComplete,
  pairIdFromCode, newKeyPair, deriveSharedKey, confirmationFor,
  keyToBase64, pubToBase64, pubFromBase64,
} from './pairing';
import { VERSION_LABEL } from './version';
import { t } from './i18n';

type Props = {
  cfg: DuoConfig;
  onPaired: (pair: PairInfo) => void;
  onBack: () => void;
};

type Step = 'choose' | 'preparing' | 'create' | 'join' | 'exchanging' | 'error';

/** If nothing happens in a minute and a half, better say so than spin. */
const TIMEOUT_MS = 90_000;

/**
 * The wait before another attempt is allowed after a failure.
 *
 * This is where the defence against somebody trying codes in bulk
 * lives, not in the slowness of the computation: it makes insisting
 * pointless, without keeping anybody waiting when things go well.
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

  // The countdown before another attempt is allowed.
  useEffect(() => {
    if (retryIn <= 0) return;
    const t = setTimeout(() => setRetryIn((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [retryIn]);

  /** Connection and exchange. The same for the creating and joining sides. */
  const startExchange = useCallback(async (rawCode: string, side: 'A' | 'B') => {
    const clean = normalizeCode(rawCode);
    codeRef.current = clean;
    keysRef.current = newKeyPair();
    doneRef.current = false;
    sentPubRef.current = false;
    sharedRef.current = null;

    // Deliberately slow (see pairing.ts): about a second, once only.
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
            if (sharedRef.current) return; // already worked out
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
              fail(t('pairing.keyExchangeFailed'));
            }
            return;
          }

          if (msg.kind === 'confirm') {
            const key = sharedRef.current;
            if (!key) return; // it came before the key: we wait
            if (msg.proof !== confirmationFor(key, otherSide)) {
              fail(t('pairing.codeMismatch'));
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
            fail(t('pairing.codeInUse'));
          }
        },
      },
    );

    signalingRef.current = sig;
    sig.connect();

    timerRef.current = setTimeout(() => {
      fail(t('pairing.noAnswer'));
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
    doneRef.current = true; // stops a computation that may be under way
    setTyped('');
    setCode('');
    setStep('choose');
  }, [cleanup]);

  // --- the screens --------------------------------------------------------

  if (step === 'error') {
    return (
      <Screen>
        <Text style={styles.icon}>{'\u{26A0}'}</Text>
        <Text style={styles.title}>{t('pairing.failedTitle')}</Text>
        <Text style={styles.body}>{message}</Text>
        <Primary
          label={retryIn > 0 ? t('pairing.retryIn', { seconds: retryIn }) : t('pairing.retry')}
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
        <Text style={[styles.title, { marginTop: 24 }]}>{t('pairing.oneMoment')}</Text>
        <Text style={styles.body}>{t('pairing.preparing')}</Text>
      </Screen>
    );
  }

  if (step === 'create') {
    return (
      <Screen>
        <Text style={styles.title}>{t('pairing.dictateTitle')}</Text>
        <Text style={styles.body}>{t('pairing.dictateBody')}</Text>
        <View style={styles.codeBox}>
          <Text style={styles.code}>{formatCode(code)}</Text>
        </View>
        <View style={styles.waitRow}>
          <ActivityIndicator color="#2f7cf6" />
          <Text style={styles.waitText}>{t('pairing.waitingOther')}</Text>
        </View>
        <Text style={styles.hint}>{t('pairing.dictateHint')}</Text>
        <Secondary label={t('pairing.cancel')} onPress={reset} />
      </Screen>
    );
  }

  if (step === 'join') {
    return (
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Screen>
          <Text style={styles.title}>{t('pairing.typeTitle')}</Text>
          <Text style={styles.body}>{t('pairing.typeBody')}</Text>
          <TextInput
            style={styles.codeInput}
            value={formatCode(typed)}
            onChangeText={(t) => setTyped(normalizeCode(t))}
            placeholder={t('pairing.codePlaceholder')}
            placeholderTextColor="#3a4353"
            keyboardType="number-pad"
            autoCorrect={false}
            maxLength={9}
            // One is here to type: the keyboard does not keep anybody waiting.
            autoFocus
          />
          <Primary
            label={t('pairing.pair')}
            disabled={!isCodeComplete(typed)}
            onPress={startJoin}
          />
          <Secondary label={t('pairing.back')} onPress={reset} />
        </Screen>
      </KeyboardAvoidingView>
    );
  }

  if (step === 'exchanging') {
    return (
      <Screen>
        <ActivityIndicator size="large" color="#2f7cf6" />
        <Text style={[styles.title, { marginTop: 24 }]}>{t('pairing.exchanging')}</Text>
        <Text style={styles.body}>{t('pairing.establishingKey')}</Text>
        <Secondary label={t('pairing.cancel')} onPress={reset} />
      </Screen>
    );
  }

  return (
    <Screen>
      <Text style={styles.big}>{'\u{1F517}'}</Text>
      <Text style={styles.title}>{t('pairing.connectTitle')}</Text>
      <Text style={styles.body}>{t('pairing.connectBody')}</Text>
      <Primary label={t('pairing.createCode')} onPress={startCreate} />
      <Primary label={t('pairing.haveCode')} outline onPress={() => setStep('join')} />
      {/* Whoever is already paired is here to add a connection, not
          because they must: they have to be able to change their mind.
          Whoever is not paired yet has nowhere to go back to, and the
          button does not appear. */}
      {isPaired(cfg) ? <Secondary label={t('pairing.cancel')} onPress={onBack} /> : null}
      <Secondary
        label={t('pairing.changeServer')}
        value={displayServer(cfg.serverUrl)}
        onPress={onBack}
      />
      <Text style={styles.version}>{VERSION_LABEL}</Text>
    </Screen>
  );
}

// --- pieces of interface ----------------------------------------------------

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
        {/* The server in use beside the control that changes it: it is
            the one thing one would want to know before touching it, and
            before this one had to go in to find out where one was
            pointed. */}
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
  // Dimmer than the control: it is information, not something to press.
  linkValue: { color: '#4a5462', fontSize: 15 },
  version: { color: '#3a4353', fontSize: 12, marginTop: 20 },
});
