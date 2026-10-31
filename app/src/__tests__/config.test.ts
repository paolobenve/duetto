import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  normalizeServerUrl, displayServer, isServerConfigured, keyForServer, keyForPair, isStrangeServer,
  switchToPair, forgetPair, DEFAULT_CONFIG, type DuoConfig, type PairInfo,
  withoutServerKeys, loadConfig, saveConfig, markNewPhoneSeen,
} from '../config';

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

describe('a server\'s key goes to that server alone', () => {
  const HOME = 'wss://home.example/duetto/ws';
  const ELSEWHERE = 'wss://elsewhere.example/duetto/ws';
  const inUse = { serverUrl: HOME, serverKey: 'home-key' };

  test('the key of the server in use, said at its own door only', () => {
    const untouched = { key: 'home-key', at: HOME };
    expect(keyForServer(HOME, untouched, inUse)).toBe('home-key');
    expect(keyForServer('home.example', untouched, inUse)).toBe('home-key');
    expect(keyForServer(ELSEWHERE, untouched, inUse)).toBe('');
  });

  test('a key typed for another server goes there, and the home one comes back home', () => {
    const typed = { key: ' their-key ', at: ELSEWHERE };
    expect(keyForServer(ELSEWHERE, typed, inUse)).toBe('their-key');
    expect(keyForServer(HOME, typed, inUse)).toBe('home-key');
    expect(keyForServer('wss://third.example/duetto/ws', typed, inUse)).toBe('');
  });

  test('a phone with no server has no key to give', () => {
    expect(keyForServer(ELSEWHERE, { key: '', at: '' }, { serverUrl: '', serverKey: '' })).toBe('');
  });

  test('a pair\'s own key, even an empty one, is its own', () => {
    expect(keyForPair({ serverUrl: ELSEWHERE, serverKey: 'pair-key' }, inUse)).toBe('pair-key');
    expect(keyForPair({ serverUrl: ELSEWHERE, serverKey: '' }, inUse)).toBe('');
  });

  test('an old pair with no key borrows the one in use only on the same server', () => {
    expect(keyForPair({ serverUrl: HOME }, inUse)).toBe('home-key');
    expect(keyForPair({}, inUse)).toBe('home-key');
    expect(keyForPair({ serverUrl: ELSEWHERE }, inUse)).toBe('');
  });

  const pair = (id: string, serverUrl: string, serverKey?: string): PairInfo => ({
    id, key: 'k', side: 'A', peerName: id, pairedAt: '2026-10-01T00:00:00Z', serverUrl, serverKey,
  } as PairInfo);
  const twoServers = (): DuoConfig => {
    const here = pair('here', HOME, 'home-key');
    return {
      ...DEFAULT_CONFIG, serverUrl: HOME, serverKey: 'home-key',
      pair: here, pairs: [here, pair('old-elsewhere', ELSEWHERE)],
    };
  };

  test('moving to an old pair on another server does not carry the key along', () => {
    const after = switchToPair(twoServers(), 'old-elsewhere');
    expect(after.serverUrl).toBe(ELSEWHERE);
    expect(after.serverKey).toBe('');
  });

  test('nor does forgetting the pair in use, when the next one lives elsewhere', () => {
    const after = forgetPair(twoServers(), 'here');
    expect(after.serverUrl).toBe(ELSEWHERE);
    expect(after.serverKey).toBe('');
  });
});

describe('a link to a server this phone has never been to', () => {
  const HOME = 'wss://home.example/duetto/ws';
  const PAIRS_SERVER = 'wss://friend.example/duetto/ws';
  const here = {
    ...DEFAULT_CONFIG, serverUrl: HOME,
    pairs: [{ id: 'p', key: 'k', side: 'A', peerName: 'p', pairedAt: '2026-10-01T00:00:00Z', serverUrl: PAIRS_SERVER } as PairInfo],
  };

  test('is strange: neither the server in use nor a pair\'s', () => {
    expect(isStrangeServer(here, 'wss://unknown.example/duetto/ws')).toBe(true);
    expect(isStrangeServer(here, 'unknown.example')).toBe(true);
  });

  test('the server in use and a pair\'s server are not, however written', () => {
    expect(isStrangeServer(here, HOME)).toBe(false);
    expect(isStrangeServer(here, 'home.example')).toBe(false);
    expect(isStrangeServer(here, 'https://friend.example/')).toBe(false);
  });

  test('to a phone with no server yet nothing is strange: its first link is its way in', () => {
    expect(isStrangeServer(DEFAULT_CONFIG, 'wss://unknown.example/duetto/ws')).toBe(false);
  });
});

describe('the key of the server is kept nowhere', () => {
  const pair = (id: string, serverKey?: string): PairInfo =>
    ({ id, key: `k-${id}`, side: 'A', serverUrl: 'wss://example.org/duetto/ws', serverKey } as PairInfo);
  const withKeys: DuoConfig = {
    ...DEFAULT_CONFIG,
    serverUrl: 'wss://example.org/duetto/ws',
    serverKey: 'sesamo',
    pair: pair('p1', 'sesamo'),
    pairs: [pair('p1', 'sesamo'), pair('p2', 'other'), pair('p3')],
  };
  const STORED = 'duetto.config.v3';
  /** The keys a stored configuration holds, wherever they are. */
  const keysIn = (raw: string | null) => {
    const c = JSON.parse(raw || '{}');
    return [c, c.pair, ...(c.pairs || [])].map((x) => x?.serverKey).filter(Boolean);
  };

  beforeEach(() => AsyncStorage.clear());

  test('neither the one in use nor any pair\'s', () => {
    const clean = withoutServerKeys(withKeys);
    expect(clean.serverKey).toBe('');
    expect(clean.pair?.serverKey).toBe('');
    expect(clean.pairs.map((p) => p.serverKey || '')).toEqual(['', '', '']);
    expect(clean.pairs.map((p) => p.id)).toEqual(['p1', 'p2', 'p3']);
  });

  test('saving writes none, whatever the screen holds', async () => {
    await saveConfig(withKeys);
    expect(keysIn(await AsyncStorage.getItem(STORED))).toEqual([]);
  });

  test('one written by a version from before is wiped at the first start, from the phone too', async () => {
    await AsyncStorage.setItem(STORED, JSON.stringify(withKeys));
    const cfg = await loadConfig();
    expect(cfg.serverKey).toBe('');
    expect(cfg.pairs.every((p) => !p.serverKey)).toBe(true);
    expect(keysIn(await AsyncStorage.getItem(STORED))).toEqual([]);
    expect(cfg.pairs.map((p) => p.id)).toEqual(['p1', 'p2', 'p3']);
  });
});

describe('the other side\'s new phone, answered', () => {
  test('marked on that pair alone, in use or not', () => {
    const pair = (id: string): PairInfo => ({ id, key: 'k', side: 'A', peerName: '', pairedAt: '2026-10-01' });
    const cfg: DuoConfig = { ...DEFAULT_CONFIG, pair: pair('a'), pairs: [pair('a'), pair('b')] };
    const inUse = markNewPhoneSeen(cfg, 'a', '2026-10-31');
    expect(inUse.pair?.newPhoneSeen).toBe('2026-10-31');
    expect(inUse.pairs.map((p) => p.newPhoneSeen)).toEqual(['2026-10-31', undefined]);
    const other = markNewPhoneSeen(cfg, 'b', '2026-10-30');
    expect(other.pair?.newPhoneSeen).toBeUndefined();
    expect(other.pairs.map((p) => p.newPhoneSeen)).toEqual([undefined, '2026-10-30']);
  });
});
