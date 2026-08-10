#!/usr/bin/env node
/**
 * Aggiunge i permessi necessari al AndroidManifest.xml generato da RN,
 * in modo idempotente (si puo' rilanciare senza duplicare).
 */
const fs = require('fs');
const path = require('path');

const manifest = path.join(
  __dirname, '..', 'android', 'app', 'src', 'main', 'AndroidManifest.xml',
);

if (!fs.existsSync(manifest)) {
  console.log('AndroidManifest.xml non trovato: esegui prima bootstrap.sh');
  process.exit(0);
}

let xml = fs.readFileSync(manifest, 'utf8');

const permissions = [
  'android.permission.INTERNET',
  'android.permission.CAMERA',
  'android.permission.RECORD_AUDIO',
  'android.permission.MODIFY_AUDIO_SETTINGS',
  'android.permission.ACCESS_NETWORK_STATE',
  'android.permission.BLUETOOTH', // audio da auricolari BT
];

const lines = permissions
  .filter((p) => !xml.includes(`android:name="${p}"`))
  .map((p) => `    <uses-permission android:name="${p}" />`);

if (lines.length > 0) {
  xml = xml.replace(
    /<manifest([^>]*)>/,
    (m) => `${m}\n${lines.join('\n')}`,
  );
}

// Le feature camera/microfono non sono obbligatorie a livello di Play Store
const features = [
  '    <uses-feature android:name="android.hardware.camera" android:required="false" />',
  '    <uses-feature android:name="android.hardware.microphone" android:required="false" />',
];
for (const f of features) {
  if (!xml.includes(f.trim().split('"')[1])) {
    xml = xml.replace(/<manifest([^>]*)>/, (m) => `${m}\n${f}`);
  }
}

fs.writeFileSync(manifest, xml);
console.log(`Manifest aggiornato (${lines.length} permessi aggiunti).`);
