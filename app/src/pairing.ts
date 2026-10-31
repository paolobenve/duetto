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
import { decodeUTF8, encodeBase64, decodeBase64 } from 'tweetnacl-util';

/**
 * Pairing the two phones.
 *
 * Whoever creates the pair gets an eight-digit NUMERIC CODE. The other
 * one types it in. From that moment the two are paired for good and the
 * code is of no further use.
 *
 * The app never sends the code to the server: all it says is `pairId`,
 * a fingerprint of the code, which is what brings the two of you into
 * the same room. A link opened in a browser shows the code to the
 * server's page, though - see "The link's secret" below.
 *
 * The key is not derived from the code: the two phones do a
 * Diffie-Hellman exchange (X25519) and stir the code into the result.
 * So:
 *  - a listener cannot work out the key (they do not have the private
 *    halves);
 *  - anybody wanting to sit in the middle would have to know the code,
 *    and the final check would give them away;
 *  - once pairing is done the key is 256 bits and the weakness of the
 *    code no longer matters at all.
 *
 * THE COST OF COMPUTING pairId
 * Eight digits are only a hundred million combinations: whoever sees
 * pairId could try them all and get back to the code. Making the
 * computation slow raises that cost, but it raises ours too, and ten
 * seconds of waiting at every pairing is not acceptable.
 *
 * The compromise: a few thousand rounds, about a third of a second on
 * the phone, which still multiply the attacker's cost by some
 * thousands. The defence against somebody trying codes wholesale lives
 * elsewhere, and works better: the server limits how many attempts fit
 * in a given time, and the app makes you wait before trying again.
 *
 * One limit stays, and is stated rather than hidden: a hostile server,
 * which sees pairId, could get back to the code with enough computing
 * power and slip in DURING pairing. Afterwards the key is 256 bits and
 * the code is worthless. If that ever became a worry, the answer is a
 * longer code, not a slower computation.
 */

const CODE_DIGITS = 8;

/** How costly it should be to get back to the code from pairId (see above). */
const KDF_ROUNDS = 6_000;
/** How often to yield, so the interface does not freeze. */
const KDF_CHUNK = 1_000;

/** Makes a numeric code, evenly spread (no lopsided modulo). */
export function generateCode(): string {
  let out = '';
  while (out.length < CODE_DIGITS) {
    for (const b of nacl.randomBytes(CODE_DIGITS)) {
      // Throw 250-255 away: they would use the digits 0-5 more often.
      if (b >= 250) continue;
      out += String(b % 10);
      if (out.length === CODE_DIGITS) break;
    }
  }
  return out;
}

/** Keeps only the digits of whatever was typed. */
export function normalizeCode(raw: string): string {
  return (raw || '').replace(/\D/g, '').slice(0, CODE_DIGITS);
}

export function isCodeComplete(raw: string): boolean {
  return normalizeCode(raw).length === CODE_DIGITS;
}

/** How to show it: "12345678" -> "1234 5678", easier to read out. */
export function formatCode(raw: string): string {
  const c = normalizeCode(raw);
  return c.length > 4 ? `${c.slice(0, 4)} ${c.slice(4)}` : c;
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const buf = new Uint8Array(total);
  let at = 0;
  for (const p of parts) { buf.set(p, at); at += p.length; }
  return buf;
}

const sha512 = (...parts: Uint8Array[]) => nacl.hash(concat(...parts));
const label = (s: string) => decodeUTF8(s);

/**
 * The pair's identifier: the only thing the server gets to see.
 *
 * The computation is made somewhat costly on purpose (see above), and
 * is asynchronous so the interface does not freeze while it runs.
 */
export async function pairIdFromCode(code: string): Promise<string> {
  const clean = normalizeCode(code);
  let h = sha512(label('duetto-pair-id|'), label(clean));
  for (let i = 0; i < KDF_ROUNDS; i++) {
    h = nacl.hash(h);
    // Every so often hand control back to the event loop, so the
    // spinner keeps turning.
    if (i % KDF_CHUNK === 0) await new Promise<void>((r) => setTimeout(() => r(), 0));
  }
  return encodeBase64(h.slice(0, 16)).replace(/[+/=]/g, '');
}

// --- Key exchange -----------------------------------------------------------

export type PairKeys = {
  publicKey: Uint8Array;
  secretKey: Uint8Array;
};

export function newKeyPair(): PairKeys {
  const kp = nacl.box.keyPair();
  return { publicKey: kp.publicKey, secretKey: kp.secretKey };
}

/**
 * Shared key = KDF(Diffie-Hellman secret, code).
 *
 * Nothing needs slowing down here: the Diffie-Hellman secret is already
 * 256 random bits, and without it the code is not enough.
 */
export function deriveSharedKey(
  mySecret: Uint8Array,
  theirPublic: Uint8Array,
  code: string,
): Uint8Array {
  const dh = nacl.scalarMult(mySecret, theirPublic);
  return sha512(label('duetto-key|'), dh, label('|'), label(normalizeCode(code)))
    .slice(0, nacl.secretbox.keyLength);
}

