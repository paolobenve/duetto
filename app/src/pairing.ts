import nacl from 'tweetnacl';
import { decodeUTF8, encodeBase64, decodeBase64 } from 'tweetnacl-util';

/**
 * Accoppiamento fra i due telefoni.
 *
 * Chi crea la coppia genera un CODICE. L'altro lo digita. Da quel
 * momento i due sono accoppiati per sempre e il codice non serve piu'.
 *
 * Il codice NON viene mai inviato al server: al server arriva solo
 * `pairId`, cioe' un'impronta del codice, che serve solo a farvi
 * incontrare nella stessa stanza.
 *
 * La chiave di cifratura non si ricava dal solo codice: i due telefoni
 * fanno uno scambio Diffie-Hellman (X25519) e mescolano il codice nel
 * risultato. Cosi':
 *  - un server che ascolta non puo' calcolare la chiave (non ha i
 *    segreti privati);
 *  - un server che prova a mettersi in mezzo non puo' farlo, perche'
 *    non conosce il codice e la verifica finale fallirebbe;
 *  - finito l'accoppiamento la chiave e' a 256 bit e la forza del
 *    codice non conta piu' nulla.
 */

/** Alfabeto senza caratteri confondibili (niente 0/O, 1/I/L). */
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const CODE_LEN = 8; // ~39 bit: abbastanza, visto che serve solo ad autenticare

/** Genera un codice del tipo "K7M2-9QXF". */
export function generateCode(): string {
  const bytes = nacl.randomBytes(CODE_LEN);
  let out = '';
  for (let i = 0; i < CODE_LEN; i++) {
    out += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return `${out.slice(0, 4)}-${out.slice(4)}`;
}

/** Ripulisce quello che l'utente ha digitato: maiuscole, niente trattini. */
export function normalizeCode(raw: string): string {
  return (raw || '')
    .toUpperCase()
    .split('')
    .filter((c) => ALPHABET.includes(c))
    .join('');
}

export function isCodeComplete(raw: string): boolean {
  return normalizeCode(raw).length === CODE_LEN;
}

/** Come mostrarlo all'utente: "K7M29QXF" -> "K7M2-9QXF". */
export function formatCode(raw: string): string {
  const c = normalizeCode(raw);
  return c.length > 4 ? `${c.slice(0, 4)}-${c.slice(4)}` : c;
}

function sha512(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const buf = new Uint8Array(total);
  let at = 0;
  for (const p of parts) { buf.set(p, at); at += p.length; }
  return nacl.hash(buf);
}

const label = (s: string) => decodeUTF8(s);

/**
 * Identificativo della coppia: e' l'UNICA cosa che il server vede.
 * Da qui non si risale al codice in tempo utile, e comunque il codice
 * da solo non basta per la chiave.
 */
export function pairIdFromCode(code: string): string {
  const h = sha512(label('duotalk-pair-id|'), label(normalizeCode(code)));
  return encodeBase64(h.slice(0, 16)).replace(/[+/=]/g, '');
}

/**
 * Topic ntfy dei due lati, ricavati dal codice: il server li conosce
 * solo perche' glieli diciamo noi, non perche' possa indovinarli.
 */
export function topicFromCode(code: string, side: 'A' | 'B'): string {
  const h = sha512(label(`duotalk-ntfy|${side}|`), label(normalizeCode(code)));
  const s = encodeBase64(h.slice(0, 12)).replace(/[+/=]/g, '');
  return `duotalk-${s.toLowerCase()}`;
}

// --- Scambio di chiavi ------------------------------------------------------

export type PairKeys = {
  publicKey: Uint8Array;
  secretKey: Uint8Array;
};

export function newKeyPair(): PairKeys {
  const kp = nacl.box.keyPair();
  return { publicKey: kp.publicKey, secretKey: kp.secretKey };
}

/**
 * Chiave condivisa = KDF(segreto Diffie-Hellman, codice).
 * Senza il codice il risultato e' diverso: e' questo che impedisce a un
 * server di mettersi in mezzo.
 */
export function deriveSharedKey(
  mySecret: Uint8Array,
  theirPublic: Uint8Array,
  code: string,
): Uint8Array {
  const dh = nacl.scalarMult(mySecret, theirPublic);
  return sha512(label('duotalk-key|'), dh, label('|'), label(normalizeCode(code)))
    .slice(0, nacl.secretbox.keyLength);
}

/**
 * Prova di possesso della chiave, diversa per i due lati cosi' nessuno
 * puo' rimandare indietro quella dell'altro. Se non combacia, il codice
 * digitato e' sbagliato (o qualcuno sta provando a intromettersi).
 */
export function confirmationFor(key: Uint8Array, side: 'A' | 'B'): string {
  return encodeBase64(sha512(label(`duotalk-confirm|${side}|`), key).slice(0, 16));
}

export const keyToBase64 = (k: Uint8Array) => encodeBase64(k);
export const keyFromBase64 = (s: string) => decodeBase64(s);
export const pubToBase64 = (k: Uint8Array) => encodeBase64(k);
export const pubFromBase64 = (s: string) => decodeBase64(s);
