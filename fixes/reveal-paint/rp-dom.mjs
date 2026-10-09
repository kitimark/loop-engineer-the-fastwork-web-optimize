#!/usr/bin/env node
// reveal-paint build card: the a11y / focus / hit-test difference of g0.0m's hidden state (Chrome mobile 430x932 DPR 3 with
// touch, headless; counts only, no timing). Arms C = g0.0l, V = g0.0m from out/g0-0m/snap (served hashes checked), one
// isolated page each, plain http, --vendors=local. Per stop y (default 0 and 300: the card hidden; 1400: shown):
//   card: computed visibility / opacity / will-change / pointer-events of .start-selling-future-card and #people's class
//   focusables: elements inside #people that take focus (a[href], button, input, select, textarea, [tabindex]) and are
//     rendered (computed visibility visible, display not none, has a box): the keyboard / switch-control reach
//   ax: Accessibility.getFullAXTree nodes whose DOM node is inside #people and that are not ignored (the screen-reader reach)
//   hits: document.elementFromPoint every 20 CSS px over the viewport: how many land inside #people, and every point whose
//     element differs between C and V
//   node tools/lock.mjs run chrome-measure --shared --weight probe --max-seconds 300 --owner fix-reveal-paint -- \
//     node fixes/reveal-paint/rp-dom.mjs [0,300,1400]
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const WT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const { resolveTree } = await import(join(WT, 'tools/lib/paths.mjs'));
const { launchChrome, CDP, gotoAndSettle, sleep, tempProfileDir } = await import(join(WT, 'tools/lib/cdp.mjs'));
const NODE = '_app/immutable/nodes/2.DyWL8TcE.js', CSS = '_app/immutable/assets/2.gBuqKVzi.css';
const SNAP = join(WT, 'out/g0-0m/snap');
const HX = Object.fromEntries(readFileSync(join(SNAP, 'HASHES.txt'), 'utf8').trim().split('\n').map((l) => l.split(/\s+/)).map(([h, p]) => [p, h.slice(0, 12)]));
const YS = (process.argv[2] || '0,300,1400').split(',').map(Number);
const OUT = join(WT, 'out/reveal-paint', 'dom-' + new Date().toISOString().replace(/[:.]/g, '-')); mkdirSync(OUT, { recursive: true });
const sha = (b) => createHash('sha256').update(b).digest('hex').slice(0, 12);

const STATE = `JSON.stringify((() => { const p = document.getElementById('people'), card = p.querySelector('.start-selling-future-card'), cs = getComputedStyle(card);
  const vis = (e) => { const s = getComputedStyle(e); const r = e.getBoundingClientRect(); return s.visibility === 'visible' && s.display !== 'none' && r.width > 0 && r.height > 0; };
  const foc = [...p.querySelectorAll('a[href], button, input, select, textarea, [tabindex]')].filter((e) => e.tabIndex >= 0 && !e.disabled);
  const nm = (e) => e.tagName.toLowerCase() + (e.getAttribute('role') ? '[' + e.getAttribute('role') + ']' : '') + '.' + String(e.className || '').split(' ')[0];
  return { y: Math.round(scrollY), cls: p.className, card: { vis: cs.visibility, op: cs.opacity, wc: cs.willChange, pe: cs.pointerEvents },
    focusable: foc.length, focusRendered: foc.filter(vis).map(nm),
    tappable: [...card.querySelectorAll('*')].filter((e) => { const s = getComputedStyle(e); return s.visibility === 'visible' && s.pointerEvents !== 'none'; }).map(nm),
    ariaHidden: p.querySelectorAll('[aria-hidden]').length, tabMinus: p.querySelectorAll('[tabindex="-1"]').length }; })())`;
const HITS = `JSON.stringify((() => { const p = document.getElementById('people'); const out = []; const lab = (e) => e ? e.tagName.toLowerCase() + '.' + String(e.className && e.className.baseVal !== undefined ? e.className.baseVal : e.className || '').split(' ')[0] + (p.contains(e) ? '@people' : '') : null;
  for (let y = 10; y < innerHeight; y += 20) for (let x = 10; x < innerWidth; x += 20) out.push(lab(document.elementFromPoint(x, y))); return out; })())`;

