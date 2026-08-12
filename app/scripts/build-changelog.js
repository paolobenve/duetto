#!/usr/bin/env node
/**
 * Porta CHANGELOG.md dentro l'app.
 *
 * Le note di versione si scrivono in un solo posto - il file alla radice
 * del progetto - e da lì finiscono anche nell'app: due copie da tenere
 * allineate a mano diventerebbero due copie diverse.
 *
 * Il formato è minimo di proposito: titoli "## versione" e paragrafi,
 * con un'eventuale apertura in grassetto. Basta a rendere le note
 * leggibili senza portarsi dietro un interprete di Markdown.
 */
const fs = require('fs');
const path = require('path');

const appDir = path.join(__dirname, '..');
const sorgente = path.join(appDir, '..', 'CHANGELOG.md');
const outFile = path.join(appDir, 'src', 'changelog.ts');

const testo = fs.readFileSync(sorgente, 'utf8');

const versioni = [];
let corrente = null;

for (const riga of testo.split('\n')) {
  const titolo = riga.match(/^##\s+(.+?)\s*$/);
  if (titolo) {
    corrente = { versione: titolo[1], paragrafi: [] };
    versioni.push(corrente);
    continue;
  }
  if (!corrente) continue;              // il preambolo non serve nell'app
  if (!riga.trim()) { corrente.chiuso = true; continue; }
  // Le righe si riuniscono in paragrafi: nel file sono spezzate a 100
  // colonne, ma sullo schermo di un telefono devono riflettere da sole.
  if (corrente.chiuso || corrente.paragrafi.length === 0) {
    corrente.paragrafi.push(riga.trim());
    corrente.chiuso = false;
  } else {
    corrente.paragrafi[corrente.paragrafi.length - 1] += ' ' + riga.trim();
  }
}

/** Divide "**Titolo.** resto" in due pezzi: il grassetto e il seguito. */
function spezza(p) {
  const m = p.match(/^\*\*(.+?)\*\*\s*(.*)$/);
  return m ? { forte: m[1], testo: m[2] } : { forte: '', testo: p };
}

const dati = versioni.map((v) => ({
  versione: v.versione,
  paragrafi: v.paragrafi.map(spezza),
}));

fs.writeFileSync(outFile,
`// Generato da scripts/build-changelog.js: non modificare a mano.
// La sorgente è CHANGELOG.md alla radice del progetto.
export type NotaVersione = {
  versione: string;
  paragrafi: { forte: string; testo: string }[];
};

export const CHANGELOG: NotaVersione[] = ${JSON.stringify(dati, null, 2)};
`);

console.log(`note di versione: ${dati.length} voci`);
