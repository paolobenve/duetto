/*
 * Duetto - a permanent voice and video channel for two people.
 * Copyright (C) 2026 Paolo Benvenuto
 *
 * Free software under the GNU General Public License, version 3 or any
 * later version, and with no warranty of any kind. The full text is in
 * the LICENSE file at the root of the project, and at
 * <https://www.gnu.org/licenses/>.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, ActivityIndicator,
  ScrollView, KeyboardAvoidingView, Platform, BackHandler,
} from 'react-native';
import { DuoConfig, displayServer, normalizeServerUrl, isServerConfigured } from './config';
import { knock, watchDoor, formatInvitation, DoorAnswer } from './door';
import { parseLink } from './links';
import { Scanner } from 'duetto-platform';
import { normalizeCode, formatCode, isCodeComplete } from './pairing';
import { VERSION_FULL } from './version';
import { t } from './i18n';

/**
 * The first screen: which server, and nothing else until it is needed.
 *
 * It used to be the settings, with every field on show - the card of
 * this phone, the invitation, the key - and a first evening was spent
 * working out which of them mattered. None of them can be known in
 * advance: it depends on what the server is to this phone, and the
 * server is the one that knows. So the name is asked for, the phone
 * knocks, and the answer decides the next step:
 *
 *  - a free server is taken there and then: nothing to ask;
 *  - a server that wants a key asks for the key, and only that;
 *  - a server with an owner who does not know us offers the two ways
 *    in: the invitation, for connections of one's own, or the pairing
 *    code of whoever is calling, which needs nothing else.
 *
 * Whatever the road, it ends at the pairing screen with a word - owner,
 * member, guest - that says which buttons can work there.
 */
type Props = {
  initial: DuoConfig;
  /**
   * The server is written, the role is known: on to the pairing. With
   * a code, the pairing starts at once with it: somebody's guest has
   * typed the eight digits here, and has nothing else to press.
   */
  onDone: (cfg: DuoConfig, answer: DoorAnswer, code?: string) => void;
  /** goes back without touching anything; absent at the first start, which has nowhere to go */
  onClose?: () => void;
};

type Step = 'server' | 'knocking' | 'key' | 'stranger' | 'welcomed';

