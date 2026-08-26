#!/usr/bin/env node
/**
 * Carries CHANGELOG.md into the app.
 *
 * The release notes are written in one place only - the file at the
 * root of the project - and from there they also end up in the app: two
 * copies to be kept in line by hand would become two different copies.
 *
 * The format is minimal on purpose: "## version" headings and
 * paragraphs, with an optional opening in bold. That is enough to make
 * the notes readable without dragging a Markdown parser along.
 */
const fs = require('fs');
const path = require('path');

const appDir = path.join(__dirname, '..');
const source = path.join(appDir, '..', 'CHANGELOG.md');
const outFile = path.join(appDir, 'src', 'changelog.ts');

const text = fs.readFileSync(source, 'utf8');

const versions = [];
let current = null;

for (const line of text.split('\n')) {
  const heading = line.match(/^##\s+(.+?)\s*$/);
  if (heading) {
    current = { version: heading[1], paragraphs: [] };
    versions.push(current);
    continue;
  }
  if (!current) continue;              // the preamble is not needed in the app
  if (!line.trim()) { current.closed = true; continue; }
  // The lines are gathered back into paragraphs: in the file they are
  // broken at 100 columns, but on a phone's screen they have to wrap by
  // themselves.
  if (current.closed || current.paragraphs.length === 0) {
    current.paragraphs.push(line.trim());
    current.closed = false;
  } else {
    current.paragraphs[current.paragraphs.length - 1] += ' ' + line.trim();
  }
}

/** Splits "**Title.** the rest" in two: the bold part and what follows. */
function split(p) {
  const m = p.match(/^\*\*(.+?)\*\*\s*(.*)$/);
  return m ? { strong: m[1], text: m[2] } : { strong: '', text: p };
}

const data = versions.map((v) => ({
  version: v.version,
  paragraphs: v.paragraphs.map(split),
}));

fs.writeFileSync(outFile,
`// Written by scripts/build-changelog.js: do not edit by hand.
// The source is CHANGELOG.md at the root of the project.
export type ReleaseNote = {
  version: string;
  paragraphs: { strong: string; text: string }[];
};

export const CHANGELOG: ReleaseNote[] = ${JSON.stringify(data, null, 2)};
`);

console.log(`release notes: ${data.length} entries`);
