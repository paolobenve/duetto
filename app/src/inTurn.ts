/*
 * Duetto - a permanent voice and video channel for two people.
 * Copyright (C) 2026 Paolo Benvenuto
 *
 * Free software under the GNU General Public License, version 3 or any
 * later version, and with no warranty of any kind. The full text is in
 * the LICENSE file at the root of the project, and at
 * <https://www.gnu.org/licenses/>.
 */

/**
 * The questions of the first entry, one at a time.
 *
 * On Android a dialog put up while another is on the screen closes that
 * one, unanswered. A new phone's first entry asks three things within
 * seconds - the ringtone of the other call apps, the volume test, the
 * word about Google - and on 26 October, on the moto, the first was
 * closed by the second before anybody could read it; marked as asked,
 * it was never asked again.
 *
 * Each of them is handed in here as a function that puts it up and,
 * when it has been answered or closed, calls `done`; the next waits
 * for that. A question that never says it is done - closed by some
 * other dialog outside the line - holds the line for two minutes at
 * the most.
 */
type Ask = (done: () => void) => void;

const HOLD_AT_MOST_MS = 120_000;
const line: Ask[] = [];
let open = false;

function next() {
  const ask = line.shift();
  if (!ask) { open = false; return; }
  open = true;
  let finished = false;
  const done = () => {
    if (finished) return;
    finished = true;
    clearTimeout(stuck);
    next();
  };
  const stuck = setTimeout(done, HOLD_AT_MOST_MS);
  try {
    ask(done);
  } catch {
    done();
  }
}

export function inTurn(ask: Ask) {
  line.push(ask);
  if (!open) next();
}
