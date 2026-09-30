// Preload (`node --import <this> tools/serve.mjs … --state <file>`) that makes the --state file write
// slow: every fs write to a path ending in $SLOW_STATE_SUFFIX (default "state.json") first busy-waits
// $SLOW_STATE_MS (default 1500) ms. Turns the "MIRROR_URL printed before the state file exists" race
// (incident I-014) from a rare flake under load into a deterministic failure.
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';

const SUFFIX = process.env.SLOW_STATE_SUFFIX || 'state.json';
const MS = Number(process.env.SLOW_STATE_MS || 1500);
const slow = (f) => { if (String(f).endsWith(SUFFIX)) { const t = Date.now() + MS; while (Date.now() < t); } };
for (const name of ['writeFileSync', 'renameSync']) {
  const orig = fs[name];
  fs[name] = function (...a) { slow(name === 'renameSync' ? a[1] : a[0]); return orig.apply(this, a); };
}
syncBuiltinESMExports(); // make `import { writeFileSync } from 'node:fs'` in serve.mjs see the wrapper
