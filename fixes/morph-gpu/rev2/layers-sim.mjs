// morph-gpu memory / layers note (review B5; fix-morph-gpu): WebKit's composited layers in the iOS Simulator, per arm, at
// rest at y 0, parked mid-page (2620) and at the page end (the morph's pin), then at the end with the morph held at
// m 0.5, 1 and back at 0 (window.__fwMorphSet, so the hook builds). Counts only: LayerTree.layersForNode on the document
// (count, sum of `memory`, sum of `paintCount`) and on the nav (header.start-selling-top-nav) and the glass div.
// Arms (hook builds = the arm + the frozen-frame hook and the frame stepper, nothing else): M besthook-fef569e3c2e2
// (best-build), R1 rvhook-81a43009c62d (rev 1), A newest rv2ahook-*, B newest rv2bhook-*.
// Run (functional Simulator session, shared slot):
//   node tools/lock.mjs run chrome-measure --shared --weight simulator --max-seconds 300 --owner fix-morph-gpu -- \
//     node tools/sim.mjs session --functional --owner fix-morph-gpu -- node fixes/morph-gpu/rev2/layers-sim.mjs M,R1,A,B
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { REPO as WT, resolveTree } from '../../../tools/lib/paths.mjs';
const { openTab, sleep } = await import(join(WT, 'tools/lib/wip.mjs'));

const NODE = '_app/immutable/nodes/2.DyWL8TcE.js', CSS = '_app/immutable/assets/2.gBuqKVzi.css';
const OUT = join(WT, 'out/morph-gpu/rev2'); mkdirSync(OUT, { recursive: true });
const SNAP = join(WT, 'out/snapshots');
const hashOf = (dir, f) => createHash('sha256').update(readFileSync(join(dir, f))).digest('hex').slice(0, 12);
const newest = (re) => readdirSync(SNAP).filter((d) => re.test(d)).map((d) => join(SNAP, d)).sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0];
const dirs = { M: join(SNAP, 'besthook-fef569e3c2e2'), R1: join(SNAP, 'rvhook-81a43009c62d'), A: newest(/^rv2ahook-[0-9a-f]{12}$/), B: newest(/^rv2bhook-[0-9a-f]{12}$/), R: join(SNAP, 'fdhook-fef569e3c2e2') };
const ARMDEF = Object.fromEntries(Object.entries(dirs).map(([k, d]) => [k, { dir: d, js: hashOf(d, NODE), css: hashOf(d, CSS) }]));
const ARMS = (process.argv[2] || 'M,R1,A,B').split(',');
const BASE = resolveTree('site-pretty');
const sha = (b) => createHash('sha256').update(b).digest('hex').slice(0, 12);
const startedAt = new Date().toISOString(), tag = startedAt.replace(/[:.]/g, '-');
const MIDY = 2620;

async function nodeId(c, sel) {
  const root = (await c.send('DOM.getDocument')).root.nodeId;
  if (!sel) return root;
  return (await c.send('DOM.querySelector', { nodeId: root, selector: sel })).nodeId || 0;
}
const sum = (L) => ({ n: L.length, memoryKB: Math.round(L.reduce((s, l) => s + (l.memory || 0), 0) / 1024), paintCount: L.reduce((s, l) => s + (l.paintCount || 0), 0) });
async function snap(c, label) {
  const o = { label, y: await c.evaluate('Math.round(scrollY)') };
  for (const [k, sel] of [['doc', null], ['nav', 'header.start-selling-top-nav'], ['glass', '.fw-rv-glass']]) {
    const id = await nodeId(c, sel);
    // a node with display: none (the glass div while the reveal is off) has no renderer: WebKit errors, count it as none
    try { o[k] = id ? sum((await c.send('LayerTree.layersForNode', { nodeId: id })).layers || []) : null; }
    catch (e) { if (!/Missing renderer/.test(String(e.message || e))) throw e; o[k] = { n: 0, memoryKB: 0, paintCount: 0, noRenderer: true }; }
  }
  o.attrs = JSON.parse(await c.evaluate(`JSON.stringify((() => { const n = document.querySelector('header.start-selling-top-nav'); return { rv: n.hasAttribute('data-fw-rv'), rvp: n.hasAttribute('data-fw-rvp'), dark: !!n.querySelector(':scope > .fw-rv-dark'), glass: !!document.querySelector('.fw-rv-glass') }; })())`));
  console.log(snap.arm, label, JSON.stringify(o));
  return o;
}
// WebKit's Runtime.evaluate ignores awaitPromise (tools/lib/wip.mjs): start the walk, then poll its flag.
async function walk(c, y) {
  await c.evaluate(`window.__lw = null; (async () => { const ty = Math.min(${y}, document.documentElement.scrollHeight - innerHeight); for (let i = 0; i < 400 && Math.abs(scrollY - ty) > 1; i++) { const d = ty - scrollY; scrollBy({ top: Math.sign(d) * Math.min(Math.abs(d), 250), behavior: 'instant' }); await new Promise((r) => setTimeout(r, 100)); } window.__lw = Math.round(scrollY); })(); 'ok'`);
  for (let i = 0; i < 120; i++) { const v = await c.evaluate('window.__lw'); if (v != null) return v; await sleep(500); }
  throw new Error(`walk to ${y} did not finish`);
}

