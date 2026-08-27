/*
 * Duetto - a permanent voice and video channel for two people.
 * Copyright (C) 2026 Paolo Benvenuto
 *
 * Free software under the GNU General Public License, version 3 or any
 * later version, and with no warranty of any kind. The full text is in
 * the LICENSE file at the root of the project, and at
 * <https://www.gnu.org/licenses/>.
 */
import React, { useState } from 'react';
import {
  View, Text, TextInput, StyleSheet, ScrollView, TouchableOpacity,
  KeyboardAvoidingView, Platform, Alert, Modal, Pressable,
} from 'react-native';
import type { DuoConfig, PairInfo, VideoQuality } from './config';
import { t, LANGUAGES } from './i18n';
import type { LanguageChoice } from './i18n';
import {
  isServerConfigured, isPaired, normalizeServerUrl, displayServer, VIDEO_PROFILES,
  pairName,
} from './config';
import { peerAvatar } from './avatar';
import { isRealName } from './presence';
import { VERSION_FULL } from './version';
import { Alerts } from 'duetto-platform';

/**
 * The choices for the call's vibration.
 *
 * "As the phone decides" is not laziness: Android knows things the app
 * does not - whether you are on silent, on "do not disturb", wearing
 * headphones - and leaving the decision to it makes the call behave
 * like every other notification on the phone. The other two force it,
 * one way or the other.
 */
/**
 * Lists that are built while drawing, not once and for all.
 *
 * A `const` at the top of the file is filled in when the file is first
 * imported, with whatever language was in use at that moment - and it
 * stays that way. Changing language, the screen redrew itself in the new
 * one while these three lists went on saying what they had said the
 * first time. That is why they are functions.
 */
const VIBRATIONS = (): {
  value: DuoConfig['alertVibration']; label: string; note: string;
}[] => [
  { value: 'default', label: t('settings.vibrationPhone'), note: t('settings.vibrationPhoneNote') },
  { value: 'always', label: t('settings.vibrationAlways'), note: t('settings.vibrationAlwaysNote') },
  { value: 'never', label: t('settings.vibrationNever'), note: t('settings.vibrationNeverNote') },
];

const SOUNDS = (): {
  value: DuoConfig['alertSound']; label: string; note: string;
}[] => [
  { value: 'default', label: t('settings.soundDefault'), note: t('settings.soundDefaultNote') },
  { value: 'none', label: t('settings.soundNone'), note: t('settings.soundNoneNote') },
  { value: 'chosen', label: t('settings.soundChoose'), note: t('settings.soundChooseNote') },
];

/**
 * How far the controls step aside.
 *
 * The percentages are not a detail for technicians: they are exactly
 * the thing one is choosing, and whoever reads "well faded" without a
 * number cannot tell whether it will be a shadow or a memory.
 */
const CONTROLS = (): {
  value: DuoConfig['controls']; label: string; note: string;
}[] => [
  { value: 'dim', label: t('settings.controlsDim'), note: t('settings.controlsDimNote') },
  { value: 'faint', label: t('settings.controlsFaint'), note: t('settings.controlsFaintNote') },
  { value: 'hidden', label: t('settings.controlsHidden'), note: t('settings.controlsHiddenNote') },
];

type Props = {
  initial: DuoConfig;
  onSave: (cfg: DuoConfig) => void;
  /** forgets a connection, in use or not */
  onForgetPair: (id: string) => void;
  /** brings a connection already set up into use */
  onSwitchPair: (id: string) => void;
  /** the name I give a connection myself; empty = back to theirs */
  onRenamePair: (id: string, name: string) => void;
  /**
   * Adds a pairing without touching the ones already there: it is for a
   * new person, and it is for when the other side has broken the pair
   * and there is no way of knowing here.
   */
  onRepair: () => void;
  /** goes back without saving; absent when there is nowhere to go back to */
  onClose?: () => void;
  /** opens the screen of system settings again */
  onOpenSetup: () => void;
  /**
   * VP9 in hardware, on the two phones separately.
   *
   * The option is always shown, but can only be picked with both: codec
   * preferences hold for the whole session, so choosing it because one
   * phone can do it would force the other to encode in software.
   * Showing it greyed out, saying whose limit it is, is more useful
   * than hiding it.
   */
  vp9Here?: boolean;
  vp9Peer?: boolean;
  /**
   * The quality is applied on the touch, without going through "Save".
   *
   * It is the one setting that is judged by looking: you try it, you
   * see the effect, you change it. Having to confirm it with a button
   * forces you out of the settings to find out how it turned out.
   */
  onQualityChange?: (q: VideoQuality) => void;
  /**
   * Settings that are applied on the touch and written at once.
   *
   * Once paired there is no "Save" - the server is not touched - and a
   * switch waiting for a confirmation that does not exist never comes
   * on.
   */
  onLive?: (patch: Partial<DuoConfig>) => void;
};

