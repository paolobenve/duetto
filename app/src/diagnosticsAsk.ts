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
import type { Signaling } from './signaling';
import { t } from './i18n';

/**
 * One phone asking the other to turn its diagnostics on.
 *
 * What goes wrong on the other phone is written in its journal, and the
 * journal comes over only with its diagnostics on - which the person
 * holding it seldom knows how to find. So it is asked from here, with a
 * button, and over there a card answers with another: turn on, later,
 * no.
 *
 * The other phone need not be connected: the request is kept here,
 * written down, and goes as soon as the two find each other - from the
 * app or from the presence with no window, whichever holds the
 * connection. Answers come back the same way: "received" when it has
 * arrived, then "on", "later" or "no".
 */
export type AskState = 'waiting' | 'delivered' | 'later' | 'no' | 'on';
export type Answer = 'received' | 'on' | 'later' | 'no';

/** what we asked, per connection */
const OURS = 'duetto.diagnostics-ask';
/** what we were asked, per connection */
const THEIRS = 'duetto.diagnostics-asked';
/** "later" holds the card back this long, then it comes again */
export const LATER_MS = 30 * 60 * 1000;

export type Asked = { at: number; laterAt?: number };

async function readMap<T>(key: string): Promise<Record<string, T>> {
  try {
    const raw = await AsyncStorage.getItem(key);
    const m = raw ? JSON.parse(raw) : null;
    return m && typeof m === 'object' ? m : {};
  } catch {
    return {};
  }
}

async function writeEntry<T>(key: string, id: string, v: T | null): Promise<void> {
  const m = await readMap<T>(key);
  if (v === null) delete m[id]; else m[id] = v;
  await AsyncStorage.setItem(key, JSON.stringify(m)).catch(() => { /* noop */ });
}

export async function ourAsk(pairId: string): Promise<AskState | null> {
  return (await readMap<AskState>(OURS))[pairId] ?? null;
}

export function setOurAsk(pairId: string, state: AskState | null): Promise<void> {
  return writeEntry(OURS, pairId, state);
}

/** What waits to go, sent: called when the two have just found each other. */
export async function deliverAsk(sig: Signaling | null, pairId: string | undefined): Promise<void> {
  if (!sig?.connected || !pairId) return;
  if ((await ourAsk(pairId)) === 'waiting') sig.sendSignal({ kind: 'askDiagnostics' });
}

/** Their answer: our request moves on, and its new state is returned. */
export async function answerHeard(pairId: string, answer: Answer): Promise<AskState> {
  const state: AskState = answer === 'received' ? 'delivered' : answer;
  await setOurAsk(pairId, state);
  return state;
}

export async function askedOfUs(pairId: string): Promise<Asked | null> {
  return (await readMap<Asked>(THEIRS))[pairId] ?? null;
}

/** Asked again: the card is due at once, whatever "later" said before. */
export function noteAskedOfUs(pairId: string): Promise<void> {
  return writeEntry<Asked>(THEIRS, pairId, { at: Date.now() });
}

export async function laterAskedOfUs(pairId: string): Promise<void> {
  const was = await askedOfUs(pairId);
  if (was) await writeEntry<Asked>(THEIRS, pairId, { ...was, laterAt: Date.now() });
}

export function clearAskedOfUs(pairId: string): Promise<void> {
  return writeEntry<Asked>(THEIRS, pairId, null);
}

/** Whether the card is due: asked, and not put off a moment ago. */
export function cardDue(a: Asked | null): boolean {
  return !!a && (!a.laterAt || Date.now() - a.laterAt > LATER_MS);
}

/**
 * The words, with the other person in them: their name, or "the other"
 * - the sentence starting with a capital whichever it is.
 */
export function said(key: string, name?: string): string {
  const s = t(key, { who: name?.trim() || t('presence.theOther') });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** The first of these connections whose card is due, if any. */
export async function dueAmong(pairIds: string[]): Promise<string | null> {
  const m = await readMap<Asked>(THEIRS);
  return pairIds.find((id) => cardDue(m[id] ?? null)) ?? null;
}
