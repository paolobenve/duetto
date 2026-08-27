#!/usr/bin/env bash
# Duetto - a permanent voice and video channel for two people.
# Copyright (C) 2026 Paolo Benvenuto
#
# Free software under the GNU General Public License, version 3 or any
# later version, and with no warranty of any kind. The full text is in
# the LICENSE file at the root of the project, and at
# <https://www.gnu.org/licenses/>.
# Pulls every consumption journal off the connected phone.
#
#   mine.log            written by this phone
#   other-<name>.log    what the other phone sent over, one file per
#                       connection: the name is the one you gave the
#                       connection plus a piece of its fingerprint, so
#                       that two files can never be confused
#   other.log           journals that arrived before the files were split
#
# Connecting ONE phone is enough: the other, in somebody else's hands,
# never reaches a cable, and that is why they exchange journals by
# themselves.
#
# Use:  ./scripts/read-journal.sh [destination-folder]

set -euo pipefail

DEST="${1:-journal-$(date +%Y%m%d-%H%M)}"
REMOTE=/sdcard/Android/data/com.duetto/files/journal

if ! adb get-state > /dev/null 2>&1; then
  echo "No phone connected (adb cannot see one)." >&2
  exit 1
fi

if ! adb shell "ls $REMOTE" > /dev/null 2>&1; then
  echo "There is no journal on the phone yet: $REMOTE" >&2
  echo "It needs a version of the app that writes one, and a few minutes of life." >&2
  exit 1
fi

mkdir -p "$DEST"
adb pull "$REMOTE/." "$DEST" > /dev/null
echo "== pulled into $DEST:"
ls -l "$DEST"

# A two-line summary, to see at once whether there is anything to read.
for f in "$DEST"/*.log; do
  [ -f "$f" ] || continue
  lines=$(wc -l < "$f")
  echo
  echo "== $(basename "$f"): $lines lines"
  [ "$lines" -gt 0 ] && head -1 "$f"
  [ "$lines" -gt 1 ] && tail -1 "$f"
done

# The per-app tally is kept by Android, not by the app: if the phone is
# this one, it is worth taking that too, since it says how much Duetto
# spent compared with everything else.
echo
echo "== for the consumption charged to each app, on THIS phone:"
echo "   adb shell dumpsys batterystats --charged com.duetto | head -40"
