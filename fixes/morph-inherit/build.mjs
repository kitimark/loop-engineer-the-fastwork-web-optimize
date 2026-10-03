// morph-inherit builds (fix-nav-morph): immutable snapshot copies for the gates.
//   mi-<js12>     = fixes/morph-inherit/overlay (C = st6-rb2 + the inline --morph writes on the nav children)
//   mhook-<js12>  = mi + the debug hook window.__fwMorphSet(m) (holds the morph at m; frozen frames only)
//   bhook-<js12>  = plain baseline + the same hook, adapted to the baseline's variables (no __pinY / __osb there)
// C's hooked copy is out/snapshots/f3r-chook-f6f254402209 (fixes/nav-morph/reveal-build.mjs).
//   node fixes/morph-inherit/build.mjs
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const WT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const { resolveTree } = await import(join(WT, 'tools/lib/paths.mjs'));
const NODE = '_app/immutable/nodes/2.DyWL8TcE.js', CSS = '_app/immutable/assets/2.gBuqKVzi.css';
const SNAP = join(WT, 'out/snapshots');
const sha = (b) => createHash('sha256').update(b).digest('hex').slice(0, 12);
const AT = '    let ne = dE(L, { manageAnimations: !1 });';
const hook = (body) => `    // DEBUG ONLY (morph-inherit frozen frames): hold the morph at m (no spring).\n    window.__fwMorphSet = (m) => {\n      ${body};\n    };\n`;
const C_HOOK = hook('(n && window.cancelAnimationFrame(n), (n = 0), C() || (s = __pinY()), (w = a = i = r = m), z(x, m, !0), S(), __osb(), C() || I())');
const B_HOOK = hook('(n && window.cancelAnimationFrame(n), (n = 0), C() || (s = window.scrollY), (w = a = i = r = m), z(x, m, !0), S(), C() || I())');
function put(name, js, css) {
  const dir = join(SNAP, `${name}-${sha(js)}`);
  if (!existsSync(dir)) {
    mkdirSync(join(dir, dirname(NODE)), { recursive: true }); mkdirSync(join(dir, dirname(CSS)), { recursive: true });
    writeFileSync(join(dir, NODE), js); writeFileSync(join(dir, CSS), css);
  }
  console.log(`${name} ${dir} js ${sha(js)} css ${sha(css)}`);
}
const addHook = (js, h) => { if (js.split(AT).length !== 2) throw new Error('hook anchor not unique'); return js.replace(AT, h + AT); };
const OV = join(WT, 'fixes/morph-inherit/overlay');
const mjs = readFileSync(join(OV, NODE), 'utf8'), mcss = readFileSync(join(OV, CSS));
put('mi', mjs, mcss);
put('mhook', addHook(mjs, C_HOOK), mcss);
const BASE = resolveTree('site-pretty');
put('bhook', addHook(readFileSync(join(BASE, NODE), 'utf8'), B_HOOK), readFileSync(join(BASE, CSS)));
