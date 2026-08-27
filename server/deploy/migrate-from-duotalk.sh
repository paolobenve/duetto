#!/usr/bin/env bash
# Renames on the server what was left of DuoTalk: the folder, the service,
# the service user. The code is already the new one: only the names change
# here, and nothing else is meant to behave differently.
#
# Use:  sudo bash migrate-from-duotalk.sh
#
# It does not touch HAProxy: the two paths /duotalk/ and /duetto/ both
# have to stay until the phones have moved to the new APK.
#
# It can be run again: if it finds the work already done, it stops and
# says so. If the new service does not answer, it puts everything back as
# it was.

set -euo pipefail

OLD=/opt/duotalk
NEW=/opt/duetto
OLD_UNIT=/etc/systemd/system/duotalk-signaling.service
NEW_UNIT=/etc/systemd/system/duetto-signaling.service
SAVED=/root/duotalk-signaling.service.removed

if [ -d "$NEW" ] && [ ! -d "$OLD" ]; then
  echo "== already migrated: $NEW is there and $OLD is gone."
  systemctl is-active --quiet duetto-signaling && echo "== duetto-signaling is running." || true
  exit 0
fi
[ -d "$OLD" ] || { echo "Cannot find $OLD: there is nothing to move." >&2; exit 1; }
[ -f "$OLD_UNIT" ] || { echo "Cannot find $OLD_UNIT." >&2; exit 1; }

# The current owner and group: they have to be kept, changing only the
# name of the group if it was the old one. Guessing them would be the
# easiest way of leaving the service without permission to read its own
# files.
OWNER="$(stat -c %U "$OLD")"
GROUP="$(stat -c %G "$OLD")"
echo "== $OLD belongs to $OWNER:$GROUP"

echo "== stopping duotalk-signaling"
systemctl stop duotalk-signaling

echo "== moving $OLD -> $NEW"
mv "$OLD" "$NEW"

# The new unit is born of the old one, not of the example in the repo:
# that way ExecStart stays as it was (the path to node depends on the
# machine), along with the hardening lines and every tweak made by hand.
echo "== creating $NEW_UNIT from the old one"
sed 's/duotalk/duetto/g; s/DuoTalk/Duetto/g' "$OLD_UNIT" > "$NEW_UNIT"

NEW_USER="$(sed -n 's/^User=//p' "$NEW_UNIT" | head -1)"
if [ -n "$NEW_USER" ] && ! id -u "$NEW_USER" > /dev/null 2>&1; then
  echo "== creating the service user $NEW_USER"
  useradd --system --no-create-home --shell /usr/sbin/nologin "$NEW_USER"
fi

if [ "$GROUP" = "duotalk" ] && [ -n "$NEW_USER" ]; then
  echo "== handing the files to $OWNER:$NEW_USER"
  chown -R "$OWNER:$NEW_USER" "$NEW"
  chmod -R u+rwX,g+rX,o-rwx "$NEW"
  # The files copied later with rsync have to inherit the group,
  # otherwise the service stops being able to read them at the first
  # deploy.
  find "$NEW" -type d -exec chmod g+s {} \;
  [ -f "$NEW/server/.env" ] && chmod 640 "$NEW/server/.env"
fi

echo "== putting duetto-signaling into service"
systemctl disable duotalk-signaling > /dev/null 2>&1 || true
mv "$OLD_UNIT" "$SAVED"
systemctl daemon-reload
# Without "|| true" a failed start would make the script exit because of
# set -e, skipping the very rollback below: one would be left halfway,
# with the folder moved and no service on its feet.
systemctl enable --now duetto-signaling || true

sleep 2
ANSWER="$(curl -s --max-time 5 http://127.0.0.1:8787/healthz || true)"
case "$ANSWER" in
  *'"ok":true'*)
    echo
    echo "== it answers: $ANSWER"
    echo "== done."
    echo
    echo "Two things are left, to be done once the phones have moved to Duetto:"
    echo "  - take the duotalk_path lines and its backend out of"
    echo "    /etc/haproxy/haproxy.cfg (for now they are needed: they are"
    echo "    the road of the old app);"
    [ "$GROUP" = "duotalk" ] && echo "  - sudo userdel duotalk"
    echo "The old unit is in $SAVED."
    ;;
  *)
    echo "The new service does not answer. Putting everything back." >&2
    systemctl disable --now duetto-signaling > /dev/null 2>&1 || true
    rm -f "$NEW_UNIT"
    mv "$SAVED" "$OLD_UNIT"
    mv "$NEW" "$OLD"
    systemctl daemon-reload
    systemctl enable --now duotalk-signaling
    echo "duotalk-signaling restored. Look at: journalctl -u duetto-signaling -n 50" >&2
    exit 1
    ;;
esac