export default function WelcomeScreen({ initial, onDone, onClose }: Props) {
  const [server, setServer] = useState(displayServer(initial.serverUrl));
  const [key, setKey] = useState(initial.serverKey || '');
  const [invitation, setInvitation] = useState(initial.invitation || '');
  /** the pairing code somebody is reading out, typed right here */
  const [code, setCode] = useState('');
  const [step, setStep] = useState<Step>('server');
  /** a line under the field: what went wrong, or what the server said */
  const [note, setNote] = useState('');
  const [answer, setAnswer] = useState<DoorAnswer | null>(null);
  /** what just happened at the door, kept for the screen that says so */
  const [welcomed, setWelcomed] = useState<{ a: DoorAnswer; at: string; inv: string } | null>(null);

  const resolved = normalizeServerUrl(server);
  const ready = isServerConfigured({ ...initial, serverUrl: server });

  const finishWith = useCallback((
    a: DoorAnswer, withCode: string | undefined, at: string, inv: string,
  ) => {
    onDone({
      ...initial,
      serverUrl: at,
      serverKey: key.trim(),
      invitation: inv,
      serverRole: a.role,
    }, a, withCode);
  }, [initial, key, onDone]);
  const finish = useCallback((a: DoorAnswer, withCode?: string) => {
    finishWith(a, withCode, resolved, invitation.trim());
  }, [finishWith, resolved, invitation]);

  /**
   * Knocks with what is written now - or with what a QR code has just
   * said, handed in directly, since the fields would not have caught
   * up yet - and goes where the answer says.
   */
  const knockNow = useCallback(async (from: Step, over?: {
    server?: string; invitation?: string; code?: string;
  }) => {
    const at = over?.server ? normalizeServerUrl(over.server) : resolved;
    const inv = (over?.invitation ?? invitation).trim();
    setStep('knocking');
    setNote('');
    let a: DoorAnswer;
    try {
      a = await knock(at, {
        key: key.trim() || undefined,
        invite: inv || undefined,
        name: initial.displayName || undefined,
      });
    } catch (e: any) {
      const why = String(e?.message || '');
      setNote(why === 'unreachable' || why === 'timeout'
        ? t('welcome.unreachable')
        : t('welcome.refused', { why }));
      setStep(from);
      return;
    }
    setAnswer(a);
    // A pairing code read from a QR: the two ways in are settled, and
    // the pairing starts with it, as somebody's guest unless the
    // server already knows us.
    if (over?.code && !a.error) {
      finishWith(a.role === 'stranger' ? { ...a, role: 'guest' } : a, over.code, at, inv);
      return;
    }
    if (a.error === 'bad-key') {
      setNote(t('welcome.keyWrong'));
      setStep(a.hasOwner ? 'stranger' : 'key');
      return;
    }
    if (a.error === 'bad-invite') {
      setNote(t('welcome.invitationWrong'));
      setStep('stranger');
      return;
    }
    if (a.error) {
      setNote(t('welcome.refused', { why: a.error }));
      setStep(from);
      return;
    }
    // An older server, which cannot say what we are: on as before.
    if (a.role === 'unknown') {
      finishWith(a, undefined, at, inv);
      return;
    }
    // In: said in so many words before going on. Whoever has just
    // taken a server, or come in with an invitation, deserves to be
    // told what that means, not to land on a settings screen. Not
    // when nothing has happened, though: the same server confirmed
    // from the settings, and the same word as before, is a look and
    // not an arrival.
    if (a.role === 'owner' || a.role === 'member') {
      const nothingNew = at === initial.serverUrl && a.role === initial.serverRole && !a.adopted;
      if (nothingNew) { finishWith(a, undefined, at, inv); return; }
      setWelcomed({ a, at, inv });
      setStep('welcomed');
      return;
    }
    // A stranger, or somebody's guest with no pair to go to: what is
    // missing depends on the house.
    if (!a.hasOwner && a.needsKey) { setStep('key'); return; }
    if (a.hasOwner) { setStep('stranger'); return; }
    // Free, no key wanted, and still not taken: the server could not
    // write the list. Nothing to do from here but say so.
    setNote(t('welcome.notTaken'));
    setStep('server');
  }, [resolved, key, invitation, initial.displayName, finishWith]);

  /** A QR code held up by the other phone: server and code, typed by nobody. */
  const scanQr = useCallback(async (from: Step) => {
    setNote('');
    let text = '';
    try {
      text = await Scanner.scan(t('qr.hint'));
    } catch {
      setNote(t('qr.noCamera'));
      return;
    }
    if (!text) return;
    const link = parseLink(text);
    if (!link) { setNote(t('qr.notOurs')); return; }
    setServer(displayServer(link.serverUrl));
    if (link.kind === 'invite') {
      setInvitation(link.code);
      knockNow(from, { server: link.serverUrl, invitation: link.code });
    } else {
      setCode(link.code);
      knockNow(from, { server: link.serverUrl, code: link.code });
    }
  }, [knockNow]);

  /**
   * The phone's Back key does what the screen's own "Back" does: from
   * an inner step to the first one, from the first one to wherever one
   * came from. Without this it closed the app.
   */
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (step === 'knocking') return true;
      if (step !== 'server') { setNote(''); setWelcomed(null); setStep('server'); return true; }
      if (onClose) { onClose(); return true; }
      return false;
    });
    return () => sub.remove();
  }, [step, onClose]);

  /**
   * On "you are in", a thread at the door: taken off the list while
   * still reading the words, one is told here and not at the next
   * step, when the buttons would already be wrong.
   */
  useEffect(() => {
    if (step !== 'welcomed' || !welcomed) return;
    const stop = watchDoor(welcomed.at, {
      key: key.trim() || undefined,
      name: initial.displayName || undefined,
    }, () => {
      setWelcomed(null);
      setNote(t('welcome.removedMeanwhile'));
      setStep('server');
    });
    return stop;
  }, [step, welcomed, key, initial.displayName]);

  // --- the screens --------------------------------------------------------
  if (step === 'welcomed' && welcomed) {
    const { a } = welcomed;
    const title = a.role === 'owner'
      ? (a.adopted ? t('welcome.inOwnerTitle') : t('welcome.inOwnerBackTitle'))
      : t('welcome.inMemberTitle', { name: a.name || '' });
    const body = a.role === 'owner'
      ? (a.adopted
        ? t('welcome.inOwnerBody', { server: displayServer(welcomed.at) })
        : t('welcome.inOwnerBackBody', { server: displayServer(welcomed.at) }))
      : t('welcome.inMemberBody', { server: displayServer(welcomed.at), name: a.name || '' });
    return (
      <Screen>
        <Text style={styles.big}>{a.role === 'owner' ? '\u{1F3E0}' : '\u{1F91D}'}</Text>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.body}>{body}</Text>
        <Primary
          label={t('welcome.go')}
          onPress={() => finishWith(welcomed.a, undefined, welcomed.at, welcomed.inv)}
        />
      </Screen>
    );
  }

  if (step === 'knocking') {
    return (
      <Screen>
        <ActivityIndicator size="large" color="#2f7cf6" />
        <Text style={[styles.title, { marginTop: 24 }]}>{t('welcome.knocking')}</Text>
        <Text style={styles.body}>{displayServer(resolved)}</Text>
      </Screen>
    );
  }

  if (step === 'key') {
    return (
      <Keyboard>
        <Screen>
          <Text style={styles.big}>{'\u{1F511}'}</Text>
          <Text style={styles.title}>{t('welcome.keyTitle')}</Text>
          <Text style={styles.body}>{t('welcome.keyBody')}</Text>
          <Field
            label={t('settings.serverKey')}
            value={key}
            onChange={setKey}
            placeholder={t('settings.serverKeyPlaceholder')}
            autoFocus
          />
          {note ? <Text style={styles.note}>{note}</Text> : null}
          <Primary label={t('welcome.next')} disabled={!key.trim()} onPress={() => knockNow('key')} />
          <Secondary label={t('welcome.back')} onPress={() => { setNote(''); setStep('server'); }} />
        </Screen>
      </Keyboard>
    );
  }

  if (step === 'stranger') {
    const withKey = !!answer?.needsKey;
    return (
      <Keyboard>
        <Screen>
          <Text style={styles.big}>{'\u{1F6AA}'}</Text>
          <Text style={styles.title}>{t('welcome.strangerTitle')}</Text>
          <Text style={styles.body}>{t('welcome.strangerBody')}</Text>
          {/* The camera first: it takes either - a pairing code or an
              invitation - and whoever is near has nothing to type. */}
          <Primary label={t('qr.scan')} onPress={() => scanQr('stranger')} />

          {/* The common case first: somebody is reading a code out,
              and the eight digits are all that is needed - typed here,
              and the pairing starts with them. */}
          <Text style={styles.section}>{t('welcome.calledTitle')}</Text>
          <Text style={styles.hint}>{t('welcome.calledHint')}</Text>
          <TextInput
            style={styles.codeInput}
            value={formatCode(code)}
            onChangeText={(v) => setCode(normalizeCode(v))}
            placeholder={t('pairing.codePlaceholder')}
            placeholderTextColor="#3a4353"
            keyboardType="number-pad"
            autoCorrect={false}
            maxLength={9}
          />
          <Primary
            label={t('pairing.pair')}
            disabled={!isCodeComplete(code)}
            onPress={() => finish(
              { ...(answer || { hasOwner: true, needsKey: withKey }), role: 'guest' },
              code,
            )}
          />

          <Text style={styles.section}>{t('welcome.invitedTitle')}</Text>
          <Field
            label={t('settings.invitation')}
            value={invitation}
            onChange={(v) => setInvitation(formatInvitation(v, invitation))}
            placeholder={t('settings.invitationPlaceholder')}
            hint={t('welcome.invitationHint')}
          />
          {withKey ? (
            <Field
              label={t('settings.serverKey')}
              value={key}
              onChange={setKey}
              placeholder={t('settings.serverKeyPlaceholder')}
              hint={t('welcome.ownKeyHint')}
            />
          ) : null}
          {note ? <Text style={styles.note}>{note}</Text> : null}
          {/* Enabled by what is on the screen: a key remembered from
              before, in a field that is not shown, must not make a
              button that only knocks again. */}
          <Primary
            label={t('welcome.next')}
            outline
            disabled={!invitation.trim() && !(withKey && key.trim())}
            onPress={() => knockNow('stranger')}
          />
          <Secondary label={t('welcome.back')} onPress={() => { setNote(''); setStep('server'); }} />
        </Screen>
      </Keyboard>
    );
  }

  return (
    <Keyboard>
      <Screen>
        <Text style={styles.brand}>Duetto</Text>
        <Text style={styles.title}>{t('welcome.serverTitle')}</Text>
        <Text style={styles.body}>{t('welcome.serverBody')}</Text>
        <Field
          label={t('settings.server')}
          value={server}
          onChange={setServer}
          placeholder={t('settings.serverPlaceholder')}
          hint={server.trim()
            ? t('settings.willConnectTo', { url: resolved })
            : t('settings.justTheName')}
          keyboardType="url"
          autoFocus
        />
        {note ? <Text style={styles.note}>{note}</Text> : null}
        <Primary
          label={t('welcome.next')}
          disabled={!ready}
          // The same server, already known: nothing to ask, nothing to
          // rebuild - back where one came from.
          // Only for whoever may open connections there: a guest or a
          // stranger with no pair has the two ways in to see, and going
          // back to the settings would only send them here again.
          onPress={() => (onClose && resolved === initial.serverUrl
            && (initial.serverRole === 'owner' || initial.serverRole === 'member')
            ? onClose()
            : knockNow('server'))}
        />
        {/* Or nothing typed at all: the other phone holds its code up,
            and the server comes with it. */}
        <Primary label={t('qr.scan')} outline onPress={() => scanQr('server')} />
        {onClose ? <Secondary label={t('welcome.back')} onPress={onClose} /> : null}
        <Text style={styles.version}>{VERSION_FULL}</Text>
      </Screen>
    </Keyboard>
  );
}

