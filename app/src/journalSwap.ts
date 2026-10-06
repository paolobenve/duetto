/*
 * Duetto - a permanent voice and video channel for two people.
 * Copyright (C) 2026 Paolo Benvenuto
 *
 * Free software under the GNU General Public License, version 3 or any
 * later version, and with no warranty of any kind. The full text is in
 * the LICENSE file at the root of the project, and at
 * <https://www.gnu.org/licenses/>.
 */
import { Journal } from 'duetto-platform';
import type { Signaling } from './signaling';

/** one piece of journal per message: the server takes 256 KB, this leaves room */
export const JOURNAL_PIECE = 180 * 1024;

/**
 * Sends the other side the journal lines that have not gone yet.
 *
 * It is there so that both journals can be read by plugging in one
 * phone: the other one, in somebody else's hands, no cable ever
 * reaches. Only the new lines are sent; if the file has been rotated
 * and now holds fewer lines than we had sent, we start again.
 *
 * Shared by the app and by the presence with no window: they never
 * hold the connection together, and the mark of what has gone is the
 * same for both, so nothing goes twice.
 */
export async function sendJournalOver(sig: Signaling | null): Promise<void> {
  if (!sig?.connected) return;
  try {
    const { text, cursor } = await Journal.unsent();
    if (!text || !cursor) return;
    // In pieces under the server's ceiling, cut between rows: a row
    // split in two would be glued back with a newline in the middle.
    let piece = '';
    for (const line of text.split('\n')) {
      if (!line) continue;
      if (piece.length + line.length + 1 > JOURNAL_PIECE) {
        sig.sendSignal({ kind: 'journal', text: piece });
        piece = '';
      }
      piece += line + '\n';
    }
    if (piece) sig.sendSignal({ kind: 'journal', text: piece });
    await Journal.markSent(cursor);
  } catch {
    // the next beat tries again
  }
}
