import { PROTOCOL, PROTOCOL_MIN, protocolFit } from '../protocol';

describe('protocol: whether two Duettos understand each other', () => {
  test('one that says nothing speaks protocol 1, and is understood', () => {
    expect(protocolFit(undefined, undefined)).toBe(PROTOCOL_MIN <= 1 ? 'ok' : 'theirs-old');
  });

  test('the same protocol is understood both ways', () => {
    expect(protocolFit(PROTOCOL, PROTOCOL_MIN)).toBe('ok');
  });

  test('older than the oldest we understand: theirs is too old', () => {
    expect(protocolFit(PROTOCOL_MIN - 1, 1)).toBe(PROTOCOL_MIN > 1 ? 'theirs-old' : 'ok');
  });

  test('asking more than we speak: ours is too old', () => {
    expect(protocolFit(PROTOCOL + 1, PROTOCOL + 1)).toBe('mine-old');
  });

  test('nonsense counts as nothing said', () => {
    expect(protocolFit('two', -3)).toBe(protocolFit(undefined, undefined));
  });
});
