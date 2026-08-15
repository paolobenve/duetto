#!/usr/bin/env node
/**
 * Adatta l'AndroidManifest.xml generato da React Native:
 *  - permessi (rete, microfono, camera, audio)
 *  - intent filter per il deep link "duetto://channel", così toccando
 *    la notifica ntfy si apre direttamente Duetto
 *
 * Idempotente: si può rilanciare senza duplicare nulla.
 */
const fs = require('fs');
const path = require('path');

const manifestPath = path.join(
  __dirname, '..', 'android', 'app', 'src', 'main', 'AndroidManifest.xml',
);

if (!fs.existsSync(manifestPath)) {
  console.log('AndroidManifest.xml non trovato: esegui prima bootstrap.sh');
  process.exit(0);
}

let xml = fs.readFileSync(manifestPath, 'utf8');
let changes = 0;

// --- Permessi ---------------------------------------------------------------
const permissions = [
  'android.permission.INTERNET',
  'android.permission.ACCESS_NETWORK_STATE',
  'android.permission.RECORD_AUDIO',
  'android.permission.CAMERA',
  'android.permission.MODIFY_AUDIO_SETTINGS',
  'android.permission.BLUETOOTH_CONNECT', // auricolari BT
  // Restare nel canale in background / a schermo spento.
  // Il servizio è dichiarato dal modulo duetto-platform e i suoi
  // permessi arrivano dal merge dei manifest; li ripetiamo qui perché
  // siano visibili leggendo il manifest dell'app.
  'android.permission.FOREGROUND_SERVICE',
  'android.permission.FOREGROUND_SERVICE_MICROPHONE',
  'android.permission.FOREGROUND_SERVICE_CAMERA',
  'android.permission.WAKE_LOCK',
  'android.permission.POST_NOTIFICATIONS',
  'android.permission.VIBRATE', // il richiamo di "Avvisa"
];

for (const p of permissions) {
  if (!xml.includes(`android:name="${p}"`)) {
    xml = xml.replace(/<manifest([^>]*)>/, (m) => `${m}\n    <uses-permission android:name="${p}" />`);
    changes++;
  }
}

// --- Feature non obbligatorie ----------------------------------------------
const features = ['android.hardware.camera', 'android.hardware.microphone'];
for (const f of features) {
  if (!xml.includes(`<uses-feature android:name="${f}"`)) {
    xml = xml.replace(
      /<manifest([^>]*)>/,
      (m) => `${m}\n    <uses-feature android:name="${f}" android:required="false" />`,
    );
    changes++;
  }
}

// --- MainActivity: deep link + launchMode ----------------------------------
const activityRe = /<activity\b[^>]*android:name="\.MainActivity"[^>]*>/;
const activityMatch = xml.match(activityRe);

if (!activityMatch) {
  console.warn('Attenzione: MainActivity non trovata, deep link non aggiunto.');
} else {
  // launchMode singleTask: senza, toccare la notifica aprirebbe una seconda
  // istanza dell'app invece di riportare in primo piano quella già aperta.
  // Se l'attributo c'è già va SOSTITUITO: duplicarlo fa fallire il build.
  let tag = activityMatch[0];
  if (/android:launchMode="[^"]*"/.test(tag)) {
    if (!/android:launchMode="singleTask"/.test(tag)) {
      tag = tag.replace(/android:launchMode="[^"]*"/, 'android:launchMode="singleTask"');
      changes++;
    }
  } else {
    tag = tag.replace(
      /android:name="\.MainActivity"/,
      'android:name=".MainActivity"\n        android:launchMode="singleTask"',
    );
    changes++;
  }
  // Picture-in-Picture: il tasto Indietro mette l'app nella finestrella
  // invece di farne uscire.
  if (!/android:supportsPictureInPicture=/.test(tag)) {
    tag = tag.replace(
      /android:name="\.MainActivity"/,
      'android:name=".MainActivity"\n        android:supportsPictureInPicture="true"',
    );
    changes++;
  }

  // Il PiP è un cambio di configurazione: se l'activity non lo dichiara,
  // Android la ricrea e la connessione si perde.
  const neededConfig = ['screenSize', 'smallestScreenSize', 'screenLayout', 'orientation'];
  const configMatch = tag.match(/android:configChanges="([^"]*)"/);
  if (configMatch) {
    const have = configMatch[1].split('|').filter(Boolean);
    const missing = neededConfig.filter((c) => !have.includes(c));
    if (missing.length > 0) {
      tag = tag.replace(
        /android:configChanges="[^"]*"/,
        `android:configChanges="${[...have, ...missing].join('|')}"`,
      );
      changes++;
    }
  } else {
    tag = tag.replace(
      /android:name="\.MainActivity"/,
      `android:name=".MainActivity"\n        android:configChanges="${neededConfig.join('|')}"`,
    );
    changes++;
  }

  if (tag !== activityMatch[0]) {
    xml = xml.replace(activityRe, () => tag);
  }

  // Deep link, inserito dentro LA MainActivity (dopo il suo primo
  // intent-filter), non dopo il primo intent-filter del documento.
  if (!xml.includes('android:scheme="duetto"')) {
    const activityAt = xml.search(activityRe);
    const closeTag = '</intent-filter>';
    const filterEnd = xml.indexOf(closeTag, activityAt);
    const activityEnd = xml.indexOf('</activity>', activityAt);

    if (filterEnd !== -1 && (activityEnd === -1 || filterEnd < activityEnd)) {
      const at = filterEnd + closeTag.length;
      const deepLink = `
        <intent-filter>
            <action android:name="android.intent.action.VIEW" />
            <category android:name="android.intent.category.DEFAULT" />
            <category android:name="android.intent.category.BROWSABLE" />
            <data android:scheme="duetto" android:host="channel" />
        </intent-filter>`;
      xml = xml.slice(0, at) + deepLink + xml.slice(at);
      changes++;
    } else {
      console.warn('Attenzione: intent-filter della MainActivity non trovato.');
    }
  }
}

fs.writeFileSync(manifestPath, xml);
console.log(`Manifest aggiornato (${changes} modifiche).`);
