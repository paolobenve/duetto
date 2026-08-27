/*
 * Duetto - a permanent voice and video channel for two people.
 * Copyright (C) 2026 Paolo Benvenuto
 *
 * Free software under the GNU General Public License, version 3 or any
 * later version, and with no warranty of any kind. The full text is in
 * the LICENSE file at the root of the project, and at
 * <https://www.gnu.org/licenses/>.
 */
import { Locale } from 'duetto-platform';
import { en, type Dictionary } from './en';
import { it } from './it';

/**
 * The languages the app speaks, and the words it speaks them with.
 *
 * There is no library behind this: a dictionary per language, a
 * function that looks a key up, and the phone's own language as the
 * default. A translation library would bring plural rules, dates and a
 * loader for languages fetched at runtime - none of which this app
 * needs, all of which would have to be carried around.
 *
 * The chosen language belongs to the CONNECTION, like the other
 * settings: two people who write to each other in English can keep the
 * app in English, and the same phone can show Italian to somebody else.
 */
export type Language = 'en' | 'it';

const dictionaries: Record<Language, Dictionary> = { en, it };

/** What the picker in the settings offers, in this order. */
export const LANGUAGES: Language[] = ['en', 'it'];

/** `auto` means: whatever the phone is set to. */
export type LanguageChoice = 'auto' | Language;

const isLanguage = (v: string): v is Language =>
  (LANGUAGES as string[]).includes(v);

/** The phone's language, if we speak it; English otherwise. */
export function phoneLanguage(): Language {
  const short = String(Locale.language || 'en').slice(0, 2).toLowerCase();
  return isLanguage(short) ? short : 'en';
}

let current: Language = phoneLanguage();

/**
 * Set the language in use. Returns what was actually chosen, so the
 * caller can tell "the phone's language" from a deliberate pick.
 */
export function useLanguage(choice: LanguageChoice | undefined): Language {
  current = !choice || choice === 'auto' || !isLanguage(choice)
    ? phoneLanguage()
    : choice;
  return current;
}

export function currentLanguage(): Language {
  return current;
}

/**
 * A path like `channel.peerWaiting`, walked one step at a time.
 *
 * A missing key returns the key itself instead of throwing: a wrong
 * word on screen is a bug to fix, a crash in the middle of a
 * conversation is something else entirely.
 */
function look(dictionary: Dictionary, path: string): string {
  let node: any = dictionary;
  for (const step of path.split('.')) {
    if (node === undefined || node === null) return path;
    node = node[step];
  }
  return typeof node === 'string' ? node : path;
}

/**
 * The words for a key, with `{holes}` filled in.
 *
 * Falls back to English when a language is missing the key - which can
 * only happen for a language added in a hurry - because half a sentence
 * in the wrong language still says something, and a key printed raw
 * says nothing.
 */
export function t(path: string, values?: Record<string, string | number>): string {
  let text = look(dictionaries[current], path);
  if (text === path && current !== 'en') text = look(en, path);
  if (!values) return text;
  return text.replace(/\{(\w+)\}/g, (whole, name) => {
    const value = values[name];
    return value === undefined ? whole : String(value);
  });
}
