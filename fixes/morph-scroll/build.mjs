// morph-scroll builds (fix-hero-exit-threaded; PROPOSAL: the end-of-page morph follows the scroll on touch phones).
// Base = best-build B-R2 (out/snapshots/best-BR2-8018ce062d30) + morph-gpu rev 2 A (fixes/morph-gpu/rev2/delta.diff with
// __rvPP = !1) + window.__rvPrepNow (fixes/morph-scroll/prepnow.diff, a copy of morph-gpu a02f2b97's rev2/prepnow.diff).
// Proposal = the overlay fixes/morph-scroll/overlay (base + the morph-scroll change). Writes immutable snapshots:
//   msbase-<js12>   the base (control for the proposal's own checks)
//   msbasehook-<js12> the base + window.__fwMorphSet(m) (morph-gpu's frozen-frame hook, byte for byte)
//   ms-<js12>       the proposal
// and fixes/morph-scroll/delta.diff (proposal vs base, for review).   node fixes/morph-scroll/build.mjs
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const WT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const NODE = '_app/immutable/nodes/2.DyWL8TcE.js', CSS = '_app/immutable/assets/2.gBuqKVzi.css';
const SNAP = join(WT, 'out/snapshots');
const BEST = { dir: join(SNAP, 'best-BR2-8018ce062d30'), js: '8018ce062d30', css: '71b65c667720' };
const OVL = join(WT, 'fixes/morph-scroll/overlay');
const sha = (b) => createHash('sha256').update(b).digest('hex').slice(0, 12);
if (sha(readFileSync(join(BEST.dir, NODE))) !== BEST.js || sha(readFileSync(join(BEST.dir, CSS))) !== BEST.css) throw new Error(`${BEST.dir} is not B-R2`);
const tmp = mkdtempSync(join(tmpdir(), 'morph-scroll-'));
for (const f of [NODE, CSS]) { mkdirSync(join(tmp, dirname(f)), { recursive: true }); writeFileSync(join(tmp, f), readFileSync(join(BEST.dir, f))); }
const patch = (p) => { const r = spawnSync('patch', ['-p1', '-s', '-d', tmp, '-i', p], { encoding: 'utf8' }); if (r.status !== 0) throw new Error(`patch ${p}: ${r.stdout}${r.stderr}`); };
patch(join(WT, 'fixes/morph-gpu/rev2/delta.diff'));
{ const f = join(tmp, NODE), s = readFileSync(f, 'utf8'), PP = '    __rvPP = !0,\n';
  if (s.split(PP).length !== 2) throw new Error('__rvPP switch not found once'); writeFileSync(f, s.replace(PP, '    __rvPP = !1,\n')); }
patch(join(WT, 'fixes/morph-scroll/prepnow.diff'));
const baseJs = readFileSync(join(tmp, NODE), 'utf8'), baseCss = readFileSync(join(tmp, CSS));
rmSync(tmp, { recursive: true });
const AT = '    let ne = dE(L, { manageAnimations: !1 });';
const HOOK = `    // DEBUG ONLY (morph-inherit frozen frames): hold the morph at m (no spring).\n    window.__fwMorphSet = (m) => {\n      (n && window.cancelAnimationFrame(n), (n = 0), C() || (s = __pinY()), (w = a = i = r = m), z(x, m, !0), S(), __osb(), C() || I());\n    };\n`;
if (baseJs.split(AT).length !== 2) throw new Error('hook anchor not unique');
function put(name, j, c) {
  const got = [sha(j), sha(c)], dir = join(SNAP, `${name}-${got[0]}`);
  if (!existsSync(dir)) {
    mkdirSync(join(dir, dirname(NODE)), { recursive: true }); mkdirSync(join(dir, dirname(CSS)), { recursive: true });
    writeFileSync(join(dir, NODE), j); writeFileSync(join(dir, CSS), c);
  }
  console.log(`${name} ${dir} js ${got[0]} css ${got[1]}`);
  return dir;
}
const baseDir = put('msbase', baseJs, baseCss);
put('msbasehook', baseJs.replace(AT, HOOK + AT), baseCss);
const msJs = readFileSync(join(OVL, NODE), 'utf8'), msCss = readFileSync(join(OVL, CSS));
const msDir = put('ms', msJs, msCss);
let out = '';
for (const f of [NODE, CSS]) {
  const d = spawnSync('diff', ['-u', '--label', `a/${f}`, '--label', `b/${f}`, join(baseDir, f), join(msDir, f)], { encoding: 'utf8' });
  if (d.status > 1) throw new Error(d.stderr);
  out += d.stdout;
}
writeFileSync(join(WT, 'fixes/morph-scroll/delta.diff'), out);
console.log(`delta.diff ${sha(out)} (${out.split('\n').length} lines vs msbase)`);
