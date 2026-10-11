// Entry point for `node --test research/team-article/medium-check/test/`: Node resolves a directory argument to
// its index.js, so this file loads every *.test.mjs next to it (one process). The files also run one by one:
//   node --test 'research/team-article/medium-check/test/*.test.mjs'
import { readdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
for (const f of readdirSync(here).filter((x) => x.endsWith('.test.mjs')).sort()) await import(pathToFileURL(`${here}/${f}`).href);