/**
 * Proof that the key is held, different for the two sides so that
 * neither can echo the other's back. If it does not match, the typed
 * code is wrong - or somebody is trying to get in between.
 */
export function confirmationFor(key: Uint8Array, side: 'A' | 'B'): string {
  return encodeBase64(sha512(label(`duetto-confirm|${side}|`), key).slice(0, 16));
}

// --- The link's secret ------------------------------------------------------

/*
 * A link handed over is opened in a browser, and the browser asks the
 * server for the page: the server reads the path, and with it the code
 * and the maker's key - all that the pair's key used to be made of. And
 * the code comes back from pairId too, with enough computing (see the
 * top of this file). What follows a '#' no browser ever sends. So a
 * link carries one more thing there, 128 random bits, and they go into
 * the pair's key: whoever has the code and the maker's key, the server
 * included, still cannot make it.
 *
 * Two more things come from the same secret:
 *  - the proof a letter carries: without it the maker takes no letter,
 *    where a letter for the wrong key used to make a pair with nobody;
 *  - the token for the seat a waiting room keeps: the maker leaves the
 *    server a check of it, the phone that opened the link says the
 *    token itself, and nobody else sits there while the maker is away.
 *
 * Digits read out and typed carry none: that exchange stays the old
 * one, live, with both phones there, and so do its limits.
 */
const LINK_SECRET_BYTES = 16;

const toUrl64 = (b: Uint8Array) => encodeBase64(b).replace(/\+/g, '-').replace(/\//g, '_').replace(/[=]+$/, '');
const fromUrl64 = (s: string) => {
  const b = s.replace(/-/g, '+').replace(/_/g, '/');
  return decodeBase64(b + '='.repeat((4 - (b.length % 4)) % 4));
};

/** A secret is 22 characters of base64url: 16 bytes, as a link carries it. */
export function isLinkSecret(s: unknown): s is string {
  return typeof s === 'string' && /^[A-Za-z0-9_-]{22}$/.test(s);
}

export function newLinkSecret(): string {
  return toUrl64(nacl.randomBytes(LINK_SECRET_BYTES));
}

/**
 * Shared key = KDF(Diffie-Hellman secret, code, link's secret), or the
 * old one where there is no secret: a code read out, or a link made by
 * an app from before.
 */
export function pairKey(
  mySecret: Uint8Array,
  theirPublic: Uint8Array,
  code: string,
  linkSecret?: string,
): Uint8Array {
  if (!linkSecret) return deriveSharedKey(mySecret, theirPublic, code);
  if (!isLinkSecret(linkSecret)) throw new Error('not a link secret');
  const dh = nacl.scalarMult(mySecret, theirPublic);
  return sha512(
    label('duetto-key-linked|'), dh, label('|'), label(normalizeCode(code)), label('|'), fromUrl64(linkSecret),
  ).slice(0, nacl.secretbox.keyLength);
}

/** The token for the waiting room's seat, said by the phone that opened the link. */
export function seatToken(linkSecret: string): string {
  return toUrl64(sha512(label('duetto-seat|'), fromUrl64(linkSecret)).slice(0, 16));
}

/**
 * What the maker leaves with the server to know that token when it is
 * said: its hash, which does not turn back into it. The server checks
 * it the same way, with SHA-512 (see the server's index.js).
 */
export function seatCheck(token: string): string {
  return toUrl64(nacl.hash(fromUrl64(token)).slice(0, 16));
}

/** Whether a letter's proof was made with this key: the other side's word. */
export function letterProves(key: Uint8Array, proof: unknown): boolean {
  return typeof proof === 'string' && proof === confirmationFor(key, 'B');
}

export const keyToBase64 = (k: Uint8Array) => encodeBase64(k);
export const keyFromBase64 = (s: string) => decodeBase64(s);
export const pubToBase64 = (k: Uint8Array) => encodeBase64(k);
export const pubFromBase64 = (s: string) => decodeBase64(s);

/**
 * The pair, from the other half's letter.
 *
 * The maker kept the secret half of the pair made for the code; the
 * letter brings the other phone's public half and its name. The shared
 * key is the same one a live exchange would have made. A link with its
 * secret puts the secret into the key; a link without one - the kind
 * every app made until now - does not, and a letter for it is taken
 * without a proof, as before: a letter for the wrong key simply makes
 * a key nobody else has.
 */
export function pairFromLetter(
  mine: { id: string; sec: string; code: string; secret?: string },
  theirPub: string,
  theirName: string,
  side: 'A' | 'B',
): { id: string; key: string; side: 'A' | 'B'; peerName: string; pairedAt: string } {
  const key = pairKey(keyFromBase64(mine.sec), pubFromBase64(theirPub), mine.code, mine.secret);
  return {
    id: mine.id,
    key: keyToBase64(key),
    side,
    peerName: theirName || '',
    pairedAt: new Date().toISOString(),
  };
}
