/*
 * Duetto - a permanent voice and video channel for two people.
 * Copyright (C) 2026 Paolo Benvenuto
 *
 * Free software under the GNU General Public License, version 3 or any
 * later version, and with no warranty of any kind. The full text is in
 * the LICENSE file at the root of the project, and at
 * <https://www.gnu.org/licenses/>.
 */
import { displayServer, normalizeServerUrl } from './config';

/**
 * What a QR code says, and how it is read back.
 *
 *   duetto://cathopedia.org/pair/12345678     a pairing code
 *   duetto://cathopedia.org/invite/ABCD-2345  an invitation
 *
 * The server travels with the code: whoever is invited or called holds
 * their phone up to the other one and types nothing, not even the
 * address. The host is the one the settings show; the full address is
 * rebuilt from it the same way as when it is typed.
 */
export type DuettoLink =
  | { kind: 'pair'; serverUrl: string; code: string }
  | { kind: 'invite'; serverUrl: string; code: string };

export function pairLink(serverUrl: string, code: string): string {
  return `duetto://${displayServer(serverUrl)}/pair/${code.replace(/\D/g, '')}`;
}

export function inviteLink(serverUrl: string, code: string): string {
  return `duetto://${displayServer(serverUrl)}/invite/${code.trim().toUpperCase()}`;
}

/** Reads a link back; null for anything that is not one of ours. */
export function parseLink(text: string): DuettoLink | null {
  const m = (text || '').trim().match(/^duetto:\/\/([^/\s]+)\/(pair|invite)\/([^/\s]+)$/i);
  if (!m) return null;
  const serverUrl = normalizeServerUrl(m[1]);
  const kind = m[2].toLowerCase();
  if (kind === 'pair') {
    const code = m[3].replace(/\D/g, '');
    return code.length === 8 ? { kind: 'pair', serverUrl, code } : null;
  }
  const code = m[3].toUpperCase();
  return /^[A-Z0-9]{4}-?[A-Z0-9]{4}$/.test(code)
    ? { kind: 'invite', serverUrl, code: code.includes('-') ? code : `${code.slice(0, 4)}-${code.slice(4)}` }
    : null;
}
