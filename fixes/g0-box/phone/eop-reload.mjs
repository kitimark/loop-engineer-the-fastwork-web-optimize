#!/usr/bin/env node
// Candidate 1 jack parity (1b), reload restored at the end (fix-g0-box, lead 2026-10-09). The gesture runner's reload
// starts from the top on purpose (tools/lib/gesture-run.mjs:111-113), so this probe reloads itself: fresh load,
// scrollTo(0, Y) (default 4700, below the g0 hold at ~5213 on the Simulator), 1.5 s, location.reload() with no scroll
// reset (SvelteKit restores the position itself, chunks/CzkAa0og.js:620), reconnect, 3 s, then two real WDA-sim
// finger-up drags (520 px / 1200 ms, 300 ms apart). A passive window touchmove logger (bubble phase, so after the page's
// capture listeners) records cancelable / defaultPrevented / scrollY per move. Held = any prevented finger-up move (the
// jack held the page and opened the morph), as on g0.0h. Counts only; one functional Simulator session.
// Usage (inside the session, WDA-sim started): node fixes/g0-box/phone/eop-reload.mjs <arm>... (out/eopp/serve-<arm>.json)
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { openTab, sleep } from '../../../tools/lib/wip.mjs';
import { createSession } from '../../../tools/lib/wda.mjs';
import { compileScript } from '../../../tools/lib/gesture.mjs';

const WT = new URL('../../..', import.meta.url).pathname;
const OUT = join(WT, 'out/eopp/reload'); mkdirSync(OUT, { recursive: true });
const Y = Number(process.env.EOP_RELOAD_Y || 4700);
const prog = compileScript({ name: 'eop-reload-swipe', version: 1, screen: [430, 932], params: { x: 215 },
  steps: [{ type: 'stroke', dir: 'up', px: 520, ms: 1200, profile: 'drag' }, { type: 'pause', ms: 300 }, { type: 'stroke', dir: 'up', px: 520, ms: 1200, profile: 'drag' }] });
const LOG = `(() => { const L = window.__eopr = []; let y0 = null;
  addEventListener('touchstart', (e) => { y0 = e.touches[0] ? e.touches[0].clientY : null; L.push(['s', 0, 0, Math.round(scrollY), y0]); }, { passive: true });
  addEventListener('touchmove', (e) => { const cy = e.touches[0] ? e.touches[0].clientY : null; L.push(['m', e.cancelable ? 1 : 0, e.defaultPrevented ? 1 : 0, Math.round(scrollY), cy]); }, { passive: true });
  return 'ok'; })()`;

async function tabOn(port, key) {
  let last = '';
  for (let i = 0; i < 20; i++) {
    let t; try { t = await openTab((u) => u.startsWith(`http://localhost:${port}/`)); } catch (e) { last = `openTab: ${e?.message || e}`; await sleep(1000); continue; }
    const nav = await t.evaluate("(performance.getEntriesByType('navigation')[0] || {}).name || ''").catch((e) => `ERR ${e?.message || e}`);
    const old = await t.evaluate('window.__eopOld === 1').catch(() => true);
    if ((key === '' || String(nav).includes(key)) && (key === '' || old !== true)) return t; last = `nav ${String(nav).slice(0, 90)} old ${old}`; t.close(); await sleep(1000);
  }
  throw new Error(`no tab on port ${port} with ${key} (last: ${last})`);
}
const ready = async (c) => { for (let i = 0; i < 60; i++) { if ((await c.evaluate("document.readyState === 'complete'").catch(() => false)) === true) return true; await sleep(250); } return false; };

const wda = await createSession({ base: process.env.EOP_WDA || 'http://127.0.0.1:8101', simulator: true });
const res = {};
try {
  for (const arm of process.argv.slice(2)) {
    const port = JSON.parse(readFileSync(join(WT, `out/eopp/serve-${arm}.json`), 'utf8')).port;
    const url = `http://localhost:${port}/?eopr=${arm}-${Date.now()}`; const key = url.split('?')[1];
    spawnSync('node', ['tools/sim.mjs', 'open', url], { cwd: WT, encoding: 'utf8' });
    process.env.FW_TAB_HOST = `localhost:${port}`;
    // the first lookup takes the arm's tab whatever its URL (sim open's query was not always the tab's navigation URL), then
    // navigates it to the keyed URL itself, so the probe's page is a fresh document it can recognise
    let c = await tabOn(port, ''); await c.evaluate(`window.__eopOld = 1; setTimeout(() => location.replace(${JSON.stringify(url)}), 50); 1`); c.close(); await sleep(1500);
    c = await tabOn(port, key); await ready(c); await sleep(3000);
    await c.evaluate(`scrollTo(0, ${Y}), 1`); await sleep(1500);
    const yBefore = await c.evaluate('Math.round(scrollY)');
    await c.evaluate('window.__eopOld = 1; setTimeout(() => location.reload(), 50); 1'); c.close(); await sleep(1500);
    c = await tabOn(port, key); await ready(c); await sleep(3000);
    const yRestored = await c.evaluate('Math.round(scrollY)');
    await c.evaluate(LOG);
    for (const op of prog.ops) { if (op.op === 'stroke') await wda.actions(op.actions); else if (op.op === 'pause') await sleep(op.ms); }
    await sleep(1500);
    const L = JSON.parse(await c.evaluate('JSON.stringify(window.__eopr)'));
    const panel = JSON.parse(await c.evaluate("JSON.stringify((() => { const p = document.querySelector('.start-selling-morph-panel'); return p ? { opacity: getComputedStyle(p).opacity, inert: p.inert } : null; })())"));
    const yEnd = await c.evaluate('Math.round(scrollY)'); c.close();
    let prev = null, held = 0; for (const r of L) { if (r[0] === 's') { prev = r[4]; continue; } if (prev != null && r[4] != null && prev - r[4] > 0 && r[2] === 1) held++; prev = r[4]; }
    const mv = L.filter((r) => r[0] === 'm');
    res[arm] = { yBefore, yRestored, yEnd, moves: mv.length, cancelable: mv.filter((r) => r[1]).length, prevented: mv.filter((r) => r[2]).length, held, panel };
    console.log(`RELOADEND ${arm}: y before reload ${yBefore}, restored ${yRestored} | swipe moves ${mv.length}, cancelable ${res[arm].cancelable}, prevented ${res[arm].prevented} -> ${held ? 'HELD (opens)' : 'NOT held'} | y after ${yEnd}, panel opacity ${panel?.opacity} inert ${panel?.inert}`);
  }
} finally { await wda.close(); }
writeFileSync(join(OUT, `reload-${Object.keys(res).join('-')}-${Date.now()}.json`), JSON.stringify(res, null, 1));
