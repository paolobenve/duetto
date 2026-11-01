#!/usr/bin/env bash
#
# Duetto - a permanent voice and video channel for two people.
# Copyright (C) 2026 Paolo Benvenuto
#
# Free software under the GNU General Public License, version 3 or any
# later version, and with no warranty of any kind. The full text is in
# the LICENSE file at the root of the project, and at
# <https://www.gnu.org/licenses/>.
#
# Installs the signalling server, or updates it, on a Linux machine with
# systemd: the steps of docs/DEPLOY.md, section 1, in one go. Run it on
# the server, from a copy of the repository:
#
#   git clone https://gitlab.com/paolobenve/duetto.git
#   sudo bash duetto/server/deploy/install.sh --domain duetto.example.org
#
# What it does: checks Node and npm; makes the service's user; puts the
# code in /opt/duetto/server, writable by you and read by the service;
# installs its one dependency; runs the smoke test; writes the settings
# in /etc/duetto/server.env, with a new key of the house, the first time
# only; installs the systemd unit and starts it; asks it /healthz.
#
# Run again, it updates: the code is copied over and the service
# restarted, while the settings, the list of phones and a unit of your
# own are left as they are. The HTTPS proxy and the relay (coturn) stay
# with the guide, sections 2 and 3: they depend on what the machine
# already runs.

set -euo pipefail

DIR=/opt/duetto
DOMAIN=
SERVICE=duetto-signaling
SVC_USER=duetto
ENV_DIR=/etc/duetto
ENV_FILE=$ENV_DIR/server.env

usage() {
  cat <<'EOF'
Usage: sudo bash server/deploy/install.sh [--domain NAME] [--dir DIR]

  --domain NAME   the name the phones will dial (duetto.example.org): it goes in
                  HOST_NAMES, and in the relay's and STUN's addresses
  --dir DIR       where the code goes (default /opt/duetto; the server ends up in
                  DIR/server)
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --domain) DOMAIN=${2:-}; shift 2 ;;
    --dir) DIR=${2:-}; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; usage >&2; exit 2 ;;
  esac
done

