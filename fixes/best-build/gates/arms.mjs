// best-build gate arms: immutable snapshot copies (out/snapshots/, read-only files) and the table every gate script reads.
//   node fixes/best-build/gates/arms.mjs          # make the snapshots (idempotent), print the table
// Arms (sha256/12 of the JS node / the CSS as served; every gate voids a load whose served hashes differ):
//   B  plain baseline (no overlay)
//   C  st6-rb2                         (fixes/morph-inherit/build.mjs: c-…, same bytes as fixes/st6-rb2/patch.diff)
//   V  platform-idle's own build      (baseline + fixes/platform-idle/patch.diff)
//   M  morph-inherit's own build      (fixes/morph-inherit/build.mjs: mi-…)
//   N  the best build                 (fixes/best-build/build.mjs)
//   VH / MH / NH  V / M / N + the morph-inherit debug hook window.__fwMorphSet(m) (frozen frames only; the hook text is
//                 morph-inherit's C_HOOK byte for byte; MH is morph-inherit's mhook-d9898e0a2e15)
//   X2 (any arm + "2"): the same build from a second server (own origin): the A/A pair
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WT, JS, CSS, FILES, build, sha } from '../build.mjs';

const { resolveTree } = await import(join(WT, 'tools/lib/paths.mjs'));
const SNAP = join(WT, 'out/snapshots');
const BASE = resolveTree('site-pretty');
// pinned: what each arm must serve
export const PIN = {
  B: ['4606120cf392', '27776f3d4138'], C: ['7bf7c4657d21', 'f523598b2a24'], V: ['de29ff8aa622', 'e0f92804c521'],
  M: ['7c61fe7d0662', 'f523598b2a24'], N: ['65052c4a3902', 'e0f92804c521'],
  MH: ['d9898e0a2e15', 'f523598b2a24'], VH: ['75fa7c2049c1', 'e0f92804c521'], NH: ['fef569e3c2e2', 'e0f92804c521'],
};
const DIRS = { C: 'c-7bf7c4657d21', M: 'mi-7c61fe7d0662', MH: 'mhook-d9898e0a2e15', V: 'pi-de29ff8aa622', N: 'best-65052c4a3902', VH: 'vhook-' + PIN.VH[0], NH: 'nhook-' + PIN.NH[0] };
// the hook, byte for byte as fixes/morph-inherit/build.mjs C_HOOK (mhook)
const AT = '    let ne = dE(L, { manageAnimations: !1 });';
const C_BODY = '(n && window.cancelAnimationFrame(n), (n = 0), C() || (s = __pinY()), (w = a = i = r = m), z(x, m, !0), S(), __osb(), C() || I())';
const C_HOOK = `    // DEBUG ONLY (morph-inherit frozen frames): hold the morph at m (no spring).\n    window.__fwMorphSet = (m) => {\n      ${C_BODY};\n    };\n`;
const addHook = (js) => { if (js.split(AT).length !== 2) throw new Error('hook anchor not unique'); return js.replace(AT, C_HOOK + AT); };

export const ARMDEF = {};
for (const [k, [js, css]] of Object.entries(PIN)) ARMDEF[k] = { dir: k === 'B' ? null : join(SNAP, DIRS[k]), js, css };
for (const k of Object.keys(PIN)) ARMDEF[k + '2'] = { ...ARMDEF[k] };
export const NODE = JS;
export { CSS, BASE };

export function makeSnapshots({ quiet = false } = {}) {
  const log = (...a) => quiet || console.log(...a);
  if (!['C', 'M', 'MH'].every((k) => existsSync(join(SNAP, DIRS[k], JS)))) execFileSync(process.execPath, [join(WT, 'fixes/morph-inherit/build.mjs')], { stdio: quiet ? 'ignore' : 'inherit' });
  const { tree, comps } = build({ work: join(WT, 'out/best-build/work-arms'), quiet: true });
  const V = comps.find((c) => c.name === 'platform-idle').own;
  const M = comps.find((c) => c.name === 'morph-inherit').own;
  if (sha(addHook(M[JS])) !== PIN.MH[0]) throw new Error('the hook text differs from morph-inherit mhook');
  const want = { V, N: tree, VH: { ...V, [JS]: addHook(V[JS]) }, NH: { ...tree, [JS]: addHook(tree[JS]) } };
  for (const [k, t] of Object.entries(want)) {
    const got = [sha(t[JS]), sha(t[CSS])];
    if (got.join() !== PIN[k].join()) throw new Error(`arm ${k}: ${got.join(' / ')}, pinned ${PIN[k].join(' / ')}`);
    const d = join(SNAP, DIRS[k]);
    if (!existsSync(join(d, JS))) for (const f of FILES) { mkdirSync(join(d, dirname(f)), { recursive: true }); writeFileSync(join(d, f), t[f]); chmodSync(join(d, f), 0o444); }
  }
  for (const [k, def] of Object.entries(ARMDEF)) {
    if (k.endsWith('2')) continue;
    const src = (f) => readFileSync(join(def.dir || BASE, f));
    const got = [sha(src(JS)), sha(src(CSS))];
    if (got.join() !== [def.js, def.css].join()) throw new Error(`arm ${k} at ${def.dir || BASE}: ${got.join(' / ')}, pinned ${def.js} / ${def.css}`);
    log(`${k.padEnd(3)} js ${def.js} css ${def.css}  ${def.dir ? def.dir.replace(WT + '/', '') : '(baseline)'}`);
  }
}
if (process.argv[1] === fileURLToPath(import.meta.url)) makeSnapshots();
