/*
 * Duetto - a permanent voice and video channel for two people.
 * Copyright (C) 2026 Paolo Benvenuto
 *
 * Free software under the GNU General Public License, version 3 or any
 * later version, and with no warranty of any kind. The full text is in
 * the LICENSE file at the root of the project, and at
 * <https://www.gnu.org/licenses/>.
 */
import { Heartbeat, Journal, Network } from 'duetto-platform';
import { Signaling } from './signaling';

/**
 * The connection's watchdog: the part that notices a dead link and has
 * it remade.
 *
 * It used to live inside the app's interface, as two React effects -
 * and that was the hole: the presence with no interface, the very mode
 * this app exists for, ran without it. A socket that died silently
 * after a reboot stayed dead until the server's own heartbeat found it
 * out, minutes later, while the phone believed itself reachable. Now
 * both connections - the app's and the headless one - attach the same
 * watchdog, so there is exactly one set of ears and no second copy to
 * drift out of tune.
 *
 * It listens to two things:
 *
 * - The native heartbeat, the only alarm clock that rings with the
 *   screen off. At every beat the connection is looked at: already
 *   dead, it is remade; looking alive, it is asked a question, and the
 *   answer is checked at the beat AFTER - a timer here would be of no
 *   use, because JavaScript's timers do not go off with the screen off,
 *   and that is exactly the hole the heartbeat comes to plug. The
 *   question costs a message of a few dozen bytes a minute, and in
 *   exchange it keeps the road open through the routers in between,
 *   which close connections that sit still.
 *
 * - The network's announcements. They arrive in a volley, so a change
 *   is let settle first; then, if the socket looks alive, it is asked
 *   whether it really is. Bringing a healthy connection down is not
 *   free - the other person sees you disappear and come back - and the
 *   first version of this piece did it at every sigh of the network:
 *   the two phones vanished on each other every few seconds. The
 *   server's answer is the proof that the socket lives; if it does not
 *   come within a few seconds, then it really was dead.
 */

/**
 * How long to wait, after a change of network, before acting: the
 * events arrive in a volley and one is enough.
 */
export const NETWORK_SETTLE_MS = 700;

/**
 * How long the server's answer is waited for before the link is given
 * up for dead, after the network has changed under our feet.
 */
export const PROBE_WAIT_MS = 3_000;

export type Watchdog = {
  /**
   * The server has answered: whatever doubt we had about the socket,
   * it is alive. To be called from `onPresence` - it settles both the
   * probe after a change of network and the heartbeat's own question.
   */
  noteAnswer: () => void;
  /** Stops listening and forgets every pending question. */
  stop: () => void;
};

