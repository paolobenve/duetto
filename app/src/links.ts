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
 * Where to ask to be a beta tester: a GitLab work item with the template
 * and the title already in place, the same link the README gives.
 */
/** The petition against Google's developer verification of every app. */
export const PETITION_LINK = 'https://keepandroidopen.org/';

export const BETA_TESTER_LINK =
  'https://gitlab.com/paolobenve/duetto/-/issues/new?issuable_template=Beta_tester'
  + '&issue%5Btitle%5D=Beta%20tester%3A%20%3Cadd%20here%20your%20%28nick%29name%3E';

/**
 * What a QR code says, and how it is read back.
 *
 *   duetto://yourserver.org/pair/12345678         a pairing code
 *   duetto://yourserver.org/pair/12345678/KEY     ...with the maker's key
 *   duetto://yourserver.org/invite/ABCD-2345      an invitation
 *
 * The server travels with the code: whoever is invited or called holds
 * their phone up to the other one and types nothing, not even the
 * address. The host is the one the settings show; the full address is
 * rebuilt from it the same way as when it is typed.
 *
 * The key is the public half of the pair the code's maker made for
 * this exchange: with it, whoever opens the link has everything the
 * shared key is made of - their own secret, this key, the code - and
 * pairs at once, without the maker awake at the same moment. It is
 * public by definition; the code beside it is what was always secret.
 * Without it, the link is the old kind, and the exchange is live.
 */
export type DuettoLink =
  | { kind: 'pair'; serverUrl: string; code: string; pub?: string }
  | { kind: 'invite'; serverUrl: string; code: string };

/** base64 to base64url, so the key can live in a link without escaping */
const toUrl = (b64: string) => b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromUrl = (u: string) => {
  const b = u.replace(/-/g, '+').replace(/_/g, '/');
  return b + '='.repeat((4 - (b.length % 4)) % 4);
};

/**
 * The links people are given are https, not duetto://.
 *
 *   https://yourserver.org/duetto/p/12345678/KEY   a pairing code
 *   https://yourserver.org/duetto/i/ABCD-2345      an invitation
 *
 * A messaging app makes an https address a link and a custom scheme
 * plain text; mail cut "duetto://" off and offered the server's name.
 * So the server itself answers at these paths with a page that bounces
 * into the app - duetto://... - and, with no app installed, says where
 * to get it and what to type. The host is the one the settings show,
 * so no server name lives in the app. Both forms read back below.
 */
export function pairLink(serverUrl: string, code: string, pub?: string): string {
  const base = `https://${displayServer(serverUrl)}/duetto/p/${code.replace(/\D/g, '')}`;
  return pub ? `${base}/${toUrl(pub)}` : base;
}

export function inviteLink(serverUrl: string, code: string): string {
  return `https://${displayServer(serverUrl)}/duetto/i/${code.trim().toUpperCase()}`;
}

/** Reads a link back; null for anything that is not one of ours. */
export function parseLink(text: string): DuettoLink | null {
  const m = (text || '').trim()
    .match(/^(?:duetto:\/\/([^/\s]+)\/(pair|invite)|https?:\/\/([^/\s]+)\/duetto\/(p|i))\/([^/\s?#]+)(?:\/([A-Za-z0-9_-]{43}))?\/?$/i);
  if (!m) return null;
  const serverUrl = normalizeServerUrl(m[1] || m[3]);
  const kind = (m[2] || (m[4].toLowerCase() === 'p' ? 'pair' : 'invite')).toLowerCase();
  m[3] = m[5];
  m[4] = m[6];
  if (kind === 'pair') {
    const code = m[3].replace(/\D/g, '');
    if (code.length !== 8) return null;
    return m[4] ? { kind: 'pair', serverUrl, code, pub: fromUrl(m[4]) } : { kind: 'pair', serverUrl, code };
  }
  if (m[4]) return null;
  const code = m[3].toUpperCase();
  return /^[A-Z0-9]{4}-?[A-Z0-9]{4}$/.test(code)
    ? { kind: 'invite', serverUrl, code: code.includes('-') ? code : `${code.slice(0, 4)}-${code.slice(4)}` }
    : null;
}
