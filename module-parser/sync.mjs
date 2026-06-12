#!/usr/bin/env node
/**
 * Sync the canonical module-format parser files to their consumer repos.
 * Cross-repo package sharing isn't practical here, so we keep ONE canonical
 * source (this folder) and copy it verbatim (plus a DO-NOT-EDIT banner).
 *
 * Usage:
 *   node module-parser/sync.mjs           # write copies
 *   node module-parser/sync.mjs --check   # verify copies are in sync (exit 1 on drift)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const projects = path.resolve(here, '../..'); // .../projects

// target directories per canonical file
const TARGETS = {
  'module_types.ts': [
    'reactor-module-tools/module-preview/src',
    'reactor-module-tools/lr-cursor-extension/src/parser',
    'dioco-base/src/modules',
  ],
  'module_parser.ts': [
    'reactor-module-tools/module-preview/src',
    'reactor-module-tools/lr-cursor-extension/src/parser',
    'dioco-base/src/modules',
  ],
  'module_spec.ts': [
    'reactor-module-tools/module-preview/src',
    'reactor-module-tools/lr-cursor-extension/src/parser',
  ],
  'module_diagnostics.ts': [
    'reactor-module-tools/module-preview/src',
    'reactor-module-tools/lr-cursor-extension/src/parser',
  ],
};

const banner = (name) =>
  `// AUTO-SYNCED COPY — DO NOT EDIT.\n` +
  `// Canonical source: reactor-module-tools/module-parser/${name}\n` +
  `// To update: edit the canonical file, then run \`node module-parser/sync.mjs\`.\n\n`;

const check = process.argv.includes('--check');
let drift = 0, written = 0;

for (const [name, dirs] of Object.entries(TARGETS)) {
  const expected = banner(name) + fs.readFileSync(path.join(here, name), 'utf8');
  for (const dir of dirs) {
    const dest = path.join(projects, dir, name);
    const current = fs.existsSync(dest) ? fs.readFileSync(dest, 'utf8') : null;
    if (current === expected) continue;
    if (check) {
      console.error(`DRIFT: ${dir}/${name}`);
      drift++;
    } else {
      fs.writeFileSync(dest, expected);
      console.log(`synced: ${dir}/${name}`);
      written++;
    }
  }
}

if (check) {
  if (drift) {
    console.error(`\n${drift} file(s) out of sync. Run: node module-parser/sync.mjs`);
    process.exit(1);
  }
  console.log('All parser copies in sync.');
} else {
  console.log(`\n${written} file(s) written.`);
}