say() { printf '\n== %s\n' "$*"; }
fail() { printf '\nSTOPPED: %s\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || fail "run it with sudo: it makes a user, and writes in /etc and $DIR."
[ -n "$DIR" ] || fail "--dir needs a folder."
DIR=${DIR%/}
# It is given over to the service's group, whole: never a system folder.
case "$DIR" in
  /*) ;;
  *) fail "--dir needs a full path, like /opt/duetto." ;;
esac
case "$DIR" in
  ''|/opt|/usr|/usr/*|/etc|/etc/*|/var|/srv|/home|/root|/bin|/sbin|/lib|/boot|/tmp)
    fail "--dir $DIR is a system folder: give one of Duetto's own, like /opt/duetto." ;;
esac
if [ -n "$DOMAIN" ] && ! [[ "$DOMAIN" =~ ^[A-Za-z0-9.-]+$ ]]; then
  fail "--domain takes a bare name, like duetto.example.org: no https://, no path."
fi

SRC=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
DEST=$DIR/server
[ -f "$SRC/src/index.js" ] || fail "$SRC does not look like Duetto's server folder."
# Whoever runs it owns the code; the service only reads it.
OWNER=${SUDO_USER:-root}
as_owner() {
  if [ "$OWNER" = root ]; then "$@"; else sudo -u "$OWNER" -H "$@"; fi
}

# --- Node and npm -----------------------------------------------------------
say "Node and npm"
NODE=$(command -v node || true)
[ -n "$NODE" ] || fail "Node is missing. On Debian or Raspberry Pi OS: sudo apt install nodejs npm"
command -v npm >/dev/null || fail "npm is missing (Debian ships it apart): sudo apt install npm"
NODE_MAJOR=$("$NODE" -p 'process.versions.node.split(".")[0]')
[ "$NODE_MAJOR" -ge 18 ] || fail "Node $("$NODE" --version) is too old: 18 or newer is needed."
case "$NODE" in
  /home/*|/root/*)
    # The unit hides the home folders from the service (ProtectHome).
    fail "Node is at $NODE, inside a home folder (nvm?), where the service cannot see it. Install it for the whole system, e.g. sudo apt install nodejs npm." ;;
esac
echo "node $("$NODE" --version) at $NODE, npm $(npm --version)"

SYSTEMD=yes
[ -d /run/systemd/system ] || SYSTEMD=no

# --- The service's user ------------------------------------------------------
say "The service's user"
if id "$SVC_USER" >/dev/null 2>&1; then
  echo "$SVC_USER is there already"
else
  useradd --system --no-create-home --shell /usr/sbin/nologin "$SVC_USER"
  echo "made $SVC_USER"
fi

# --- The code ------------------------------------------------------------------
say "The code, in $DEST"
mkdir -p "$DEST"
if [ "$(cd "$DEST" && pwd -P)" != "$(cd "$SRC" && pwd -P)" ]; then
  # Copied over, never deleted: what was put there by hand stays. A
  # developer's .env and list are theirs, and nobody else's business.
  tar -C "$SRC" --exclude=./node_modules --exclude=./.env --exclude=./devices.json \
    -cf - . | tar -C "$DEST" --no-same-owner -xf -
  echo "copied from $SRC"
else
  echo "already in place"
fi
chown -R "$OWNER:$SVC_USER" "$DIR"
chmod -R u+rwX,g=rX,o= "$DIR"
find "$DIR" -type d -exec chmod g+s {} +   # new files inherit the group

say "Its dependency"
(cd "$DEST" && as_owner sh -c 'umask 027 && npm install --omit=dev --no-audit --no-fund') \
  || fail "npm install failed: the lines above say why."
chmod -R g=rX,o= "$DEST/node_modules"

# --- The smoke test --------------------------------------------------------------
say "The smoke test (half a minute)"
# Written by this shell, as root: a file of somebody else's in /tmp is
# one root may not write into (protected_regular).
LOG=$(mktemp /tmp/duetto-smoke-XXXXXX.log)
smoke() { (cd "$DEST" && as_owner env SMOKE_SLOW="$1" "$NODE" smoke-test.mjs) >"$LOG" 2>&1; }
if smoke 1; then
  echo "ALL OK"
else
  # Its times are shrunk and tight: a small board busy after the
  # install can miss one with nothing wrong in the server.
  echo "it failed: once more with every time four times as long (two minutes)"
  if smoke 4; then
    echo "ALL OK with longer times: the server is fine, the machine is only slow"
  else
    grep -E '^(FAIL|Error)|after:|FAILURES|^node ' "$LOG" >&2 || tail -20 "$LOG" >&2
    fail "the smoke test fails. The whole output is in $LOG: the lines above, pasted where you ask for help, are what is needed. Nothing was started."
  fi
fi
rm -f "$LOG"

# --- The settings ----------------------------------------------------------------
say "The settings, in $ENV_FILE"
install -d -o root -g "$SVC_USER" -m 750 "$ENV_DIR"
KEY=
if [ -f "$ENV_FILE" ]; then
  echo "already there: left as they are (sudoedit $ENV_FILE to change them)"
else
  install -o root -g "$SVC_USER" -m 640 "$DEST/.env.example" "$ENV_FILE"
  if command -v openssl >/dev/null; then KEY=$(openssl rand -hex 12)
  else KEY=$("$NODE" -p 'require("crypto").randomBytes(12).toString("hex")'); fi
  sed -i "s|^SERVER_KEY=\$|SERVER_KEY=$KEY|" "$ENV_FILE"
  if [ -n "$DOMAIN" ]; then
    sed -i "s|^HOST_NAMES=\$|HOST_NAMES=$DOMAIN|; s|YOUR_DOMAIN|$DOMAIN|g" "$ENV_FILE"
  fi
  printf '\n# Where the phones let in are kept: the folder the unit makes.\nDEVICES_FILE=/var/lib/duetto/devices.json\n' \
    >>"$ENV_FILE"
  echo "written, with a new key of the house"
fi

if [ "$SYSTEMD" = no ]; then
  say "No systemd here"
  echo "Everything but the service is in place. Start it as docs/DEPLOY.md says"
  echo "for your case (Docker: server/docker-compose.yml)."
  exit 0
fi

# --- The service -------------------------------------------------------------------
say "The service"
UNIT=/etc/systemd/system/$SERVICE.service
if [ -f "$UNIT" ]; then
  echo "$UNIT is there already: left as it is"
else
  sed -e "s|^User=.*|User=$SVC_USER|" \
      -e "s|^WorkingDirectory=.*|WorkingDirectory=$DEST|" \
      -e "s|^ExecStart=.*|ExecStart=$NODE src/index.js|" \
      "$DEST/deploy/$SERVICE.service" >"$UNIT"
  chmod 644 "$UNIT"
  echo "installed $UNIT"
fi
systemctl daemon-reload
if systemctl is-active --quiet "$SERVICE"; then
  systemctl restart "$SERVICE"
  echo "restarted, with the new code"
else
  systemctl enable --now "$SERVICE"
  echo "enabled and started"
fi

# --- Is it answering? ----------------------------------------------------------------
PORT=$(sed -n 's/^PORT=\([0-9]*\).*/\1/p' "$ENV_FILE" | tail -1)
PORT=${PORT:-8787}
ok=no
for _ in $(seq 1 20); do
  if "$NODE" -e "fetch('http://127.0.0.1:$PORT/healthz').then(r=>r.json()).then(j=>process.exit(j.ok?0:1),()=>process.exit(1))" 2>/dev/null; then
    ok=yes; break
  fi
  sleep 0.5
done
if [ "$ok" = no ]; then
  journalctl -u "$SERVICE" --since '2 min ago' --no-pager | tail -20 >&2 || true
  fail "the service does not answer on 127.0.0.1:$PORT/healthz: its log is above."
fi
echo "it answers on 127.0.0.1:$PORT"
journalctl -u "$SERVICE" --since '2 min ago' --no-pager -o cat 2>/dev/null \
  | grep -E 'door:|list:' | tail -2 || true

# --- What is left ------------------------------------------------------------------------
say "Done. What is left, from docs/DEPLOY.md"
cat <<EOF
2. HTTPS: expose 127.0.0.1:$PORT under /duetto/ with the proxy you have
   (examples for HAProxy, Apache and nginx in $DEST/deploy).
3. The relay, coturn, for phones on networks that cannot meet directly; then
   TURN_PASS (and STUN_URL) in $ENV_FILE, and: sudo systemctl restart $SERVICE
4. Knock with a phone of yours first: in the app, the server's name. The first
   phone that knows the key of the house becomes the owner.
EOF
if [ -z "$DOMAIN" ] && [ -n "$KEY" ]; then
  echo "   With no --domain, write the name in HOST_NAMES, TURN_URL and STUN_URL"
  echo "   (sudoedit $ENV_FILE), then restart."
fi
if [ -n "$KEY" ]; then
  cat <<EOF

The key of the house: $KEY
Keep it to yourself: it makes whoever knows it the owner. It is in $ENV_FILE
(sudo grep SERVER_KEY $ENV_FILE).
EOF
fi
