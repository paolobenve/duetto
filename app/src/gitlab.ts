/*
 * Duetto - a permanent voice and video channel for two people.
 * Copyright (C) 2026 Paolo Benvenuto
 *
 * Free software under the GNU General Public License, version 3 or any
 * later version, and with no warranty of any kind. The full text is in
 * the LICENSE file at the root of the project, and at
 * <https://www.gnu.org/licenses/>.
 */

/**
 * The beta tester's own road to their work item on GitLab.
 *
 * With a personal token the app talks to gitlab.com by itself: it looks
 * for the work item the person opened - the one titled "Beta tester:
 * ..." first, any open one of theirs otherwise - attaches the journal's
 * files and writes the note, in their name. Without a token the same
 * report goes through the server, which holds a token of the project's
 * and signs the note with the person's name in its first line.
 */

import { Journal } from 'duetto-platform';

const GITLAB = 'https://gitlab.com';
/** Duetto's project on gitlab.com */
export const PROJECT_ID = '86073650';
/** where a token is made, name and scope already filled in */
export const TOKEN_PAGE =
  `${GITLAB}/-/user_settings/personal_access_tokens?name=Duetto&scopes=api`;

export type ReportFile = { name: string; path: string; text: string };
export type ReportOutcome = { ok: boolean; error?: string; url?: string };

async function api(token: string, path: string, init: RequestInit = {}) {
  const res = await fetch(`${GITLAB}/api/v4/projects/${PROJECT_ID}${path}`, {
    ...init,
    headers: { 'PRIVATE-TOKEN': token, ...(init.headers as any) },
  });
  if (res.status === 401) throw new Error('bad-token');
  if (!res.ok) throw new Error(`gitlab-${res.status}`);
  return res.json();
}

/**
 * The person's work item: among the open ones they created, the one
 * titled "Beta tester: ..." first, else the most recent.
 */
export async function findMyWorkItem(
  token: string, name = '',
): Promise<{ iid: number; url: string } | null> {
  const list: any[] = await api(token, '/issues?scope=created_by_me&state=opened&per_page=20');
  if (!Array.isArray(list) || list.length === 0) return null;
  const lower = name.trim().toLowerCase();
  const named = lower
    ? list.find((i) => String(i.title ?? '').toLowerCase().includes(lower)) : null;
  const beta = list.find((i) => /^beta tester\b/i.test(String(i.title ?? '')));
  const pick = named ?? beta ?? list[0];
  return { iid: Number(pick.iid), url: String(pick.web_url ?? '') };
}

async function upload(token: string, f: ReportFile): Promise<string> {
  const form = new FormData();
  // React Native's FormData takes a file as {uri, name, type}: the
  // journal's files are on disk already, so the path is enough.
  form.append('file', { uri: `file://${f.path}`, name: f.name, type: 'text/plain' } as any);
  const out = await api(token, '/uploads', { method: 'POST', body: form });
  return String(out?.markdown ?? '');
}

/** The note's text: a header, the person's words, the attachments. */
export function noteBody(o: {
  who: string; version: string; phone: string; text: string; attachments: string[];
}): string {
  const quoted = o.text.trim()
    ? o.text.trim().split('\n').map((l) => `> ${l}`).join('\n')
    : '';
  const parts = [
    o.who
      ? `**Report from _${o.who}_** · Duetto ${o.version} · ${o.phone}`
      : `**Duetto ${o.version}** · ${o.phone}`,
    quoted,
    o.attachments.length ? `Journal: ${o.attachments.join(' ')}` : '',
  ];
  return parts.filter(Boolean).join('\n\n');
}

/**
 * The whole trip with the person's own token: find, upload, write.
 * `withJournal`: the files of the last three days go along.
 */
export async function reportDirectly(o: {
  token: string; name?: string; text: string; withJournal: boolean; version: string; phone: string;
}): Promise<ReportOutcome> {
  try {
    const item = await findMyWorkItem(o.token, o.name ?? '');
    if (!item) return { ok: false, error: 'no-work-item' };
    const attachments: string[] = [];
    if (o.withJournal) {
      const files: ReportFile[] = await Journal.files(3);
      for (const f of files) {
        const md = await upload(o.token, f);
        if (md) attachments.push(md);
      }
    }
    await api(o.token, `/issues/${item.iid}/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        body: noteBody({ who: '', version: o.version, phone: o.phone, text: o.text, attachments }),
      }),
    });
    return { ok: true, url: item.url };
  } catch (e: any) {
    return { ok: false, error: String(e?.message ?? e) };
  }
}