export function attachWatchdog(
  get: () => Signaling | null,
  hooks: {
    /** Called whenever the watchdog concludes we are without a server. */
    onNoServer?: () => void;
    /**
     * Extra work per beat, run once the socket has been looked at and
     * found standing: the one clock that also ticks with the screen
     * off, for whoever has more than the socket to keep an eye on.
     */
    onBeat?: () => void;
    /**
     * A change of network, once it has settled.
     *
     * The socket's own handling stays in here; this is for whoever has
     * MORE than the socket standing on the old network - the direct
     * link between the two phones, above all. Android often changes
     * network without breaking anything (the new one comes up before
     * the old one goes), and then no outage ever tells the link to go
     * looking for the roads the new network has opened: it kept
     * walking a dead one through the relay while the two phones sat on
     * the same wifi.
     */
    onNetwork?: (what: string) => void;
    /**
     * Whether the watchdog also sets the heartbeat's pace: one a
     * minute when all is well, one every fifteen seconds while there
     * is something to put right. The app's interface has a pace-setter
     * of its own, wired to what the screen shows; the headless
     * presence has nobody else, and says true.
     */
    driveFast?: boolean;
  } = {},
): Watchdog {
  /**
   * The time the question was asked and the time an answer was last
   * seen, because a stopwatch cannot be used here - with the screen
   * off it never runs out. Comparing them at every beat tells whether
   * the previous question went unanswered, and an unanswered question
   * is a dead socket.
   */
  let probeSent = 0;
  let answerSeen = Date.now();
  let emptyBeats = 0;
  let settle: ReturnType<typeof setTimeout> | null = null;
  /**
   * The strongest word heard while the volley settles.
   *
   * A change of network arrives as a volley - `arrived`, then
   * `address`, then `valid`, within a breath - and the settling used
   * to keep the LAST word: a real change of network came out dressed
   * as an address twitch, exactly the thing a healthy link has
   * learned to ignore. A phone back on its wifi kept talking through
   * the carrier, candidates and all, and nobody ever went looking for
   * the roads the new network had opened. The strongest word wins
   * instead: arrived over valid, valid over address.
   */
  let settleWord = '';
  const WORD_RANK: Record<string, number> = { address: 0, valid: 1, arrived: 2 };
  let probe: ReturnType<typeof setTimeout> | null = null;

  const stopProbe = () => {
    if (!probe) return;
    clearTimeout(probe);
    probe = null;
  };

  const rebuild = (why: string) => {
    Journal.mark(`heartbeat:${why}`).catch(() => { /* noop */ });
    hooks.onNoServer?.();
    probeSent = 0;
    emptyBeats += 1;
    /**
     * Two beats to nothing: we tell Android to look at the network.
     *
     * This is the case of somebody leaving the house: the wifi, which
     * works perfectly well, goes weak and stops carrying data, but the
     * phone stays attached to it - with the screen off, for a good
     * half minute. We know before the system does, because our
     * attempts fail one after another: we say so, the check is its
     * own, and if that network does not reach the internet it moves
     * the traffic by itself.
     */
    if (emptyBeats === 2) {
      Journal.mark('network:not-carrying').catch(() => { /* noop */ });
      Network.reportNotCarrying().catch(() => { /* noop */ });
    }
    get()?.rebuild();
  };

  const stopBeat = Heartbeat.subscribe(() => {
    const sig = get();
    if (!sig) return;
    /**
     * Which network is carrying us, asked and not waited for.
     *
     * The system's announcement can be made while no JavaScript is
     * alive to hear it, and then it is lost for good: a phone that
     * came home with the screen off kept its link over the carrier
     * until somebody touched the screen. The beat rings with the
     * screen off, so the question is asked here; a change answers
     * with the usual "arrived", through the usual door.
     */
    Network.recheck().then((changed: boolean) => {
      // Said apart from the system's own word, because the two cannot
      // be told from each other afterwards: `network:arrived` is the
      // announcement heard, this one is the change nobody announced
      // and the beat went to look for.
      if (!changed) return;
      Journal.mark('network:by-beat').catch(() => { /* noop */ });
    }).catch(() => { /* noop */ });
    if (hooks.driveFast) Heartbeat.fast(!sig.connected).catch(() => { /* noop */ });
    if (!sig.connected) { rebuild('no-socket'); return; }
    // The previous question went unanswered: the socket looks alive
    // but carries nothing any more.
    if (probeSent && answerSeen < probeSent) {
      rebuild('silent');
      return;
    }
    emptyBeats = 0;
    probeSent = Date.now();
    sig.askPresence();
    hooks.onBeat?.();
  });

  const stopNet = Network.subscribe((what: string) => {
    if (what === 'lost') return;
    // The wifi's health while the emergency lane is open: nothing has
    // changed for OUR sockets - they are bound to the mobile data - so
    // no probing and no rebuilding; whoever opened the lane hears the
    // word and decides at their own pace.
    if (what === 'wifi-back') {
      hooks.onNetwork?.(what);
      return;
    }
    if (settle) clearTimeout(settle);
    if ((WORD_RANK[what] ?? 0) >= (WORD_RANK[settleWord] ?? -1)) settleWord = what;
    settle = setTimeout(() => {
      settle = null;
      const word = settleWord;
      settleWord = '';
      Journal.mark(`network:${word}`).catch(() => { /* noop */ });
      hooks.onNetwork?.(word);
      const sig = get();
      if (!sig) return;
      // Already without a server: there is nothing to save, we simply
      // rebuild.
      if (!sig.connected) {
        hooks.onNoServer?.();
        sig.rebuild();
        return;
      }
      // It looks alive: first we ask whether it really is.
      stopProbe();
      sig.askPresence();
      probe = setTimeout(() => {
        probe = null;
        Journal.mark('network:silent').catch(() => { /* noop */ });
        hooks.onNoServer?.();
        get()?.rebuild();
      }, PROBE_WAIT_MS);
    }, NETWORK_SETTLE_MS);
  });

  return {
    noteAnswer() {
      stopProbe();
      answerSeen = Date.now();
      // An answer is also the proof that the network carries: the
      // escalation towards Android starts again from zero.
      emptyBeats = 0;
    },
    stop() {
      if (settle) { clearTimeout(settle); settle = null; }
      stopProbe();
      stopBeat();
      stopNet();
      if (hooks.driveFast) Heartbeat.fast(false).catch(() => { /* noop */ });
    },
  };
}
