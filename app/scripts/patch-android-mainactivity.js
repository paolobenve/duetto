#!/usr/bin/env node
/**
 * Makes the volume keys pass through Duetto's hands.
 *
 * The activity is the only thing that receives the physical keys, and
 * React Native generates the activity: it lives in android/, which is
 * not in this repository. Here two lines are added to it, always the
 * same ones.
 *
 * The why is in Volume.kt: on a good many phones the call volume on the
 * speaker is nailed down by the maker, and the keys look broken. By
 * taking them, the app can hand them to the system when the system
 * obeys, and raise the volume on its own account when it does not.
 *
 * Idempotent: if the lines are already there, it does nothing.
 */
const fs = require('fs');
const path = require('path');

const file = path.join(
  __dirname, '..', 'android', 'app', 'src', 'main', 'java', 'com', 'duetto',
  'MainActivity.kt',
);

if (!fs.existsSync(file)) {
  console.log('MainActivity.kt not found: run bootstrap.sh first');
  process.exit(0);
}

let kt = fs.readFileSync(file, 'utf8');

if (kt.includes('Volume.intercetta')) {
  console.log('volume keys: already in place');
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

const methods = `
  /**
   * The volume keys, while one is in the channel.
   *
   * See Volume.kt: the system volume is tried first, and only if that
   * does not move - because it is at its limit - does the app raise the
   * other voice on its own account. Outside the channel nothing comes
   * through here.
   */
  override fun onKeyDown(keyCode: Int, event: KeyEvent): Boolean {
    if (Volume.intercetta(this, keyCode)) return true
    return super.onKeyDown(keyCode, event)
  }

  /** The release is consumed with the press, or the key acts twice. */
  override fun onKeyUp(keyCode: Int, event: KeyEvent): Boolean {
    if (Volume.consumaRilascio(keyCode)) return true
    return super.onKeyUp(keyCode, event)
  }
`;

// Just before the brace that closes the class.
const closing = kt.lastIndexOf('}');
kt = kt.slice(0, closing) + methods + kt.slice(closing);

fs.writeFileSync(file, kt);
console.log('volume keys: MainActivity sorted');
