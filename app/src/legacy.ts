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
 * TEMPORARY. The settings as they were written in Italian.
 *
 * Moving to English, the names of the fields written into the phone's
 * storage changed along with the code - `etichetta` became `label`,
 * `uscitaAudio` became `audioOutput` - and nothing was there to read the
 * old ones. On a phone updating from an earlier Duetto every preference
 * went silently back to its default: the name given to a connection, the
 * sound of the alert, where the sound comes out, how loud the other
 * voice is on each output, which camera opens.
 *
 * It was not lost, only unread: the old keys are still in there, because
 * what is not recognised gets written back untouched. This reads them
 * once and writes them under the names in use.
 *
 * It lives in a file of its own, with nothing imported, so that it can
 * be run and checked outside the app.
 *
 * TO BE TAKEN AWAY once every phone has been through here.
 */

/** The fields, as they were called then and as they are called now. */
const FIELDS: [string, string][] = [
  ['audioMigliore', 'richerAudio'],
  ['mostraDiagnostica', 'showDiagnostics'],
  ['comandi', 'controls'],
  ['avvisoVibra', 'alertVibration'],
  ['avvisoSuono', 'alertSound'],
  ['avvisoSuonoUri', 'alertSoundUri'],
  ['avvisoSuonoNome', 'alertSoundName'],
  ['uscitaAudio', 'audioOutput'],
  ['guadagni', 'gains'],
  ['guadagniAzzerati', 'gainsReset'],
  ['cameraFrontale', 'frontCamera'],
];

/** The same, for what a connection carries. */
const PAIR_FIELDS: [string, string][] = [
  ['etichetta', 'label'],
  ['impostazioni', 'settings'],
];

/**
 * The words written inside, which changed too.
 *
 * The fallback is the one the setting was born with: a value that means
 * nothing to anybody is worse than the default, and the only way to get
 * one here is a file written by hand.
 */
const VALUES: Record<string, { table: Record<string, string>; fallback: string }> = {
  videoQuality: {
    table: { risparmio: 'saver', standard: 'standard', migliore: 'better', massima: 'best' },
    fallback: 'better',
  },
  controls: {
    // `none` maps to itself: it was born after this bridge, and the
    // bridge - knowing only the three old degrees - read it as a value
    // from nowhere and put the default back at every start. Whoever
    // chose "always visible" found "barely faded" the next morning.
    table: { poco: 'dim', molto: 'faint', nascondi: 'hidden', none: 'none' },
    fallback: 'dim',
  },
  alertVibration: {
    table: { predefinito: 'default', sempre: 'always', mai: 'never' },
    fallback: 'default',
  },
  alertSound: {
    table: { predefinito: 'default', nessuno: 'none', scelto: 'chosen' },
    fallback: 'default',
  },
};

/**
 * Moves a value from the old name to the new one.
 *
 * When both are there the OLD one wins, which looks wrong and is not:
 * the new name can only have been written by a Duetto that could not
 * read the old one, so what it holds is the default it fell back on -
 * "speaker", "no name", the standard quality - while the old name holds
 * what was really chosen, months of it.
 *
 * The price is one evening: anybody who changed a setting between the
 * update and this fix sees that one change go back. It is paid once,
 * because from here on the old names are gone.
 */
function rename(target: any, pairs: [string, string][]) {
  if (!target || typeof target !== 'object') return;
  for (const [was, now] of pairs) {
    if (target[was] === undefined) continue;
    target[now] = target[was];
    delete target[was];
  }
}

/** Puts the words back into English, where they are words we know. */
function words(target: any) {
  if (!target || typeof target !== 'object') return;
  for (const key of Object.keys(VALUES)) {
    const v = target[key];
    if (typeof v !== 'string') continue;
    const { table, fallback } = VALUES[key];
    if (table[v]) target[key] = table[v];
    else if (!Object.values(table).includes(v)) target[key] = fallback;
  }
}

/** One connection: its own fields, and the settings it carries. */
function pair(p: any) {
  if (!p || typeof p !== 'object') return p;
  rename(p, PAIR_FIELDS);
  if (p.settings) {
    rename(p.settings, FIELDS);
    words(p.settings);
  }
  return p;
}

/**
 * The whole configuration as it comes out of storage.
 *
 * It works on a copy: the object arrives from `JSON.parse` and belongs
 * to nobody, but the connections inside it are shared between `pair` and
 * `pairs`, and being written twice would do no harm anyway - the second
 * pass finds the old names gone.
 */
export function fromItalianStorage(cfg: any): any {
  if (!cfg || typeof cfg !== 'object') return cfg;
  rename(cfg, FIELDS);
  words(cfg);
  if (Array.isArray(cfg.pairs)) cfg.pairs.forEach(pair);
  pair(cfg.pair);
  return cfg;
}
