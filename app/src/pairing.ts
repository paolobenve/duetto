import nacl from 'tweetnacl';
import { decodeUTF8, encodeBase64, decodeBase64 } from 'tweetnacl-util';

/**
 * Accoppiamento fra i due telefoni.
 *
 * Chi crea la coppia riceve un CODICE NUMERICO di 8 cifre. L'altro lo
 * digita. Da quel momento i due sono accoppiati per sempre e il codice
 * non serve più.
 *
 * Il codice NON viene mai inviato al server: al server arriva solo
 * `pairId`, un'impronta del codice, che serve a farvi incontrare nella
 * stessa stanza.
 *
 * La chiave non si ricava dal codice: i due telefoni fanno uno scambio
 * Diffie-Hellman (X25519) e mescolano il codice nel risultato. Quindi:
 *  - chi ascolta non può calcolare la chiave (non ha i segreti privati);
 *  - chi volesse mettersi in mezzo dovrebbe conoscere il codice, e la
 *    verifica finale lo smaschererebbe;
 *  - finito l'accoppiamento la chiave è a 256 bit e la debolezza del
 *    codice non conta più nulla.
 *
 * COSTO DEL CALCOLO DI pairId
 * Otto cifre sono solo 100 milioni di combinazioni: chi vede pairId
 * potrebbe provarle tutte e risalire al codice. Rendere il calcolo lento
 * alza quel costo, ma lo alza anche per noi, e un'attesa di dieci secondi
 * a ogni accoppiamento non è accettabile.
 *
 * Il compromesso scelto: poche migliaia di giri, circa un terzo di
 * secondo sul telefono, che moltiplicano comunque per qualche migliaio il
 * costo di chi tenta. La difesa contro chi prova codici a tappeto sta
 * altrove, ed è più efficace: il server limita il numero di tentativi
 * nel tempo, e l'app impone un'attesa prima di riprovare.
 *
 * Resta un limite dichiarato: un server ostile, che vede pairId, potrebbe
 * risalire al codice con abbastanza potenza di calcolo e inserirsi
 * DURANTE l'accoppiamento. Dopo, la chiave è a 256 bit e non serve più a
 * nulla. Se questo dovesse preoccupare, la contromisura è allungare il
 * codice, non rallentare il calcolo.
 */

const CODE_DIGITS = 8;

/** Quanto rendere costoso risalire al codice da pairId (vedi sopra). */
const KDF_ROUNDS = 6_000;
/** Ogni quanti giri cedere il controllo, per non congelare l'interfaccia. */
const KDF_CHUNK = 1_000;

/** Genera un codice numerico, uniforme (niente modulo sbilanciato). */
export function generateCode(): string {
  let out = '';
  while (out.length < CODE_DIGITS) {
    for (const b of nacl.randomBytes(CODE_DIGITS)) {
      // Scarta 250-255: userebbero le cifre 0-5 più spesso delle altre.
      if (b >= 250) continue;
      out += String(b % 10);
      if (out.length === CODE_DIGITS) break;
    }
  }
  return out;
}

/** Tiene solo le cifre di quello che l'utente ha digitato. */
export function normalizeCode(raw: string): string {
  return (raw || '').replace(/\D/g, '').slice(0, CODE_DIGITS);
}

export function isCodeComplete(raw: string): boolean {
  return normalizeCode(raw).length === CODE_DIGITS;
}

/** Come mostrarlo: "12345678" -> "1234 5678", più facile da dettare. */
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
 * Identificativo della coppia: l'unica cosa che il server vede.
 * Il calcolo è reso un po' costoso di proposito (vedi sopra).
 * Asincrono per non bloccare l'interfaccia mentre gira.
 */
export async function pairIdFromCode(code: string): Promise<string> {
  const clean = normalizeCode(code);
  let h = sha512(label('duetto-pair-id|'), label(clean));
  for (let i = 0; i < KDF_ROUNDS; i++) {
    h = nacl.hash(h);
    // Ogni tanto restituiamo il controllo al ciclo di eventi, così
    // l'indicatore di attesa continua ad animarsi.
    if (i % KDF_CHUNK === 0) await new Promise<void>((r) => setTimeout(() => r(), 0));
  }
  return encodeBase64(h.slice(0, 16)).replace(/[+/=]/g, '');
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
 * Qui non serve rallentare nulla: il segreto Diffie-Hellman è già
 * casuale a 256 bit, e senza di quello il codice non basta.
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
 * Prova di possesso della chiave, diversa per i due lati così nessuno
 * può rimandare indietro quella dell'altro. Se non combacia, il codice
 * digitato è sbagliato (o qualcuno sta provando a intromettersi).
 */
export function confirmationFor(key: Uint8Array, side: 'A' | 'B'): string {
  return encodeBase64(sha512(label(`duetto-confirm|${side}|`), key).slice(0, 16));
}

export const keyToBase64 = (k: Uint8Array) => encodeBase64(k);
export const keyFromBase64 = (s: string) => decodeBase64(s);
export const pubToBase64 = (k: Uint8Array) => encodeBase64(k);
export const pubFromBase64 = (s: string) => decodeBase64(s);
