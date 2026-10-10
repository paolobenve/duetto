/*
 * Duetto - a permanent voice and video channel for two people.
 * Copyright (C) 2026 Paolo Benvenuto
 *
 * Free software under the GNU General Public License, version 3 or any
 * later version, and with no warranty of any kind. The full text is in
 * the LICENSE file at the root of the project, and at
 * <https://www.gnu.org/licenses/>.
 */

import { t } from './i18n';

/**
 * The sounds for calling back somebody who is in the channel but does
 * not answer, and the ones this phone can alert you with.
 *
 * A handful, and quite unlike one another: you choose without having to
 * listen to them one by one. The technical name is known to the phone
 * on the other side too, which is the one that plays it.
 *
 * Built while drawing, not once at import: a list made at the top of a
 * file freezes the language it was born in, and changing language it
 * would go on speaking the old one under a screen that had changed.
 */
/**
 * How loud each sound is as recorded, in LUFS (ffmpeg's ebur128), and
 * the level of the buttons' own: the knock was some 6 dB below them, the
 * fanfare 7, and on the moto the call one sends sounded "a bit low".
 * Heard on the side that sends, every sound is brought to the buttons'
 * level, under the same option; at the top the knock stays a little
 * short, because a sound cannot go past its full volume.
 */
const RECORDED_LUFS: Record<string, number> = {
  knock: -16.5, drumroll: -15.7, drumkit: -13.9, fanfare: -17.2, horn: -10.5, rooster: -12.2,
};
const BUTTONS_LUFS = -10;
export function sentGain(name: string, gain: number): number {
  const l = RECORDED_LUFS[name];
  if (l === undefined || gain <= 0) return gain;
  return Math.min(1, gain * 10 ** ((BUTTONS_LUFS - l) / 20));
}

/** The name of a sound as the list shows it; the bare name if unknown. */
export const alarmLabel = (name: string): string =>
  ALARMS().find((a) => a.name === name)?.label ?? name;

export const ALARMS = (): { name: string; label: string; note: string }[] => [
  { name: 'drumroll', label: t('alarms.drums'), note: t('alarms.drumsNote') },
  { name: 'drumkit', label: t('alarms.kit'), note: t('alarms.kitNote') },
  { name: 'fanfare', label: t('alarms.fanfare'), note: t('alarms.fanfareNote') },
  { name: 'horn', label: t('alarms.horn'), note: t('alarms.hornNote') },
  { name: 'rooster', label: t('alarms.rooster'), note: t('alarms.roosterNote') },
];
