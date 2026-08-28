/*
 * Duetto - a permanent voice and video channel for two people.
 * Copyright (C) 2026 Paolo Benvenuto
 *
 * Free software under the GNU General Public License, version 3 or any
 * later version, and with no warranty of any kind. The full text is in
 * the LICENSE file at the root of the project, and at
 * <https://www.gnu.org/licenses/>.
 */

import { existsSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
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

const EMPTY = { devices: [], invitations: [] };

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
export function read() {
  try {
    if (!existsSync(FILE)) return { ...EMPTY };
    const parsed = JSON.parse(readFileSync(FILE, 'utf8'));
    return {
      devices: Array.isArray(parsed.devices) ? parsed.devices : [],
      invitations: Array.isArray(parsed.invitations) ? parsed.invitations : [],
    };
  } catch {
    // A broken file must not lock everybody out in silence: it is said
    // out loud, and the door falls back on what the .env says.
    console.warn(`[duetto] ${FILE} is unreadable: ignored`);
    return { ...EMPTY };
  }
}

/** Writes it whole, and never half: the temporary file takes the fall. */
export function write(data) {
  const temporary = `${FILE}.new`;
  writeFileSync(temporary, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 });
  renameSync(temporary, FILE);
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
export function useInvitation(code, pub) {
  const data = read();
  const invitation = liveInvitation(data, code);
  if (!invitation) return null;
  data.invitations = data.invitations.filter((i) => i.code !== invitation.code);
  data.devices = data.devices
    .filter((d) => d.pub !== pub)
    .concat({
      name: invitation.name,
      pub,
      since: new Date().toISOString(),
    });
  write(data);
  return invitation.name;
}

/** The name this key is written down under, or null. */
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
  write(data);
  return before - data.devices.length;
}