// --- pieces of interface ----------------------------------------------------

function Keyboard({ children }: { children?: React.ReactNode }) {
  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {children}
    </KeyboardAvoidingView>
  );
}

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

function Field(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  hint?: string;
  keyboardType?: 'default' | 'url';
  autoFocus?: boolean;
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
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType={props.keyboardType}
        autoFocus={props.autoFocus}
      />
      {props.hint ? <Text style={styles.hint}>{props.hint}</Text> : null}
    </View>
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
  brand: { color: '#fff', fontSize: 34, fontWeight: '800', marginBottom: 22 },
  big: { fontSize: 56, marginBottom: 18 },
  title: { color: '#fff', fontSize: 25, fontWeight: '800', textAlign: 'center' },
  body: {
    color: '#8892a0', fontSize: 15, textAlign: 'center',
    marginTop: 12, marginBottom: 26, lineHeight: 22,
  },
  section: {
    color: '#c9d2de', fontSize: 16, fontWeight: '700', alignSelf: 'flex-start',
    marginTop: 26, marginBottom: 6,
  },
  field: { width: '100%', marginBottom: 6 },
  label: { color: '#8892a0', fontSize: 13, marginBottom: 6 },
  input: {
    backgroundColor: '#151a23', color: '#fff', borderRadius: 12,
    paddingVertical: 14, paddingHorizontal: 16, fontSize: 17,
    borderWidth: 1, borderColor: '#2a313d',
  },
  codeInput: {
    backgroundColor: '#151a23', color: '#fff', borderRadius: 14,
    paddingVertical: 14, paddingHorizontal: 20, fontSize: 30, fontWeight: '700',
    letterSpacing: 5, textAlign: 'center', borderWidth: 1, borderColor: '#2a313d',
    width: '100%', marginTop: 8, fontVariant: ['tabular-nums'],
  },
  hint: { color: '#6b7686', fontSize: 13, lineHeight: 19, marginTop: 8, alignSelf: 'flex-start' },
  note: { color: '#ffb454', fontSize: 14, lineHeight: 20, marginTop: 10, alignSelf: 'flex-start' },
  button: {
    backgroundColor: '#2f7cf6', borderRadius: 12, paddingVertical: 16,
    alignItems: 'center', width: '100%', marginTop: 16,
  },
  buttonOutline: { backgroundColor: 'transparent', borderWidth: 1, borderColor: '#2f7cf6' },
  buttonDisabled: { backgroundColor: '#333c4a', borderColor: '#333c4a', opacity: 0.55 },
  buttonText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  buttonOutlineText: { color: '#7cc4ff' },
  link: { marginTop: 22, padding: 10 },
  linkText: { color: '#6b7686', fontSize: 15 },
  version: { color: '#3a4353', fontSize: 12, marginTop: 30 },
});
