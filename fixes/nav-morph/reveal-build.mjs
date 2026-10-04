// F3 #4 prototype builds (fix-nav-morph): immutable snapshot copies for the frozen frames and the Simulator counts.
//   C-hook  = C (st6-rb2, out/snapshots/f3a-st6rb2) + the debug hook window.__fwMorphSet(m) only (no visual change)
//   P       = the #4 prototype (fixes/f3-reveal/overlay: C + composited reveal + the same hook)
// Writes out/snapshots/f3r-chook-<js12>/ and out/snapshots/f3r-proto-<js12>/ and prints their JS / CSS hashes.
//   node fixes/nav-morph/reveal-build.mjs
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const WT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const NODE = '_app/immutable/nodes/2.DyWL8TcE.js', CSS = '_app/immutable/assets/2.gBuqKVzi.css';
const SNAP = join(WT, 'out/snapshots');
const sha = (b) => createHash('sha256').update(b).digest('hex').slice(0, 12);
const C = join(SNAP, 'f3a-st6rb2'), P = join(WT, 'fixes/f3-reveal/overlay');
const HOOK_AT = '    let ne = dE(L, { manageAnimations: !1 });';
const HOOK = `    // DEBUG ONLY (F3 #4 frozen frames): hold the morph at m (no spring), for screenshots at fixed tween times.
    window.__fwMorphSet = (m) => {
      (n && window.cancelAnimationFrame(n), (n = 0), C() || (s = __pinY()), (w = a = i = r = m), z(x, m, !0), S(), __osb(), C() || I());
    };
`;
function put(name, js, css) {
  const dir = join(SNAP, `f3r-${name}-${sha(js)}`);
  if (!existsSync(dir)) {
    mkdirSync(join(dir, dirname(NODE)), { recursive: true }); mkdirSync(join(dir, dirname(CSS)), { recursive: true });
    writeFileSync(join(dir, NODE), js); writeFileSync(join(dir, CSS), css);
  }
  console.log(`${name} ${dir} js ${sha(js)} css ${sha(css)}`);
}
let cjs = readFileSync(join(C, NODE), 'utf8');
if (cjs.split(HOOK_AT).length !== 2) throw new Error('hook anchor not unique in C');
cjs = cjs.replace(HOOK_AT, HOOK + HOOK_AT);
put('chook', cjs, readFileSync(join(C, CSS)));
const pjs = readFileSync(join(P, NODE), 'utf8');
if (!pjs.includes('window.__fwMorphSet')) throw new Error('prototype has no hook');
put('proto', pjs, readFileSync(join(P, CSS)));