async function server(d) {
  const st = join(OUT, `serve-${d}.json`); rmSync(st, { force: true });
  const p = spawn(process.execPath, [join(WT, 'tools/serve.mjs'), '--root', resolveTree('site-pretty'), '--overlay', join(SNAP, d), '--port', '0', '--quiet', '--no-cache', '--state', st, '--vendors=local', '--no-http-twin'], { stdio: ['ignore', 'ignore', 'inherit'] });
  for (let i = 0; i < 300; i++) { if (existsSync(st)) try { return { p, ...JSON.parse(readFileSync(st, 'utf8')) }; } catch {} await sleep(100); }
  p.kill(); throw new Error(d + ' server did not start');
}
const res = { tool: 'fixes/reveal-paint/rp-dom.mjs', ys: YS, arms: {} };
const chrome = await launchChrome({ port: 0, profileDir: tempProfileDir(join(WT, 'out/reveal-paint/chrome'), 'dom'), headless: true, windowSize: '430,932' });
const cdp = await CDP.connect(chrome.wsUrl);
try {
  for (const d of ['C', 'V']) {
    const s = await server(d); const A = (res.arms[d] = { stops: [] });
    try {
      const url = `http://localhost:${s.port}/`;
      A.served = { js: sha(Buffer.from(await (await fetch(new URL(NODE, url))).arrayBuffer())), css: sha(Buffer.from(await (await fetch(new URL(CSS, url))).arrayBuffer())) };
      if (A.served.js !== HX[`${d}/${NODE}`] || A.served.css !== HX[`${d}/${CSS}`]) { A.void = 'served ' + JSON.stringify(A.served); continue; }
      const page = await cdp.newIsolatedPage();
      await page.send('Emulation.setDeviceMetricsOverride', { width: 430, height: 932, deviceScaleFactor: 3, mobile: true });
      await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
      await gotoAndSettle(page, url, { quietMs: 1500, maxMs: 45000 }); await sleep(3000);
      await page.send('DOM.enable'); await page.send('Accessibility.enable');
      for (const y of YS) {
        await page.eval(`(scrollTo({ top: ${y}, behavior: 'instant' }), 1)`); await sleep(2500);
        const st = JSON.parse(await page.eval(STATE)); const hits = JSON.parse(await page.eval(HITS));
        // AX: nodes inside #people (by backend DOM node id) that are not ignored
        const doc = await page.send('DOM.getDocument', { depth: -1, pierce: true });
        const ids = new Set(); let peopleNode = null;
        const find = (n) => { if (n.attributes && n.attributes.includes('id') && n.attributes[n.attributes.indexOf('id') + 1] === 'people') peopleNode = n; (n.children || []).forEach(find); };
        find(doc.root); const lab = new Map(); const collect = (n) => { ids.add(n.backendNodeId); const a = n.attributes || []; const ci = a.indexOf('class'); lab.set(n.backendNodeId, (n.localName || n.nodeName) + (ci >= 0 ? '.' + String(a[ci + 1]).split(' ')[0] : '')); (n.children || []).forEach(collect); }; if (peopleNode) collect(peopleNode);
        const ax = (await page.send('Accessibility.getFullAXTree')).nodes || [];
        const inP = ax.filter((n) => n.backendDOMNodeId != null && ids.has(n.backendDOMNodeId));
        const shown = inP.filter((n) => !n.ignored);
        A.stops.push({ ...st, axInPeople: inP.length, axNotIgnored: shown.length, axRoles: [...new Set(shown.map((n) => n.role?.value).filter(Boolean))].slice(0, 20), axList: shown.map((n) => `${n.role?.value}:${lab.get(n.backendDOMNodeId)}`), hits });
      }
      await page.close();
    } finally { s.p.kill(); }
  }
} finally { cdp.close(); await chrome.close(); }
for (let i = 0; i < YS.length; i++) {
  const c = res.arms.C?.stops?.[i], v = res.arms.V?.stops?.[i]; if (!c || !v) { console.log(`y ${YS[i]}: missing arm`); continue; }
  const diff = c.hits.map((h, k) => (h !== v.hits[k] ? [k, h, v.hits[k]] : null)).filter(Boolean);
  console.log(`DOMLINE y ${YS[i]} cls C "${c.cls}" V "${v.cls}" | card C ${JSON.stringify(c.card)} V ${JSON.stringify(v.card)} | focus rendered C ${c.focusRendered.length} V ${v.focusRendered.length} ${JSON.stringify(v.focusRendered.filter((x) => !c.focusRendered.includes(x)).slice(0, 6))} | ax not ignored C ${c.axNotIgnored} V ${v.axNotIgnored} roles same ${JSON.stringify(c.axRoles) === JSON.stringify(v.axRoles)} | ax V-only ${JSON.stringify((() => { const cc = [...(c.axList || [])]; return (v.axList || []).filter((x) => { const k = cc.indexOf(x); if (k >= 0) { cc.splice(k, 1); return false; } return true; }); })())} C-only ${JSON.stringify((() => { const vv = [...(v.axList || [])]; return (c.axList || []).filter((x) => { const k = vv.indexOf(x); if (k >= 0) { vv.splice(k, 1); return false; } return true; }); })())} | tappable in card C ${c.tappable?.length} V ${v.tappable?.length} same ${JSON.stringify(c.tappable) === JSON.stringify(v.tappable)} | [aria-hidden] C ${c.ariaHidden} V ${v.ariaHidden}, [tabindex=-1] C ${c.tabMinus} V ${v.tabMinus} | hits in #people C ${c.hits.filter((h) => h && h.endsWith('@people')).length} V ${v.hits.filter((h) => h && h.endsWith('@people')).length}, differing points ${diff.length}${diff.length ? ' ' + JSON.stringify(diff.slice(0, 3)) : ''}`);
}
writeFileSync(join(OUT, 'dom.json'), JSON.stringify(res, null, 1)); console.log('wrote', join(OUT, 'dom.json'));
