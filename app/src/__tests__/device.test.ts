import AsyncStorage from '@react-native-async-storage/async-storage';
import { Journal } from 'duetto-platform';
import { CARD_UNREADABLE, deviceKey, emptyThisPhone } from '../device';

// The native side is not here: the card needs none of it, and of the
// journal only that it is emptied with the phone.
jest.mock('duetto-platform', () => ({
  Foreground: {},
  Journal: { forget: jest.fn(() => Promise.resolve(true)) },
}));

const KEY = 'duetto.device-key';
const ASIDE = 'duetto.device-key.unreadable';
const storage = AsyncStorage as jest.Mocked<typeof AsyncStorage>;
const stored = async () => JSON.parse((await AsyncStorage.getItem(KEY)) || 'null');
/** The storage as the mock makes it: a failure queued by one test is not the next one's. */
const real = { getItem: storage.getItem.getMockImplementation()!, setItem: storage.setItem.getMockImplementation()! };

describe('the card of this phone', () => {
  // emptyThisPhone forgets the card in memory too: every test starts
  // from a phone that has read nothing yet.
  beforeEach(async () => {
    storage.getItem.mockReset().mockImplementation(real.getItem);
    storage.setItem.mockReset().mockImplementation(real.setItem);
    await AsyncStorage.clear();
    await emptyThisPhone();
    jest.clearAllMocks();
  });

  test('made once, written down, and the same one after', async () => {
    const a = await deviceKey();
    expect(a.pub).toBeTruthy();
    expect(a.sec).toBeTruthy();
    expect(await stored()).toEqual(a);
    expect(await deviceKey()).toEqual(a);
  });

  test('two asking at once - two connections at the first start - get the same card', async () => {
    const [a, b] = await Promise.all([deviceKey(), deviceKey()]);
    expect(b.pub).toBe(a.pub);
    expect((await stored()).pub).toBe(a.pub);
    expect(storage.setItem.mock.calls.filter(([k]) => k === KEY)).toHaveLength(1);
  });

  test('a storage that does not answer: no card made, the one stored left as it is', async () => {
    const before = await deviceKey();
    await emptyThisPhone();
    await AsyncStorage.setItem(KEY, JSON.stringify(before));
    storage.getItem.mockRejectedValueOnce(new Error('disk'));
    await expect(deviceKey()).rejects.toThrow(CARD_UNREADABLE);
    expect(await stored()).toEqual(before);
    // and when it answers again, it is the same phone
    expect(await deviceKey()).toEqual(before);
  });

  test('something stored that is not a card is kept aside, then a new card made', async () => {
    await AsyncStorage.setItem(KEY, '{"pub":"half a ca');
    const made = await deviceKey();
    expect(await AsyncStorage.getItem(ASIDE)).toBe('{"pub":"half a ca');
    expect(await stored()).toEqual(made);
  });

  test('so is a card with a half missing', async () => {
    await AsyncStorage.setItem(KEY, JSON.stringify({ pub: 'only-the-public-half' }));
    const made = await deviceKey();
    expect(JSON.parse((await AsyncStorage.getItem(ASIDE)) || '{}').pub).toBe('only-the-public-half');
    expect(made.pub).not.toBe('only-the-public-half');
  });

  test('not kept aside, not replaced', async () => {
    await AsyncStorage.setItem(KEY, 'garbage');
    storage.setItem.mockRejectedValueOnce(new Error('full'));
    await expect(deviceKey()).rejects.toThrow(CARD_UNREADABLE);
    expect(await AsyncStorage.getItem(KEY)).toBe('garbage');
  });

  test('a new card that could not be written down is not used', async () => {
    storage.setItem.mockRejectedValueOnce(new Error('full'));
    await expect(deviceKey()).rejects.toThrow(CARD_UNREADABLE);
    expect(await AsyncStorage.getItem(KEY)).toBeNull();
    // the next ask makes one again, and this time it is the one kept
    const made = await deviceKey();
    expect(await stored()).toEqual(made);
  });

  test('a phone emptied forgets its journal too', async () => {
    await emptyThisPhone();
    expect(Journal.forget).toHaveBeenCalledTimes(1);
  });

  test('a journal that will not go does not stop the emptying', async () => {
    (Journal.forget as jest.Mock).mockRejectedValueOnce(new Error('disk'));
    await AsyncStorage.setItem('duetto.config.v3', '{}');
    await expect(emptyThisPhone()).resolves.toBeUndefined();
    expect(await AsyncStorage.getItem('duetto.config.v3')).toBeNull();
  });
});
