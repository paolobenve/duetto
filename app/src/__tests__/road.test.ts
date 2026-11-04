import { Freshness, FRESH_MS, lossStep } from '../road';

describe('a number from the statistics is current', () => {
  test('while its counter moves', () => {
    const f = new Freshness();
    expect(f.moved('audio', 1, 0)).toBe(true);
    expect(f.moved('audio', 2, 10_000)).toBe(true);
    expect(f.moved('audio', 3, 20_000)).toBe(true);
  });

  test('a little longer, for a report that is late', () => {
    const f = new Freshness();
    f.moved('audio', 5, 0);
    expect(f.moved('audio', 5, FRESH_MS - 1)).toBe(true);
    expect(f.moved('audio', 5, FRESH_MS)).toBe(false);
  });

  test('no more, once the counter stands still', () => {
    const f = new Freshness();
    f.moved('audio', 7, 0);
    expect(f.moved('audio', 7, 10_000)).toBe(true);
    expect(f.moved('audio', 7, 20_000)).toBe(false);
    expect(f.moved('audio', 7, 600_000)).toBe(false);
    // the voice goes out again, and the reports with it
    expect(f.moved('audio', 8, 610_000)).toBe(true);
  });

  test('a new connection starts its counter again, lower: that is new too', () => {
    const f = new Freshness();
    f.moved('ping', 'pairA:340', 0);
    expect(f.moved('ping', 'pairB:1', 30_000)).toBe(true);
  });

  test('each counter on its own', () => {
    const f = new Freshness();
    f.moved('audio', 1, 0);
    f.moved('video', 1, 0);
    expect(f.moved('audio', 2, 20_000)).toBe(true);
    expect(f.moved('video', 1, 20_000)).toBe(false);
  });

  test('nothing read is not current', () => {
    const f = new Freshness();
    expect(f.moved('audio', undefined, 0)).toBe(false);
    expect(f.moved('audio', null, 0)).toBe(false);
  });

  test('forgotten with the connection', () => {
    const f = new Freshness();
    f.moved('audio', 4, 0);
    f.reset();
    expect(f.moved('audio', 4, 100_000)).toBe(true);
  });
});

describe('what came in since the last reading', () => {
  test('got and lost, and the share lost', () => {
    expect(lossStep({ got: 100, lost: 2 }, { got: 190, lost: 12 })).toEqual({ got: 90, lost: 10, pct: 10 });
  });

  test('a late packet coming off the lost counter is no loss, and what came in counts', () => {
    expect(lossStep({ got: 100, lost: 5 }, { got: 150, lost: 3 })).toEqual({ got: 50, lost: 0, pct: 0 });
  });

  test('a new connection, its counters started again: nothing to compare', () => {
    expect(lossStep({ got: 5000, lost: 40 }, { got: 80, lost: 0 })).toBeNull();
  });

  test('no first reading, nothing to compare', () => {
    expect(lossStep(undefined, { got: 80, lost: 0 })).toBeNull();
  });

  test('nothing came in', () => {
    expect(lossStep({ got: 80, lost: 1 }, { got: 80, lost: 1 })).toBeNull();
  });
});
