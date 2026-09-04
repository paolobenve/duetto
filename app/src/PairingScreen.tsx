/*
 * Duetto - a permanent voice and video channel for two people.
 * Copyright (C) 2026 Paolo Benvenuto
 *
 * Free software under the GNU General Public License, version 3 or any
 * later version, and with no warranty of any kind. The full text is in
 * the LICENSE file at the root of the project, and at
 * <https://www.gnu.org/licenses/>.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, ActivityIndicator,
  ScrollView, KeyboardAvoidingView, Platform, Clipboard,
} from 'react-native';
import { DuoConfig, PairInfo, ServerRole, displayServer, isPaired } from './config';
import { makeInvitation } from './door';
import { pairLink, parseLink } from './links';
import QrCode from './QrCode';
import { Scanner } from 'duetto-platform';
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
  /**
   * What the server is to this phone: it decides which buttons can
   * work. A guest cannot create a code - the room would have nobody to
   * open it - so the button is not there; only the owner may invite.
   */
  role?: ServerRole;
  /** a code typed at the welcome: the pairing starts with it, at once */
  joinWith?: string;
  /** open on typing a code, for whoever may create one but was given one */
  startTyping?: boolean;
  /**
   * The server turned this phone away: it is not what the phone thought
   * it was here - taken off the list, say - and whoever holds the word
   * has to hear it, or the buttons stay wrong for good.
   */
  onRefused?: (reason: string) => void;
};

type Step = 'choose' | 'preparing' | 'create' | 'join' | 'exchanging' | 'error'
  | 'invite' | 'invited' | 'done';

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

