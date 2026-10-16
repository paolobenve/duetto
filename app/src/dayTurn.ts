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
 * The turn of the day, for the words that hold a time.
 *
 * "Since 09:33:05" is written without its day while it is today, and
 * with it otherwise - but only when the words are written, at a change.
 * After midnight nothing changes, and the standing notification went on
 * saying "since 09:33:05" all through the next day, about yesterday.
 *
 * A timer set for midnight stands still while the processor sleeps: the
 * day is looked at on every heartbeat instead, which comes asleep too -
 * the watchdog's alarm strikes one at least every ten minutes - and on
 * every return of the app to the front.
 */
import { AppState } from 'react-native';
import { Heartbeat, Journal } from 'duetto-platform';

const listeners = new Set<() => void>();
let today = new Date().toDateString();
let watching: (() => void) | null = null;

function look() {
  const now = new Date().toDateString();
  if (now === today) return;
  today = now;
  Journal.mark('day-turned').catch(() => { /* noop */ });
  for (const l of [...listeners]) {
    try { l(); } catch { /* one listener's trouble is not the others' */ }
  }
}

/** Called once the day has turned; the returned function stops it. */
export function onNewDay(cb: () => void): () => void {
  listeners.add(cb);
  if (!watching) {
    const beat = Heartbeat.subscribe(look);
    const front = AppState.addEventListener('change', (st) => { if (st === 'active') look(); });
    watching = () => { beat(); front.remove(); };
  }
  return () => {
    listeners.delete(cb);
    if (listeners.size === 0 && watching) { watching(); watching = null; }
  };
}
