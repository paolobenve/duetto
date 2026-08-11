import nacl from 'tweetnacl';
import { decodeUTF8 } from 'tweetnacl-util';

/**
 * Un'immagine per chi non ha un nome.
 *
 * Senza, restava un punto interrogativo, che sembra un errore più che
 * un segnaposto.
 *
 * NON è casuale: nasce dall'identificativo della coppia e dal lato, quindi
 *  - resta sempre la stessa, e diventa riconoscibile;
 *  - i due telefoni ne hanno una diversa l'uno dall'altro;
 *  - e ognuno vede per l'altro esattamente ciò che l'altro vede per sé,
 *    perché entrambi partono dagli stessi dati.
 */

/** Toni scelti per stare bene sul fondo scuro. */
const COLORS = [
  '#c9556b', '#c97a2b', '#b39320', '#5e9e3a', '#2f9e77',
  '#2b8fb3', '#3f77d0', '#7a5fd0', '#b04fb0', '#8a6a4a',
];

/** Simboli neutri e distinguibili anche in piccolo. */
const SYMBOLS = [
  '\u{1F98A}', '\u{1F422}', '\u{1F989}', '\u{1F98B}', '\u{1F41D}',
  '\u{1F42C}', '\u{1F994}', '\u{1F99C}', '\u{1F438}', '\u{1F980}',
  '\u{1F334}', '\u{1F33B}', '\u{1F344}', '\u{1F41A}', '\u{2618}',
  '\u{1F31E}', '\u{1F31C}', '\u{2601}', '\u{26F5}', '\u{1F3D4}',
];

export type Avatar = { color: string; symbol: string };

export function avatarFor(seed: string): Avatar {
  const h = nacl.hash(decodeUTF8(`duotalk-avatar|${seed}`));
  return {
    color: COLORS[h[0] % COLORS.length],
    symbol: SYMBOLS[h[1] % SYMBOLS.length],
  };
}

/** L'immagine dell'ALTRO: stesso identificativo, lato opposto al nostro. */
export function peerAvatar(pairId: string, mySide: 'A' | 'B'): Avatar {
  return avatarFor(`${pairId}|${mySide === 'A' ? 'B' : 'A'}`);
}
