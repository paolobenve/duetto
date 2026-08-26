import nacl from 'tweetnacl';
import { decodeUTF8, encodeUTF8, encodeBase64, decodeBase64 } from 'tweetnacl-util';

/**
 * Authenticated symmetric encryption of the signalling messages.
 *
 * NaCl secretbox (XSalsa20-Poly1305):
 *  - a 32-byte key, the one settled during pairing;
 *  - a random 24-byte nonce for every message;
 *  - the ciphertext is AUTHENTICATED as well: if the server - or
 *    anybody else - changes a single byte, decryption fails.
 *
 * This way the server is a plain forwarder of opaque envelopes, and
 * cannot sit in the middle of the WebRTC parameters (the DTLS
 * fingerprints).
 *
 * The key does NOT come from a typed passphrase: it comes out of the
 * Diffie-Hellman exchange done while pairing (see pairing.ts), so it is
 * 256 random bits and cannot be guessed by trying.
 */
export class SignalCrypto {
  private readonly key: Uint8Array;

  constructor(key: Uint8Array | string) {
    const k = typeof key === 'string' ? decodeBase64(key) : key;
    if (k.length !== nacl.secretbox.keyLength) {
      throw new Error(`wrong key length: ${k.length}`);
    }
    this.key = k;
  }

  /** Encrypts a JSON object -> base64 string (nonce || ciphertext). */
  seal(obj: unknown): string {
    const plain = decodeUTF8(JSON.stringify(obj));
    const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
    const box = nacl.secretbox(plain, nonce, this.key);
    const out = new Uint8Array(nonce.length + box.length);
    out.set(nonce, 0);
    out.set(box, nonce.length);
    return encodeBase64(out);
  }

  /** Decrypts base64 -> JSON object. Null when authentication fails. */
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