/**
 * The settings. One thing only stands in front: where the server is.
 * All the rest is optional and sits under "Other settings".
 */
export default function SettingsScreen({
  initial, onForgetPair, onSwitchPair, onRenamePair, onSave, onRepair, onClose, onOpenSetup,
  vp9Here, vp9Peer, onQualityChange, onLive,
}: Props) {
  const vp9Available = !!vp9Here && !!vp9Peer;
  const vp9Why = vp9Available
    ? t('settings.vp9Ok')
    : !vp9Here && !vp9Peer
      ? t('settings.vp9Neither')
      : !vp9Here
        ? t('settings.vp9ThisPhone')
        : t('settings.vp9OtherPhone');
  // The field shows the domain, not the whole address that lives in the
  // configuration: that is what is asked for, and what is read back.
  const [cfg, setCfg] = useState<DuoConfig>(
    () => ({ ...initial, serverUrl: displayServer(initial.serverUrl) }),
  );
  const [advanced, setAdvanced] = useState(false);
  /** the server field appears only on request, once paired */
  const [changingServer, setChangingServer] = useState(false);
  const set = (k: keyof DuoConfig) => (v: string) => setCfg({ ...cfg, [k]: v });

  const ready = isServerConfigured(cfg);
  const paired = isPaired(cfg);
  const resolved = normalizeServerUrl(cfg.serverUrl);

  /**
   * The connections, the one in use first.
   *
   * It is read from the configuration that arrived, not from the one
   * being worked on: only the server field is edited in here, and the
   * list is changed by the buttons, which go through the parent.
   */
  const connections = initial.pairs;
  const inUse = initial.pair?.id;

  const nameOf = (p: PairInfo) => pairName(p) || t('settings.unnamed');

  /** the connection being named, and the name in progress */
  const [naming, setNaming] = useState<PairInfo | null>(null);
  const [writtenName, setWrittenName] = useState('');
  const openNaming = (p: PairInfo) => {
    setWrittenName(p.label || '');
    setNaming(p);
  };
  const closeNaming = (save: boolean) => {
    if (save && naming) onRenamePair(naming.id, writtenName);
    setNaming(null);
  };

  const confirmBreakUp = (p: PairInfo) => {
    const active = p.id === inUse;
    const left = connections.filter((q) => q.id !== p.id);
    const after = active && left.length
      ? t('settings.forgetSwitch', { who: nameOf(left[0]) })
      : '';
    Alert.alert(
      t('settings.forgetTitle', { who: nameOf(p) }),
      t('settings.forgetBody') + after,
      [
        { text: t('settings.cancel'), style: 'cancel' },
        {
          text: t('settings.breakUp'),
          style: 'destructive',
          onPress: () => onForgetPair(p.id),
        },
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
          <Text style={styles.title}>Duetto</Text>
        </View>
        <Text style={styles.subtitle}>{t('settings.subtitle')}</Text>

        {paired && !changingServer ? (
          // Once paired the server is hardly ever touched: showing it
          // as an editable field invites a mistake that would
          // disconnect everything. The value is shown, and changed if
          // one asks.
          <View style={styles.field}>
            <Text style={styles.label}>{t('settings.server')}</Text>
            <Text style={styles.readonly}>{displayServer(initial.serverUrl)}</Text>
            <TouchableOpacity onPress={() => setChangingServer(true)}>
              <Text style={styles.linkInline}>{t('settings.changeServer')}</Text>
            </TouchableOpacity>
          </View>
        ) : (
        <View style={styles.field}>
          <Text style={styles.label}>{t('settings.server')}</Text>
          <TextInput
            style={styles.input}
            value={cfg.serverUrl}
            onChangeText={set('serverUrl')}
            placeholder={t('settings.serverPlaceholder')}
            placeholderTextColor="#4a5462"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />
          <Text style={styles.hint}>
            {cfg.serverUrl.trim()
              ? t('settings.willConnectTo', { url: resolved })
              : t('settings.justTheName')}
          </Text>
        </View>
        )}

        {/* The step forward belongs here, not at the bottom: right
            under what one has just written. Below are settings that
            apply by themselves or that concern a pairing already
            made. */}
        {!paired || changingServer ? (
        <TouchableOpacity
          style={[styles.button, !ready && styles.buttonDisabled]}
          disabled={!ready}
          onPress={() => onSave({ ...cfg, serverUrl: resolved })}>
          <Text style={styles.buttonText}>
            {paired ? t('settings.save') : t('settings.next')}
          </Text>
        </TouchableOpacity>
        ) : null}

        {paired ? (
          <>
            <Text style={styles.section}>
              {connections.length > 1 ? t('settings.connections') : t('settings.pair')}
            </Text>
            {connections.length > 1 ? (
              <Text style={styles.sectionHint}>{t('settings.connectionsHint')}</Text>
            ) : null}
            {connections.map((p) => {
              const active = p.id === inUse;
              const face = peerAvatar(p.id, p.side);
              return (
                <View key={p.id} style={styles.pairRow}>
                  <TouchableOpacity
                    style={[styles.pairBox, active && styles.pairBoxInUse]}
                    disabled={active}
                    onPress={() => onSwitchPair(p.id)}>
                    <View style={[styles.pairFace, { backgroundColor: face.color }]}>
                      <Text style={styles.pairFaceText}>{face.symbol}</Text>
                    </View>
                    <View style={styles.pairWho}>
                      <Text style={styles.pairName}>{nameOf(p)}</Text>
                      {/* With the connection's name at the head, who is
                          on the other side has to be said all the same:
                          they are two different things, and that name
                          is the one they gave themselves. */}
                      {p.label && isRealName(p.peerName) ? (
                        <Text style={styles.pairMeta}>
                          {t('settings.withWho', { who: p.peerName })}
                        </Text>
                      ) : null}
                      <Text style={styles.pairMeta}>
                        {active ? t('settings.inUseSince') : t('settings.since')}
                        {p.pairedAt ? new Date(p.pairedAt).toLocaleDateString() : '—'}
                      </Text>
                      {/* The server is part of the connection's
                          identity: the room is there, and moving to
                          another connection moves you to another server
                          as well. Whoever has one reads the same line
                          every time and stops thinking about it. */}
                      <Text style={styles.pairMeta}>
                        {displayServer(p.serverUrl || initial.serverUrl) || '—'}
                      </Text>
                    </View>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.pairAway}
                    onPress={() => openNaming(p)}>
                    <Text style={styles.pairNameText}>{'\u270E'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.pairAway}
                    onPress={() => confirmBreakUp(p)}>
                    <Text style={styles.pairAwayText}>{'\u2715'}</Text>
                  </TouchableOpacity>
                </View>
              );
            })}
            <TouchableOpacity style={styles.secondary} onPress={onRepair}>
              <Text style={styles.secondaryText}>{t('settings.addConnection')}</Text>
            </TouchableOpacity>
            <Text style={styles.sectionHint}>{t('settings.addConnectionHint')}</Text>
          </>
        ) : null}

        <Text style={styles.subsection}>{t('settings.videoQuality')}</Text>
        <Text style={styles.sectionHint}>{t('settings.videoQualityHint')}</Text>
        <Text style={styles.sectionHint}>{t('settings.bandwidthHint')}</Text>
        {(Object.keys(VIDEO_PROFILES) as VideoQuality[]).map((q) => (
          <TouchableOpacity
            key={q}
            style={[styles.choice, cfg.videoQuality === q && styles.choicePicked]}
            onPress={() => {
              setCfg({ ...cfg, videoQuality: q });
              onQualityChange?.(q);
            }}>
            <View style={[styles.radio, cfg.videoQuality === q && styles.radioPicked]} />
            <View style={styles.choiceText}>
              <Text style={styles.choiceLabel}>{t(`quality.${VIDEO_PROFILES[q].key}`)}</Text>
              <Text style={styles.choiceNote}>{t(`quality.${VIDEO_PROFILES[q].key}Note`)}</Text>
            </View>
          </TouchableOpacity>
        ))}
        <Text style={styles.sectionHint}>{t('settings.ceilingsHint')}</Text>

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
              {t('settings.vp9Codec')}
            </Text>
            <Text style={[styles.choiceNote, !vp9Available && styles.textOff]}>
              {vp9Why}
            </Text>
          </View>
        </TouchableOpacity>

        <Text style={styles.subsection}>{t('settings.audio')}</Text>
        <TouchableOpacity
          style={[styles.choice, cfg.richerAudio && styles.choicePicked]}
          onPress={() => {
            const v = !cfg.richerAudio;
            setCfg({ ...cfg, richerAudio: v });
            onLive?.({ richerAudio: v });
          }}>
          <View style={[styles.radio, cfg.richerAudio && styles.radioPicked]} />
          <View style={styles.choiceText}>
            <Text style={styles.choiceLabel}>{t('settings.richerVoice')}</Text>
            <Text style={styles.choiceNote}>{t('settings.richerVoiceNote')}</Text>
          </View>
        </TouchableOpacity>

        <Text style={styles.subsection}>{t('settings.whenTheyCall')}</Text>
        <Text style={styles.sectionHint}>{t('settings.whenTheyCallHint')}</Text>

        <Text style={styles.sectionHint}>{t('settings.vibration')}</Text>
        {VIBRATIONS().map((v) => (
          <TouchableOpacity
            key={v.value}
            style={[styles.choice, cfg.alertVibration === v.value && styles.choicePicked]}
            onPress={() => {
              setCfg({ ...cfg, alertVibration: v.value });
              onLive?.({ alertVibration: v.value });
            }}>
            <View style={[styles.radio, cfg.alertVibration === v.value && styles.radioPicked]} />
            <View style={styles.choiceText}>
              <Text style={styles.choiceLabel}>{v.label}</Text>
              <Text style={styles.choiceNote}>{v.note}</Text>
            </View>
          </TouchableOpacity>
        ))}

        <Text style={styles.sectionHint}>{t('settings.sound')}</Text>
        {SOUNDS().map((s) => (
          <TouchableOpacity
            key={s.value}
            style={[styles.choice, cfg.alertSound === s.value && styles.choicePicked]}
            onPress={async () => {
              if (s.value !== 'chosen') {
                setCfg({ ...cfg, alertSound: s.value });
                onLive?.({ alertSound: s.value });
                return;
              }
              // A system screen makes the choice: if it is cancelled,
              // nothing changes - not even the selected entry, which
              // would otherwise say "chosen" without anything having
              // been chosen.
              const picked = await Alerts.pickSound(cfg.alertSoundUri).catch(() => null);
              if (!picked) return;
              const patch = {
                alertSound: 'chosen' as const,
                alertSoundUri: picked.uri,
                alertSoundName: picked.name,
              };
              setCfg({ ...cfg, ...patch });
              onLive?.(patch);
            }}>
            <View style={[styles.radio, cfg.alertSound === s.value && styles.radioPicked]} />
            <View style={styles.choiceText}>
              <Text style={styles.choiceLabel}>
                {s.value === 'chosen' && cfg.alertSoundName
                  ? cfg.alertSoundName
                  : s.label}
              </Text>
              <Text style={styles.choiceNote}>{s.note}</Text>
            </View>
          </TouchableOpacity>
        ))}

        <Text style={styles.subsection}>{t('settings.controlsWhileWatching')}</Text>
        <Text style={styles.sectionHint}>{t('settings.controlsHint')}</Text>
        {CONTROLS().map((c) => (
          <TouchableOpacity
            key={c.value}
            style={[styles.choice, cfg.controls === c.value && styles.choicePicked]}
            onPress={() => {
              setCfg({ ...cfg, controls: c.value });
              onLive?.({ controls: c.value });
            }}>
            <View style={[styles.radio, cfg.controls === c.value && styles.radioPicked]} />
            <View style={styles.choiceText}>
              <Text style={styles.choiceLabel}>{c.label}</Text>
              <Text style={styles.choiceNote}>{c.note}</Text>
            </View>
          </TouchableOpacity>
        ))}

        <Text style={styles.subsection}>{t('settings.language')}</Text>
        <Text style={styles.sectionHint}>{t('settings.languageHint')}</Text>
        {(['auto', ...LANGUAGES] as LanguageChoice[]).map((l) => (
          <TouchableOpacity
            key={l}
            style={[styles.choice, (cfg.language ?? 'auto') === l && styles.choicePicked]}
            onPress={() => {
              setCfg({ ...cfg, language: l });
              onLive?.({ language: l });
            }}>
            <View style={[
              styles.radio, (cfg.language ?? 'auto') === l && styles.radioPicked,
            ]} />
            <View style={styles.choiceText}>
              <Text style={styles.choiceLabel}>{t(`language.${l}`)}</Text>
            </View>
          </TouchableOpacity>
        ))}

        <TouchableOpacity style={styles.toggle} onPress={() => setAdvanced(!advanced)}>
          <Text style={styles.toggleText}>
            {advanced ? '▾' : '▸'}  {t('settings.otherSettings')}
          </Text>
        </TouchableOpacity>

        {advanced ? (
          <View style={styles.advanced}>
            <Text style={styles.sectionHint}>{t('settings.nothingRequired')}</Text>
            <Field
              label={t('settings.yourName')}
              value={cfg.displayName}
              onChange={set('displayName')}
              placeholder={t('settings.yourNamePlaceholder')}
              hint={t('settings.yourNameHint')}
            />
          </View>
        ) : null}


        <Text style={styles.section}>{t('settings.stayReachable')}</Text>
        <Text style={styles.sectionHint}>{t('settings.stayReachableHint')}</Text>
        <TouchableOpacity style={styles.rowButton} onPress={onOpenSetup}>
          <Text style={styles.rowButtonText}>{t('settings.reviewSystemSettings')}</Text>
          <Text style={styles.rowButtonArrow}>{'\u203A'}</Text>
        </TouchableOpacity>

        {/* Diagnostics belong to the phone, like staying reachable, and
            not to the person: the journal is one file and the log one
            stream. That is why they sit here among the app's own things
            and not among the settings that travel with a connection. */}
        <Text style={styles.section}>{t('settings.diagnostics')}</Text>
        <Text style={styles.sectionHint}>{t('settings.diagnosticsHint')}</Text>
        <TouchableOpacity
          style={[styles.choice, cfg.diagnostics && styles.choicePicked]}
          onPress={() => {
            const v = !cfg.diagnostics;
            setCfg({ ...cfg, diagnostics: v });
            onLive?.({ diagnostics: v });
          }}>
          <View style={[styles.radio, cfg.diagnostics && styles.radioPicked]} />
          <View style={styles.choiceText}>
            <Text style={styles.choiceLabel}>{t('settings.diagnosticsOn')}</Text>
            <Text style={styles.choiceNote}>{t('settings.diagnosticsOnNote')}</Text>
          </View>
        </TouchableOpacity>

        <Text style={styles.section}>{t('settings.security')}</Text>
        <View style={styles.infoBox}>
          <Text style={styles.infoLine}>
            {'\u{1F512}'}{t('settings.secMedia')}
            <Text style={styles.infoStrong}>{t('settings.secMediaStrong')}</Text>
            {t('settings.secMediaTail')}
          </Text>
          <Text style={styles.infoLine}>
            {'\u{1F512}'}{t('settings.secHandshake')}
          </Text>
          <Text style={styles.infoLine}>
            {'\u{1F511}'}{t('settings.secKey')}
          </Text>
          <Text style={styles.infoLine}>
            {'\u{1F441}'}{t('settings.secServerKnows')}
            <Text style={styles.infoStrong}>{t('settings.secWhen')}</Text>
            {t('settings.secServerKnowsMid')}
            <Text style={styles.infoStrong}>{t('settings.secWhat')}</Text>
            {t('settings.secServerKnowsTail')}
          </Text>
        </View>

        {/* The sounds for calling back come from outside, and whoever
            recorded them is to be named: one of the four asks for it in
            its licence, the others do not, but citing only the
            compulsory one would be half a courtesy. */}
        <Text style={styles.subsection}>{t('settings.soundsOrigin')}</Text>
        <Text style={styles.sectionHint}>{t('settings.soundsOriginText')}</Text>

        <Text style={styles.version}>{VERSION_FULL}</Text>
      </ScrollView>

      {/* The name to give a connection: it opens from the pencil. */}
      <Modal
        visible={!!naming}
        transparent
        animationType="fade"
        onRequestClose={() => closeNaming(false)}>
        <Pressable style={styles.sheetBack} onPress={() => closeNaming(false)}>
          {/* A touch inside the box must not close it: one is
              writing. */}
          <Pressable style={styles.sheet} onPress={() => { /* hold it */ }}>
            <Text style={styles.sheetTitle}>{t('settings.connectionName')}</Text>
            <TextInput
              style={styles.input}
              value={writtenName}
              onChangeText={setWrittenName}
              placeholder={t('settings.connectionNamePlaceholder')}
              placeholderTextColor="#5b6472"
              autoFocus
              maxLength={32}
              returnKeyType="done"
              onSubmitEditing={() => closeNaming(true)}
            />
            <Text style={styles.hint}>{t('settings.connectionNameHint')}</Text>
            <View style={styles.sheetActions}>
              <TouchableOpacity style={styles.sheetAction} onPress={() => closeNaming(false)}>
                <Text style={styles.sheetCancel}>{t('settings.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.sheetAction} onPress={() => closeNaming(true)}>
                <Text style={styles.sheetOk}>{t('settings.save')}</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
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
  secondary: {
    marginTop: 16, borderRadius: 12, paddingVertical: 14, alignItems: 'center',
    borderWidth: 1, borderColor: '#2f7cf6',
  },
  secondaryText: { color: '#2f7cf6', fontSize: 16, fontWeight: '700' },
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
  readonly: { color: '#e6ebf1', fontSize: 16, paddingVertical: 4 },
  linkInline: { color: '#2f7cf6', fontSize: 14, fontWeight: '600', marginTop: 8 },
  input: {
    backgroundColor: '#151a23', color: '#fff', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 13, fontSize: 16,
    borderWidth: 1, borderColor: '#252c38',
  },
  hint: { color: '#6b7686', fontSize: 12, marginTop: 6, lineHeight: 17 },
  pairRow: { flexDirection: 'row', alignItems: 'stretch', gap: 8, marginTop: 10 },
  pairBox: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: '#151a23', borderRadius: 12, padding: 16,
    borderWidth: 1, borderColor: '#252c38',
  },
  /** the one in use is known without reading: the only one with a lit edge */
  pairBoxInUse: { borderColor: '#2f7cf6', backgroundColor: '#16203050' },
  pairFace: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
  },
  pairFaceText: { fontSize: 20 },
  pairWho: { flex: 1 },
  pairAway: {
    width: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: '#252c38',
  },
  pairAwayText: { color: '#e5484d', fontSize: 17, fontWeight: '700' },
  pairNameText: { color: '#7cc4ff', fontSize: 19, fontWeight: '700' },
  sheetBack: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center', justifyContent: 'center', padding: 24,
  },
  sheet: {
    width: '100%', maxWidth: 420, backgroundColor: '#151a23', borderRadius: 16,
    padding: 20, borderWidth: 1, borderColor: '#252c38',
  },
  sheetTitle: { color: '#e6ebf1', fontSize: 18, fontWeight: '700', marginBottom: 14 },
  sheetActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 6 },
  sheetAction: { paddingVertical: 10, paddingHorizontal: 16 },
  sheetCancel: { color: '#8892a0', fontSize: 16, fontWeight: '600' },
  sheetOk: { color: '#2f7cf6', fontSize: 16, fontWeight: '700' },
  pairName: { color: '#e6ebf1', fontSize: 17, fontWeight: '700' },
  pairMeta: { color: '#6b7686', fontSize: 13, marginTop: 4 },
  rowButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#151a23', borderRadius: 12, paddingVertical: 15,
    paddingHorizontal: 16, borderWidth: 1, borderColor: '#252c38',
  },
  rowButtonText: { color: '#e6ebf1', fontSize: 16, fontWeight: '600' },
  rowButtonArrow: { color: '#6b7686', fontSize: 22, lineHeight: 24 },
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
