#!/usr/bin/env node
/**
 * Mette l'icona di Duetto dentro android/.
 *
 * PERCHE' UNO SCRIPT
 * La cartella android/ non sta nel repo: la rigenera bootstrap.sh con la
 * CLI di React Native, e con lei tornerebbero le icone del modello. Tutto
 * ciò che deve sopravvivere a quella rigenerazione va rimesso da qui
 * (come per il manifest e per gli abi).
 *
 * COSA SCRIVE
 *  - l'icona adattiva (Android 8+): uno strato di fondo a tinta unita e
 *    uno di primo piano vettoriale, che il telefono ritaglia con la
 *    maschera che preferisce - tonda, quadrata, a goccia;
 *  - la versione monocromatica, che Android 13+ usa per le icone
 *    intonate allo sfondo;
 *  - le immagini per i telefoni prima di Android 8, nelle cinque
 *    misure, ricavate dall'SVG con inkscape.
 *
 * Senza inkscape le immagini vecchie restano quelle che ci sono: sui
 * telefoni da Android 8 in su non si vedono comunque, perché lì vale
 * l'icona adattiva, che è vettoriale e non ha bisogno di nessuno.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const appDir = path.join(__dirname, '..');
const res = path.join(appDir, 'android', 'app', 'src', 'main', 'res');
const assets = path.join(appDir, 'assets');

const SFONDO = '#12161f';
/** Le cinque misure che Android si aspetta, in pixel. */
const MISURE = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };

if (!fs.existsSync(res)) {
  console.log('android/ non c\'è ancora: salto le icone.');
  process.exit(0);
}

// --- da SVG a VectorDrawable ------------------------------------------------

/** Gli attributi di un tag, come oggetto. */
function attributi(testo) {
  const out = {};
  for (const m of testo.matchAll(/([\w-]+)="([^"]*)"/g)) out[m[1]] = m[2];
  return out;
}

/**
 * Traduce il nostro SVG in VectorDrawable.
 *
 * Funziona perché l'SVG è generato da noi e contiene solo path con
 * coordinate assolute: nessuna trasformazione da interpretare, nessun
 * gruppo, nessuna forma da convertire. Un traduttore SVG generico
 * sarebbe tutt'altro lavoro, e non servirebbe a niente qui.
 */
function vettoriale(svg) {
  const righe = [];
  for (const m of svg.matchAll(/<path\b([^>]*?)\/>/g)) {
    const a = attributi(m[1]);
    if (!a.d) continue;
    const pezzi = [`android:pathData="${a.d}"`];
    if (a.fill && a.fill !== 'none') pezzi.push(`android:fillColor="${a.fill}"`);
    if (a.stroke && a.stroke !== 'none') {
      pezzi.push(`android:strokeColor="${a.stroke}"`);
      pezzi.push(`android:strokeWidth="${a['stroke-width'] || 1}"`);
      if (a['stroke-linecap']) pezzi.push(`android:strokeLineCap="${a['stroke-linecap']}"`);
    }
    righe.push(`    <path\n        ${pezzi.join('\n        ')} />`);
  }
  if (righe.length === 0) throw new Error('nessun path trovato nell\'SVG dell\'icona');
  return `<?xml version="1.0" encoding="utf-8"?>
<!-- Generato da scripts/patch-android-icon.js: non modificare a mano.
     La sorgente e' assets/icona-primo-piano.svg. -->
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="108dp"
    android:height="108dp"
    android:viewportWidth="108"
    android:viewportHeight="108">
${righe.join('\n')}
</vector>
`;
}

function scrivi(percorso, contenuto) {
  fs.mkdirSync(path.dirname(percorso), { recursive: true });
  fs.writeFileSync(percorso, contenuto);
}

const primoPiano = fs.readFileSync(path.join(assets, 'icona-primo-piano.svg'), 'utf8');
scrivi(path.join(res, 'drawable', 'ic_launcher_foreground.xml'), vettoriale(primoPiano));

scrivi(path.join(res, 'values', 'ic_launcher_background.xml'),
  `<?xml version="1.0" encoding="utf-8"?>
<!-- Generato da scripts/patch-android-icon.js -->
<resources>
    <color name="ic_launcher_background">${SFONDO}</color>
</resources>
`);

// Lo stesso disegno vale per l'icona tonda: la forma la decide il
// telefono, non noi. "monochrome" e' per le icone intonate allo sfondo
// di Android 13+: il sistema tinge la sagoma e ignora i nostri colori.
const adattiva = `<?xml version="1.0" encoding="utf-8"?>
<!-- Generato da scripts/patch-android-icon.js -->
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background" />
    <foreground android:drawable="@drawable/ic_launcher_foreground" />
    <monochrome android:drawable="@drawable/ic_launcher_foreground" />
</adaptive-icon>
`;
scrivi(path.join(res, 'mipmap-anydpi-v26', 'ic_launcher.xml'), adattiva);
scrivi(path.join(res, 'mipmap-anydpi-v26', 'ic_launcher_round.xml'), adattiva);

// --- immagini per i telefoni prima di Android 8 -----------------------------

function inkscapeDisponibile() {
  try {
    execFileSync('inkscape', ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

if (!inkscapeDisponibile()) {
  console.log('icona: inkscape non c\'è, salto le immagini per Android 7 e precedenti.');
  console.log('       (da Android 8 in su vale l\'icona adattiva, che è vettoriale)');
  process.exit(0);
}

const quadrata = fs.readFileSync(path.join(assets, 'icona.svg'), 'utf8');
// La versione tonda è la stessa col fondo ritagliato: certi lanciatori
// vecchi la usano al posto di quella quadrata.
const tonda = quadrata.replace(
  /<rect width="108" height="108" fill="[^"]*"\/>/,
  `<circle cx="54" cy="54" r="54" fill="${SFONDO}"/>`,
);
if (tonda === quadrata) throw new Error('non ho trovato il fondo da ritagliare');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'duetto-icona-'));
const sorgenti = {
  ic_launcher: path.join(tmp, 'quadrata.svg'),
  ic_launcher_round: path.join(tmp, 'tonda.svg'),
};
fs.writeFileSync(sorgenti.ic_launcher, quadrata);
fs.writeFileSync(sorgenti.ic_launcher_round, tonda);

let fatte = 0;
for (const [densita, lato] of Object.entries(MISURE)) {
  for (const [nome, sorgente] of Object.entries(sorgenti)) {
    const dest = path.join(res, `mipmap-${densita}`, `${nome}.png`);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    execFileSync('inkscape', [sorgente, '-o', dest, '-w', String(lato), '-h', String(lato)],
      { stdio: 'ignore' });
    fatte++;
  }
}
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`icona: scritte ${fatte} immagini e l'icona adattiva.`);
