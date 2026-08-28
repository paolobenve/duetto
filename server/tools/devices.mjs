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
 * Who is on the list, and who is invited.
 *
 *   npm run devices                 what there is
 *   npm run devices -- --remove anna   takes a phone away, at once
 *
 * Taking one away needs no restart: the list is read at every knock.
 */
import { fileName, read, remove } from '../src/devices.js';

const args = process.argv.slice(2);
const cut = args.indexOf('--remove');

if (cut >= 0) {
  const name = args[cut + 1];
  if (!name) {
    console.error('use: npm run devices -- --remove NAME');
    process.exit(1);
  }
  const gone = remove(name);
  console.log(gone
    ? `${name}: ${gone} phone(s) taken off the list, and out at the next knock.`
    : `${name}: nobody by that name on the list.`);
  process.exit(0);
}

const { devices, invitations, rooms } = read();
console.log(`${fileName()}\n`);

if (devices.length === 0) console.log('No phone on the list: the door is open.');
else {
  console.log('Phones on the list:');
  for (const d of devices) {
    const card = d.pub.length > 16 ? `${d.pub.slice(0, 8)}…${d.pub.slice(-6)}` : d.pub;
    // How many connections they have opened, and how many of those
    // brought somebody along. There is no ceiling on this - a phone is
    // in one connection at a time, so many rooms cost sockets and not
    // conversations - but a strange number is worth seeing.
    const theirs = rooms.filter((r) => r.owner === d.name);
    const brought = theirs.filter((r) => r.guest).length;
    const also = theirs.length
      ? `   ${theirs.length} connection(s), ${brought} with somebody along`
      : '';
    console.log(`  ${d.name.padEnd(12)} ${card}   since ${d.since.slice(0, 10)}${also}`);
  }
}

const live = invitations.filter((i) => Date.parse(i.expires) > Date.now());
if (live.length > 0) {
  console.log('\nInvitations not yet used:');
  for (const i of live) {
    console.log(`  ${i.code}   for ${i.name}, until ${i.expires.slice(0, 10)}`);
  }
}
