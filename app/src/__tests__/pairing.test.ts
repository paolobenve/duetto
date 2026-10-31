import { createHash } from 'crypto';
import {
  generateCode, normalizeCode, isCodeComplete, formatCode, pairIdFromCode,
  newKeyPair, deriveSharedKey, confirmationFor, pairFromLetter, keyToBase64, pubToBase64,
  newLinkSecret, isLinkSecret, pairKey, seatToken, seatCheck, letterProves,
} from '../pairing';

describe('the pairing code', () => {
  test('is eight digits, and two are not the same', () => {
    const a = generateCode();
    const b = generateCode();
    expect(a).toMatch(/^\d{8}$/);
    expect(b).toMatch(/^\d{8}$/);
    expect(a).not.toBe(b);
  });

  test('keeps only its digits, eight at most', () => {
    expect(normalizeCode(' 1234-5678 ')).toBe('12345678');
    expect(normalizeCode('123456789')).toBe('12345678');
    expect(normalizeCode('')).toBe('');
  });

  test('is complete at eight digits and not before', () => {
    expect(isCodeComplete('1234 567')).toBe(false);
    expect(isCodeComplete('1234 5678')).toBe(true);
  });

  test('is shown in two halves', () => {
    expect(formatCode('12345678')).toBe('1234 5678');
    expect(formatCode('123')).toBe('123');
  });

  test('names the pair the same however it was typed', async () => {
    const a = await pairIdFromCode('1234 5678');
    const b = await pairIdFromCode('12345678');
    expect(a).toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9]+$/);
    expect(await pairIdFromCode('87654321')).not.toBe(a);
  });
});

describe('the key exchange', () => {
  test('both sides arrive at the same key from the same code', () => {
    const a = newKeyPair();
    const b = newKeyPair();
    const fromA = deriveSharedKey(a.secretKey, b.publicKey, '1234 5678');
    const fromB = deriveSharedKey(b.secretKey, a.publicKey, '12345678');
    expect(Buffer.from(fromA)).toEqual(Buffer.from(fromB));
    expect(fromA.length).toBe(32);
  });

  test('a different code is a different key', () => {
    const a = newKeyPair();
    const b = newKeyPair();
    const one = deriveSharedKey(a.secretKey, b.publicKey, '12345678');
    const other = deriveSharedKey(a.secretKey, b.publicKey, '12345679');
    expect(Buffer.from(one)).not.toEqual(Buffer.from(other));
  });

  test('the two sides prove the key with different words', () => {
    const key = new Uint8Array(32).fill(7);
    expect(confirmationFor(key, 'A')).not.toBe(confirmationFor(key, 'B'));
    expect(confirmationFor(key, 'A')).toBe(confirmationFor(key, 'A'));
  });

  test('a letter makes the key the live exchange would have made', () => {
    const maker = newKeyPair();
    const other = newKeyPair();
    const live = deriveSharedKey(other.secretKey, maker.publicKey, '12345678');
    const byLetter = pairFromLetter(
      { id: 'room', sec: keyToBase64(maker.secretKey), code: '1234 5678' },
      pubToBase64(other.publicKey), 'Mamma', 'A',
    );
    expect(byLetter.key).toBe(keyToBase64(live));
    expect(byLetter.peerName).toBe('Mamma');
    expect(byLetter.side).toBe('A');
  });
});

describe('the link\'s secret', () => {
  test('is 16 random bytes, as 22 characters a link can carry', () => {
    const a = newLinkSecret();
    expect(isLinkSecret(a)).toBe(true);
    expect(a).not.toBe(newLinkSecret());
    expect(isLinkSecret('short')).toBe(false);
    expect(isLinkSecret(42)).toBe(false);
  });

  test('goes into the key: both sides meet, and the code alone is not enough', () => {
    const maker = newKeyPair();
    const other = newKeyPair();
    const secret = newLinkSecret();
    const fromMaker = pairKey(maker.secretKey, other.publicKey, '12345678', secret);
    const fromOther = pairKey(other.secretKey, maker.publicKey, '1234 5678', secret);
    expect(Buffer.from(fromMaker)).toEqual(Buffer.from(fromOther));
    expect(fromMaker.length).toBe(32);
    // Without the secret - the code and the maker's key, which the
    // server sees - it is another key.
    const withoutIt = pairKey(other.secretKey, maker.publicKey, '12345678');
    expect(Buffer.from(withoutIt)).not.toEqual(Buffer.from(fromMaker));
    expect(Buffer.from(withoutIt)).toEqual(Buffer.from(deriveSharedKey(other.secretKey, maker.publicKey, '12345678')));
    expect(Buffer.from(pairKey(other.secretKey, maker.publicKey, '12345678', newLinkSecret())))
      .not.toEqual(Buffer.from(fromMaker));
    expect(() => pairKey(other.secretKey, maker.publicKey, '12345678', 'not-a-secret')).toThrow();
  });

  test('a letter for a link with its secret makes the key the other phone made', () => {
    const maker = newKeyPair();
    const other = newKeyPair();
    const secret = newLinkSecret();
    const theirs = pairKey(other.secretKey, maker.publicKey, '12345678', secret);
    const byLetter = pairFromLetter(
      { id: 'room', sec: keyToBase64(maker.secretKey), code: '12345678', secret },
      pubToBase64(other.publicKey), '', 'A',
    );
    expect(byLetter.key).toBe(keyToBase64(theirs));
  });

  test('the letter\'s proof: made with the key, and with nothing else', () => {
    const maker = newKeyPair();
    const other = newKeyPair();
    const secret = newLinkSecret();
    const key = pairKey(other.secretKey, maker.publicKey, '12345678', secret);
    expect(letterProves(key, confirmationFor(key, 'B'))).toBe(true);
    // The maker's own word echoed back, a proof without the secret, none.
    expect(letterProves(key, confirmationFor(key, 'A'))).toBe(false);
    const stranger = pairKey(newKeyPair().secretKey, maker.publicKey, '12345678');
    expect(letterProves(key, confirmationFor(stranger, 'B'))).toBe(false);
    expect(letterProves(key, undefined)).toBe(false);
  });

  test('the seat: a token from the secret, and a check the server can make', () => {
    const secret = newLinkSecret();
    const token = seatToken(secret);
    expect(token).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(token).not.toBe(secret);
    expect(seatToken(newLinkSecret())).not.toBe(token);
    // The server's way, with Node's SHA-512: the same check.
    const server = createHash('sha512').update(Buffer.from(token, 'base64url')).digest()
      .subarray(0, 16).toString('base64url');
    expect(seatCheck(token)).toBe(server);
    expect(seatCheck(token)).not.toBe(token);
  });
});
