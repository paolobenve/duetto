#!/usr/bin/env node
/**
 * Mette l'icona di Duetto dentro android/.
 *
 * PERCHE' UNO SCRIPT
 * La cartella android/ non sta nel repository: la rigenera bootstrap.sh
 * con la CLI di React Native, e con lei tornerebbero le icone del
 * modello - il robottino verde. Tutto ciò che deve sopravvivere a quella
 * rigenerazione va rimesso da qui, come per il manifest, gli abi e il
 * tema.
 *
 * DA DOVE VIENE L'ICONA
 * assets/icona.png: due cornette di telefono, una blu e una verde, una
 * di fronte all'altra e unite dal filo attorcigliato. È un disegno, non
 * un vettoriale, quindi qui non si traduce niente: si ritaglia, si
 * ridimensiona e si scrive nelle misure che Android si aspetta.
 *
 * COSA SCRIVE
 *  - l'icona adattiva (Android 8+): fondo bianco a tinta unita e primo
 *    piano con le sole cornette, che il telefono ritaglia con la
 *    maschera che preferisce - tonda, quadrata, a goccia. Il primo piano
 *    tiene le cornette dentro alla zona sicura, altrimenti su un
 *    telefono con la maschera tonda il filo verrebbe tagliato;
 *  - la versione monocromatica, che Android 13+ usa per le icone
 *    intonate allo sfondo: la sagoma, senza colori;
 *  - le immagini per i telefoni prima di Android 8, nelle cinque
 *    misure, quadrate e tonde.
 *
 * Serve ImageMagick. Senza, le icone restano quelle che ci sono e lo
 * script lo dice invece di fallire.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const appDir = path.join(__dirname, '..');
const res = path.join(appDir, 'android', 'app', 'src', 'main', 'res');
const sorgente = path.join(appDir, 'assets', 'icona.png');

/** Il bianco del fondo: quello del disegno, arrotondato. */
const SFONDO = '#FFFFFF';

/** Le cinque misure che Android si aspetta per le icone vecchie. */
const MISURE = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };

/**
 * Quanto della tela occupano le cornette nell'icona adattiva.
 *
 * La tela dell'icona adattiva è 108, ma il telefono ne mostra al più 72,
 * e con la maschera tonda garantisce solo il cerchio da 66: quello che
 * esce da lì può essere tagliato. Le cornette stanno dentro a 66 su 108,
 * cioè al 61%, con un margine di sicurezza.
 */
const QUOTA_SICURA = 0.62;

if (!fs.existsSync(res)) {
  console.log("icone: android/ non c'è ancora, salto.");
  process.exit(0);
}
if (!fs.existsSync(sorgente)) {
  console.log('icone: manca assets/icona.png, salto.');
  process.exit(0);
}

function magick(args) {
  execFileSync('convert', args, { stdio: 'pipe' });
}

try {
  execFileSync('convert', ['-version'], { stdio: 'pipe' });
} catch {
  console.log('icone: ImageMagick non installato, lascio quelle che ci sono.');
  process.exit(0);
}

const tmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'duetto-icone-'));
const dentro = (n) => path.join(tmp, n);

// --- 1) Gli angoli --------------------------------------------------------
// Il disegno è un quadrato bianco ad angoli tondi su fondo NERO: quel
// nero non è parte dell'icona, è il vuoto attorno. Si riempie partendo
// dai quattro angoli, così il colore si spande solo lì e non tocca le
// parti scure dentro alle cornette - gli altoparlanti sono neri anche
// loro, ma non comunicano con il bordo.
const LATO = 1254;
const angoli = ['0,0', `${LATO - 1},0`, `0,${LATO - 1}`, `${LATO - 1},${LATO - 1}`];
const riempi = (colore, uscita) => magick([
  sorgente,
  '-alpha', 'set',
  // Fuzz largo: fra il nero di fuori e il bianco di dentro c'è una
  // sfumatura di grigi - il bordo ammorbidito del disegno - e lasciarla
  // fuori vorrebbe dire un filo grigio attorno all'icona, che sul fondo
  // bianco si vede benissimo. Il bianco di dentro resta fuori dal conto:
  // è troppo lontano dal nero perché questa tolleranza lo prenda.
  '-fill', colore, '-fuzz', '48%',
  ...angoli.flatMap((p) => ['-draw', `color ${p} floodfill`]),
  uscita,
]);

