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
 * Brings the local modules in modules/ into line inside node_modules/.
 *
 * WHY IT IS NEEDED
 * Modules declared with "file:modules/..." are COPIED by npm into
 * node_modules, not linked. Changes to the sources therefore go unseen
 * until "npm install" is run again, and in the meantime Gradle and
 * Metro build the old version without any error at all: the build
 * succeeds, but the app contains stale code. It is a silent mistake and
 * very hard to recognise from outside.
 *
 * This script runs before every build (see package.json).
 */
const fs = require('fs');
const path = require('path');

const appDir = path.join(__dirname, '..');
const modulesDir = path.join(appDir, 'modules');
const nodeModulesDir = path.join(appDir, 'node_modules');

/** Things there is no sense in copying: the build makes them again. */
const SKIP = new Set(['build', '.gradle', 'node_modules', '.cxx']);

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const src = path.join(from, entry.name);
    const dst = path.join(to, entry.name);
    if (entry.isDirectory()) copyDir(src, dst);
    else fs.copyFileSync(src, dst);
  }
}

if (!fs.existsSync(modulesDir)) {
  console.log('No local module to bring into line.');
  process.exit(0);
}

let synced = 0;
for (const entry of fs.readdirSync(modulesDir, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const src = path.join(modulesDir, entry.name);
  const dst = path.join(nodeModulesDir, entry.name);

  // If npm made a symbolic link that is fine already: leave it alone.
  if (fs.existsSync(dst) && fs.lstatSync(dst).isSymbolicLink()) {
    console.log(`${entry.name}: linked, nothing to do`);
    continue;
  }

  fs.rmSync(dst, { recursive: true, force: true });
  copyDir(src, dst);
  console.log(`${entry.name}: brought into line`);
  synced++;
}

console.log(synced > 0 ? `${synced} local module(s) updated.` : 'All in line already.');
