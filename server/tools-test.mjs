/*
 * Duetto - a permanent voice and video channel for two people.
 * Copyright (C) 2026 Paolo Benvenuto
 *
 * Free software under the GNU General Public License, version 3 or any
 * later version, and with no warranty of any kind. The full text is in
 * the LICENSE file at the root of the project, and at
 * <https://www.gnu.org/licenses/>.
 */
// The commands at the terminal see what the service sees: the settings
// file the unit reads, with the list wherever it says, what is in the
// environment winning over it, no file being no fault, and a file that
// is there but not for this user stopping the command instead of
// letting it write a list of its own. Run from this directory:
// `npm run test:tools`.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const DIR = mkdtempSync(path.join(tmpdir(), 'duetto-tools-'));
const SETTINGS = path.join(DIR, 'server.env');
const LIST = path.join(DIR, 'list.json');
const OTHER = path.join(DIR, 'other.json');

/**
 * A command of tools/, with these variables and no DEVICES_FILE of the
 * caller's - and run from the test's own folder, where a command that
 * missed the settings would leave its devices.json, and not here.
 */
const TOOLS = path.join(path.dirname(new URL(import.meta.url).pathname), 'tools');
function run(tool, args, env) {
  const clean = { ...process.env };
  delete clean.DEVICES_FILE;
  delete clean.INVITE_DAYS;
  const r = spawnSync('node', [path.join(TOOLS, `${tool}.mjs`), ...args],
    { cwd: DIR, env: { ...clean, ...env }, encoding: 'utf8' });
  return { code: r.status, out: r.stdout, err: r.stderr };
}
const invitedIn = (file) => (existsSync(file)
  ? JSON.parse(readFileSync(file, 'utf8')).invitations.map((i) => i.name) : []);

let failed = 0;
const check = (label, ok, detail) => { console.log(`${ok ? 'OK ' : 'FAIL'} ${label}${ok ? '' : ' -> ' + JSON.stringify(detail)}`); if (!ok) failed++; };

try {
  writeFileSync(SETTINGS, [
    '# the settings of a server, as systemd reads them',
    '; DEVICES_FILE=/nowhere/a-comment.json',
    '#DEVICES_FILE=/nowhere/another-comment.json',
    `DEVICES_FILE=${LIST}`,
    'INVITE_DAYS="3"',
    'export NOT_A_SETTING=1',
    '',
  ].join('\n'));

  let r = run('invite', ['anna'], { DUETTO_ENV: SETTINGS });
  check('an invitation is written in the list the settings name',
    r.code === 0 && r.out.includes(`Written in ${LIST}`) && invitedIn(LIST).includes('anna')
      && !existsSync(path.join(DIR, 'devices.json')), r);
  check('and lasts the days they say, quotes taken off', r.out.includes('good for 3 days'), r.out);

  r = run('invite', ['ANNA'], { DUETTO_ENV: SETTINGS });
  check('a name that is somebody\'s, in capitals: the command says so and writes nothing',
    r.code === 1 && r.err.includes('somebody\'s already') && invitedIn(LIST).length === 1, r);

  r = run('devices', [], { DUETTO_ENV: SETTINGS });
  check('the list is read from there too', r.code === 0 && r.out.startsWith(LIST) && r.out.includes('for anna'), r);

  r = run('invite', ['bruno'], { DUETTO_ENV: SETTINGS, DEVICES_FILE: OTHER });
  check('what is in the environment wins over the file',
    r.code === 0 && r.out.includes(`Written in ${OTHER}`) && invitedIn(OTHER).includes('bruno')
      && !invitedIn(LIST).includes('bruno'), r);

  r = run('invite', ['carla'], { DUETTO_ENV: path.join(DIR, 'missing.env'), DEVICES_FILE: OTHER });
  check('no settings file is no fault', r.code === 0 && invitedIn(OTHER).includes('carla'), r);

  // Taken away at the terminal as from the app: the relay users go too,
  // the person's and those of whoever they had brought along - each by
  // the relay's own command, which the command waits for.
  const LIST_R = path.join(DIR, 'remove.json');
  const ADMIN = path.join(DIR, 'turn-admin.sh');
  const ADMIN_LOG = path.join(DIR, 'turn-admin.log');
  writeFileSync(ADMIN, `#!/bin/sh\necho "$@" >> ${ADMIN_LOG}\n`);
  chmodSync(ADMIN, 0o755);
  writeFileSync(LIST_R, JSON.stringify({
    devices: [
      { name: 'anna', pub: 'PUB-ANNA', since: '2026-11-01T00:00:00.000Z' },
      { name: 'bruno', pub: 'PUB-BRUNO', since: '2026-11-01T00:00:00.000Z' },
    ],
    rooms: [{ room: 'r1', owner: 'anna', guest: 'PUB-GUEST' }, { room: 'r2', owner: 'bruno', guest: 'PUB-OTHER' }],
    turn: { 'PUB-ANNA': { user: 'annasrelay01', pass: 'x' }, 'PUB-BRUNO': { user: 'brunosrelay1', pass: 'y' } },
  }));
  r = run('devices', ['--remove', 'anna'],
    { DUETTO_ENV: path.join(DIR, 'missing.env'), DEVICES_FILE: LIST_R, TURN_ADMIN_CMD: ADMIN });
  const asked = existsSync(ADMIN_LOG) ? readFileSync(ADMIN_LOG, 'utf8') : '';
  const guestUser = createHash('sha256').update('PUB-GUEST').digest('hex').slice(0, 12);
  const after = JSON.parse(readFileSync(LIST_R, 'utf8'));
  check('taken off at the terminal: off the list', r.code === 0 && r.out.includes('taken off the list')
    && after.devices.every((d) => d.name !== 'anna'), r);
  check('and their relay user dropped, and their guest\'s',
    asked.includes('del annasrelay01') && asked.includes(`del ${guestUser}`) && !('PUB-ANNA' in after.turn), { asked, turn: after.turn });
  check('nobody else\'s', !asked.includes('brunosrelay1') && 'PUB-BRUNO' in after.turn, { asked, turn: after.turn });

  // Root reads whatever it likes: the case is for everybody else.
  if (process.getuid?.() !== 0) {
    chmodSync(SETTINGS, 0o000);
    // With a list named in the environment, too: the other settings
    // would be missing all the same.
    r = run('invite', ['dario'], { DUETTO_ENV: SETTINGS, DEVICES_FILE: OTHER });
    check('settings there but not for this user: the command stops, and says how to run it',
      r.code === 1 && r.err.includes('sudo -u duetto') && !invitedIn(OTHER).includes('dario'), r);
    chmodSync(SETTINGS, 0o600);
  }
} finally {
  rmSync(DIR, { recursive: true, force: true });
}
console.log(failed ? `\n${failed} FAILED` : '\nALL OK');
process.exit(failed ? 1 : 0);
