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

/**
 * A call that arrived with no interface to show it.
 *
 * With the app open, a call or a sound shows in the middle of the screen
 * as well as in the shade: see CallAlert. With Duetto closed, only the
 * presence with no window hears it, and it can do the notification and
 * nothing more. The call is kept here, and the interface shows it when
 * it opens - while it is still news.
 */
const KEY = 'duetto.call-unseen';

/** How long a call stays news, for an interface opened after it. */
export const CALL_NEWS_MS = 10 * 60 * 1000;

type Kept = { text: string; pairId?: string; at: number };

/** The words of the call, and the connection when it is not the one in use. */
export function keepCall(text: string, pairId?: string): void {
  const kept: Kept = { text, pairId, at: Date.now() };
  AsyncStorage.setItem(KEY, JSON.stringify(kept)).catch(() => { /* noop */ });
}

/** The call kept, taken away; none when there is none or it is old news. */
export async function takeCall(): Promise<Omit<Kept, 'at'> | null> {
  const raw = await AsyncStorage.getItem(KEY).catch(() => null);
  if (!raw) return null;
  AsyncStorage.removeItem(KEY).catch(() => { /* noop */ });
  try {
    const kept = JSON.parse(raw) as Kept;
    if (!kept.text || Date.now() - kept.at > CALL_NEWS_MS) return null;
    return { text: kept.text, pairId: kept.pairId };
  } catch {
    return null;
  }
}
