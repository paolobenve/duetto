#!/usr/bin/env node
/**
 * Nell'APK una sola architettura: arm64.
 *
 * React Native impacchetta le librerie native per quattro architetture:
 * due vere (arm) e due per gli emulatori da PC (x86). Su un telefono
 * quelle due sono peso morto, e Android deve comunque verificarle e
 * scompattarle all'installazione: sono i trenta secondi di "app in
 * preparazione" su un telefono di fascia media.
 *
 * Anche armeabi-v7a, che era rimasta "per i telefoni più vecchi", non
 * serve a nessuno qui: i telefoni a 32 bit hanno smesso di uscire dieci
 * anni fa, e questa app vuole comunque una camera, WebRTC e Android 8.
 * Toglierla vuol dire un APK grosso la metà - da passare all'altra
 * persona per messaggio, non e' un dettaglio - e meno codice mappato in
 * memoria su un telefono che di memoria ne ha poca.
 *
 * Chi volesse un emulatore, o un telefono a 32 bit, aggiunge qui la sua
 * architettura e ricompila.
 *
 * Sta in uno script perché android/ è generato da bootstrap.sh e non
 * versionato: modificarlo a mano significherebbe perderlo alla prima
 * rigenerazione.
 */
const fs = require('fs');
const path = require('path');

/**
 * L'elenco che React Native usa per COMPILARE le sue librerie.
 *
 * E' un'altra manopola dalla stessa parte: `abiFilters` decide cosa
 * finisce nell'APK, questa decide cosa viene compilato. Lasciandola
 * larga si compilano librerie per architetture che poi vengono buttate:
 * tempo di compilazione regalato.
 */
function ristringiProprieta() {
  const prop = path.join(__dirname, '..', 'android', 'gradle.properties');
  if (!fs.existsSync(prop)) return;
  const testo = fs.readFileSync(prop, 'utf8');
  const riga = /^reactNativeArchitectures=.*$/m;
  if (!riga.test(testo)) return;
  if (/^reactNativeArchitectures=arm64-v8a$/m.test(testo)) return;
  fs.writeFileSync(prop, testo.replace(riga, 'reactNativeArchitectures=arm64-v8a'));
  console.log('architetture da compilare: solo arm64-v8a');
}

const file = path.join(__dirname, '..', 'android', 'app', 'build.gradle');
if (!fs.existsSync(file)) {
  console.log('build.gradle non ancora generato: niente da fare');
  process.exit(0);
}

ristringiProprieta();

let gradle = fs.readFileSync(file, 'utf8');

const VOLUTE = "abiFilters 'arm64-v8a'";
/** La riga giusta e' quella che finisce lì: senza virgole, senza altro. */
const GIA_A_POSTO = /abiFilters\s+'arm64-v8a'\s*$/m;

if (GIA_A_POSTO.test(gradle)) {
  console.log('architetture già filtrate: solo arm64-v8a');
  process.exit(0);
}

// Un filtro più largo, scritto da una versione precedente di questo
// script: si stringe invece di lasciarlo com'è.
if (gradle.includes('abiFilters')) {
  gradle = gradle.replace(/abiFilters[^\n]*/, VOLUTE);
  fs.writeFileSync(file, gradle);
  console.log('architetture ristrette: solo arm64-v8a');
  process.exit(0);
}

const blocco = `        ndk {
            // Una sola: gli emulatori x86 e i telefoni a 32 bit
            // raddoppiavano l'APK. Vedi patch-android-gradle.js
            ${VOLUTE}
        }
`;

// Si aggancia alla fine di defaultConfig, che c'è in ogni progetto RN.
const marcatore = /(defaultConfig\s*\{[\s\S]*?)(\n    \})/;
if (!marcatore.test(gradle)) {
  console.error('defaultConfig non trovato in build.gradle: non tocco nulla');
  process.exit(1);
}

gradle = gradle.replace(marcatore, `$1\n${blocco}$2`);
fs.writeFileSync(file, gradle);
console.log('architetture filtrate: solo arm64-v8a');
