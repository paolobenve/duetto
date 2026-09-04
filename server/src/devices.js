/*
 * Duetto - a permanent voice and video channel for two people.
 * Copyright (C) 2026 Paolo Benvenuto
 *
 * Free software under the GNU General Public License, version 3 or any
 * later version, and with no warranty of any kind. The full text is in
 * the LICENSE file at the root of the project, and at
 * <https://www.gnu.org/licenses/>.
 */

import { existsSync, readFileSync, writeFileSync, renameSync, statSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import path from 'node:path';

/**
 * Who may come in, and who has been invited to.
 *
 * A phone is known by the public half of the key it made for itself.
 * Writing those by hand in the `.env` works for the two or three phones
 * of the person who owns the server, and stops working the moment
 * somebody else is to be let in: you would have to be at a keyboard,
 * with their key in front of you, at the moment they ask.
 *
 * So there is an invitation instead. It is a short code, made for one
 * person and spent once: whoever types it in gets the phone that used
 * it written down under the name the invitation carried. The identity
 * is not an address or a document - it is "the person I handed this to",
 * which is the same trust the pairing code between two phones is built
 * on.
 *
 * It all lives in one small file, written by the commands in tools/ and
 * read here. No database, nothing to keep running: a server for a
 * handful of people has a handful of lines.
 */

const FILE = process.env.DEVICES_FILE
  || path.join(process.cwd(), 'devices.json');

/** A week. Long enough to be handed over calmly, short enough to expire. */
const INVITE_DAYS = Number(process.env.INVITE_DAYS || 7);

const EMPTY = { devices: [], invitations: [], rooms: [] };

export function fileName() {
  return FILE;
}

/**
 * Reads the file, and puts up with it not being there.
 *
 * It is read at every knock rather than kept in memory: it is a few
 * hundred bytes, and this way taking a phone away takes effect at once
 * instead of at the next restart - which is the moment one wants it to.
 */
/**
 * The last reading, kept as long as the file has not moved.
 *
 * "Read at every knock" stays true in spirit - editing the file still
 * takes effect at once, because the file's own clock betrays the change
 * - but the price drops from three synchronous disk reads per join to
 * one cheap stat. It matters exactly once: after a restart, when every
 * phone knocks in the same second, and each of those reads used to
 * stall every other pair's messages.
 *
 * (Reads and writes here are all synchronous in a single process, so
 * there is no torn state to guard against: no locking is needed, only
 * this small memory.)
 */
let cached = null;
let cachedStamp = 0;

export function read() {
  try {
    if (!existsSync(FILE)) { cached = null; return { ...EMPTY }; }
    const stamp = statSync(FILE).mtimeMs;
    if (cached && stamp === cachedStamp) return cached;
    const parsed = JSON.parse(readFileSync(FILE, 'utf8'));
    cachedStamp = stamp;
    cached = {
      devices: Array.isArray(parsed.devices) ? parsed.devices : [],
      invitations: Array.isArray(parsed.invitations) ? parsed.invitations : [],
      rooms: Array.isArray(parsed.rooms) ? parsed.rooms : [],
    };
    return cached;
  } catch {
    // A broken file must not lock everybody out in silence: it is said
    // out loud, and the door falls back on what the .env says.
    console.warn(`[duetto] ${FILE} cannot be read: ignored`);
    console.warn('[duetto] (whose is it? the service reads it as its own user)');
    return { ...EMPTY };
  }
}

/**
 * Writes it whole, and never half: the temporary file takes the fall.
 *
 * A failure here must not bring the server down, and it did: a unit
 * with `ProtectSystem=strict` and nothing writable gives EROFS, the
 * exception went up uncaught, systemd restarted the process, the phone
 * knocked again and it fell over again - a loop that took the two
 * people talking with it. Whoever cannot write can still hold a
 * conversation up: what is lost is the memory of it, and that is worth
 * saying once, not dying for.
 *
 * The mode leaves the group in: the file is written by the service and
 * read by the commands in tools/, which are run by a person.
 */
export function write(data) {
  const temporary = `${FILE}.new`;
  try {
    writeFileSync(temporary, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o640 });
    renameSync(temporary, FILE);
    // The memory in read() must not outlive what it remembers.
    cached = null;
    return true;
  } catch (e) {
    console.warn(`[duetto] cannot write ${FILE}: ${e.message}`);
    console.warn('[duetto] the list is not being kept: see ReadWritePaths in the unit');
    // Here too: a change that could not be written must not live on in
    // the memory as though it had been.
    cached = null;
    return false;
  }
}

/**
 * A code made to be read out loud.
 *
 * Eight characters, in two groups, out of an alphabet with no O and no
 * I: on a phone's screen they are a zero and a one, and a code that has
 * to be dictated cannot afford a letter that is heard as a number.
 */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function makeCode() {
  const bytes = randomBytes(8);
  const letters = [...bytes].map((b) => ALPHABET[b % ALPHABET.length]);
  return `${letters.slice(0, 4).join('')}-${letters.slice(4).join('')}`;
}

export function addInvitation(name) {
  const data = read();
  const code = makeCode();
  data.invitations.push({
    code,
    name,
    made: new Date().toISOString(),
    expires: new Date(Date.now() + INVITE_DAYS * 86400_000).toISOString(),
  });
  write(data);
  return { code, days: INVITE_DAYS, devices: data.devices.length };
}

/** The invitation that this code opens, if it is still worth anything. */
function liveInvitation(data, code) {
  const said = String(code || '').trim().toUpperCase();
  if (!said) return null;
  const now = Date.now();
  return data.invitations.find((i) =>
    i.code === said && Date.parse(i.expires) > now) || null;
}

