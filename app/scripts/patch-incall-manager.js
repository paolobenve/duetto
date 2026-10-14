#!/usr/bin/env node
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
 * The call library keeps the processor awake no more.
 *
 * react-native-incall-manager takes a wake lock of its own when it is
 * started - on entering the channel - and holds it until it is stopped:
 * the processor never sleeps in the channel, even alone in it, with
 * nobody to hear. Duetto keeps the processor awake itself, and only
 * while the other is in the channel or the link to them is up (see
 * ChannelForegroundService and setPeerHere): on 13 and 14 October the
 * moto alone in its channel drew twice what it drew waiting.
 *
 * Here the library's one line that takes it is taken out; letting go of
 * a lock it does not hold is something the library already does without
 * harm.
 *
 * Idempotent: if the line is already gone, it does nothing; if the
 * library changed so that it cannot be found, it says so and stops.
 */
const fs = require('fs');
const path = require('path');

const file = path.join(
  __dirname, '..', 'node_modules', 'react-native-incall-manager', 'android', 'src', 'main',
  'java', 'com', 'zxcpoiu', 'incallmanager', 'InCallManagerModule.java',
);

if (!fs.existsSync(file)) {
  console.log('InCallManagerModule.java not found: run npm install first');
  process.exit(0);
}

let java = fs.readFileSync(file, 'utf8');
const MARK = 'Duetto: the processor is kept awake by Duetto, not here';
if (java.includes(MARK)) {
  console.log('InCallManager: already without its wake lock');
  process.exit(0);
}

const from = '            Log.d(TAG, "start audioRouteManager");\n'
  + '            wakeLockUtils.acquirePartialWakeLock();\n';
const to = '            Log.d(TAG, "start audioRouteManager");\n'
  + `            // ${MARK} - see scripts/patch-incall-manager.js in Duetto.\n`;

const at = java.indexOf(from);
if (at < 0 || java.indexOf(from, at + 1) >= 0) {
  console.error('InCallManager: the library changed, cannot take its wake lock out');
  process.exit(1);
}
java = java.replace(from, to);
fs.writeFileSync(file, java);
console.log('InCallManager: its wake lock taken out');
