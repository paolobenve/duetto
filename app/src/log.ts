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
 * The log lines, which speak only when they are asked to.
 *
 * There are some eighty of them scattered about, and in a release build
 * they used to run all the same: every one formats its strings and hands
 * them to the native bridge, in the channel and while merely waiting.
 * For whoever is not chasing a fault they are pure cost, and nobody will
 * ever read them.
 *
 * So they are quiet unless diagnostics are on. `adb logcat -s
 * ReactNativeJS` goes on working for whoever turns the switch: it is the
 * same lines, on request.
 *
 * The tag stays at the head of each line - `duetto-rtc`, `duetto-sig`,
 * `duetto-presence` - because that is what one greps for.
 */
let speaking = false;

/** Called as soon as the settings are read, and at every change. */
export function setLogging(on: boolean) {
  speaking = on;
}

export function logging(): boolean {
  return speaking;
}

/** A logger for one family of lines. */
export const logger = (tag: string) =>
  (...args: any[]) => {
    if (speaking) console.log(tag, ...args);
  };
