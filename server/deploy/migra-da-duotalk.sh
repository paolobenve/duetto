#!/usr/bin/env bash
# Rinomina sul server quel che restava di DuoTalk: cartella, servizio,
# utente di servizio. Il codice e' gia' quello nuovo: qui cambiano solo i
# nomi, e nient'altro deve cambiare comportamento.
#
# Uso:  sudo bash migra-da-duotalk.sh
#
# Non tocca HAProxy: i due percorsi /duotalk/ e /duetto/ devono restare
# tutti e due finche' i telefoni non sono passati all'APK nuovo.
#
# Si puo' rilanciare: se trova il lavoro gia' fatto, si ferma dicendolo.
# Se il servizio nuovo non risponde, rimette tutto com'era.

set -euo pipefail

VECCHIA=/opt/duotalk
NUOVA=/opt/duetto
UNIT_VECCHIA=/etc/systemd/system/duotalk-signaling.service
UNIT_NUOVA=/etc/systemd/system/duetto-signaling.service
SALVATAGGIO=/root/duotalk-signaling.service.rimosso

if [ -d "$NUOVA" ] && [ ! -d "$VECCHIA" ]; then
  echo "== gia' migrato: c'e' $NUOVA e non c'e' piu' $VECCHIA."
  systemctl is-active --quiet duetto-signaling && echo "== duetto-signaling e' attivo." || true
  exit 0
fi
[ -d "$VECCHIA" ] || { echo "Non trovo $VECCHIA: non c'e' niente da spostare." >&2; exit 1; }
[ -f "$UNIT_VECCHIA" ] || { echo "Non trovo $UNIT_VECCHIA." >&2; exit 1; }

# Proprietario e gruppo attuali: vanno conservati, cambiando solo il nome
# del gruppo se era quello vecchio. Indovinarli sarebbe il modo piu'
# facile di lasciare il servizio senza permesso di leggere i suoi file.
PROPRIETARIO="$(stat -c %U "$VECCHIA")"
GRUPPO="$(stat -c %G "$VECCHIA")"
echo "== $VECCHIA appartiene a $PROPRIETARIO:$GRUPPO"

echo "== fermo duotalk-signaling"
systemctl stop duotalk-signaling

echo "== sposto $VECCHIA -> $NUOVA"
mv "$VECCHIA" "$NUOVA"

# L'unit nuova nasce da quella vecchia, non dall'esempio nel repo: cosi'
# restano com'erano ExecStart (il percorso di node dipende dalla
# macchina), le voci di hardening e ogni ritocco fatto a mano.
echo "== creo $UNIT_NUOVA dalla vecchia"
sed 's/duotalk/duetto/g; s/DuoTalk/Duetto/g' "$UNIT_VECCHIA" > "$UNIT_NUOVA"

UTENTE_NUOVO="$(sed -n 's/^User=//p' "$UNIT_NUOVA" | head -1)"
if [ -n "$UTENTE_NUOVO" ] && ! id -u "$UTENTE_NUOVO" > /dev/null 2>&1; then
  echo "== creo l'utente di servizio $UTENTE_NUOVO"
  useradd --system --no-create-home --shell /usr/sbin/nologin "$UTENTE_NUOVO"
fi

if [ "$GRUPPO" = "duotalk" ] && [ -n "$UTENTE_NUOVO" ]; then
  echo "== passo i file a $PROPRIETARIO:$UTENTE_NUOVO"
  chown -R "$PROPRIETARIO:$UTENTE_NUOVO" "$NUOVA"
  chmod -R u+rwX,g+rX,o-rwx "$NUOVA"
  # I file copiati in seguito con rsync devono ereditare il gruppo,
  # altrimenti il servizio smette di poterli leggere al primo deploy.
  find "$NUOVA" -type d -exec chmod g+s {} \;
  [ -f "$NUOVA/server/.env" ] && chmod 640 "$NUOVA/server/.env"
fi

echo "== metto in servizio duetto-signaling"
systemctl disable duotalk-signaling > /dev/null 2>&1 || true
mv "$UNIT_VECCHIA" "$SALVATAGGIO"
systemctl daemon-reload
# Senza "|| true" un avvio fallito farebbe uscire lo script per via di
# set -e, saltando proprio il ripristino: si resterebbe a meta' strada,
# con la cartella spostata e nessun servizio in piedi.
systemctl enable --now duetto-signaling || true

sleep 2
RISPOSTA="$(curl -s --max-time 5 http://127.0.0.1:8787/healthz || true)"
case "$RISPOSTA" in
  *'"ok":true'*)
    echo
    echo "== risponde: $RISPOSTA"
    echo "== fatto."
    echo
    echo "Restano due cose, da fare quando i telefoni saranno passati a Duetto:"
    echo "  - togliere da /etc/haproxy/haproxy.cfg le righe di duotalk_path e"
    echo "    del suo backend (per ora servono: sono la via dell'app vecchia);"
    [ "$GRUPPO" = "duotalk" ] && echo "  - sudo userdel duotalk"
    echo "L'unit vecchia e' in $SALVATAGGIO."
    ;;
  *)
    echo "Il servizio nuovo non risponde. Rimetto tutto com'era." >&2
    systemctl disable --now duetto-signaling > /dev/null 2>&1 || true
    rm -f "$UNIT_NUOVA"
    mv "$SALVATAGGIO" "$UNIT_VECCHIA"
    mv "$NUOVA" "$VECCHIA"
    systemctl daemon-reload
    systemctl enable --now duotalk-signaling
    echo "Ripristinato duotalk-signaling. Guarda: journalctl -u duetto-signaling -n 50" >&2
    exit 1
    ;;
esac
