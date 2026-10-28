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
 * The standing notification's "Call" buttons, one on each connection's
 * line: the simple alert, sent without opening the app.
 *
 * The touch arrives as a word from the service ("alert:" and the pair's
 * id, empty for the connection in use) and goes to whoever holds that
 * connection now: a waiting one's own (standby.ts); for the one in use,
 * the app when it has the connection, the presence with no window
 * otherwise - each answers only when the connection is its own. What
 * happened is said with a toast over the shade: sent, or the other not
 * there to hear it.
 *
 * And the bell's ding, quietly, on this phone, as from the app's own
 * button: whatever holds the connection, sent from the shade it was
 * silent here, and the toast alone did not say it had left.
 */
import { DeviceEventEmitter } from 'react-native';
import { Alarm, Foreground, Journal } from 'duetto-platform';
import { news } from './presence';
import { CUE_GAIN, loadConfig } from './config';
import { KNOCK_ECHO_MS, sentGain } from './alarms';

export type CallOutcome = { sent: boolean; who: string; channel: string };
/** null: this connection is not mine now */
type Caller = () => CallOutcome | null;

const others = new Map<string, Caller>();
const inUse = new Set<Caller>();

/** The caller of a waiting connection; null takes it away. */
export function callerFor(pairId: string, c: Caller | null) {
  if (c) others.set(pairId, c);
  else others.delete(pairId);
}

/** One of the callers of the connection in use; the returned function takes it away. */
export function callerInUse(c: Caller): () => void {
  inUse.add(c);
  return () => { inUse.delete(c); };
}

function callInUse(): CallOutcome | null {
  for (const c of inUse) {
    const out = c();
    if (out) return out;
  }
  return null;
}

DeviceEventEmitter.addListener('duettoNotificationAction', (a: string) => {
  if (!a.startsWith('alert:')) return;
  const id = a.slice('alert:'.length);
  // A connection that has just become the one in use is asked as such.
  const out = (id ? others.get(id)?.() : null) ?? callInUse();
  Journal.mark(`command:notification:call:${id ? id.slice(0, 8) : 'in-use'}:${out?.sent ? 'sent' : 'not-sent'}`)
    .catch(() => { /* noop */ });
  Foreground.toast(news.callFromNotification(out?.who ?? '', out?.channel ?? '', !!out?.sent))
    .catch(() => { /* noop */ });
  if (out?.sent) {
    loadConfig().then((c) => {
      const gain = CUE_GAIN[c.cueVolume] ?? CUE_GAIN.veryLow;
      if (gain > 0) return Alarm.play('bell', true, KNOCK_ECHO_MS, sentGain('bell', gain));
    }).catch(() => { /* noop */ });
  }
});
