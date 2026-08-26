import nacl from 'tweetnacl';
import { decodeUTF8, encodeBase64, decodeBase64 } from 'tweetnacl-util';

/**
 * Pairing the two phones.
 *
 * Whoever creates the pair gets an eight-digit NUMERIC CODE. The other
 * one types it in. From that moment the two are paired for good and the
 * code is of no further use.
 *
 * The code is NEVER sent to the server: all the server sees is
 * `pairId`, a fingerprint of the code, which is what brings the two of
 * you into the same room.
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

export const keyToBase64 = (k: Uint8Array) => encodeBase64(k);
export const keyFromBase64 = (s: string) => decodeBase64(s);
export const pubToBase64 = (k: Uint8Array) => encodeBase64(k);
export const pubFromBase64 = (s: string) => decodeBase64(s);