// Per il primo piano dell'icona adattiva il vuoto diventa bianco: sotto
// c'è il fondo bianco, e non si vede nessun bordo.
riempi(SFONDO, dentro('piena.png'));
// Per le icone vecchie diventa trasparente: lì la forma tonda del
// quadrato è l'icona stessa, e riempirla di bianco la farebbe sembrare
// un francobollo.
riempi('none', dentro('ritagliata.png'));

// --- 2) Il primo piano ----------------------------------------------------
// Le cornette occupano 933 pixel su 1254, cioè il 74% del disegno.
// Portarle al 62% della tela vuol dire allargare la tela attorno, non
// rimpicciolire il disegno: si aggiunge bianco tutt'intorno.
const CORNETTE = 933;
const TELA = Math.round(CORNETTE / QUOTA_SICURA);
magick([
  dentro('piena.png'),
  '-background', SFONDO, '-gravity', 'center',
  '-extent', `${TELA}x${TELA}`,
  dentro('primo-piano.png'),
]);

// --- 3) La sagoma, per le icone intonate ----------------------------------
// Tutto ciò che non è bianco diventa nero pieno; il bianco sparisce.
// Non è un disegno nuovo: è la stessa immagine vista in controluce.
// Nero pieno dove il disegno è scuro, trasparente dove è bianco: la
// sagoma va consegnata così, perché è il telefono a colorarla con la
// tinta del suo sfondo. Un'immagine senza trasparenza diventerebbe un
// quadratone di tinta unita.
magick([
  '(', '-size', `${TELA}x${TELA}`, 'xc:black', ')',
  '(', dentro('primo-piano.png'), '-colorspace', 'gray', '-threshold', '88%', '-negate', ')',
  '-alpha', 'off', '-compose', 'copy_opacity', '-composite',
  dentro('sagoma.png'),
]);

// --- 4) Le misure ---------------------------------------------------------
let scritti = 0;
for (const [dpi, lato] of Object.entries(MISURE)) {
  const cartella = path.join(res, `mipmap-${dpi}`);
  fs.mkdirSync(cartella, { recursive: true });

  // Icona classica: il quadrato ad angoli tondi, come nel disegno.
  magick([
    dentro('ritagliata.png'), '-resize', `${lato}x${lato}`,
    path.join(cartella, 'ic_launcher.png'),
  ]);

  // Tonda: la stessa, ritagliata in cerchio.
  const r = lato / 2;
  magick([
    dentro('piena.png'), '-resize', `${lato}x${lato}`,
    '(', '+clone', '-alpha', 'transparent', '-fill', 'white',
    '-draw', `circle ${r},${r} ${r},0`, ')',
    '-compose', 'copyopacity', '-composite',
    path.join(cartella, 'ic_launcher_round.png'),
  ]);

  // Adattiva: tela 108, cioè 2.25 volte l'icona classica.
  const tela = Math.round(lato * 2.25);
  magick([
    dentro('primo-piano.png'), '-resize', `${tela}x${tela}`,
    path.join(cartella, 'ic_launcher_foreground.png'),
  ]);
  magick([
    dentro('sagoma.png'), '-resize', `${tela}x${tela}`,
    path.join(cartella, 'ic_launcher_monochrome.png'),
  ]);
  scritti += 4;
}

// --- 5) Le descrizioni ----------------------------------------------------
const adattiva = `<?xml version="1.0" encoding="utf-8"?>
<!-- Generata da scripts/patch-android-icon.js: non modificare a mano. -->
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background" />
    <foreground android:drawable="@mipmap/ic_launcher_foreground" />
    <monochrome android:drawable="@mipmap/ic_launcher_monochrome" />
</adaptive-icon>
`;
const anydpi = path.join(res, 'mipmap-anydpi-v26');
fs.mkdirSync(anydpi, { recursive: true });
fs.writeFileSync(path.join(anydpi, 'ic_launcher.xml'), adattiva);
fs.writeFileSync(path.join(anydpi, 'ic_launcher_round.xml'), adattiva);

fs.mkdirSync(path.join(res, 'values'), { recursive: true });
fs.writeFileSync(
  path.join(res, 'values', 'ic_launcher_background.xml'),
  `<?xml version="1.0" encoding="utf-8"?>
<!-- Generata da scripts/patch-android-icon.js: non modificare a mano. -->
<resources>
    <color name="ic_launcher_background">${SFONDO}</color>
</resources>
`,
);

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`icone: ${scritti} immagini e 3 descrizioni, dalle cornette di assets/icona.png`);
