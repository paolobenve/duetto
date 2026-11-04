/**
 * Whether a number read from the statistics is current.
 *
 * Some numbers the statistics give are the last ones received, and stay
 * there when nothing new comes: what the other side lost of our voice
 * is in its last report, and with our voice held it sends no more;
 * the round trip of the ICE checks is the last answer's, and on a dead
 * road no answer comes. Read as they stand they were written in the
 * journal for hours - 16 ms on 379 lines of the POCO's day, with its
 * voice held. Each comes with a counter that moves at every report or
 * answer: while it has moved lately, the number beside it is current.
 */

/**
 * A little over the longest wait between two reports: the voice's
 * come every five seconds or so, and can be half as late again.
 */
export const FRESH_MS = 12_000;

export class Freshness {
  private seen = new Map<string, { value: string; at: number }>();

  /**
   * The counter `key` reads `value` now: true while it has changed in
   * the last `FRESH_MS`. The first reading counts as a change: a new
   * connection's first report is new.
   */
  moved(key: string, value: unknown, now: number): boolean {
    if (value === undefined || value === null) return false;
    const v = String(value);
    const was = this.seen.get(key);
    if (!was || was.value !== v) {
      this.seen.set(key, { value: v, at: now });
      return true;
    }
    return now - was.at < FRESH_MS;
  }

  reset() {
    this.seen.clear();
  }
}

/** The packets counted coming in, at one reading. */
export type Counted = { got: number; lost: number };

/**
 * What came in since the previous reading, and how much of it was lost.
 *
 * The lost counter can go down: a packet counted lost that arrives late
 * comes off it. Such a reading used to be thrown away whole, losses
 * newer than the late packet with it; now it counts what it got, and
 * no loss below zero. A received counter that went down is a new
 * connection's: nothing to compare, the reading starts the next one.
 * Null when nothing came in.
 */
export function lossStep(prev: Counted | undefined, now: Counted):
  { got: number; lost: number; pct: number } | null {
  if (!prev || now.got < prev.got) return null;
  const got = now.got - prev.got;
  const lost = Math.max(0, now.lost - prev.lost);
  if (got + lost === 0) return null;
  return { got, lost, pct: (100 * lost) / (got + lost) };
}
