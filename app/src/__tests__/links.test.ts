import { pairLink, inviteLink, parseLink } from '../links';

const SERVER = 'wss://example.org/duetto/ws';

describe('links: what a QR code or a tapped link says', () => {
  test('a pairing code travels with its server, digits only', () => {
    expect(pairLink(SERVER, '1234 5678')).toBe('duetto://example.org/pair/12345678');
  });

  test('an invitation is upper-cased and trimmed', () => {
    expect(inviteLink(SERVER, ' abcd-2345 ')).toBe('duetto://example.org/invite/ABCD-2345');
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
    expect(parseLink('duetto://example.org/pair/1234')).toBeNull();
    expect(parseLink('duetto://example.org/invite/ABC-2345')).toBeNull();
    expect(parseLink('duetto://example.org/enter/ABCD-2345')).toBeNull();
    expect(parseLink('duetto://channel/enter')).toBeNull();
  });
});
