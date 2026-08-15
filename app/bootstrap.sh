#!/usr/bin/env bash
# Duetto - genera la parte nativa Android (cartella android/) e installa le dipendenze.
#
# La logica dell'app (src/) e la configurazione JS sono già nel repo.
# Qui usiamo la CLI ufficiale di React Native per creare lo "scheletro"
# nativo (Gradle, MainActivity, ecc.) alla versione giusta, e poi lo
# innestiamo nel progetto. Così il repo resta leggero e riproducibile.
#
# Uso:   cd app && ./bootstrap.sh
# Richiede: Node 18+, un JDK 17+, e l'SDK Android (ANDROID_HOME).

set -euo pipefail

RN_VERSION="0.76.5"
APP_NAME="Duetto"
HERE="$(cd "$(dirname "$0")" && pwd)"

if [ -d "$HERE/android" ]; then
  echo "==> android/ esiste già: salto la generazione nativa."
else
  echo "==> Genero lo scheletro nativo React Native $RN_VERSION in una cartella temporanea..."
  TMP="$(mktemp -d)"
  trap 'rm -rf "$TMP"' EXIT
  ( cd "$TMP" && npx --yes @react-native-community/cli@latest init "$APP_NAME" \
      --version "$RN_VERSION" --skip-install --pm npm --install-pods false )

  echo "==> Copio le cartelle native nel progetto..."
  cp -R "$TMP/$APP_NAME/android" "$HERE/android"
  if [ -d "$TMP/$APP_NAME/ios" ]; then cp -R "$TMP/$APP_NAME/ios" "$HERE/ios"; fi
  # Alcuni file di root utili se mancano
  for f in Gemfile .watchmanconfig; do
    [ -f "$HERE/$f" ] || cp "$TMP/$APP_NAME/$f" "$HERE/$f" 2>/dev/null || true
  done
fi

# Gradle deve sapere dov'e' l'SDK anche quando viene lanciato da npm, che
# non eredita ANDROID_HOME dall'ambiente della shell.
if [ -n "${ANDROID_HOME:-}" ] && [ ! -f "$HERE/android/local.properties" ]; then
  echo "sdk.dir=$ANDROID_HOME" > "$HERE/android/local.properties"
  echo "==> Scritto android/local.properties (sdk.dir=$ANDROID_HOME)"
fi

echo "==> Applico permessi, deep link e foreground service al manifest..."
node "$HERE/scripts/patch-android-manifest.js"

# Il modulo nativo duetto-platform è scritto per l'architettura classica,
# pienamente supportata in RN 0.76. Con la New Architecture servirebbe il
# livello di interop e non tutte le dipendenze lo gradiscono.
GRADLE_PROPS="$HERE/android/gradle.properties"
if [ -f "$GRADLE_PROPS" ]; then
  if grep -q '^newArchEnabled=' "$GRADLE_PROPS"; then
    sed -i 's/^newArchEnabled=.*/newArchEnabled=false/' "$GRADLE_PROPS"
  else
    echo 'newArchEnabled=false' >> "$GRADLE_PROPS"
  fi
  echo "==> New Architecture disattivata (architettura classica)."
fi

echo "==> Installo le dipendenze npm..."
( cd "$HERE" && npm install )

cat <<'EOF'

==> Fatto.
Passi successivi:
  1) Collega un telefono Android (debug USB attivo) oppure avvia un emulatore.
  2) Avvia il bundler:   npm start
  3) In un altro terminale:   npm run android
  4) Ripeti l'installazione sul secondo telefono.
  5) Su entrambi inserisci gli stessi Server / Stanza / Passphrase.

Per un APK installabile a mano:  npm run build:apk
(l'APK esce in android/app/build/outputs/apk/release/)
EOF
