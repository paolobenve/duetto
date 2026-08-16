#!/usr/bin/env bash
# Tira giù dal telefono collegato i diari dei consumi, tutti e due.
#
#   mio.log    scritto da questo telefono
#   altro.log  quello che l'altro telefono gli ha mandato via server
#
# Basta collegare UN telefono: l'altro, in mano a un'altra persona, a un
# cavo non ci arriva mai, e per questo si scambiano i diari da soli.
#
# Uso:  ./scripts/leggi-diario.sh [cartella-di-destinazione]

set -euo pipefail

DEST="${1:-diario-$(date +%Y%m%d-%H%M)}"
REMOTA=/sdcard/Android/data/com.duetto/files/diario

if ! adb get-state > /dev/null 2>&1; then
  echo "Nessun telefono collegato (adb non lo vede)." >&2
  exit 1
fi

if ! adb shell "ls $REMOTA" > /dev/null 2>&1; then
  echo "Sul telefono non c'è ancora nessun diario: $REMOTA" >&2
  echo "Serve una versione dell'app che lo scriva, e qualche minuto di vita." >&2
  exit 1
fi

mkdir -p "$DEST"
adb pull "$REMOTA/." "$DEST" > /dev/null
echo "== scaricati in $DEST:"
ls -l "$DEST"

# Un riassunto in due righe, per capire subito se c'è materiale.
for f in "$DEST"/*.log; do
  [ -f "$f" ] || continue
  righe=$(wc -l < "$f")
  echo
  echo "== $(basename "$f"): $righe righe"
  [ "$righe" -gt 0 ] && head -1 "$f"
  [ "$righe" -gt 1 ] && tail -1 "$f"
done

# Il conto per app lo tiene Android, non l'app: se il telefono è questo,
# vale la pena prendere anche quello, che dice quanto ha speso Duetto
# rispetto a tutto il resto.
echo
echo "== per il consumo attribuito a ogni app, su QUESTO telefono:"
echo "   adb shell dumpsys batterystats --charged com.duetto | head -40"