export default function PairingScreen({
  cfg, onPaired, onBack, role = 'unknown', joinWith, onRefused, startTyping,
}: Props) {
  const [step, setStep] = useState<Step>(startTyping ? 'join' : 'choose');
  const [code, setCode] = useState('');
  const [typed, setTyped] = useState('');
  const [message, setMessage] = useState('');
  const [retryIn, setRetryIn] = useState(0);
  /** the invitation being made: whose, and the one just made */
  const [person, setPerson] = useState('');
  const [inviting, setInviting] = useState(false);
  const [inviteNote, setInviteNote] = useState('');
  const [invited, setInvited] = useState<{ name: string; code: string; days: number } | null>(null);
  const [copied, setCopied] = useState(false);
  /** the pair just made, shown and explained before it is handed over */
  const [made, setMade] = useState<PairInfo | null>(null);

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
        serverKey: cfg.serverKey,
        invitation: cfg.invitation,
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
            // Not handed over yet: first a word on what has just
            // happened, which whoever was merely reading digits out
            // has no way of knowing.
            setMade({
              id: pairIdRef.current,
              key: keyToBase64(key),
              side,
              peerName: peerNameRef.current,
              pairedAt: new Date().toISOString(),
            });
            setStep('done');
          }
        },

        onError: (err, reason) => {
          if (err === 'room-full') {
            fail(t('pairing.codeInUse'));
          } else if (err === 'not-allowed') {
            cleanup();
            doneRef.current = true;
            onRefused?.(reason || 'stranger');
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

  /** The other phone's code read with the camera, and the pairing started. */
  const [scanNote, setScanNote] = useState('');
  const scanCode = useCallback(async () => {
    setScanNote('');
    let text = '';
    try {
      text = await Scanner.scan(t('qr.hint'));
    } catch {
      setScanNote(t('qr.noCamera'));
      return;
    }
    if (!text) return;
    const link = parseLink(text);
    if (!link || link.kind !== 'pair') { setScanNote(t('qr.notOurs')); return; }
    if (displayServer(link.serverUrl) !== displayServer(cfg.serverUrl)) {
      setScanNote(t('qr.otherServer', { server: displayServer(link.serverUrl) }));
      return;
    }
    setTyped(link.code);
    startExchange(link.code, 'B');
  }, [cfg.serverUrl, startExchange]);

  /**
   * Whoever may open connections here creates the code, and that is
   * all: the screen opens on the code itself, with nothing to press.
   * Typing somebody else's code stays possible, as a line under it,
   * for the one case where two such phones pair with each other.
   */
  const opens = role === 'owner' || role === 'member';
  const autoCreated = useRef(false);
  useEffect(() => {
    if (!opens || joinWith || startTyping || autoCreated.current) return;
    autoCreated.current = true;
    startCreate();
  }, [opens, joinWith, startTyping, startCreate]);

  // The eight digits were typed at the welcome: nothing to press here.
  const startedWith = useRef('');
  useEffect(() => {
    if (!joinWith || !isCodeComplete(joinWith) || startedWith.current === joinWith) return;
    startedWith.current = joinWith;
    setTyped(joinWith);
    startExchange(joinWith, 'B');
  }, [joinWith, startExchange]);

  const reset = useCallback(() => {
    cleanup();
    doneRef.current = true; // stops a computation that may be under way
    setTyped('');
    setCode('');
    setStep('choose');
  }, [cleanup]);

  /**
   * An invitation, made at the door.
   *
   * It goes through the door and not through a room, because a server
   * just taken has no room yet - and the card shown at the door is
   * authority enough. The server answers only an owner's card.
   */
  const startInvite = useCallback(async () => {
    const who = person.trim();
    if (!who || inviting) return;
    setInviting(true);
    setInviteNote('');
    try {
      const made = await makeInvitation(
        cfg.serverUrl.trim(),
        { key: cfg.serverKey, name: cfg.displayName },
        who,
      );
      setInvited(made);
      setPerson('');
      setCopied(false);
      setStep('invited');
    } catch (e: any) {
      setInviteNote(t('pairing.inviteFailed', { why: String(e?.message || '') }));
    } finally {
      setInviting(false);
    }
  }, [person, inviting, cfg]);

  // --- the screens --------------------------------------------------------
  if (step === 'done' && made) {
    const who = made.peerName || t('pairing.theOtherPerson');
    return (
      <Screen>
        <Text style={styles.big}>{'\u{1F517}'}</Text>
        <Text style={styles.title}>{t('pairing.doneTitle')}</Text>
        <Text style={styles.body}>
          {role === 'guest'
            ? t('pairing.doneGuest', { who })
            : t('pairing.doneOpens', { who })}
        </Text>
        <Primary label={t('pairing.go')} onPress={() => onPaired(made)} />
      </Screen>
    );
  }

  if (step === 'invite') {
    return (
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Screen>
          <Text style={styles.title}>{t('pairing.inviteTitle')}</Text>
          <Text style={styles.body}>{t('pairing.inviteBody')}</Text>
          <TextInput
            style={styles.nameInput}
            value={person}
            onChangeText={setPerson}
            placeholder={t('pairing.inviteName')}
            placeholderTextColor="#4a5462"
            autoCorrect={false}
            autoFocus
          />
          <Text style={styles.hint}>{t('pairing.inviteNameHint')}</Text>
          {inviteNote ? <Text style={styles.note}>{inviteNote}</Text> : null}
          <Primary
            label={t('pairing.makeInvite')}
            disabled={!person.trim() || inviting}
            onPress={startInvite}
          />
          <Secondary label={t('pairing.back')} onPress={() => setStep('choose')} />
        </Screen>
      </KeyboardAvoidingView>
    );
  }

  if (step === 'invited' && invited) {
    return (
      <Screen>
        <Text style={styles.title}>{t('pairing.invitedTitle')}</Text>
        <Text style={styles.body}>
          {t('pairing.invitedBody', { who: invited.name, days: invited.days })}
        </Text>
        <View style={styles.codeBox}>
          <Text style={styles.inviteCode} selectable>{invited.code}</Text>
        </View>
        <Primary
          label={copied ? t('pairing.copied') : t('pairing.copy')}
          outline
          onPress={() => {
            Clipboard.setString(invited.code);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
        />
        <Secondary label={t('pairing.back')} onPress={() => setStep('choose')} />
      </Screen>
    );
  }


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
        {/* The same code to be looked at: whoever is near holds their
            phone up, and types nothing - the server travels in it. */}
        <QrCode text={pairLink(cfg.serverUrl, code)} size={180} />
        <Text style={styles.qrHint}>{t('qr.orScanThis')}</Text>
        <View style={styles.waitRow}>
          <ActivityIndicator color="#2f7cf6" />
          <Text style={styles.waitText}>{t('pairing.waitingOther')}</Text>
        </View>
        <Text style={styles.hint}>{t('pairing.dictateHint')}</Text>
        <Secondary label={t('pairing.cancel')} onPress={opens ? onBack : reset} />
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
          <Primary label={t('qr.scan')} outline onPress={scanCode} />
          {scanNote ? <Text style={styles.note}>{scanNote}</Text> : null}
          <Secondary label={t('pairing.back')} onPress={startTyping ? onBack : reset} />
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

  // Only what can work here. A guest's room is opened by whoever let
  // them in: "Create the code" would make one nobody can open, and try
  // in silence until it gave up.
  const guest = role === 'guest';
  return (
    <Screen>
      <Text style={styles.big}>{'\u{1F517}'}</Text>
      <Text style={styles.title}>{t('pairing.connectTitle')}</Text>
      <Text style={styles.body}>{guest ? t('pairing.roleGuest') : t('pairing.connectBody')}</Text>
      {role === 'owner' || role === 'member' ? (
        <Text style={styles.role}>
          {t(role === 'owner' ? 'pairing.roleOwner' : 'pairing.roleMember')}
        </Text>
      ) : null}
      {!guest ? <Primary label={t('pairing.createCode')} onPress={startCreate} /> : null}
      <Primary label={t('pairing.haveCode')} outline={!guest} onPress={() => setStep('join')} />
      {role === 'owner' ? (
        <Primary
          label={t('pairing.invite')}
          outline
          onPress={() => { setInviteNote(''); setStep('invite'); }}
        />
      ) : null}
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
  inviteCode: {
    color: '#7cc4ff', fontSize: 36, fontWeight: '800', letterSpacing: 4,
  },
  nameInput: {
    backgroundColor: '#151a23', color: '#fff', borderRadius: 12,
    paddingVertical: 14, paddingHorizontal: 16, fontSize: 17,
    borderWidth: 1, borderColor: '#2a313d', width: '100%',
  },
  role: { color: '#c9d2de', fontSize: 14, textAlign: 'center', marginBottom: 14, marginTop: -10 },
  qrHint: { color: '#6b7686', fontSize: 13, textAlign: 'center', marginTop: 8, marginBottom: 18 },
  note: { color: '#ffb454', fontSize: 14, lineHeight: 20, marginTop: 10, alignSelf: 'flex-start' },
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
