import { createPublicKey, verify } from 'node:crypto';
import nacl from 'tweetnacl';
import { decodeBase64, encodeBase64 } from 'tweetnacl-util';
import { doorWords, hostOf, signAtDoor } from '../doorSign';

/** The server's own check (server/src/index.js, verifies), done here the same way. */
const SPKI = Buffer.from('302a300506032b6570032100', 'hex');
const serverVerifies = (pub: Uint8Array, bytes: Buffer, sig: string) => verify(
  null, bytes,
  createPublicKey({ key: Buffer.concat([SPKI, Buffer.from(pub)]), format: 'der', type: 'spki' }),
  Buffer.from(sig, 'base64'),
);

describe('the signature at a server\'s door', () => {
  const pair = nacl.sign.keyPair();
  const sec = encodeBase64(pair.secretKey);
  const nonce = encodeBase64(nacl.randomBytes(16));

  test('the name is the host as dialed: lowercase, no port, no user', () => {
    expect(hostOf('wss://Example.org/duetto/ws')).toBe('example.org');
    expect(hostOf('ws://example.org:8787/custom')).toBe('example.org');
    expect(hostOf('wss://someone@example.org/duetto/ws')).toBe('example.org');
    expect(hostOf('wss://[::1]:8787/x')).toBe('[::1]');
    expect(hostOf('example.org')).toBe('');
    expect(hostOf('')).toBe('');
  });

  test('a server that asks for the second way gets its own name signed, as the server checks it', () => {
    const out = signAtDoor(sec, nonce, 'wss://example.org/duetto/ws', 2);
    expect(out.sigv).toBe(2);
    expect(out.host).toBe('example.org');
    expect(serverVerifies(pair.publicKey, Buffer.from(`duetto-door-v2|example.org|${nonce}`, 'utf8'), out.sig))
      .toBe(true);
  });

  test('that signature is no good for another name, nor as the bare number', () => {
    const out = signAtDoor(sec, nonce, 'wss://evil.example/duetto/ws', 2);
    expect(nacl.sign.detached.verify(doorWords(nonce, 'example.org'), decodeBase64(out.sig), pair.publicKey))
      .toBe(false);
    expect(serverVerifies(pair.publicKey, Buffer.from(nonce, 'base64'), out.sig)).toBe(false);
  });

  test('an older server, which says nothing, gets the bare number as always', () => {
    const out = signAtDoor(sec, nonce, 'wss://example.org/duetto/ws', undefined);
    expect(out.sigv).toBeUndefined();
    expect(out.host).toBeUndefined();
    expect(serverVerifies(pair.publicKey, Buffer.from(nonce, 'base64'), out.sig)).toBe(true);
  });
});
