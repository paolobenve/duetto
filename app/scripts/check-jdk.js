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
 * The release build runs Gradle on JDK 21, the one F-Droid builds
 * with: the libraries that are Java only compile with the JVM Gradle
 * runs on, and a different JDK means different bytes. This stops the
 * build early, with a word, when JAVA_HOME (or the java on the PATH)
 * is another version.
 */
const { spawnSync } = require('child_process');
const path = require('path');

const java = process.env.JAVA_HOME ? path.join(process.env.JAVA_HOME, 'bin', 'java') : 'java';
// java says its version on stderr.
const run = spawnSync(java, ['-version'], { encoding: 'utf8' });
const said = `${run.stderr || ''}${run.stdout || ''}`;
const m = said.match(/version "(\d+)/);
const major = m ? Number(m[1]) : 0;
if (major !== 21) {
  console.error(`build:apk needs JDK 21 (${java} is ${major || 'unknown'}): `
    + 'set JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64, or the like.');
  process.exit(1);
}
