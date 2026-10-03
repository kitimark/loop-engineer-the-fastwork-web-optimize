// morph-inherit builds (fix-nav-morph): immutable snapshot copies for the gates (fixes/morph-inherit/gates/).
//   mi-<js12>     = C + the inline --morph writes on the nav children (this fix). Source: fixes/morph-inherit/overlay
//                   when present, else the baseline + patch.diff (applied with patch(1) in out/morph-inherit/src)
//   c-<js12>      = C = st6-rb2: mi with delta-vs-st6rb2.diff reversed
//   mhook-<js12>  = mi + the debug hook window.__fwMorphSet(m) (holds the morph at m; frozen frames only)
//   chook-<js12>  = C + the same hook, byte for byte the text of the F3 #4 prototype's C build (f6f254402209)
//   bhook-<js12>  = plain baseline + the same hook, adapted to the baseline's variables (no __pinY / __osb there)
//   bdrive-<js12> = plain baseline + the phone morph driver window.__fwMorphDrive copied from mi (P-085 control, driver M)
// Every build is checked against the hashes the gates were measured with (EXPECT) and refused on a mismatch.
// The gate data in README.md were taken with the fixes/nav-morph/ copies of these scripts, whose snapshot dirs for C
// were f3a-st6rb2 / st6-rb2-7bf7c4657d21 and f3r-chook-f6f254402209: the same bytes as c- and chook- here.
//   node fixes/morph-inherit/build.mjs
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const WT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const { resolveTree } = await import(join(WT, 'tools/lib/paths.mjs'));
const NODE = '_app/immutable/nodes/2.DyWL8TcE.js', CSS = '_app/immutable/assets/2.gBuqKVzi.css';
const SNAP = join(WT, 'out/snapshots');
const FIX = join(WT, 'fixes/morph-inherit');
const sha = (b) => createHash('sha256').update(b).digest('hex').slice(0, 12);
const EXPECT = {
  mi: ['7c61fe7d0662', 'f523598b2a24'], c: ['7bf7c4657d21', 'f523598b2a24'],
  mhook: ['d9898e0a2e15', 'f523598b2a24'], chook: ['f6f254402209', 'f523598b2a24'], bhook: ['a0945967a4fb', '27776f3d4138'],
  bdrive: ['afd388b8945a', '27776f3d4138'],
};
const AT = '    let ne = dE(L, { manageAnimations: !1 });';
const hook = (body, what = 'morph-inherit frozen frames): hold the morph at m (no spring).') => `    // DEBUG ONLY (${what}\n    window.__fwMorphSet = (m) => {\n      ${body};\n    };\n`;
const C_BODY = '(n && window.cancelAnimationFrame(n), (n = 0), C() || (s = __pinY()), (w = a = i = r = m), z(x, m, !0), S(), __osb(), C() || I())';
const C_HOOK = hook(C_BODY);
const C_HOOK_F3 = hook(C_BODY, 'F3 #4 frozen frames): hold the morph at m (no spring), for screenshots at fixed tween times.');
const B_HOOK = hook('(n && window.cancelAnimationFrame(n), (n = 0), C() || (s = window.scrollY), (w = a = i = r = m), z(x, m, !0), S(), C() || I())');
function put(name, js, css) {
  const got = [sha(js), sha(css)];
  if (got.join() !== EXPECT[name].join()) throw new Error(`${name}: js ${got[0]} css ${got[1]}, expected ${EXPECT[name].join(' / ')}`);
  const dir = join(SNAP, `${name}-${got[0]}`);
  if (!existsSync(dir)) {
    mkdirSync(join(dir, dirname(NODE)), { recursive: true }); mkdirSync(join(dir, dirname(CSS)), { recursive: true });
    writeFileSync(join(dir, NODE), js); writeFileSync(join(dir, CSS), css);
  }
  console.log(`${name} ${dir} js ${got[0]} css ${got[1]}`);
}
const addHook = (js, h) => { if (js.split(AT).length !== 2) throw new Error('hook anchor not unique'); return js.replace(AT, h + AT); };
const BASE = resolveTree('site-pretty');
// the fix (mi) and C, as files in SRC_M / SRC_C
const SRC = join(WT, 'out/morph-inherit/src');
const OV = join(FIX, 'overlay');
const SRC_M = join(SRC, 'mi'), SRC_C = join(SRC, 'c');
rmSync(SRC, { recursive: true, force: true });
for (const f of [NODE, CSS]) {
  mkdirSync(join(SRC_M, dirname(f)), { recursive: true });
  cpSync(existsSync(join(OV, NODE)) ? join(OV, f) : join(BASE, f), join(SRC_M, f));
}
if (!existsSync(join(OV, NODE))) execFileSync('patch', ['-s', '-p1', '-d', SRC_M, '-i', join(FIX, 'patch.diff')], { stdio: 'inherit' });
cpSync(SRC_M, SRC_C, { recursive: true });
execFileSync('patch', ['-s', '-R', '-p1', '-d', SRC_C, '-i', join(FIX, 'delta-vs-st6rb2.diff')], { stdio: 'inherit' });
const mjs = readFileSync(join(SRC_M, NODE), 'utf8'), mcss = readFileSync(join(SRC_M, CSS));
const cjs = readFileSync(join(SRC_C, NODE), 'utf8'), ccss = readFileSync(join(SRC_C, CSS));
put('mi', mjs, mcss);
put('c', cjs, ccss);
put('mhook', addHook(mjs, C_HOOK), mcss);
put('chook', addHook(cjs, C_HOOK_F3), ccss);
put('bhook', addHook(readFileSync(join(BASE, NODE), 'utf8'), B_HOOK), readFileSync(join(BASE, CSS)));
// P-085's control: the plain baseline + the phone morph driver window.__fwMorphDrive (driver M), copied byte for byte
// from mi (st6-rb2's debug driver) with its two st6-rb2 helpers replaced by the baseline's own expressions (as in the
// wheel handler A and B_HOOK): __pinMax() -> the page's max scrollY, __pinY() -> window.scrollY.
const DRV0 = '    // DEBUG ONLY (morph-webkit phone driver';
const drv = mjs.slice(mjs.indexOf(DRV0), mjs.indexOf(AT));
if (mjs.split(DRV0).length !== 2 || !drv.includes('window.__fwMorphDrive')) throw new Error('driver not found in mi');
const B_DRIVE = drv.replace('__pinMax()', 'Math.max(0, document.documentElement.scrollHeight - window.innerHeight)').replace('__pinY()', 'window.scrollY');
if (/__pin/.test(B_DRIVE)) throw new Error('driver still uses an st6-rb2 helper');
put('bdrive', addHook(readFileSync(join(BASE, NODE), 'utf8'), B_DRIVE), readFileSync(join(BASE, CSS)));
