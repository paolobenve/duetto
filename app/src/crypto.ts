import nacl from 'tweetnacl';
import { decodeUTF8, encodeUTF8, encodeBase64, decodeBase64 } from 'tweetnacl-util';

/**
 * Cifratura simmetrica autenticata dei messaggi di signaling.
 *
 * Usiamo NaCl secretbox (XSalsa20-Poly1305):
 *  - chiave a 32 byte, quella stabilita durante l'accoppiamento
 *  - nonce casuale a 24 byte per ogni messaggio
 *  - il ciphertext e' anche AUTENTICATO: se il server (o chiunque)
 *    modifica un solo byte, la decifratura fallisce.
 *
 * Cosi' il server e' un semplice inoltratore di buste opache e non puo'
 * fare man-in-the-middle sui parametri WebRTC (fingerprint DTLS).
 *
 * La chiave NON deriva da una passphrase digitata: nasce dallo scambio
 * Diffie-Hellman fatto all'accoppiamento (vedi pairing.ts), quindi e'
 * casuale a 256 bit e non attaccabile per tentativi.
 */
export class SignalCrypto {
  private readonly key: Uint8Array;

  constructor(key: Uint8Array | string) {
    const k = typeof key === 'string' ? decodeBase64(key) : key;
    if (k.length !== nacl.secretbox.keyLength) {
      throw new Error(`chiave di lunghezza errata: ${k.length}`);
    }
    this.key = k;
  }

  /** Cifra un oggetto JSON -> stringa base64 (nonce || ciphertext). */
  seal(obj: unknown): string {
    const plain = decodeUTF8(JSON.stringify(obj));
    const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
    const box = nacl.secretbox(plain, nonce, this.key);
    const out = new Uint8Array(nonce.length + box.length);
    out.set(nonce, 0);
    out.set(box, nonce.length);
    return encodeBase64(out);
  }

  /** Decifra base64 -> oggetto JSON. Null se l'autenticazione fallisce. */
  open<T = unknown>(b64: string): T | null {
    try {
      const data = decodeBase64(b64);
      const nonce = data.slice(0, nacl.secretbox.nonceLength);
      const box = data.slice(nacl.secretbox.nonceLength);
      const plain = nacl.secretbox.open(box, nonce, this.key);
      if (!plain) return null;
      return JSON.parse(encodeUTF8(plain)) as T;
    } catch {
      return null;
    }
  }
}
