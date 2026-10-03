// morph-gpu builds (fix-morph-gpu): immutable snapshot copies in out/snapshots for the gates (fixes/morph-gpu/gates/).
// The fix stacks on best-build (main 60df1cf: st6-rb2 + platform-idle + morph-inherit, js 65052c4a3902, css e0f92804c521).
//   best-<js12>     = A: best-build (fixes/best-build/build.mjs --snapshot), checked against its pinned hashes
//   besthook-<js12> = A + the debug hook window.__fwMorphSet(m) (frozen frames only)
//   rv-<js12>       = B: this fix (fixes/morph-gpu/overlay = best-build + the reveal); what would land
//   rvhook-<js12>   = B + the same hook, byte for byte the same hook text, plus a frame stepper for the switch-off
//                     frames: its rAF calls go through window.__rvRaf when a gate sets it (unset = the same as rv)
// Also writes fixes/morph-gpu/delta.diff: this fix's own change against best-build (diff -u, both files).
//   node fixes/morph-gpu/build.mjs
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const WT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const NODE = '_app/immutable/nodes/2.DyWL8TcE.js', CSS = '_app/immutable/assets/2.gBuqKVzi.css';
const SNAP = join(WT, 'out/snapshots');
const OV = join(WT, 'fixes/morph-gpu/overlay');
const BEST = { js: '65052c4a3902', css: 'e0f92804c521' };
const sha = (b) => createHash('sha256').update(b).digest('hex').slice(0, 12);
const bestDir = join(SNAP, `best-${BEST.js}`);
if (!existsSync(join(bestDir, NODE))) execFileSync(process.execPath, [join(WT, 'fixes/best-build/build.mjs'), '--snapshot'], { stdio: 'inherit' });
const bjs = readFileSync(join(bestDir, NODE), 'utf8'), bcss = readFileSync(join(bestDir, CSS));
if (sha(bjs) !== BEST.js || sha(bcss) !== BEST.css) throw new Error(`best-build snapshot is ${sha(bjs)} / ${sha(bcss)}, expected ${BEST.js} / ${BEST.css}`);
const AT = '    let ne = dE(L, { manageAnimations: !1 });';
const HOOK = `    // DEBUG ONLY (morph-inherit frozen frames): hold the morph at m (no spring).\n    window.__fwMorphSet = (m) => {\n      (n && window.cancelAnimationFrame(n), (n = 0), C() || (s = __pinY()), (w = a = i = r = m), z(x, m, !0), S(), __osb(), C() || I());\n    };\n`;
const addHook = (js) => { if (js.split(AT).length !== 2) throw new Error('hook anchor not unique'); return js.replace(AT, HOOK + AT); };
function put(name, js, css) {
  const got = [sha(js), sha(css)];
  const dir = join(SNAP, `${name}-${got[0]}`);
  if (!existsSync(dir)) {
    mkdirSync(join(dir, dirname(NODE)), { recursive: true }); mkdirSync(join(dir, dirname(CSS)), { recursive: true });
    writeFileSync(join(dir, NODE), js); writeFileSync(join(dir, CSS), css);
  }
  console.log(`${name} ${dir} js ${got[0]} css ${got[1]}`);
  return got;
}
put('besthook', addHook(bjs), bcss);
const js = readFileSync(join(OV, NODE), 'utf8'), css = readFileSync(join(OV, CSS));
put('rv', js, css);
const RAF = '__rvF = requestAnimationFrame(';
const addStep = (js) => { const n = js.split(RAF).length - 1; if (n !== 3) throw new Error(`switch-off rAF calls: ${n}, expected 3`); return js.split(RAF).join('__rvF = (window.__rvRaf || requestAnimationFrame)('); };
put('rvhook', addStep(addHook(js)), css);
let delta = '';
for (const f of [NODE, CSS]) {
  const d = spawnSync('diff', ['-u', '--label', `a/${f}`, '--label', `b/${f}`, join(bestDir, f), join(OV, f)], { encoding: 'utf8' });
  if (d.status > 1) throw new Error(d.stderr);
  delta += d.stdout;
}
writeFileSync(join(WT, 'fixes/morph-gpu/delta.diff'), delta);
console.log(`delta.diff ${sha(delta)} (${delta.split('\n').length} lines, against best-build ${BEST.js} / ${BEST.css})`);
