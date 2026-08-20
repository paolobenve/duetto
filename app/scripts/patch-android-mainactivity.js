#!/usr/bin/env node
/**
 * Fa passare i tasti del volume dalle mani di Duetto.
 *
 * L'activity è l'unica a ricevere i tasti fisici, e l'activity la
 * genera React Native: sta in android/, che non è in questo repository.
 * Qui le si aggiungono due righe, sempre le stesse.
 *
 * Il perché sta in Volume.kt: su parecchi telefoni il volume di chiamata
 * sull'altoparlante è inchiodato dal produttore, e i tasti sembrano
 * rotti. Prendendoli, l'app può girarli al sistema quando il sistema
 * ubbidisce, e alzare il volume per conto suo quando non ubbidisce.
 *
 * Idempotente: se le righe ci sono già, non fa nulla.
 */
const fs = require('fs');
const path = require('path');

const file = path.join(
  __dirname, '..', 'android', 'app', 'src', 'main', 'java', 'com', 'duetto',
  'MainActivity.kt',
);

if (!fs.existsSync(file)) {
  console.log('MainActivity.kt non trovata: esegui prima bootstrap.sh');
  process.exit(0);
}

let kt = fs.readFileSync(file, 'utf8');

if (kt.includes('Volume.intercetta')) {
  console.log('tasti volume: già a posto');
  process.exit(0);
}

const imports = `import android.view.KeyEvent
import com.duetto.platform.Volume
`;
if (!kt.includes('import com.duetto.platform.Volume')) {
  kt = kt.replace(
    /^(import com\.facebook\.react\.ReactActivity\n)/m,
    `${imports}$1`,
  );
}

const metodi = `
  /**
   * I tasti del volume, mentre si è nel canale.
   *
   * Vedi Volume.kt: si prova prima con il volume di sistema, e solo se
   * quello non si muove - perché è al suo limite - la voce dell'altro la
   * alza l'app per conto suo. Fuori dal canale non passa di qui nulla.
   */
  override fun onKeyDown(keyCode: Int, event: KeyEvent): Boolean {
    if (Volume.intercetta(this, keyCode)) return true
    return super.onKeyDown(keyCode, event)
  }

  /** Il rilascio va consumato insieme alla pressione, o il tasto agisce due volte. */
  override fun onKeyUp(keyCode: Int, event: KeyEvent): Boolean {
    if (Volume.consumaRilascio(keyCode)) return true
    return super.onKeyUp(keyCode, event)
  }
`;

// Prima della graffa che chiude la classe.
const chiusura = kt.lastIndexOf('}');
kt = kt.slice(0, chiusura) + metodi + kt.slice(chiusura);

fs.writeFileSync(file, kt);
console.log('tasti volume: MainActivity sistemata');
