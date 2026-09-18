import {
  generateCode, normalizeCode, isCodeComplete, formatCode, pairIdFromCode,
  newKeyPair, deriveSharedKey, confirmationFor,
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
});
