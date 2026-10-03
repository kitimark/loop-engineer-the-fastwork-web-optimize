// Immutable copies of the arms' overlays for the Simulator/phone runs: out/cd-strip/snap/<arm> + hashes.json
// (sha256 of the node JS and the CSS per arm; sim.mjs refuses an arm whose server serves anything else).
// Usage: node fixes/cd-strip/snap.mjs
import { cpSync, rmSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { REPO as WT, resolveTree } from '../../tools/lib/paths.mjs';
const NODE = '_app/immutable/nodes/2.DyWL8TcE.js', CSS = '_app/immutable/assets/2.gBuqKVzi.css';
const ARMS = { st6rb2: 'fixes/st6-rb2/overlay', strip: 'fixes/cd-strip/overlay', 'strip-a': 'fixes/cd-strip--a/overlay', 'strip-cl': 'out/cd-strip/arm-cl', 'strip-rb': 'out/cd-strip/arm-rb', 'strip-rbf': 'out/cd-strip/arm-rbf', st6rb2b: 'fixes/st6-rb2/overlay' };
const SNAP = join(WT, 'out/cd-strip/snap');
const sha = (f) => createHash('sha256').update(readFileSync(f)).digest('hex');
const base = resolveTree('site-pretty');
const hashes = {};
for (const [arm, src] of Object.entries(ARMS)) {
  const d = join(SNAP, arm); rmSync(d, { recursive: true, force: true }); mkdirSync(d, { recursive: true });
  cpSync(join(WT, src), d, { recursive: true });
  const f = (p) => (existsSync(join(d, p)) ? join(d, p) : join(base, p));
  hashes[arm] = { js: sha(f(NODE)), css: sha(f(CSS)) };
  console.log(arm, hashes[arm].js.slice(0, 12), hashes[arm].css.slice(0, 12));
}
writeFileSync(join(SNAP, 'hashes.json'), JSON.stringify(hashes, null, 1));
