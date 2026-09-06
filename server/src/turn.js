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
 * A relay user per phone.
 *
 * With one credential shared by everybody, whoever takes it out of a
 * phone keeps the relay for good, and a phone taken off the list keeps
 * it too. So each phone gets a user of its own in coturn's database -
 * made the first time it is let in, dropped when it goes - and is
 * handed its own credentials with `joined`. Coturn reads its database
 * at every request: no restart, and a dropped user is out at once.
 *
 * The making and the dropping go through a small script with sudo
 * (deploy/duetto-turnuser), named by TURN_ADMIN_CMD; without it, or
 * while the user is not made yet, the shared credential stands in.
 */
import { execFile } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { forgetTurn, noteTurn, turnOf } from './devices.js';

const CMD = (process.env.TURN_ADMIN_CMD || '').trim();

/** The user's name: a piece of the card's fingerprint, letters and figures only. */
export function userFor(pub) {
  return createHash('sha256').update(String(pub)).digest('hex').slice(0, 12);
}

function run(args) {
  return new Promise((resolve, reject) => {
    const [cmd, ...head] = CMD.split(/\s+/).filter(Boolean);
    execFile(cmd, [...head, ...args], { timeout: 10_000 }, (e, out, err) => {
      if (e) reject(new Error(String(err || e.message).trim().split('\n')[0]));
      else resolve(out);
    });
  });
}

const making = new Set();

/**
 * The credentials of this phone, if it has them; null otherwise - and
 * then they are made in the background, for the next time.
 */
export function credentialsFor(pub) {
  if (!CMD || !pub) return null;
  const known = turnOf(pub);
  if (known) return { username: known.user, credential: known.pass };
  make(pub);
  return null;
}

function make(pub) {
  if (making.has(pub)) return;
  making.add(pub);
  const user = userFor(pub);
  const pass = randomBytes(24).toString('base64').replace(/[^A-Za-z0-9]/g, '').slice(0, 24);
  run(['add', user, pass]).then(() => {
    noteTurn(pub, user, pass);
    console.log(`[duetto] relay user made for phone ${pub.slice(0, 12)}…`);
  }).catch((e) => {
    console.warn(`[duetto] relay user not made (${e.message}): the shared one stands in`);
  }).finally(() => making.delete(pub));
}

/** The phone is gone: its relay user goes with it. */
export function drop(pub) {
  if (!CMD || !pub) return;
  const known = turnOf(pub);
  forgetTurn(pub);
  run(['del', known ? known.user : userFor(pub)]).then(() => {
    console.log(`[duetto] relay user dropped for phone ${pub.slice(0, 12)}…`);
  }).catch((e) => {
    console.warn(`[duetto] relay user not dropped (${e.message})`);
  });
}
