// countdown-faces: build the measurement arms (gitignored, under out/countdown-faces/arms/). Every arm is an overlay
// directory for tools/serve.mjs --overlay; none of them is a deliverable except `poc` (= fixes/countdown-faces/overlay).
//   base   no overlay (the frozen baseline)
//   still  baseline, but $E always snaps (no roll): what the page costs without the countdown's animation
//   faces  the PoC with the pause gate forced on (3 faces per digit only: part a)
//   poc    fixes/countdown-faces/overlay (3 faces + no animation while hidden: parts a + b)
// Plus, per arm, an isolated countdown page: iso-<arm>/__cd/index.html mounts ONE countdown (cD) alone with the
// page's CSS, from iso-<arm>/_app/immutable/nodes/2.__cd.js = that arm's node 2 + `export { cD as __cD }`.
// Usage: node fixes/countdown-faces/arms.mjs   (prints the overlay dirs as JSON)
import { mkdirSync, readFileSync, writeFileSync, rmSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { REPO as WT, resolveTree } from '../../tools/lib/paths.mjs';

const NODE = '_app/immutable/nodes/2.DyWL8TcE.js';
const BASE = resolveTree('site-pretty');
const POC = join(WT, 'fixes/countdown-faces/overlay');
const OUT = join(WT, 'out/countdown-faces/arms');
rmSync(OUT, { recursive: true, force: true });

const once = (src, a, b, what) => {
  const n = src.split(a).length - 1;
  if (n !== 1) throw new Error(`${what}: expected exactly 1 match, found ${n}`);
  return src.replace(a, b);
};
const baseSrc = readFileSync(join(BASE, NODE), 'utf8');
const pocSrc = readFileSync(join(POC, NODE), 'utf8');
const src = {
  base: baseSrc,
  still: once(baseSrc, '    if (YE.current) {\n      z(a, e, !0);', '    if (!0) {\n      z(a, e, !0);', 'still'),
  faces: once(pocSrc, '__cdLive = R(() => r.active !== !1),', '__cdLive = R(() => !0),', 'faces'),
  poc: pocSrc,
};
const write = (p, s) => { mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, s); };
const CSS = ['app.DTmXyoED.css', 'DialogHeader.Qcgwm6ST.css', '0.ChGpbVhU.css', '2.gBuqKVzi.css'];
const ISO = `<!doctype html>
<html lang="en" dir="ltr" data-theme="light"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>countdown alone</title>
${CSS.map((c) => `<link href="/_app/immutable/assets/${c}" rel="stylesheet">`).join('\n')}
<style>#host{display:flex;justify-content:center;padding:120px 0}</style>
</head><body><div class="start-selling svelte-q2j1fg"><div id="host"></div></div>
<script type="module" src="/__cd/main.js"></script></body></html>
`;
// external module: the mirror server sends CSP script-src 'self' (no inline scripts)
const MAIN = `import { k as mount } from '/_app/immutable/chunks/BSBv9QXB.js';
import { __cD } from '/_app/immutable/nodes/2.__cd.js';
mount(__cD, { target: document.getElementById('host'), props: {} });
window.__cdMounted = true;
`;
const dirs = {};
for (const [arm, s] of Object.entries(src)) {
  if (arm !== 'base') {
    if (arm === 'poc') dirs.poc = POC;
    else { write(join(OUT, arm, NODE), s); dirs[arm] = join(OUT, arm); }
  }
  write(join(OUT, `iso-${arm}`, '__cd/index.html'), ISO);
  write(join(OUT, `iso-${arm}`, '__cd/main.js'), MAIN);
  write(join(OUT, `iso-${arm}`, '_app/immutable/nodes/2.__cd.js'), `${s}\nexport { cD as __cD };\n`);
  dirs[`iso-${arm}`] = join(OUT, `iso-${arm}`);
}
writeFileSync(join(OUT, 'arms.json'), JSON.stringify(dirs, null, 1));
console.log(JSON.stringify(dirs, null, 1));
