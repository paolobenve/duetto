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
# TLS door. This hook renews the copy and restarts coturn every time
# certbot renews the certificate.
#
# Install once, after putting in LINEAGE below the name of the
# directory under /etc/letsencrypt/live your certificate lives in:
#
#   sudo install -m 755 letsencrypt-coturn-hook.sh \
#        /etc/letsencrypt/renewal-hooks/deploy/coturn

LINEAGE=YOUR_DOMAIN
DEST=/etc/coturn-certs

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
systemctl restart coturn
