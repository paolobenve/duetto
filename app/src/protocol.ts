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
 * How the two phones and the server talk to each other, as a number.
 *
 * The version says what a Duetto can do; this says whether two of them
 * understand each other. Until now that was settled field by field - a
 * field that is not known is left alone - which holds while things are
 * only added. When the meaning of a message changed, the older phone
 * went wrong in silence: on the evening the messages took English names
 * the journals stopped being exchanged, and only reading them told why.
 *
 * Raised only when the way of talking changes so that an older Duetto
 * would misunderstand; `PROTOCOL_MIN` is then the oldest that is still
 * understood. Each side says both, in the hello to the other phone and
 * at the door to the server, and each judges the other: whoever finds
 * the other too old - or itself too old for the other - says so on the
 * screen, instead of a channel that half works.
 *
 * Missing, it is 1: a Duetto from before this number speaks protocol 1,
 * which is what everybody spoke then.
 */
export const PROTOCOL = 1;
export const PROTOCOL_MIN = 1;

/** what goes into a hello and a join */
export const PROTOCOL_SAID = { protocol: PROTOCOL, protocolMin: PROTOCOL_MIN };

/** a number said by the other side, 1 where it says none or nonsense */
const said = (n: unknown) => (typeof n === 'number' && Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1);

/**
 * Whether we understand each other: 'ok', 'theirs-old' when theirs is
 * older than the oldest we understand, 'mine-old' when ours is older
 * than the oldest they understand.
 */
export function protocolFit(theirs?: unknown, theirMin?: unknown): 'ok' | 'theirs-old' | 'mine-old' {
  if (said(theirs) < PROTOCOL_MIN) return 'theirs-old';
  if (said(theirMin) > PROTOCOL) return 'mine-old';
  return 'ok';
}
