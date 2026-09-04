/*
 * Duetto - a permanent voice and video channel for two people.
 * Copyright (C) 2026 Paolo Benvenuto
 *
 * Free software under the GNU General Public License, version 3 or any
 * later version, and with no warranty of any kind. The full text is in
 * the LICENSE file at the root of the project, and at
 * <https://www.gnu.org/licenses/>.
 */
import React, { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, ActivityIndicator,
  ScrollView, KeyboardAvoidingView, Platform,
} from 'react-native';
import { DuoConfig, displayServer, normalizeServerUrl, isServerConfigured } from './config';
import { knock, formatInvitation, DoorAnswer } from './door';
import { normalizeCode, formatCode, isCodeComplete } from './pairing';
import { VERSION_LABEL } from './version';
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

type Step = 'server' | 'knocking' | 'key' | 'stranger';

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

  const resolved = normalizeServerUrl(server);
  const ready = isServerConfigured({ ...initial, serverUrl: server });

  const finish = useCallback((a: DoorAnswer, withCode?: string) => {
    onDone({
      ...initial,
      serverUrl: resolved,
      serverKey: key.trim(),
      invitation: invitation.trim(),
      serverRole: a.role,
    }, a, withCode);
  }, [initial, resolved, key, invitation, onDone]);

  /** Knocks with what is written now, and goes where the answer says. */
  const knockNow = useCallback(async (from: Step) => {
    setStep('knocking');
    setNote('');
    let a: DoorAnswer;
    try {
      a = await knock(resolved, {
        key: key.trim() || undefined,
        invite: invitation.trim() || undefined,
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
    if (a.role === 'owner' || a.role === 'member' || a.role === 'unknown') {
      finish(a);
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
  }, [resolved, key, invitation, initial.displayName, finish]);

  // --- the screens --------------------------------------------------------
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
          <Primary
            label={t('welcome.next')}
            outline
            disabled={!invitation.trim() && !key.trim()}
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
        <Primary label={t('welcome.next')} disabled={!ready} onPress={() => knockNow('server')} />
        {onClose ? <Secondary label={t('welcome.back')} onPress={onClose} /> : null}
        <Text style={styles.version}>{VERSION_LABEL}</Text>
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
  buttonDisabled: { backgroundColor: '#333c4a', borderColor: '#333c4a' },
  buttonText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  buttonOutlineText: { color: '#7cc4ff' },
  link: { marginTop: 22, padding: 10 },
  linkText: { color: '#6b7686', fontSize: 15 },
  version: { color: '#3a4353', fontSize: 12, marginTop: 30 },
});
