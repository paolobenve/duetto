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
 * The system bars, top and bottom, the same colour as the app.
 *
 * The theme React Native generates is "DayNight": on a phone in a light
 * theme the status bar turns grey and the navigation bar white with
 * dark buttons. Duetto, on the other hand, is dark always - a video
 * call is watched in the dark, there is no light theme that would make
 * sense - and those two light strips at the edges break the picture
 * exactly where it ought to carry on.
 *
 * Here it is settled: a black ground like the app's background, light
 * symbols top and bottom, and no contrast veil laid on by the system
 * (since Android 10 the system lightens transparent bars by itself, and
 * that veil showed as a grey band).
 *
 * Idempotent: it rewrites the file only if it is not right already.
 */
const fs = require('fs');
const path = require('path');

const stylesPath = path.join(
  __dirname, '..', 'android', 'app', 'src', 'main', 'res', 'values', 'styles.xml',
);

if (!fs.existsSync(stylesPath)) {
  console.log('styles.xml not found: run bootstrap.sh first');
  process.exit(0);
}

/** The same black as the screens' background (styles.root in JS). */
const BACKGROUND = '#0b0e14';

const items = [
  ['android:statusBarColor', BACKGROUND],
  ['android:navigationBarColor', BACKGROUND],
  // false = LIGHT symbols. The name says the opposite of what it does:
  // it describes the bar, not the symbols.
  ['android:windowLightStatusBar', 'false'],
  ['android:windowLightNavigationBar', 'false'],
  ['android:enforceStatusBarContrast', 'false'],
  ['android:enforceNavigationBarContrast', 'false'],
  ['android:windowBackground', BACKGROUND],
];

let xml = fs.readFileSync(stylesPath, 'utf8');
let changes = 0;

for (const [name, value] of items) {
  const line = `        <item name="${name}">${value}</item>`;
  const exists = new RegExp(`<item name="${name}">[^<]*</item>`);
  if (exists.test(xml)) {
    const before = xml;
    xml = xml.replace(exists, `<item name="${name}">${value}</item>`);
    if (xml !== before) changes += 1;
    continue;
  }
  xml = xml.replace(
    /(<style name="AppTheme"[^>]*>)/,
    `$1\n${line}`,
  );
  changes += 1;
}

// The light theme is of no use: the app is dark and that is all.
if (xml.includes('Theme.AppCompat.DayNight.NoActionBar')) {
  xml = xml.replace(
    'Theme.AppCompat.DayNight.NoActionBar',
    'Theme.AppCompat.NoActionBar',
  );
  changes += 1;
}

if (changes === 0) {
  console.log('theme: already in place');
  process.exit(0);
}

fs.writeFileSync(stylesPath, xml);
console.log(`theme: ${changes} items sorted (dark bars, light symbols)`);
