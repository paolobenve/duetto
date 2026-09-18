import { normalizeServerUrl, displayServer, isServerConfigured } from '../config';

describe('the server address', () => {
  test('a bare host becomes the full address', () => {
    expect(normalizeServerUrl('example.org')).toBe('wss://example.org/duetto/ws');
    expect(normalizeServerUrl('  example.org  ')).toBe('wss://example.org/duetto/ws');
    expect(normalizeServerUrl('https://example.org/')).toBe('wss://example.org/duetto/ws');
  });

  test('a path of one\'s own, and a port, are kept', () => {
    expect(normalizeServerUrl('ws://example.org:8787/custom')).toBe('ws://example.org:8787/custom');
  });

  test('nothing stays nothing', () => {
    expect(normalizeServerUrl('')).toBe('');
    expect(normalizeServerUrl('   ')).toBe('');
  });

  test('the settings show the host, and the address comes back from it', () => {
    const shown = displayServer('wss://example.org/duetto/ws');
    expect(shown).toBe('example.org');
    expect(normalizeServerUrl(shown)).toBe('wss://example.org/duetto/ws');
    expect(displayServer('ws://example.org:8787/custom')).toBe('ws://example.org:8787/custom');
  });

  test('a phone with a host is configured, one without is not', () => {
    expect(isServerConfigured({ serverUrl: 'example.org' } as any)).toBe(true);
    expect(isServerConfigured({ serverUrl: '' } as any)).toBe(false);
  });
});
