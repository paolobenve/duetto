#!/usr/bin/env node
/**
 * Le barre di sistema, sopra e sotto, dello stesso colore dell'app.
 *
 * Il tema che React Native genera è "DayNight": su un telefono in tema
 * chiaro la barra di stato diventa grigia e quella dei tasti bianca con
 * i tasti scuri. Duetto invece è scuro sempre - una videochiamata si
 * guarda al buio, non c'è un tema chiaro che abbia senso - e quelle due
 * fasce chiare ai bordi spezzano l'immagine proprio dove dovrebbe
 * continuare.
 *
 * Qui si fissa: fondo nero come lo sfondo dell'app, simboli chiari
 * sopra e sotto, e nessun velo di contrasto messo dal sistema (da
 * Android 10 il sistema schiarisce da sé le barre trasparenti, e quel
 * velo si vedeva come una banda grigia).
 *
 * Idempotente: riscrive il file solo se non è già a posto.
 */
const fs = require('fs');
const path = require('path');

const stylesPath = path.join(
  __dirname, '..', 'android', 'app', 'src', 'main', 'res', 'values', 'styles.xml',
);

if (!fs.existsSync(stylesPath)) {
  console.log('styles.xml non trovato: esegui prima bootstrap.sh');
  process.exit(0);
}

/** Lo stesso nero dello sfondo delle schermate (styles.root in JS). */
const SFONDO = '#0b0e14';

const voci = [
  ['android:statusBarColor', SFONDO],
  ['android:navigationBarColor', SFONDO],
  // false = simboli CHIARI. Il nome dice il contrario di quello che fa:
  // descrive la barra, non i simboli.
  ['android:windowLightStatusBar', 'false'],
  ['android:windowLightNavigationBar', 'false'],
  ['android:enforceStatusBarContrast', 'false'],
  ['android:enforceNavigationBarContrast', 'false'],
  ['android:windowBackground', SFONDO],
];

let xml = fs.readFileSync(stylesPath, 'utf8');
let cambi = 0;

for (const [nome, valore] of voci) {
  const riga = `        <item name="${nome}">${valore}</item>`;
  const esiste = new RegExp(`<item name="${nome}">[^<]*</item>`);
  if (esiste.test(xml)) {
    const prima = xml;
    xml = xml.replace(esiste, `<item name="${nome}">${valore}</item>`);
    if (xml !== prima) cambi += 1;
    continue;
  }
  xml = xml.replace(
    /(<style name="AppTheme"[^>]*>)/,
    `$1\n${riga}`,
  );
  cambi += 1;
}

// Il tema chiaro non serve a niente: l'app è scura e basta.
if (xml.includes('Theme.AppCompat.DayNight.NoActionBar')) {
  xml = xml.replace(
    'Theme.AppCompat.DayNight.NoActionBar',
    'Theme.AppCompat.NoActionBar',
  );
  cambi += 1;
}

if (cambi === 0) {
  console.log('tema: già a posto');
  process.exit(0);
}

fs.writeFileSync(stylesPath, xml);
console.log(`tema: ${cambi} voci sistemate (barre scure, simboli chiari)`);
