// morph-scroll builds (fix-hero-exit-threaded; PROPOSAL: the end-of-page morph follows the scroll on touch phones).
// Rev 2 (PR-018 rev 2): no morph-gpu rev 2 A and no __rvPrepNow (rev 2 A measured worse on the phone, P-098).
// Base = the best build, the baseline + one baseline-relative patch:
//   --base v8  (default since PR-018 rev 7b) fixes/v8-best/patch.diff js 3e3e94cb6e9f / css f836404b3728 (v8 replaced v7)
//   --base v7            fixes/v7-best/patch.diff       js 8c90da217745 / css 308f0da70c3a  (best build since c3dc73b1)
//   --base br2           fixes/hero-exit-threaded/patch.diff js 8018ce062d30 / css 71b65c667720 (B-R2, PR-018 rev 1's A)
// Proposal = the overlay fixes/morph-scroll/overlay (base + the morph-scroll change). Writes immutable snapshots:
//   msbase-<js12>     the base (= Try-it A)
//   msbasehook-<js12> the base + window.__fwMorphSet(m) (morph-gpu's frozen-frame hook, byte for byte; control for frames)
//   ms-<js12>         the proposal (= Try-it B)
// and fixes/morph-scroll/delta.diff (proposal vs base, for review).
//   node fixes/morph-scroll/build.mjs [--base v7|br2] [--seed <delta.diff>]
// --seed: (re)write the overlay as base + that JS diff (patch, fuzz allowed) + ms.css appended to the CSS, before
// snapshotting; without it the overlay is taken as it is and must already be built on this base.
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveTree } from '../../tools/lib/paths.mjs';
const WT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const NODE = '_app/immutable/nodes/2.DyWL8TcE.js', CSS = '_app/immutable/assets/2.gBuqKVzi.css';
const SNAP = join(WT, 'out/snapshots');
const BASES = {
  v8: { patch: 'fixes/v8-best/patch.diff', js: '3e3e94cb6e9f', css: 'f836404b3728' },
  v7: { patch: 'fixes/v7-best/patch.diff', js: '8c90da217745', css: '308f0da70c3a' },
  br2: { patch: 'fixes/hero-exit-threaded/patch.diff', js: '8018ce062d30', css: '71b65c667720' },
};
const BASE = BASES[arg('--base', 'v8')];
if (!BASE) throw new Error(`--base: one of ${Object.keys(BASES).join(', ')}`);
const OVL = join(WT, 'fixes/morph-scroll/overlay');
const PRETTY = resolveTree('site-pretty');
const sha = (b) => createHash('sha256').update(b).digest('hex').slice(0, 12);
const patchInto = (dir, p, extra = []) => {
  const r = spawnSync('patch', ['-p1', '-s', '--no-backup-if-mismatch', ...extra, '-d', dir, '-i', p], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`patch ${p}: ${r.stdout}${r.stderr}`);
  return r.stdout;
};
const tmp = mkdtempSync(join(tmpdir(), 'morph-scroll-'));
for (const f of [NODE, CSS]) { mkdirSync(join(tmp, dirname(f)), { recursive: true }); writeFileSync(join(tmp, f), readFileSync(join(PRETTY, f))); }
patchInto(tmp, join(WT, BASE.patch));
const baseJs = readFileSync(join(tmp, NODE), 'utf8'), baseCss = readFileSync(join(tmp, CSS));
if (sha(baseJs) !== BASE.js || sha(baseCss) !== BASE.css) throw new Error(`base build is ${sha(baseJs)} / ${sha(baseCss)}, expected ${BASE.js} / ${BASE.css}`);
const seed = arg('--seed');
if (seed) {
  // the JS change from the diff; the CSS change is fixes/morph-scroll/ms.css appended to the base CSS
  const out = patchInto(tmp, seed, ['-F', '3']);
  writeFileSync(join(tmp, CSS), Buffer.concat([baseCss, readFileSync(join(WT, 'fixes/morph-scroll/ms.css'))]));
  for (const f of [NODE, CSS]) { mkdirSync(join(OVL, dirname(f)), { recursive: true }); writeFileSync(join(OVL, f), readFileSync(join(tmp, f))); }
  console.log(`seeded overlay from ${seed}${out ? `\n${out}` : ''}`);
}
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