const res = { tool: 'fix-morph-gpu rev2 layers-sim', builds: ARMDEF, note: 'Simulator LayerTree counts; memory as reported by WebKit (bytes summed, shown in KB)', startedAt, order: ARMS, runs: [] };
const f = join(OUT, `layers-sim-${tag}.json`);
for (const arm of ARMS) {
  const def = ARMDEF[arm]; const st = join(OUT, `serve-layers-${arm}-${process.pid}.json`); rmSync(st, { force: true });
  const p = spawn(process.execPath, [join(WT, 'tools/serve.mjs'), '--root', BASE, '--overlay', def.dir, '--port', '0', '--quiet', '--no-cache', '--state', st, '--vendors=local', '--latency', '150'], { stdio: ['ignore', 'ignore', 'inherit'] });
  const run = { arm, snaps: [] }; snap.arm = arm;
  let c = null;
  try {
    let s = null; for (let i = 0; i < 300 && !s; i++) { if (existsSync(st)) try { s = JSON.parse(readFileSync(st, 'utf8')); } catch {} if (!s) await sleep(100); }
    if (!s) throw new Error(arm + ' server did not start');
    const url = `http://localhost:${s.port}/`;
    const js = sha(Buffer.from(await (await fetch(new URL(NODE, url))).arrayBuffer())), css = sha(Buffer.from(await (await fetch(new URL(CSS, url))).arrayBuffer()));
    run.served = { js, css };
    if (js !== def.js || css !== def.css) { run.void = `serves ${js} / ${css}`; console.log(`VOID ${arm}: ${run.void}`); continue; }
    execFileSync(process.execPath, [join(WT, 'tools/sim.mjs'), 'open', url], { stdio: ['ignore', 'ignore', 'inherit'] });
    await sleep(3000);
    c = await openTab(`localhost:${s.port}`);
    for (let i = 0; i < 40; i++) { if (await c.evaluate('document.readyState') === 'complete') break; await sleep(500); }
    await c.send('LayerTree.enable');
    run.vp = JSON.parse(await c.evaluate('JSON.stringify({ w: innerWidth, h: innerHeight, sh: document.documentElement.scrollHeight })'));
    await sleep(2500); run.snaps.push(await snap(c, 'top'));
    await walk(c, MIDY); await sleep(2500); run.snaps.push(await snap(c, 'mid'));
    await walk(c, 1e6); await sleep(3000); run.snaps.push(await snap(c, 'end'));
    for (const m of [0.5, 1, 0]) {
      await c.evaluate(`window.__fwMorphSet(${m}); 'ok'`);
      await sleep(1500);
      run.snaps.push(await snap(c, `end-m${m}`));
    }
    await c.send('LayerTree.disable').catch(() => {});
  } catch (e) { run.error = String(e.stack || e.message || e); console.log(arm, 'error', run.error); }
  finally { try { c?.close(); } catch {} p.kill(); rmSync(st, { force: true }); res.runs.push(run); writeFileSync(f, JSON.stringify(res, null, 1)); }
}
console.log('wrote', f);
