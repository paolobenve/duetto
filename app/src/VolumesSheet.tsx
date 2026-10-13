/*
 * Duetto - a permanent voice and video channel for two people.
 * Copyright (C) 2026 Paolo Benvenuto
 *
 * Free software under the GNU General Public License, version 3 or any
 * later version, and with no warranty of any kind. The full text is in
 * the LICENSE file at the root of the project, and at
 * <https://www.gnu.org/licenses/>.
 */
/**
 * All of Android's volumes, from a long press on the volume figure.
 *
 * Android's own panel was the first idea, and on the POCO it has no call
 * volume: HyperOS shows it nowhere - not in the panel, not in its
 * settings - and its volume bar does not open onto the others. The call
 * volume is reached only with the keys during a call. So Duetto shows
 * them itself, each with the phone's own steps: call, media, ring,
 * notifications, alarm.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Modal, Pressable, Linking,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Journal, Volume } from 'duetto-platform';
import { t } from './i18n';

type Stream = Awaited<ReturnType<typeof Volume.streams>>[number];

/** how often the values are read again while the sheet is open */
const REFRESH_MS = 1_000;

/**
 * Ringtone and notifications are one volume on some phones - HyperOS,
 * on the POCO: moving one moved the other, and two bars that move
 * together look broken. Found out once, by moving the notifications a
 * step and back and watching the ring, and remembered; shown then as a
 * single row. A move by hand that drags the other along finds it out
 * too, where the trial could not be made (the ring at zero).
 */
const LINKED_KEY = 'duetto.ring-notification-linked';

async function tryLinked(): Promise<boolean | null> {
  const before = await Volume.streams();
  const ring = before.find((x) => x.name === 'ring');
  const note = before.find((x) => x.name === 'notification');
  if (!ring || !note || ring.volume <= 0) return null;
  // A step that keeps clear of zero, where the ringer would go silent.
  const step = note.volume - 1 > Math.max(0, note.min) ? note.volume - 1
    : note.volume + 1 <= note.max ? note.volume + 1 : null;
  if (step === null) return null;
  if ((await Volume.setStream('notification', step)) !== 'ok') return null;
  const after = await Volume.streams();
  const linked = (after.find((x) => x.name === 'ring')?.volume ?? ring.volume) !== ring.volume;
  await Volume.setStream('notification', note.volume);
  if (linked) await Volume.setStream('ring', ring.volume);
  return linked;
}

