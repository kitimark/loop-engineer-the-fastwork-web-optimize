// scrollcb-g0 arms (fix-scrollcb-g0, 2026-10-09): immutable snapshot copies to serve. Same API as
// fixes/scroll-cb-phone/build.mjs (WT, JS, CSS, sha, build()), so the copied harnesses (probe/scb-probe.mjs, simcount.mjs,
// score-p108.mjs, pixcheck.mjs) run unchanged against these arms.
//   C  g0.0f, the current best (fixes/v3w-g00e/patch.diff on the baseline): JS 30fd80ccbb3f / CSS 1d1e5d62a2c4
//   V  g0.0f + this topic's patch.diff (JS only; CSS is C's)
// Snapshot dir: $SCB_SNAP (default out/scb/snap1) with C/ and V/ (read-only) and HASHES.txt; every file is re-hashed at
// each call and compared with the pins below (SCB_V_JS overrides V's JS pin for a new V build).
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
export const HERE = dirname(fileURLToPath(import.meta.url));
export const WT = join(HERE, '../..');
export const JS = '_app/immutable/nodes/2.DyWL8TcE.js';
export const CSS = '_app/immutable/assets/2.gBuqKVzi.css';
export const sha = (b) => createHash('sha256').update(b).digest('hex').slice(0, 12);
export const PIN = { C: ['30fd80ccbb3f', '1d1e5d62a2c4'], V: [process.env.SCB_V_JS || '82fabdcf7230', '1d1e5d62a2c4'] };
const SNAP = join(WT, process.env.SCB_SNAP || 'out/scb/snap1');
export function build({ quiet = false } = {}) {
  const log = (...a) => quiet || console.log(...a);
  const arms = {};
  for (const k of ['C', 'V']) {
    const dir = join(SNAP, k);
    const got = [JS, CSS].map((f) => {
      if (!existsSync(join(dir, f))) throw new Error(`${dir}: missing ${f}`);
      return sha(readFileSync(join(dir, f)));
    });
    if (got[0] !== PIN[k][0] || got[1] !== PIN[k][1]) throw new Error(`arm ${k}: ${got.join(' / ')}, pinned ${PIN[k].join(' / ')}`);
    arms[k] = { dir, js: got[0], css: got[1] };
    log(`${k}  js ${got[0]} css ${got[1]}  ${dir.replace(WT + '/', '')}`);
  }
  return arms;
}
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) build();
