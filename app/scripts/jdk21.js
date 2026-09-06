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
 * Builds with JDK 21.
 *
 * React Native's Gradle plugin pins a Java 17 toolchain, for itself and
 * for every module of the app. F-Droid builds on Debian's default JDK,
 * the 21, and patches the plugin in node_modules to say 21 - the
 * `sed` of their React Native template:
 *
 *   sed -i '/jvmToolchain\|JavaVersion/s/17/21/' <the plugin's build.gradle.kts>
 *     <JdkConfiguratorUtils.kt>
 *
 * This does the very same thing, after every `npm ci`, so that the APK
 * released here and the one F-Droid builds from the source are the
 * same bytes: on a line naming jvmToolchain or JavaVersion, the first
 * 17 becomes 21. Idempotent, and quiet when there is nothing to do.
 */
const fs = require('fs');
const path = require('path');

const plugin = path.join(__dirname, '..', 'node_modules', '@react-native', 'gradle-plugin');
const files = [
  ...['shared', 'shared-testutil', 'settings-plugin', 'react-native-gradle-plugin']
    .map((d) => path.join(plugin, d, 'build.gradle.kts')),
  path.join(plugin, 'react-native-gradle-plugin', 'src', 'main', 'kotlin',
    'com', 'facebook', 'react', 'utils', 'JdkConfiguratorUtils.kt'),
];

let touched = 0;
for (const file of files) {
  if (!fs.existsSync(file)) continue;
  const before = fs.readFileSync(file, 'utf8');
  const after = before.split('\n')
    .map((line) => (/jvmToolchain|JavaVersion/.test(line) ? line.replace('17', '21') : line))
    .join('\n');
  if (after !== before) {
    fs.writeFileSync(file, after);
    touched++;
  }
}
if (touched) console.log(`jdk21: ${touched} file(s) of React Native's Gradle plugin now say 21`);
