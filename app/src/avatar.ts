/*
 * Duetto - a permanent voice and video channel for two people.
 * Copyright (C) 2026 Paolo Benvenuto
 *
 * Free software under the GNU General Public License, version 3 or any
 * later version, and with no warranty of any kind. The full text is in
 * the LICENSE file at the root of the project, and at
 * <https://www.gnu.org/licenses/>.
 */
import nacl from 'tweetnacl';
import { decodeUTF8 } from 'tweetnacl-util';

/**
 * A picture for somebody who has no name yet.
 *
 * Without one there was a question mark, which looks like an error
 * rather than a placeholder.
 *
 * It is NOT random: it comes from the pair's identifier and from the
 * side, so that
 *  - it always stays the same, and becomes recognisable;
 *  - the two phones get a different one from each other;
 *  - and each of them sees, for the other person, exactly what that
 *    person sees for themselves, because both start from the same data.
 */

/** Shades picked to sit well on a dark background. */
const COLORS = [
  '#c9556b', '#c97a2b', '#b39320', '#5e9e3a', '#2f9e77',
  '#2b8fb3', '#3f77d0', '#7a5fd0', '#b04fb0', '#8a6a4a',
];

/** Symbols that stay neutral and legible even when small. */
const SYMBOLS = [
  '\u{1F98A}', '\u{1F422}', '\u{1F989}', '\u{1F98B}', '\u{1F41D}',
  '\u{1F42C}', '\u{1F994}', '\u{1F99C}', '\u{1F438}', '\u{1F980}',
  '\u{1F334}', '\u{1F33B}', '\u{1F344}', '\u{1F41A}', '\u{2618}',
  '\u{1F31E}', '\u{1F31C}', '\u{2601}', '\u{26F5}', '\u{1F3D4}',
];

export type Avatar = { color: string; symbol: string };

export function avatarFor(seed: string): Avatar {
  const h = nacl.hash(decodeUTF8(`duetto-avatar|${seed}`));
  return {
    color: COLORS[h[0] % COLORS.length],
    symbol: SYMBOLS[h[1] % SYMBOLS.length],
  };
}

/** The OTHER side's picture: same identifier, the side that is not ours. */
export function peerAvatar(pairId: string, mySide: 'A' | 'B'): Avatar {
  return avatarFor(`${pairId}|${mySide === 'A' ? 'B' : 'A'}`);
}
