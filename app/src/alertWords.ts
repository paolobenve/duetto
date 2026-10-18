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
 * The words of the alert on show, made again when the day turns.
 *
 * An alert says its moment - "called you at 23:40:12" - with the day
 * only when it is not today, and only when it is written: one left
 * unseen past midnight went on saying 23:40:12 all through the next
 * day, about yesterday. Android keeps one alert at a time, each new one
 * in place of the last; so whoever posts one leaves here how to say it,
 * and at the turn of the day the words are made again and the alert,
 * if it is still on show, is posted again with them, in silence (see
 * Notifier.renewAlert). Touched or swept away, it is left alone.
 */
import { Foreground, Journal } from 'duetto-platform';
import { onNewDay } from './dayTurn';

let last: (() => string) | null = null;

/** How to say the alert just posted, for the day's turn. */
export function alertSaid(words: () => string) {
  last = words;
}

onNewDay(() => {
  const words = last;
  if (!words) return;
  Foreground.renewAlert(words()).then((shown) => {
    if (!shown) {
      if (last === words) last = null;
      return;
    }
    Journal.mark('alert:renewed-for-day').catch(() => { /* noop */ });
  }).catch(() => { /* noop */ });
});
