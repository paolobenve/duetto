#!/usr/bin/env bash
# Duetto - generates the Android native part (the android/ folder) and
# installs the dependencies.
#
# The app's logic (src/) and the JS configuration are already in the repo.
# Here we use React Native's official CLI to create the native "skeleton"
# (Gradle, MainActivity and so on) at the right version, and then graft it
# into the project. That way the repo stays light and reproducible.
#
# Use:      cd app && ./bootstrap.sh
# It needs: Node 18+, a JDK 17+, and the Android SDK (ANDROID_HOME).

set -euo pipefail

RN_VERSION="0.76.5"
APP_NAME="Duetto"
HERE="$(cd "$(dirname "$0")" && pwd)"

if [ -d "$HERE/android" ]; then
  echo "==> android/ is already there: skipping the native generation."
else
  echo "==> Generating the React Native $RN_VERSION native skeleton in a temporary folder..."
  TMP="$(mktemp -d)"
  trap 'rm -rf "$TMP"' EXIT
  ( cd "$TMP" && npx --yes @react-native-community/cli@latest init "$APP_NAME" \
      --version "$RN_VERSION" --skip-install --pm npm --install-pods false )

  echo "==> Copying the native folders into the project..."
  cp -R "$TMP/$APP_NAME/android" "$HERE/android"
  if [ -d "$TMP/$APP_NAME/ios" ]; then cp -R "$TMP/$APP_NAME/ios" "$HERE/ios"; fi
  # A few useful root files, if they are missing
  for f in Gemfile .watchmanconfig; do
    [ -f "$HERE/$f" ] || cp "$TMP/$APP_NAME/$f" "$HERE/$f" 2>/dev/null || true
  done
fi

# Gradle has to know where the SDK is even when it is launched by npm,
# which does not inherit ANDROID_HOME from the shell's environment.
if [ -n "${ANDROID_HOME:-}" ] && [ ! -f "$HERE/android/local.properties" ]; then
  echo "sdk.dir=$ANDROID_HOME" > "$HERE/android/local.properties"
  echo "==> android/local.properties written (sdk.dir=$ANDROID_HOME)"
fi

echo "==> Applying permissions, deep links and the foreground service to the manifest..."
node "$HERE/scripts/patch-android-manifest.js"

# The duetto-platform native module is written for the classic
# architecture, fully supported in RN 0.76. With the New Architecture the
# interop layer would be needed, and not every dependency likes it.
GRADLE_PROPS="$HERE/android/gradle.properties"
if [ -f "$GRADLE_PROPS" ]; then
  if grep -q '^newArchEnabled=' "$GRADLE_PROPS"; then
    sed -i 's/^newArchEnabled=.*/newArchEnabled=false/' "$GRADLE_PROPS"
  else
    echo 'newArchEnabled=false' >> "$GRADLE_PROPS"
  fi
  echo "==> New Architecture turned off (the classic architecture)."
fi

echo "==> Installing the npm dependencies..."
( cd "$HERE" && npm install )

cat <<'EOF'

==> Done.
Next steps:
  1) Plug in an Android phone (USB debugging on), or start an emulator.
  2) Start the bundler:        npm start
  3) In another terminal:      npm run android
  4) Do the same on the second phone.
  5) On both of them, pair by reading the code out to each other.

For an APK to install by hand:  npm run build:apk
(the APK comes out in android/app/build/outputs/apk/release/)
EOF
