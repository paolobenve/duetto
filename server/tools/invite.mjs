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
 * Makes an invitation for one person.
 *
 *   npm run invite -- anna
 *
 * It prints a code to be handed over as the pairing code is: out loud,
 * by message, however you like. Whoever types it into the app gets
 * their phone written down under that name, and the code is spent.
 */
import { addInvitation, fileName, read } from '../src/devices.js';

const name = process.argv[2];
if (!name) {
  console.error('use: npm run invite -- NAME');
  console.error('  the name is for you: it is what the list and the log will say.');
  process.exit(1);
}

const before = read();
const { code, days } = addInvitation(name);

console.log(`\n  ${code}\n`);
console.log(`for ${name}, good for ${days} days.`);
console.log(`Written in ${fileName()}`);

/**
 * The warning that saves an afternoon.
 *
 * As long as nobody is on the list the door is open, and it closes by
 * itself the moment the first phone comes in with an invitation - which
 * would leave the owner's own phones outside, without their ever having
 * asked for anything. Better said now than found out then.
 */
if (before.devices.length === 0 && !process.env.AUTHORISED_KEYS) {
  console.log('\nCareful: no phone is on the list yet, so the door is open.');
  console.log('The moment this invitation is used the door shuts, and only the');
  console.log('phones on the list get in. Put your own in first - their card is');
  console.log('in the app, under the server\'s address - or make one invitation');
  console.log('for each of them and use them yourself.');
}
