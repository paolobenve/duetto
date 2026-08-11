#!/usr/bin/env node
/**
 * Allinea i moduli locali di modules/ dentro node_modules/.
 *
 * PERCHE' SERVE
 * I moduli dichiarati con "file:modules/..." vengono COPIATI da npm in
 * node_modules, non collegati. Le modifiche ai sorgenti quindi non si
 * vedono finché non si rilancia "npm install", e nel frattempo Gradle e
 * Metro compilano la versione vecchia senza dare alcun errore: il build
 * riesce, ma l'app contiene codice obsoleto. È un errore silenzioso e
 * molto difficile da riconoscere dall'esterno.
 *
 * Questo script viene eseguito prima di ogni build (vedi package.json).
 */
const fs = require('fs');
const path = require('path');

const appDir = path.join(__dirname, '..');
const modulesDir = path.join(appDir, 'modules');
const nodeModulesDir = path.join(appDir, 'node_modules');

/** Roba che non ha senso copiare: la rigenera il build. */
const SKIP = new Set(['build', '.gradle', 'node_modules', '.cxx']);

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const src = path.join(from, entry.name);
    const dst = path.join(to, entry.name);
    if (entry.isDirectory()) copyDir(src, dst);
    else fs.copyFileSync(src, dst);
  }
}

if (!fs.existsSync(modulesDir)) {
  console.log('Nessun modulo locale da allineare.');
  process.exit(0);
}

let synced = 0;
for (const entry of fs.readdirSync(modulesDir, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const src = path.join(modulesDir, entry.name);
  const dst = path.join(nodeModulesDir, entry.name);

  // Se npm ha fatto un collegamento simbolico va già bene: non toccarlo.
  if (fs.existsSync(dst) && fs.lstatSync(dst).isSymbolicLink()) {
    console.log(`${entry.name}: collegato, niente da fare`);
    continue;
  }

  fs.rmSync(dst, { recursive: true, force: true });
  copyDir(src, dst);
  console.log(`${entry.name}: allineato`);
  synced++;
}

console.log(synced > 0 ? `${synced} modulo/i locale/i aggiornato/i.` : 'Tutto gia\' allineato.');