/**
 * Takes an invitation and writes the phone that used it down.
 *
 * The invitation goes at the same moment: it was for one phone, and the
 * one that got here first is that phone. Whoever passed the code on
 * finds it spent - which is the cheapest way of noticing that it was
 * passed on.
 */
export function useInvitation(code, pub, model = '') {
  const data = read();
  const invitation = liveInvitation(data, code);
  if (!invitation) return null;
  data.invitations = data.invitations.filter((i) => i.code !== invitation.code);
  data.devices = data.devices
    .filter((d) => d.pub !== pub)
    .concat({
      name: invitation.name,
      pub,
      model: model || undefined,
      since: new Date().toISOString(),
    });
  write(data);
  return invitation.name;
}

/** Takes an unused invitation back. */
export function removeInvitation(code) {
  const data = read();
  const said = String(code || '').trim().toUpperCase();
  const before = data.invitations.length;
  data.invitations = data.invitations.filter((i) => i.code !== said);
  if (data.invitations.length !== before) write(data);
  return before - data.invitations.length;
}

/**
 * What the phone says of itself, kept up to date.
 *
 * The name it was written down under is whatever it said at the door,
 * and a phone with no name set said nothing: "Someone" on the list, for
 * good, was the result. Now the name follows the phone - and a room's
 * owner is a name, so the rooms follow too - and the model is kept
 * beside it, which is what tells two phones of one person apart.
 *
 * Only the owner's phones are renamed. Somebody let in by an
 * invitation is on the list under the name the owner chose, which the
 * invitation promised would be theirs alone to see: what the invited
 * person calls themselves does not touch it.
 * Returns the name the phone is known by now, or null if unknown.
 */
export function refresh(pub, name, model) {
  const data = read();
  const known = data.devices.find((d) => d.pub === pub);
  if (!known) return null;
  let changed = false;
  if (name && name !== known.name && known.owner === true) {
    const old = known.name;
    known.name = name;
    for (const r of data.rooms) if (r.owner === old) r.owner = name;
    changed = true;
  }
  if (model && model !== known.model) {
    known.model = model;
    changed = true;
  }
  if (changed) write(data);
  return known.name;
}

/**
 * The phone that adopts a server nobody has claimed, or comes back to
 * one with the key of the server in hand.
 *
 * Setting a server up used to end at a command line: the first phone's
 * card had to be copied and written into the `.env` by hand, on the
 * server, and until then the door stood open to anybody. Now the first
 * phone to knock at a server with nobody on its list is written down
 * as its owner, and from that instant the door is shut for everybody
 * else. The same road brings a phone back when it has lost its card -
 * a reinstall makes a new one - as long as it carries the key of the
 * server: without it the owner would be locked out of their own house
 * with no way in but ssh.
 *
 * `owner` may hand out invitations; a guest brought in by one may not.
 */
export function adopt(name, pub, owner = true, model = '') {
  const data = read();
  data.devices = data.devices
    .filter((d) => d.pub !== pub)
    .concat({
      name,
      pub,
      owner: owner === true,
      model: model || undefined,
      since: new Date().toISOString(),
    });
  return write(data) ? name : null;
}

/**
 * The rooms of the people on the list, and who they let in.
 *
 * A connection lives in a room, and two phones live in a connection. If
 * one of them is on the list, the other is with them: it is written
 * down here, for that room and no other. So somebody invited can talk
 * to whoever they like - the person on the other side has nothing to
 * ask anybody - but that person cannot go and open rooms of their own:
 * their key is worth something in one room, and nowhere else.
 *
 * That is where the chain stops. Whoever you let in brings their own
 * people; their people bring nobody.
 */
export function roomOf(room) {
  return read().rooms.find((r) => r.room === room) || null;
}

/** Writes down that this room belongs to somebody on the list. */
export function noteRoom(room, owner) {
  const data = read();
  // The first one on the list who uses it owns it, and it does not
  // change hands: two people on the list can share a room - two phones
  // of the same person, say - and passing it back and forth at every
  // knock would only make the file restless.
  if (data.rooms.some((r) => r.room === room)) return;
  data.rooms.push({ room, owner, guest: null, since: new Date().toISOString() });
  write(data);
}

/** And that this phone is the other half of it. */
export function noteGuest(room, pub) {
  const data = read();
  const known = data.rooms.find((r) => r.room === room);
  if (!known || known.guest) return;
  known.guest = pub;
  write(data);
}

/** The name this key is written down under, or null. */
/**
 * A room its owner no longer has.
 *
 * A pair broken on the phone left its room on the server: the guest
 * written in it could still be let in, to a room the owner never
 * comes to. The owner's phone says so, and the room goes - with its
 * guest, whose key was worth something in that room alone.
 */
export function removeRoom(room, owner) {
  const data = read();
  const before = data.rooms.length;
  data.rooms = data.rooms.filter((r) => !(r.room === room && r.owner === owner));
  if (data.rooms.length !== before) write(data);
  return before - data.rooms.length;
}

export function nameOf(pub) {
  const found = read().devices.find((d) => d.pub === pub);
  return found ? found.name : null;
}

/** Takes a phone away: it is out at the next knock, with no restart. */
export function remove(name) {
  const data = read();
  const before = data.devices.length;
  data.devices = data.devices.filter((d) => d.name !== name);
  data.invitations = data.invitations.filter((i) => i.name !== name);
  // Their rooms go with them, and the people they had brought along:
  // those keys were worth something in those rooms alone, and the rooms
  // are not there any more.
  data.rooms = data.rooms.filter((r) => r.owner !== name);
  write(data);
  return before - data.devices.length;
}
