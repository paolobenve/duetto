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
