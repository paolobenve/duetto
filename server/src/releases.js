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
 * The latest Duetto, as the project publishes it.
 *
 * Two things want it. The page behind a link handed to somebody who has
 * no Duetto yet: "get it from F-Droid" was two installations - F-Droid
 * first, then Duetto - for the person on the other end, who had asked
 * for nothing; the APK itself is one. And the phones: the testers did
 * not update - one of them talks every day on a version three weeks
 * old, and the mending done since never reaches them - because nothing
 * told them. The phone asks nobody but its server, so the server is the
 * one that says it.
 *
 * Read from GitLab's public list of releases, with no token, at the
 * start and every few hours; until it has been read, or if it cannot
 * be, there is simply no latest to tell, and nothing says otherwise.
 * RELEASES_PROJECT names another project, for a server that hands out
 * a Duetto of its own; "off" asks nobody.
 *
 * Two APKs to a release. The light one, without the notification
 * listener, is the one for a browser: Play Protect stops an app that
 * reads notifications when it comes from a browser, a messaging app or
 * a files app - not from a store. The full one, for whoever has it
 * already from a file, so as not to take a feature away with an
 * update. And F-Droid's version, read from its own list: whoever got
 * Duetto there updates there - from a browser Android would ask a
 * leave they never gave - and F-Droid builds a few days after GitLab.
 */
const PROJECT = process.env.RELEASES_PROJECT || 'paolobenve/duetto';
const GITLAB = (process.env.GITLAB_URL || 'https://gitlab.com').replace(/\/+$/, '');
const FDROID_PACKAGE = 'com.duetto';
const EVERY_MS = 6 * 3600_000;

/**
 * { version: '0.9.21', page: the release's page, apk: the light APK -
 * or the only one -, full: the full APK, fdroid: the version on F-Droid;
 * '' for what is not known }
 */
let latest = null;

export function latestRelease() {
  return latest;
}

async function look() {
  try {
    const res = await fetch(
      `${GITLAB}/api/v4/projects/${encodeURIComponent(PROJECT)}/releases/permalink/latest`,
      { signal: AbortSignal.timeout(20_000) },
    );
    if (!res.ok) throw new Error(`gitlab-${res.status}`);
    const r = await res.json();
    const version = String(r.tag_name || '').replace(/^v/, '');
    if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error(`tag ${r.tag_name}`);
    const apks = (r.assets?.links || [])
      .map((l) => String(l.direct_asset_url || l.url || ''))
      .filter((u) => /^https:\/\/\S+\.apk$/i.test(u));
    const full = apks.find((u) => !/light/i.test(u)) || '';
    const apk = apks.find((u) => /light/i.test(u)) || full;
    const page = /^https:\/\//.test(String(r._links?.self || '')) ? r._links.self : '';
    const fdroid = await fdroidVersion();
    if (latest?.version !== version || latest?.fdroid !== fdroid) {
      console.log(`[duetto] latest release: ${version}, on F-Droid: ${fdroid || '?'}`);
    }
    latest = { version, page, apk, full, fdroid };
  } catch (e) {
    console.warn(`[duetto] latest release not read: ${e.message}`);
  }
}

/** The version F-Droid offers, '' if it cannot be read. */
async function fdroidVersion() {
  try {
    const res = await fetch(`https://f-droid.org/api/v1/packages/${FDROID_PACKAGE}`,
      { signal: AbortSignal.timeout(20_000) });
    if (!res.ok) return '';
    const p = await res.json();
    const offered = (p.packages || []).find((x) => x.versionCode === p.suggestedVersionCode);
    const name = String(offered?.versionName || '');
    return /^\d+\.\d+\.\d+$/.test(name) ? name : '';
  } catch {
    return '';
  }
}

export function watchReleases() {
  if (PROJECT === 'off') return;
  look();
  setInterval(look, EVERY_MS).unref();
}
