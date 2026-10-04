#!/usr/bin/env node
// v8-best: element count per tag.class token, v7 (A) vs v8 (V), two loads each (A, V, A2, V2), no timing. Explains
// `fix.mjs check`'s element totals (desktop 1424 -> 1423 on 2026-10-04): the count is taken like check.mjs (every
// element, tag + each class) at three moments per load: after settle (t0), after a walk to the bottom (walk, as
// check.mjs ends), and 3 s later (walk+3s). Arms from out/v8-best/snap (gates/snap.mjs), served hashes checked.
//   node tools/lock.mjs run chrome-measure --shared --weight probe --max-seconds 300 --owner int-v8 -- \
//     node fixes/v8-best/gates/dom-count.mjs desktop|mobile
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const WT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const { resolveTree } = await import(join(WT, 'tools/lib/paths.mjs'));
const { launchChrome, CDP, gotoAndSettle, sleep, tempProfileDir } = await import(join(WT, 'tools/lib/cdp.mjs'));
const NODE = '_app/immutable/nodes/2.DyWL8TcE.js', CSS = '_app/immutable/assets/2.gBuqKVzi.css';
const VP = process.argv[2] || 'desktop';
const vp = { mobile: { width: 430, height: 932, dpr: 3, mobile: true }, desktop: { width: 1440, height: 900, dpr: 1, mobile: false } }[VP];
if (!vp) { console.error('usage: dom-count.mjs desktop|mobile'); process.exit(2); }
const SNAP = join(WT, 'out/v8-best/snap');
const HX = Object.fromEntries(readFileSync(join(SNAP, 'HASHES.txt'), 'utf8').trim().split('\n').map((l) => l.split(/\s+/)).map(([h, p]) => [p, h.slice(0, 12)]));
const BASE = resolveTree('site-pretty');
const OUT = join(WT, 'out/v8-best', `dom-${VP}-${new Date().toISOString().replace(/[:.]/g, '-')}`); mkdirSync(OUT, { recursive: true });
const sha = (b) => createHash('sha256').update(b).digest('hex').slice(0, 12);
const COUNT = `(() => { const all = document.querySelectorAll('*'); const t = {};
  for (const e of all) { const tag = e.localName; const k = e.classList.length ? [...e.classList].map((c) => tag + '.' + c) : [tag]; for (const x of k) t[x] = (t[x] || 0) + 1; }
  return { elements: all.length, tokens: t }; })()`;
async function server(d) {
  const st = join(OUT, `serve-${d}.json`); rmSync(st, { force: true });
  const p = spawn(process.execPath, [join(WT, 'tools/serve.mjs'), '--root', BASE, '--overlay', join(SNAP, d), '--port', '0', '--quiet', '--no-cache', '--state', st, '--vendors=local', '--no-http-twin'], { stdio: ['ignore', 'ignore', 'inherit'] });
  for (let i = 0; i < 300; i++) { if (existsSync(st)) try { return { p, ...JSON.parse(readFileSync(st, 'utf8')) }; } catch {} await sleep(100); }
  p.kill(); throw new Error(d + ' server did not start');
}
const res = { tool: 'fixes/v8-best/gates/dom-count.mjs', viewport: VP, loads: [] };
const chrome = await launchChrome({ port: 0, profileDir: tempProfileDir(join(WT, 'out/v8-best/chrome'), 'dom-' + VP), headless: true, windowSize: `${vp.width},${vp.height}` });
const cdp = await CDP.connect(chrome.wsUrl);
try {
  for (const arm of ['A', 'V', 'A2', 'V2']) {
    const d = arm[0]; const s = await server(d); const load = { arm };
    try {
      const url = `http://localhost:${s.port}/`;
      const js = sha(Buffer.from(await (await fetch(new URL(NODE, url))).arrayBuffer())), css = sha(Buffer.from(await (await fetch(new URL(CSS, url))).arrayBuffer()));
      if (js !== HX[`${d}/${NODE}`] || css !== HX[`${d}/${CSS}`]) { load.void = `served ${js} / ${css}`; res.loads.push(load); continue; }
      const page = await cdp.newIsolatedPage();
      await page.send('Emulation.setDeviceMetricsOverride', { width: vp.width, height: vp.height, deviceScaleFactor: vp.dpr, mobile: vp.mobile });
      if (vp.mobile) await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
      await gotoAndSettle(page, url, { quietMs: 1500, maxMs: 45000 });
      load.t0 = await page.eval(COUNT);
      const H = await page.eval('document.documentElement.scrollHeight - innerHeight');
      for (let y = 0; y <= H; y += Math.round(vp.height * 0.8)) { await page.eval(`(scrollTo(0, ${y}), 1)`); await sleep(250); }
      await page.eval(`(scrollTo(0, ${H}), 1)`); await sleep(500);
      load.walk = await page.eval(COUNT); await sleep(3000); load.walk3 = await page.eval(COUNT);
      await page.close();
    } finally { s.p.kill(); }
    res.loads.push(load);
    console.log(`${arm}: elements t0 ${load.t0?.elements} walk ${load.walk?.elements} walk+3s ${load.walk3?.elements}${load.void ? ' VOID ' + load.void : ''}`);
  }
} finally { cdp.close(); await chrome.close(); }
// tokens whose count differs between any two loads at the same moment
for (const m of ['t0', 'walk', 'walk3']) {
  const L = res.loads.filter((l) => l[m]); const keys = new Set(L.flatMap((l) => Object.keys(l[m].tokens)));
  const diff = [...keys].filter((k) => new Set(L.map((l) => l[m].tokens[k] || 0)).size > 1).map((k) => `${k} ${L.map((l) => `${l.arm}=${l[m].tokens[k] || 0}`).join(' ')}`);
  console.log(`${m}: tokens that differ between loads: ${diff.length ? '\n  ' + diff.join('\n  ') : 'none'}`);
}
writeFileSync(join(OUT, 'dom.json'), JSON.stringify(res, null, 1));
console.log('wrote', join(OUT, 'dom.json'));