export default function VolumesSheet({ visible, onClose }: {
  visible: boolean;
  onClose: () => void;
}) {
  const [streams, setStreams] = useState<Stream[]>([]);
  /** the volumes Android refused to move: Do Not Disturb */
  const [refused, setRefused] = useState<Record<string, boolean>>({});
  /** ringtone and notifications one volume here: see LINKED_KEY */
  const [linked, setLinked] = useState(false);
  const noteLinked = useCallback((now: boolean) => {
    setLinked(now);
    AsyncStorage.setItem(LINKED_KEY, now ? '1' : '0').catch(() => { /* noop */ });
  }, []);
  useEffect(() => {
    if (!visible) return;
    AsyncStorage.getItem(LINKED_KEY).then((v) => {
      if (v === '1') { setLinked(true); return; }
      if (v === '0') return;
      tryLinked().then((found) => {
        if (found === null) return;
        Journal.mark(`volumes:ring-notification:${found ? 'one' : 'apart'}`).catch(() => { /* noop */ });
        noteLinked(found);
      }).catch(() => { /* noop */ });
    }).catch(() => { /* noop */ });
  }, [visible, noteLinked]);

  const reload = useCallback(() => {
    Volume.streams().then(setStreams).catch(() => { /* noop */ });
  }, []);

  // Read on opening, and again every second while open: the keys, the
  // ring and the notifications moving together, another app - what is
  // shown has to be what is.
  useEffect(() => {
    if (!visible) return;
    setRefused({});
    reload();
    const timer = setInterval(reload, REFRESH_MS);
    return () => clearInterval(timer);
  }, [visible, reload]);

  const put = (s: Stream, value: number) => {
    const v = Math.max(s.min, Math.min(s.max, value));
    if (v === s.volume) return;
    // At once on the screen; the truth comes back with the reading.
    setStreams((all) => all.map((x) => (x.name === s.name ? { ...x, volume: v } : x)));
    const other = s.name === 'ring' ? 'notification' : s.name === 'notification' ? 'ring' : null;
    const otherBefore = other ? streams.find((x) => x.name === other)?.volume : undefined;
    Volume.setStream(s.name, v).then(async (how) => {
      Journal.mark(`volumes:${s.name}:${v}:${how}`).catch(() => { /* noop */ });
      setRefused((r) => ({ ...r, [s.name]: how === 'refused' }));
      const now = await Volume.streams();
      setStreams(now);
      // The other one dragged along: one volume, here.
      if (other && how === 'ok' && !linked && otherBefore !== undefined
          && now.find((x) => x.name === other)?.volume !== otherBefore) {
        noteLinked(true);
      }
    }).catch(() => reload());
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.back} onPress={onClose}>
        {/* A touch inside is a choice, not a way out. */}
        <Pressable style={styles.sheet} onPress={() => { /* hold it */ }}>
          <Text style={styles.title}>{t('volumes.title')}</Text>
          {streams.filter((s) => !(linked && s.name === 'notification')).map((s) => (
            <View key={s.name} style={styles.row}>
              <View style={styles.head}>
                <Text style={styles.label}>
                  {linked && s.name === 'ring' ? t('volumes.ringAndNotifications') : t(`volumes.${s.name}`)}
                </Text>
                <Text style={styles.value}>{`${s.volume} / ${s.max}`}</Text>
              </View>
              <View style={styles.line}>
                <TouchableOpacity style={styles.step} onPress={() => put(s, s.volume - 1)}>
                  <Text style={styles.stepSign}>−</Text>
                </TouchableOpacity>
                <Bar stream={s} onPick={(v) => put(s, v)} />
                <TouchableOpacity style={styles.step} onPress={() => put(s, s.volume + 1)}>
                  <Text style={styles.stepSign}>+</Text>
                </TouchableOpacity>
              </View>
              {s.name === 'call' ? <Text style={styles.note}>{t('volumes.callNote')}</Text> : null}
              {refused[s.name] ? <Text style={styles.refused}>{t('volumes.refused')}</Text> : null}
            </View>
          ))}
          <View style={styles.actions}>
            <TouchableOpacity
              style={styles.action}
              onPress={() => {
                Linking.sendIntent('android.settings.SOUND_SETTINGS').catch(() => { /* noop */ });
              }}>
              <Text style={styles.actionText}>{t('volumes.settings')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.action} onPress={onClose}>
              <Text style={styles.close}>{t('volumes.close')}</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/** The volume as a bar: a touch along it goes there. */
function Bar({ stream, onPick }: { stream: Stream; onPick: (v: number) => void }) {
  const [w, setW] = useState(0);
  const share = stream.max > 0 ? stream.volume / stream.max : 0;
  return (
    <Pressable
      style={styles.bar}
      onLayout={(e) => setW(e.nativeEvent.layout.width)}
      onPress={(e) => {
        if (w <= 0) return;
        onPick(Math.round((e.nativeEvent.locationX / w) * stream.max));
      }}>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${Math.round(share * 100)}%` }]} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  back: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end', padding: 16,
  },
  sheet: {
    backgroundColor: '#151a23', borderRadius: 16, padding: 8, paddingBottom: 12,
    borderWidth: 1, borderColor: '#252c38',
  },
  title: {
    color: '#8892a0', fontSize: 13, fontWeight: '700',
    paddingHorizontal: 14, paddingTop: 12, paddingBottom: 4,
  },
  row: { paddingHorizontal: 14, paddingVertical: 8 },
  head: { flexDirection: 'row', alignItems: 'baseline', marginBottom: 6 },
  label: { color: '#c9d2de', fontSize: 16, flex: 1 },
  value: { color: '#7cc4ff', fontSize: 15, fontWeight: '700' },
  line: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  step: {
    width: 44, height: 38, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#1e2531', borderWidth: 1, borderColor: '#2f3846',
  },
  stepSign: { color: '#e6ebf1', fontSize: 20, fontWeight: '700' },
  // Tall to the finger, thin to the eye.
  bar: { flex: 1, height: 38, justifyContent: 'center' },
  track: { height: 6, borderRadius: 3, backgroundColor: '#2f3846', overflow: 'hidden' },
  fill: { height: 6, backgroundColor: '#7cc4ff' },
  note: { color: '#6b7686', fontSize: 12.5, marginTop: 6 },
  refused: { color: '#ffd28a', fontSize: 12.5, marginTop: 6 },
  actions: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 6, paddingTop: 8,
  },
  action: { paddingVertical: 10, paddingHorizontal: 8 },
  actionText: { color: '#7cc4ff', fontSize: 15, fontWeight: '600' },
  close: { color: '#8892a0', fontSize: 15, fontWeight: '600' },
});
