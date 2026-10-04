// morph-gpu rev 3 build (fix-morph-gpu, lead ruling 2026-10-04 on T-113): #platform's fade never sits at exactly 1.
// The Simulator ablation (open-cause-sim.mjs, run 4) showed that the open start's full #platform repaint
// (19 paints, 1.05 Mpx) comes from opacity leaving 1 (the blur half costs 0 paints), and that once opacity is
// below 1, moving it (0.9999 <-> 0.99) costs 0-1 small paints. So the resting value is capped at 0.9999:
//   opacity: var(--morph-fade)  ->  opacity: min(var(--morph-fade), 0.9999)
// Every morph value below 0.9999 is unchanged; at rest the page is drawn at 0.9999 (< 0.03 of a level off 1).
// Writes out/snapshots/fd-<css12> (best-build JS unchanged + the CSS line) and fixes/morph-gpu/rev3/delta.diff.
//   node fixes/morph-gpu/rev3/build.mjs
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const WT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const NODE = '_app/immutable/nodes/2.DyWL8TcE.js', CSS = '_app/immutable/assets/2.gBuqKVzi.css';
const SNAP = join(WT, 'out/snapshots');
const BEST = { js: '65052c4a3902', css: 'e0f92804c521' };
const sha = (b) => createHash('sha256').update(b).digest('hex').slice(0, 12);
const bestDir = join(SNAP, `best-${BEST.js}`);
const js = readFileSync(join(bestDir, NODE)), css0 = readFileSync(join(bestDir, CSS), 'utf8');
if (sha(js) !== BEST.js || sha(css0) !== BEST.css) throw new Error(`${bestDir} is not ${BEST.js} / ${BEST.css}`);
const OLD = '  filter: blur(calc((1 - var(--morph-fade)) * 12px));\n  opacity: var(--morph-fade);\n';
const NEW = '  filter: blur(calc((1 - var(--morph-fade)) * 12px));\n' +
  '  /* [morph-gpu rev 3] never exactly 1: in WebKit (Simulator, OBSERVED) opacity leaving 1 repaints the whole section\n' +
  '     on the open\'s first frame (19 paints, 1.05 Mpx); below 1 the fade only re-composites. 0.9999 is < 0.03 of a level. */\n' +
  '  opacity: min(var(--morph-fade), 0.9999);\n';
if (css0.split(OLD).length !== 2) throw new Error('fade lines not found once');
const css = css0.replace(OLD, NEW);
const dir = join(SNAP, `fd-${sha(css)}`);
if (!existsSync(dir)) {
  mkdirSync(join(dir, dirname(NODE)), { recursive: true }); mkdirSync(join(dir, dirname(CSS)), { recursive: true });
  writeFileSync(join(dir, NODE), js); writeFileSync(join(dir, CSS), css);
}
console.log(`fd ${dir} js ${sha(js)} css ${sha(css)}`);
const tmp = mkdtempSync(join(tmpdir(), 'morph-gpu-rv3-'));
for (const [side, src] of [['a', bestDir], ['b', dir]]) { mkdirSync(join(tmp, side, dirname(CSS)), { recursive: true }); writeFileSync(join(tmp, side, CSS), readFileSync(join(src, CSS))); }
const d = spawnSync('diff', ['-u', join('a', CSS), join('b', CSS)], { cwd: tmp, encoding: 'utf8' });
rmSync(tmp, { recursive: true });
writeFileSync(join(WT, 'fixes/morph-gpu/rev3/delta.diff'), d.stdout);
console.log('wrote fixes/morph-gpu/rev3/delta.diff');
