// morph-gpu rev 2 builds (fix-morph-gpu): the reveal's setup moves off the tween-start frame (P-092 cost, lead ruling
// 2026-10-04). Source: out/morph-gpu/rev2/b (gitignored working copy: rev 1 + __rvPrep + the data-fw-rvp CSS), or, without
// it, best-build + the committed fixes/morph-gpu/rev2/delta.diff. Writes immutable snapshots in out/snapshots:
//   rv2b-<js12>     = rev 2 as written: setup before the morph (__rvPrep) + layers kept promoted near the end (__rvPP on)
//   rv2a-<js12>     = the same with __rvPP off: only the setup moves (dark/glass layers created, panel size measured)
//   rv2bhook-<js12> / rv2ahook-<js12> = + window.__fwMorphSet(m) and the __rvRaf frame stepper, byte for byte as
//                     fixes/morph-gpu/build.mjs adds them to rv (frozen frames and inline-style checks only)
// and fixes/morph-gpu/rev2/delta.diff (rev 2 b against best-build) + rev1-to-rev2.diff (against rev 1, for review).
//   node fixes/morph-gpu/rev2/build.mjs
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const WT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const NODE = '_app/immutable/nodes/2.DyWL8TcE.js', CSS = '_app/immutable/assets/2.gBuqKVzi.css';
const SNAP = join(WT, 'out/snapshots');
const SRC = join(WT, 'out/morph-gpu/rev2/b');
const BEST = { js: '65052c4a3902', css: 'e0f92804c521' };
const RV1 = { js: '372b99478871', css: '257507365449' };
const sha = (b) => createHash('sha256').update(b).digest('hex').slice(0, 12);
const bestDir = join(SNAP, `best-${BEST.js}`), rv1Dir = join(SNAP, `rv-${RV1.js}`);
for (const [d, h] of [[bestDir, BEST], [rv1Dir, RV1]]) {
  if (!existsSync(join(d, NODE))) throw new Error(`missing ${d}: run fixes/morph-gpu/build.mjs first`);
  if (sha(readFileSync(join(d, NODE))) !== h.js || sha(readFileSync(join(d, CSS))) !== h.css) throw new Error(`${d} is not ${h.js} / ${h.css}`);
}
const fromDelta = !existsSync(join(SRC, NODE));
let js, css;
if (fromDelta) {
  const tmp = mkdtempSync(join(tmpdir(), 'morph-gpu-rv2-'));
  for (const f of [NODE, CSS]) { mkdirSync(join(tmp, dirname(f)), { recursive: true }); writeFileSync(join(tmp, f), readFileSync(join(bestDir, f))); }
  const pr = spawnSync('patch', ['-p1', '-s', '-d', tmp, '-i', join(WT, 'fixes/morph-gpu/rev2/delta.diff')], { encoding: 'utf8' });
  if (pr.status !== 0) throw new Error(`patch rev2/delta.diff: ${pr.stdout}${pr.stderr}`);
  js = readFileSync(join(tmp, NODE), 'utf8'); css = readFileSync(join(tmp, CSS)); rmSync(tmp, { recursive: true });
} else { js = readFileSync(join(SRC, NODE), 'utf8'); css = readFileSync(join(SRC, CSS)); }

const PP = '    __rvPP = !0,\n';
if (js.split(PP).length !== 2) throw new Error('__rvPP switch not found once');
const AT = '    let ne = dE(L, { manageAnimations: !1 });';
const HOOK = `    // DEBUG ONLY (morph-inherit frozen frames): hold the morph at m (no spring).\n    window.__fwMorphSet = (m) => {\n      (n && window.cancelAnimationFrame(n), (n = 0), C() || (s = __pinY()), (w = a = i = r = m), z(x, m, !0), S(), __osb(), C() || I());\n    };\n`;
const addHook = (s) => { if (s.split(AT).length !== 2) throw new Error('hook anchor not unique'); return s.replace(AT, HOOK + AT); };
const RAF = '__rvF = requestAnimationFrame(';
const addStep = (s) => { const n = s.split(RAF).length - 1; if (n !== 3) throw new Error(`switch-off rAF calls: ${n}, expected 3`); return s.split(RAF).join('__rvF = (window.__rvRaf || requestAnimationFrame)('); };
function put(name, j, c) {
  const got = [sha(j), sha(c)], dir = join(SNAP, `${name}-${got[0]}`);
  if (!existsSync(dir)) {
    mkdirSync(join(dir, dirname(NODE)), { recursive: true }); mkdirSync(join(dir, dirname(CSS)), { recursive: true });
    writeFileSync(join(dir, NODE), j); writeFileSync(join(dir, CSS), c);
  }
  console.log(`${name} ${dir} js ${got[0]} css ${got[1]}`);
  return got;
}
const jsA = js.replace(PP, '    __rvPP = !1,\n');
put('rv2b', js, css); put('rv2a', jsA, css);
put('rv2bhook', addStep(addHook(js)), css); put('rv2ahook', addStep(addHook(jsA)), css);
if (fromDelta) { console.log('rev 2 built from rev2/delta.diff (no working copy)'); process.exit(0); }
const diff = (a, b) => {
  let out = '';
  for (const f of [NODE, CSS]) {
    const d = spawnSync('diff', ['-u', '--label', `a/${f}`, '--label', `b/${f}`, join(a, f), join(b, f)], { encoding: 'utf8' });
    if (d.status > 1) throw new Error(d.stderr);
    out += d.stdout;
  }
  return out;
};
const d1 = diff(bestDir, SRC), d2 = diff(rv1Dir, SRC);
writeFileSync(join(WT, 'fixes/morph-gpu/rev2/delta.diff'), d1);
writeFileSync(join(WT, 'fixes/morph-gpu/rev2/rev1-to-rev2.diff'), d2);
console.log(`rev2/delta.diff ${sha(d1)} (${d1.split('\n').length} lines vs best-build), rev1-to-rev2.diff ${sha(d2)} (${d2.split('\n').length} lines)`);
