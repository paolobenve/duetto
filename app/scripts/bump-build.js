#!/usr/bin/env node
/**
 * Raises the build number and writes it into src/version.ts.
 *
 * It is there to know for certain WHICH version is running on the
 * phone: with frequent hand-made installs it is easy to spend a long
 * time testing an old APK in the belief that it is new, and to blame
 * the code for problems already fixed. The number is shown in the app.
 */
const fs = require('fs');
const path = require('path');

const appDir = path.join(__dirname, '..');

/**
 * The version shown in the app.
 *
 * `major` and `minor` live in version.json and are raised by hand, when
 * a set of changes really changes what the app is. The last number
 * moves on at every build instead: that way every APK has a name of its
 * own, and asking "which version have you got" is enough to know
 * exactly what is running - without having to remember a separate build
 * number as well.
 */
const { major, minor } = JSON.parse(
  fs.readFileSync(path.join(appDir, 'version.json'), 'utf8'),
);
const counterFile = path.join(appDir, 'build-number.json');
const outFile = path.join(appDir, 'src', 'version.ts');

let n = 0;
try {
  n = JSON.parse(fs.readFileSync(counterFile, 'utf8')).build || 0;
} catch {
  n = 0;
}
n += 1;
fs.writeFileSync(counterFile, JSON.stringify({ build: n }, null, 2) + '\n');

const VERSION = `${major}.${minor}.${n}`;

const now = new Date();
const stamp = `${String(now.getDate()).padStart(2, '0')}/` +
  `${String(now.getMonth() + 1).padStart(2, '0')} ` +
  `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

fs.writeFileSync(outFile,
`// Written by scripts/bump-build.js at every build: do not edit by hand.
export const VERSION = '${VERSION}';
export const BUILD = ${n};
export const BUILT_AT = '${stamp}';
/** What is shown in the app. */
export const VERSION_LABEL = '${VERSION}';
/** For the settings: it tells two APKs of the same version apart. */
export const VERSION_FULL = '${VERSION} · ${stamp}';
`);

console.log(`${VERSION} (${stamp})`);
