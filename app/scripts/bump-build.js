#!/usr/bin/env node
/**
 * Incrementa il numero di build e lo scrive in src/version.ts.
 *
 * Serve a sapere con certezza QUALE versione sta girando sul telefono:
 * con installazioni frequenti e manuali è facile provare a lungo un APK
 * vecchio credendolo nuovo, e attribuire al codice problemi già risolti.
 * Il numero è mostrato nell'app.
 */
const fs = require('fs');
const path = require('path');

/**
 * La versione che si mostra a chi usa l'app.
 *
 * Il numero di build resta, ma sta in secondo piano: serve a noi per
 * sapere con certezza quale APK sta girando su un telefono, e compare
 * solo nelle impostazioni.
 */
const VERSION = '1.0.0';

const appDir = path.join(__dirname, '..');
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

const now = new Date();
const stamp = `${String(now.getDate()).padStart(2, '0')}/` +
  `${String(now.getMonth() + 1).padStart(2, '0')} ` +
  `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

fs.writeFileSync(outFile,
`// Generato da scripts/bump-build.js a ogni compilazione: non modificare a mano.
export const VERSION = '${VERSION}';
export const BUILD = ${n};
export const BUILT_AT = '${stamp}';
/** Quello che si vede nell'app. */
export const VERSION_LABEL = '${VERSION}';
/** Per le impostazioni: serve a distinguere due APK della stessa versione. */
export const VERSION_FULL = '${VERSION} · build ${n} · ${stamp}';
`);

console.log(`${VERSION} (build ${n}, ${stamp})`);
