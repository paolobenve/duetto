import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, AppState,
} from 'react-native';
import { Foreground } from 'duetto-platform';
import { t } from './i18n';

type Props = {
  onDone: () => void;
};

/**
 * The two settings that staying reachable depends on.
 *
 * They are offered once only, right after the pairing, because without
 * them the phone closes the app whenever it feels like it and the
 * notifications stop arriving - a fault that looks like the app's and
 * is not.
 *
 * Neither can be granted from code: the first has a system dialog, the
 * second is a maker's screen we can only open.
 */
export default function SetupScreen({ onDone }: Props) {
  const [batteryOk, setBatteryOk] = useState(false);
  const [hasAutoStart, setHasAutoStart] = useState(false);
  const [autoStartOpened, setAutoStartOpened] = useState(false);
  /**
   * Whether the app started by itself after the phone's LAST restart.
   *
   * The automatic-start authorisation cannot be read by any app - it is
   * a maker's screen - and the tick used to come on merely because you
   * had opened that screen, even without touching anything. It said
   * "fine" without knowing.
   *
   * This, instead, is the fact: at the restart the system woke us, or
   * it did not.
   */
  const [startedByItself, setStartedByItself] = useState<boolean | null>(null);
  /** the direct request was tried and changed nothing */
  const [batteryRefused, setBatteryRefused] = useState(false);
  const tried = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const ok = await Foreground.isBatteryUnrestricted();
      setBatteryOk(ok);
      // If we had already tried and nothing changed, the direct
      // request is not practicable on this phone: we move to the manual
      // road instead of offering a dialog that vanishes again.
      if (tried.current && !ok) setBatteryRefused(true);
      setHasAutoStart(await Foreground.hasAutoStartScreen());

      // Compared with the phone's switching on: an automatic start
      // three restarts ago says nothing about how things stand now.
      const last = await Foreground.lastAutoStart();
      const up = await Foreground.uptimeMs();
      const switchedOn = Date.now() - up;
      setStartedByItself(last > 0 ? last >= switchedOn - 60_000 : false);
    } catch { /* noop */ }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // On coming back from a system screen, we look again.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'active') refresh();
    });
    return () => sub.remove();
  }, [refresh]);

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.container}>
      <Text style={styles.big}>{'\u{1F50B}'}</Text>
      <Text style={styles.title}>{t('setup.title')}</Text>
      <Text style={styles.body}>{t('setup.body')}</Text>

      <Step
        n="1"
        title={t('setup.batteryTitle')}
        text={batteryRefused ? t('setup.batteryRefused') : t('setup.batteryText')}
        done={batteryOk}
        action={batteryRefused ? t('setup.batteryOpenApp') : t('setup.batteryAction')}
        onPress={async () => {
          if (batteryRefused) {
            await Foreground.openAppSettings();
            return;
          }
          tried.current = true;
          await Foreground.requestBatteryUnrestricted();
          setTimeout(refresh, 1500);
        }}
      />

      {hasAutoStart ? (
        <Step
          n="2"
          title={t('setup.autoStartTitle')}
          text={startedByItself ? t('setup.autoStartWorks') : t('setup.autoStartText')}
          done={!!startedByItself}
          action={autoStartOpened ? t('setup.autoStartReopen') : t('setup.autoStartOpen')}
          onPress={async () => {
            const ok = await Foreground.openAutoStartSettings();
            if (!ok) await Foreground.openAppSettings();
            setAutoStartOpened(true);
          }}
        />
      ) : null}

      <Text style={styles.hint}>{t('setup.makersHint')}</Text>

      <Text style={styles.hint}>
        {!hasAutoStart
          ? t('setup.noAutoStartHint')
          : startedByItself
            ? t('setup.autoStartProved')
            : t('setup.autoStartUnknown')}
      </Text>

      <TouchableOpacity style={styles.button} onPress={onDone}>
        <Text style={styles.buttonText}>{t('setup.done')}</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.link} onPress={onDone}>
        <Text style={styles.linkText}>{t('setup.skip')}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function Step(props: {
  n: string;
  title: string;
  text: string;
  done: boolean;
  action: string;
  onPress: () => void;
}) {
  return (
    <View style={styles.step}>
      <View style={styles.stepHead}>
        <View style={[styles.badge, props.done && styles.badgeDone]}>
          <Text style={styles.badgeText}>{props.done ? '✓' : props.n}</Text>
        </View>
        <Text style={styles.stepTitle}>{props.title}</Text>
      </View>
      <Text style={styles.stepText}>{props.text}</Text>
      <TouchableOpacity
        style={[styles.stepButton, props.done && styles.stepButtonDone]}
        onPress={props.onPress}>
        <Text style={[styles.stepButtonText, props.done && styles.stepButtonTextDone]}>
          {props.done ? t('setup.alreadyFine') : props.action}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#0b0e14' },
  container: { padding: 24, paddingTop: 64, paddingBottom: 40 },
  big: { fontSize: 46, textAlign: 'center' },
  title: {
    color: '#fff', fontSize: 24, fontWeight: '800',
    textAlign: 'center', marginTop: 14,
  },
  body: {
    color: '#8892a0', fontSize: 15, textAlign: 'center',
    marginTop: 12, marginBottom: 26, lineHeight: 22,
  },
  step: {
    backgroundColor: '#151a23', borderRadius: 14, padding: 16, marginBottom: 14,
    borderWidth: 1, borderColor: '#252c38',
  },
  stepHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  badge: {
    width: 26, height: 26, borderRadius: 13, backgroundColor: '#2a313d',
    alignItems: 'center', justifyContent: 'center',
  },
  badgeDone: { backgroundColor: '#2a7d46' },
  badgeText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  stepTitle: { color: '#e6ebf1', fontSize: 17, fontWeight: '700' },
  stepText: { color: '#8892a0', fontSize: 14, marginTop: 10, lineHeight: 20 },
  stepButton: {
    marginTop: 14, borderRadius: 10, paddingVertical: 12, alignItems: 'center',
    backgroundColor: '#2f7cf6',
  },
  stepButtonDone: { backgroundColor: 'transparent', borderWidth: 1, borderColor: '#2a7d46' },
  stepButtonText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  stepButtonTextDone: { color: '#4fb573' },
  hint: { color: '#5a6472', fontSize: 12.5, lineHeight: 18, marginTop: 4, marginBottom: 10 },
  button: {
    backgroundColor: '#2f7cf6', borderRadius: 12, paddingVertical: 16,
    alignItems: 'center', marginTop: 16,
  },
  buttonText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  link: { marginTop: 14, padding: 10, alignItems: 'center' },
  linkText: { color: '#6b7686', fontSize: 15 },
});
