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
 * The server's settings, for the commands in this folder.
 *
 * The service is handed them by systemd, out of /etc/duetto/server.env;
 * a command typed at a terminal was handed nothing, and found the list
 * only because the list sat in the folder it was run from. With the
 * list in /var/lib/duetto that is so no longer - and an invitation made
 * here lasted the default days, whatever INVITE_DAYS said to the
 * service. So the commands read the file the service reads, and see
 * what it sees. What is in the environment already wins, as it does
 * with `KEY=value npm run ...`; DUETTO_ENV names another file; and a
 * file that is not there is no fault: a checkout, a container, have
 * none.
 *
 * Imported first, before src/devices.js, which looks for the list the
 * moment it is loaded.
 *
 * The file is read as systemd reads it: a KEY=value a line, the lines
 * that start with # or ; left out, the quotes around a value taken off.
 */
import { readFileSync } from 'node:fs';

const FILE = process.env.DUETTO_ENV || '/etc/duetto/server.env';

let text = '';
try {
  text = readFileSync(FILE, 'utf8');
} catch (e) {
  if (e.code !== 'ENOENT') {
    // There, and not for this user: the settings are root's and the
    // service's, and a command that went on without them would write a
    // list of its own somewhere else.
    console.error(`${FILE}: ${e.code === 'EACCES' ? 'not readable by this user' : e.message}`);
    console.error('run the command as the service\'s user: sudo -u duetto npm run ...');
    process.exit(1);
  }
}

for (const line of text.split('\n')) {
  const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/.exec(line);
  if (!m || m[1] in process.env) continue;
  let value = m[2].trim();
  const q = value[0];
  if ((q === '"' || q === '\'') && value.length > 1 && value.endsWith(q)) value = value.slice(1, -1);
  process.env[m[1]] = value;
}
