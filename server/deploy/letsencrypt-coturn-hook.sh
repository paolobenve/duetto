#!/bin/sh
# Duetto - a permanent voice and video channel for two people.
# Copyright (C) 2026 Paolo Benvenuto
#
# Free software under the GNU General Public License, version 3 or any
# later version, and with no warranty of any kind. The full text is in
# the LICENSE file at the root of the project, and at
# <https://www.gnu.org/licenses/>.
#
# Let's Encrypt deploy hook: it keeps coturn's certificate copy fresh.
#
# coturn reads its certificate from /etc/coturn-certs - a copy owned by
# the turnserver user, because the letsencrypt directories belong to
# root alone. A copy goes stale at the first renewal, and a relay whose
# certificate has expired dies silently: the phones simply refuse the
# TLS door. This hook renews the copy every time certbot renews the
# certificate, and has coturn read it again.
#
# Without a restart, whenever it can. A restart closes every TURN
# session, and with them every call going through the relay in that
# moment: on 7 November 2026 a name added to the certificate cut one.
# coturn rereads its TLS and DTLS certificates on SIGUSR2 and stays up
# - coturn.service has no ExecReload, so the signal goes straight to
# the main process. Then the hook asks the TLS door which certificate
# it hands out, and restarts coturn only if it is not the new one: at
# worst it does what it always did.
#
# Install once, after putting in LINEAGE below the name of the
# directory under /etc/letsencrypt/live your certificate lives in, and
# in TLS_DOOR an address and the tls-listening-port of turnserver.conf
# (127.0.0.1 answers, unless listening-ip leaves it out):
#
#   sudo install -m 755 letsencrypt-coturn-hook.sh \
#        /etc/letsencrypt/renewal-hooks/deploy/coturn

LINEAGE=YOUR_DOMAIN
DEST=/etc/coturn-certs
TLS_DOOR=127.0.0.1:5349

set -eu

# Certbot says which lineage it has just renewed: the other
# certificates of the machine are none of our business. Run by hand,
# with no lineage named, it refreshes the copy anyway.
case "${RENEWED_LINEAGE:-/etc/letsencrypt/live/$LINEAGE}" in
  */"$LINEAGE") ;;
  *) exit 0 ;;
esac

cp -L "/etc/letsencrypt/live/$LINEAGE/fullchain.pem" \
      "/etc/letsencrypt/live/$LINEAGE/privkey.pem" "$DEST/"
chown turnserver:turnserver "$DEST/fullchain.pem" "$DEST/privkey.pem"
chmod 600 "$DEST/fullchain.pem" "$DEST/privkey.pem"

# The fingerprint of the first certificate on standard input: the
# server's own, both in a full chain and in what openssl s_client
# prints. Nothing at all if there is none.
fingerprint() { openssl x509 -noout -fingerprint -sha256 2>/dev/null || true; }

# The certificate the TLS door hands out right now.
served() {
  timeout 10 openssl s_client -connect "$TLS_DOOR" </dev/null 2>/dev/null |
    fingerprint
}

want=$(fingerprint < "$DEST/fullchain.pem")
pid=$(systemctl show -p MainPID --value coturn)
if [ "${pid:-0}" -gt 0 ] && [ -n "$want" ] && kill -s USR2 "$pid"; then
  # coturn answers on several threads, each with a socket of its own,
  # and an answer speaks only for its own thread: ask a few times, and
  # every answer must carry the new certificate.
  for try in 1 2 3 4 5 6 7 8 9 10; do
    sleep 1
    all_new=yes
    for n in 1 2 3 4 5 6 7 8; do
      [ "$(served)" = "$want" ] || { all_new=no; break; }
    done
    if [ "$all_new" = yes ]; then
      echo "coturn: the new certificate is served, no restart"
      exit 0
    fi
  done
fi
echo "coturn: $TLS_DOOR does not serve the new certificate: restarting" >&2
systemctl restart coturn
