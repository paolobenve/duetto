/*
 * Duetto - a permanent voice and video channel for two people.
 * Copyright (C) 2026 Paolo Benvenuto
 *
 * Free software under the GNU General Public License, version 3 or any
 * later version, and with no warranty of any kind. The full text is in
 * the LICENSE file at the root of the project, and at
 * <https://www.gnu.org/licenses/>.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AudioDevices, Journal } from 'duetto-platform';

/**
 * When Duetto last restarted itself, by the person's choice.
 *
 * The restart ends the process at once, and at the next start Android
 * reports that end as a death: the other phone read "the phone closed
 * it" about a button pressed on purpose. The moment is written down
 * before closing, and a death just after it is not told.
 */
export const RESTART_KEY = 'duetto.restart';
/** How long after the moment written down the death may come. */
export const RESTART_WINDOW_MS = 10_000;

/** Starts Duetto afresh, having said so first. */
export async function restartDuetto(why: string) {
  try {
    await AsyncStorage.setItem(RESTART_KEY, String(Date.now()));
    await Journal.mark(`restart:${why}`);
  } catch { /* restarted all the same */ }
  AudioDevices.restart().catch(() => {});
}
