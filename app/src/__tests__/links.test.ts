import { pairLink, inviteLink, parseLink } from '../links';

const SERVER = 'wss://example.org/duetto/ws';

describe('links: what a QR code or a tapped link says', () => {
  test('a pairing code travels with its server, digits only, as an https link', () => {
    expect(pairLink(SERVER, '1234 5678')).toBe('https://example.org/duetto/p/12345678');
  });

  test('an invitation is upper-cased and trimmed', () => {
    expect(inviteLink(SERVER, ' abcd-2345 ')).toBe('https://example.org/duetto/i/ABCD-2345');
  });

  test('the old duetto:// links still read', () => {
    expect(parseLink('duetto://example.org/pair/12345678')).toEqual({ kind: 'pair', serverUrl: SERVER, code: '12345678' });
    expect(parseLink('duetto://example.org/invite/ABCD-2345')).toEqual({ kind: 'invite', serverUrl: SERVER, code: 'ABCD-2345' });
  });

  test('a pairing link can carry the maker\'s key, and gives it back whole', () => {
    // 32 bytes in base64: 44 characters with the padding, 43 in a link.
    const pub = Buffer.from(Array.from({ length: 32 }, (_, i) => (i * 37 + 250) % 256)).toString('base64');
    const link = pairLink(SERVER, '12345678', pub);
    expect(link).toMatch(/^https:\/\/example\.org\/duetto\/p\/12345678\/[A-Za-z0-9_-]{43}$/);
    expect(link.split('/').pop()).not.toMatch(/[+/=]/);
    expect(parseLink(link)).toEqual({ kind: 'pair', serverUrl: SERVER, code: '12345678', pub });
  });

  test('a key of the wrong length is not a link of ours', () => {
    expect(parseLink('duetto://example.org/pair/12345678/tooshort')).toBeNull();
    expect(parseLink('https://example.org/duetto/i/ABCD-2345/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA')).toBeNull();
  });

  test('a pairing link reads back, with the server rebuilt in full', () => {
    expect(parseLink(pairLink(SERVER, '12345678'))).toEqual({
      kind: 'pair', serverUrl: SERVER, code: '12345678',
    });
  });

  test('an invitation reads back, dash or no dash, any case', () => {
    const want = { kind: 'invite', serverUrl: SERVER, code: 'ABCD-2345' };
    expect(parseLink('duetto://example.org/invite/ABCD-2345')).toEqual(want);
    expect(parseLink('DUETTO://example.org/INVITE/abcd2345')).toEqual(want);
  });

  test('what is not ours is null', () => {
    expect(parseLink('')).toBeNull();
    expect(parseLink('https://example.org/pair/12345678')).toBeNull();
    expect(parseLink('https://example.org/duetto/x/12345678')).toBeNull();
    expect(parseLink('duetto://example.org/pair/1234')).toBeNull();
    expect(parseLink('duetto://example.org/invite/ABC-2345')).toBeNull();
    expect(parseLink('duetto://example.org/enter/ABCD-2345')).toBeNull();
    expect(parseLink('duetto://channel/enter')).toBeNull();
  });
});
