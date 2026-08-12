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

const appDir = path.join(__dirname, '..');

/**
 * La versione mostrata nell'app.
 *
 * `major` e `minor` stanno in version.json e si alzano a mano, quando un
 * insieme di cambiamenti cambia davvero cosa l'app è. L'ultimo numero
 * avanza invece a ogni compilazione: così ogni APK ha un nome proprio, e
 * chiedere "che versione hai" basta a sapere esattamente cosa sta
 * girando - senza doversi ricordare anche un numero di build a parte.
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
`// Generato da scripts/bump-build.js a ogni compilazione: non modificare a mano.
export const VERSION = '${VERSION}';
export const BUILD = ${n};
export const BUILT_AT = '${stamp}';
/** Quello che si vede nell'app. */
export const VERSION_LABEL = '${VERSION}';
/** Per le impostazioni: serve a distinguere due APK della stessa versione. */
export const VERSION_FULL = '${VERSION} · ${stamp}';
`);

console.log(`${VERSION} (${stamp})`);
