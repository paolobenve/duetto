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
 * All three numbers live in version.json and are raised by hand, when a
 * set of changes is worth announcing: the version is a decision, not a
 * counter.
 *
 * The build number is a separate thing, and it is not in the version:
 * it counts the compilations, one by one, and it is what tells two APKs
 * that call themselves the same version apart. That is why it is shown
 * beside the version in the settings, and why reporting a problem means
 * saying it too.
 */
const { major, minor, patch } = JSON.parse(
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

const VERSION = `${major}.${minor}.${patch}`;

const now = new Date();
const stamp = `${String(now.getDate()).padStart(2, '0')}/` +
  `${String(now.getMonth() + 1).padStart(2, '0')} ` +
  `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

// The licence header goes into what is generated too: these files are
// in the repository like all the others, and a build must not strip it.
const HEADER = `/*
 * Duetto - a permanent voice and video channel for two people.
 * Copyright (C) 2026 Paolo Benvenuto
 *
 * Free software under the GNU General Public License, version 3 or any
 * later version, and with no warranty of any kind. The full text is in
 * the LICENSE file at the root of the project, and at
 * <https://www.gnu.org/licenses/>.
 */
`;

fs.writeFileSync(outFile,
`${HEADER}// Written by scripts/bump-build.js at every build: do not edit by hand.
export const VERSION = '${VERSION}';
export const BUILD = ${n};
export const BUILT_AT = '${stamp}';
/** What is shown in the app. */
export const VERSION_LABEL = '${VERSION}';
/** For the settings: it tells two APKs of the same version apart. */
export const VERSION_FULL = '${VERSION} · build ${n} · ${stamp}';
`);

console.log(`${VERSION} (build ${n}, ${stamp})`);
