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
import { decodeBase64, decodeUTF8, encodeBase64 } from 'tweetnacl-util';

/**
 * The phone's signature at a server's door.
 *
 * At every connection the server picks a number and the phone signs it:
 * that is how the server knows which phone this is. But the bare number
 * signed is good at any door: a server could hand this phone the number
 * another server had just picked, and walk in there with the answer - as
 * this phone, an owner's included. A server that says door 2 in its
 * hello is signed the second way: its name, as this phone dialed it,
 * goes in with the number, and the signature is good at that house only.
 * An older server, which knows no other, still gets the bare number.
 *
 * The server's side is `signed`, in server/src/index.js.
 */

/** What the second way signs. */
export function doorWords(nonce: string, host: string): Uint8Array {
  return decodeUTF8(`duetto-door-v2|${host}|${nonce}`);
}

/**
 * The server's name as dialed: the host of its address, in lowercase,
 * without a port - the same house, whatever the port.
 */
export function hostOf(serverUrl: string): string {
  const m = /^[a-z][a-z0-9+.-]*:\/\/([^/?#]+)/i.exec((serverUrl || '').trim());
  if (!m) return '';
  const authority = m[1].replace(/^.*@/, '');
  const host = authority.startsWith('[')
    ? authority.slice(0, authority.indexOf(']') + 1)
    : authority.replace(/:\d*$/, '');
  return host.toLowerCase();
}

/** The card's signature for this connection, and how it was made. */
export function signAtDoor(
  secretKey: string, nonce: string, serverUrl: string, door: unknown,
): { sig: string; sigv?: 2; host?: string } {
  const sec = decodeBase64(secretKey);
  if (door === 2) {
    const host = hostOf(serverUrl);
    return { sig: encodeBase64(nacl.sign.detached(doorWords(nonce, host), sec)), sigv: 2, host };
  }
  return { sig: encodeBase64(nacl.sign.detached(decodeBase64(nonce), sec)) };
}
