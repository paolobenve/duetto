#!/usr/bin/env node
/**
 * Toglie dall'APK le architetture che nessun telefono usa.
 *
 * React Native impacchetta le librerie native per quattro architetture:
 * due vere (arm) e due per gli emulatori da PC (x86). Su un telefono
 * quelle due sono peso morto - 46 MB su 88 - che Android deve comunque
 * verificare e scompattare all'installazione: sono i trenta secondi di
 * "app in preparazione" su un telefono di fascia media.
 *
 * Restano arm64-v8a, che è ogni telefono degli ultimi dieci anni, e
 * armeabi-v7a per i più vecchi. Chi volesse usare un emulatore deve
 * togliere questo filtro.
 *
 * Sta in uno script perché android/ è generato da bootstrap.sh e non
 * versionato: modificarlo a mano significherebbe perderlo alla prima
 * rigenerazione.
 */
const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'android', 'app', 'build.gradle');
if (!fs.existsSync(file)) {
  console.log('build.gradle non ancora generato: niente da fare');
  process.exit(0);
}

let gradle = fs.readFileSync(file, 'utf8');

if (gradle.includes('abiFilters')) {
  console.log('architetture già filtrate');
  process.exit(0);
}

const blocco = `        ndk {
            // Solo architetture reali: gli emulatori x86 raddoppiavano
            // l'APK e i tempi di installazione. Vedi patch-android-gradle.js
            abiFilters 'arm64-v8a', 'armeabi-v7a'
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
console.log('architetture filtrate: arm64-v8a, armeabi-v7a');
