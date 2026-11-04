/**
 * Short packets when the incoming voice loses, long ones again when it
 * stops.
 *
 * Sixty milliseconds a packet save battery, but on a road that loses
 * each hole is sixty milliseconds of voice made up by the decoder: the
 * sound goes choppy and metallic. Mumble, which a tester compared us
 * with on the same network, sends twenty. The switch in the settings
 * keeps them short always; this watches the road and shortens them
 * only while it loses.
 *
 * Only what comes IN is watched: the length an encoder uses is read
 * from the description it receives, so asking for short packets here
 * shortens the other side's, the ones this phone is losing, and leaves
 * this phone's own as they are.
 */

/** losses per hundred, over the window, that ask for short packets */
export const SHORT_ON_PCT = 4;
/** the window those losses are counted over */
export const SHORT_WINDOW_MS = 20_000;
/** how much of it must be seen, with two bad readings in it: one is a gust, not a road */
export const SHORT_SPAN_MS = 8_000;
/**
 * And at least this many packets in it, about nine seconds of voice:
 * in a silence DTX sends a couple a second, and one of them lost would
 * be a lot.
 */
export const SHORT_MIN_PACKETS = 150;
/** a reading under this is calm */
export const LONG_CALM_PCT = 1;
/** calm for this long, and the packets go long again */
export const LONG_AFTER_MS = 5 * 60_000;
/** a reading with fewer packets says nothing on its own, either way */
const READING_MIN_PACKETS = 20;

export class LossWatch {
  private readings: { at: number; got: number; lost: number }[] = [];
  private calmSince = 0;
  /** short packets asked for by this watch */
  short = false;

  /**
   * One reading: packets got and lost since the previous one. Says
   * when to switch, with the losses that made it switch; null while
   * things stay as they are.
   */
  add(at: number, got: number, lost: number): { short: boolean; pct: number } | null {
    if (got < 0 || lost < 0 || got + lost === 0) return null;
    if (!this.short) {
      this.readings.push({ at, got, lost });
      this.readings = this.readings.filter((r) => at - r.at < SHORT_WINDOW_MS);
      let g = 0;
      let l = 0;
      let bad = 0;
      for (const r of this.readings) {
        g += r.got;
        l += r.lost;
        if (r.got + r.lost >= READING_MIN_PACKETS && 100 * r.lost >= SHORT_ON_PCT * (r.got + r.lost)) bad += 1;
      }
      const pct = (100 * l) / (g + l);
      if (g + l < SHORT_MIN_PACKETS || at - this.readings[0].at < SHORT_SPAN_MS) return null;
      if (pct < SHORT_ON_PCT || bad < 2) return null;
      this.short = true;
      this.readings = [];
      this.calmSince = 0;
      return { short: true, pct };
    }
    if (got + lost < READING_MIN_PACKETS) return null;
    const pct = (100 * lost) / (got + lost);
    if (pct >= LONG_CALM_PCT) { this.calmSince = 0; return null; }
    if (!this.calmSince) { this.calmSince = at; return null; }
    if (at - this.calmSince < LONG_AFTER_MS) return null;
    this.reset();
    return { short: false, pct };
  }

  reset() {
    this.readings = [];
    this.calmSince = 0;
    this.short = false;
  }
}
