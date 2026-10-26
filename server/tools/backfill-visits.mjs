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
 * The days counted before the server counted them, read from its log.
 *
 *   journalctl -u duetto-signaling --no-pager -o short-iso \
 *     | grep -E ' (in|out of) room ' | npm run --silent backfill-visits
 *                                                 what it would write
 *   ... | npm run --silent backfill-visits -- --write   and writes it
 *
 * The owner's list says, of each phone, on how many days it came and
 * on how many it found the other (see noteVisit in src/devices.js); a
 * server that has just learnt to count would say "never connected" of
 * people who have been talking for a month. The log has a line for
 * every coming in and going out, with how many are in the room after
 * it - "Anna in room AbCd… (2 in, active)", "Anna+ out of room AbCd…
 * (dropped, 1 left)", "Anna+" being the guest of Anna's room - and from
 * those the room's days are rebuilt: a pair that kept its sockets for
 * three days has a line on the first only, and was there on all three.
 * A restart of the server - a new process number - empties the rooms.
 *
 * Meant to be run once, right after the update; run again it does no
 * harm: a day is a day however many times it is read, and what the
 * server has counted by itself is never lowered.
 */
import { createInterface } from 'node:readline';
import { fileName, read, write } from '../src/devices.js';

const writing = process.argv.includes('--write');
const LINE = /^(\S+) \S+ node\[(\d+)\]: \[duetto\] (.+?)\+? (?:in|out of) room (\S+?)… \((?:[a-z-]+, )?(\d+) (?:in|left)/;
const DAY_MS = 86400_000;
const dayOf = (ms) => new Date(ms).toISOString().slice(0, 10);

/** room -> { names, occupied, since, days, met } */
const rooms = new Map();
const roomOf = (id) => {
  if (!rooms.has(id)) {
    rooms.set(id, { names: new Set(), occupied: 0, since: 0, days: new Set(), met: new Set() });
  }
  return rooms.get(id);
};
/** The days from `since` to `until` (UTC's), counted with what the room held. */
function fill(r, until) {
  if (!r.occupied || !r.since) return;
  for (let t = r.since; ; t += DAY_MS) {
    const day = dayOf(Math.min(t, until));
    r.days.add(day);
    if (r.occupied >= 2) r.met.add(day);
    if (day >= dayOf(until)) break;
  }
}
function settle(r, at, occupied) {
  fill(r, at);
  r.occupied = occupied;
  r.since = at;
  fill(r, at);
}

let lines = 0;
let process_ = '';
for await (const line of createInterface({ input: process.stdin })) {
  const m = LINE.exec(line);
  if (!m) continue;
  const [, stamp, pid, name, id, count] = m;
  const at = Date.parse(stamp);
  if (Number.isNaN(at)) continue;
  lines += 1;
  // A restart: every socket went with the old process.
  if (pid !== process_) {
    for (const r of rooms.values()) settle(r, at, 0);
    process_ = pid;
  }
  const r = roomOf(id);
  r.names.add(name);
  settle(r, at, Number(count));
}
// The rooms still held, up to now.
for (const r of rooms.values()) settle(r, Date.now(), r.occupied);

/** name -> { days, met }: a room's days go to everybody on the list seen in it */
const seen = new Map();
for (const r of rooms.values()) {
  for (const name of r.names) {
    if (!seen.has(name)) seen.set(name, { days: new Set(), met: new Set() });
    const e = seen.get(name);
    for (const d of r.days) e.days.add(d);
    for (const d of r.met) e.met.add(d);
  }
}

const data = read();
console.log(`${fileName()}: ${lines} lines read\n`);
for (const d of data.devices) {
  const e = seen.get(d.name) || { days: new Set(), met: new Set() };
  // What the server counted by itself since the update: its last day
  // is in the log too, unless the log does not reach it.
  if (d.lastDay) e.days.add(d.lastDay);
  if (d.lastMet) e.met.add(d.lastMet);
  const days = [...e.days].sort();
  const met = [...e.met].sort();
  d.days = Math.max(d.days || 0, days.length);
  d.met = Math.max(d.met || 0, met.length);
  if (days.length) d.lastDay = days[days.length - 1];
  if (met.length) {
    d.firstMet = d.firstMet && d.firstMet < met[0] ? d.firstMet : met[0];
    d.lastMet = met[met.length - 1];
  }
  console.log(`${d.name.padEnd(24)} days ${String(d.days).padStart(3)}  together ${String(d.met).padStart(3)}`
    + `  ${d.lastMet ? `last together ${d.lastMet}` : d.days ? 'never together' : 'never in'}`);
}

if (!writing) {
  console.log('\nNothing written: add --write to keep it.');
} else if (write(data)) {
  console.log('\nWritten.');
} else {
  console.error('\nNot written: see the warning above.');
  process.exit(1);
}
