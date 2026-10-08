#!/usr/bin/env node
// sticky-walk gate 4 (fix-scrollcb-g0, 2026-10-09; lead's cqi gates), Chrome, functional, no timing.
// Arms C = g0.0h and V = g0.0h + fixcq (`container-type: inline-size` on the profile deck, shells sized by
// calc(100cqi * 764 / 353) instead of aspect-ratio), plus C2 / V2 (a second load each) for the A/A, from
// out/sticky-walk/snap (HASHES.txt checked per load; a mismatch is VOID). Each load runs on its own server, origin and
// isolated context.
// Per viewport (--vps, default all of VPS below) and load:
//   1. geometry: the deck's rect, clientWidth, scrollWidth and padding; the six shells' rects and computed height,
//      aspect-ratio and container-type; the document height.
//   2. snap: the deck scrolled into view, then a horizontal touch swipe (Input.synthesizeScrollGesture, x distance =
//      -deck clientWidth * 0.6, at the deck's centre) repeated to reach each shell, then back. After each swipe and
//      600 ms settle: scrollLeft, the index of the shell nearest the snap centre, and a PNG crop of the deck (clip, DPR
//      of the viewport).
//   3. avatar slider (PR-013 keep-st6, `.start-selling-avatars.is-carousel` in #people): with the row in view, the img
//      names and classes sampled every 250 ms for 6 s.
// Scores: C vs V and C vs C2 per viewport. Geometry and scrollLeft must be equal. Deck crops: pixels > 8 levels A~V
// beyond the A~A mask (pxlib delta). The slider: the same sequence of img states, allowing one tick of phase (the slider
// runs on timers that are not frozen).
//   node tools/lock.mjs run chrome-measure --shared --weight probe --max-seconds 300 --owner fix-scrollcb-g0 -- \
//     node fixes/sticky-walk/gates/deck-chrome.mjs [--vps m430,m430t,...]
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const WT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const { resolveTree } = await import(join(WT, 'tools/lib/paths.mjs'));
const { launchChrome, CDP, gotoAndSettle, sleep, tempProfileDir } = await import(join(WT, 'tools/lib/cdp.mjs'));
const { pngPixels, delta, aa } = await import(join(WT, 'fixes/v9-best/gates/pxlib.mjs'));
const NODE = '_app/immutable/nodes/2.DyWL8TcE.js', CSS = '_app/immutable/assets/2.gBuqKVzi.css';
const SNAP = join(WT, 'out/sticky-walk/snap');
const HX = Object.fromEntries(readFileSync(join(SNAP, 'HASHES.txt'), 'utf8').trim().split('\n').map((l) => l.split(/\s+/)).map(([h, p]) => [p, h.slice(0, 12)]));
const BASE = resolveTree('site-pretty');
const sha = (b) => createHash('sha256').update(b).digest('hex').slice(0, 12);
export const VPS = {
  m430: { width: 430, height: 775, dpr: 3, mobile: true, touch: true },   // the iPhone's scripted geometry
  m430t: { width: 430, height: 815, dpr: 3, mobile: true, touch: true },  // collapsed toolbar
  m390: { width: 390, height: 844, dpr: 3, mobile: true, touch: true },
  t768: { width: 768, height: 1024, dpr: 2, mobile: true, touch: true },  // coarse tablet (media branch width<=860)
  t1024: { width: 1024, height: 1366, dpr: 2, mobile: true, touch: true },// coarse, width<=1200 branch
  d1440: { width: 1440, height: 900, dpr: 1, mobile: false, touch: false },// desktop (rule not applied)
};
const argv = process.argv.slice(2);
const vpArg = argv.includes('--vps') ? argv[argv.indexOf('--vps') + 1] : Object.keys(VPS).join(',');
const VPL = vpArg.split(',');
const ARMS = [['C', 'C'], ['V', 'V'], ['C2', 'C'], ['V2', 'V']];
const tag = new Date().toISOString().replace(/[:.]/g, '-');
const OUT = join(WT, 'out/sticky-walk/deck', tag); mkdirSync(OUT, { recursive: true });

const GEOM = `(() => { const d = document.querySelector('#profile-showcase .start-selling-profile-deck'); if (!d) return null;
  const R = (e) => { const r = e.getBoundingClientRect(); return [Math.round(r.left * 64) / 64, Math.round((r.top + scrollY) * 64) / 64, Math.round(r.width * 64) / 64, Math.round(r.height * 64) / 64]; };
  const s = getComputedStyle(d);
  return JSON.stringify({ docH: document.documentElement.scrollHeight, deck: R(d), cw: d.clientWidth, sw: d.scrollWidth, pad: [s.paddingLeft, s.paddingRight], display: s.display, ct: s.containerType,
    shells: [...d.children].map((c) => { const cs = getComputedStyle(c); return [c.className.replace(/svelte-\\S+/g, '').trim(), R(c), cs.height, cs.aspectRatio, cs.width]; }) }); })()`;
const AV = `JSON.stringify([...document.querySelectorAll('.start-selling-avatars.is-carousel img')].map((i) => (i.currentSrc || i.src).split('/').pop() + ':' + i.className.replace(/svelte-\\S+/g, '').trim()))`;

async function server(arm, d) {
  const st = join(OUT, `serve-${arm}.json`); rmSync(st, { force: true });
  const p = spawn(process.execPath, [join(WT, 'tools/serve.mjs'), '--root', BASE, '--overlay', join(SNAP, d), '--port', '0', '--quiet', '--no-cache', '--state', st, '--vendors=local', '--no-http-twin'], { stdio: ['ignore', 'ignore', 'inherit'] });
  for (let i = 0; i < 300; i++) { if (existsSync(st)) try { return { p, ...JSON.parse(readFileSync(st, 'utf8')) }; } catch {} await sleep(100); }
  p.kill(); throw new Error(arm + ' server did not start');
}

const res = { tool: 'fixes/sticky-walk/gates/deck-chrome.mjs', startedAt: new Date().toISOString(), vps: VPL, loads: [], scores: {} };
const save = () => writeFileSync(join(OUT, 'deck.json'), JSON.stringify(res, null, 1));
const chrome = await launchChrome({ port: 0, profileDir: tempProfileDir(join(WT, 'out/sticky-walk/chrome'), 'deck'), headless: true, windowSize: '1440,1366' });
const cdp = await CDP.connect(chrome.wsUrl); res.browser = chrome.browser;
const data = {};
try {
  for (const [arm, d] of ARMS) {
    const s = await server(arm, d);
    try {
      const url = `http://localhost:${s.port}/`;
      const served = { js: sha(Buffer.from(await (await fetch(new URL(NODE, url))).arrayBuffer())), css: sha(Buffer.from(await (await fetch(new URL(CSS, url))).arrayBuffer())) };
      if (served.js !== HX[`${d}/${NODE}`] || served.css !== HX[`${d}/${CSS}`]) { res.loads.push({ arm, void: 'served ' + JSON.stringify(served) }); console.log('VOID', arm); continue; }
      for (const vk of VPL) {
        const vp = VPS[vk]; const load = { arm, vp: vk, served, errors: [], swipes: [] }; res.loads.push(load);
        const page = await cdp.newIsolatedPage();
        page.on((m) => { if (m.method === 'Runtime.exceptionThrown') load.errors.push(String(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text).split('\n')[0].slice(0, 200)); });
        await page.send('Network.enable'); await page.send('Network.setCacheDisabled', { cacheDisabled: true });
        await page.send('Emulation.setDeviceMetricsOverride', { width: vp.width, height: vp.height, deviceScaleFactor: vp.dpr, mobile: vp.mobile });
        if (vp.touch) await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
        if (vp.touch) await page.send('Emulation.setEmitTouchEventsForMouse', { enabled: true, configuration: 'mobile' }).catch(() => {});
        await gotoAndSettle(page, url, { quietMs: 1500, maxMs: 45000 }); await sleep(1500);
        load.geom0 = JSON.parse(await page.eval(GEOM) || 'null');
        // bring the deck into view (its top 60 px below the viewport top), settle
        const top = load.geom0 ? load.geom0.deck[1] - 60 : 0;
        await page.eval(`(scrollTo({ top: ${top}, behavior: 'instant' }), 1)`); await sleep(2600);
        load.geom = JSON.parse(await page.eval(GEOM) || 'null');
        const dk = JSON.parse(await page.eval(`JSON.stringify((() => { const d = document.querySelector('#profile-showcase .start-selling-profile-deck'); const r = d.getBoundingClientRect(); return [r.left, r.top, r.width, r.height, d.clientWidth]; })())`));
        const shot = async (name) => { const { data: b64 } = await page.send('Page.captureScreenshot', { format: 'png', clip: { x: Math.max(0, dk[0]), y: Math.max(0, dk[1]), width: Math.min(vp.width, dk[2]), height: Math.min(vp.height - Math.max(0, dk[1]), dk[3]), scale: 1 } }); const f = join(OUT, `${vk}-${arm}-${name}.png`); writeFileSync(f, Buffer.from(b64, 'base64')); return f; };
        const state = async () => JSON.parse(await page.eval(`JSON.stringify((() => { const d = document.querySelector('#profile-showcase .start-selling-profile-deck'); const c = d.getBoundingClientRect().left + d.clientWidth / 2; let best = -1, bd = 1e9; [...d.children].forEach((e, i) => { const r = e.getBoundingClientRect(); const dd = Math.abs(r.left + r.width / 2 - c); if (dd < bd) { bd = dd; best = i; } }); return [Math.round(d.scrollLeft * 64) / 64, best, Math.round(scrollY)]; })())`));
        load.swipes.push({ step: 'start', st: await state(), png: await shot('s0') });
        const cx = Math.round(dk[0] + dk[2] / 2), cy = Math.round(Math.max(dk[1], 0) + Math.min(dk[3], vp.height - Math.max(dk[1], 0)) / 2);
        const n = (load.geom?.shells || []).length;
        if (vp.touch && n > 1) {
          for (let i = 1; i < n; i++) { await page.send('Input.synthesizeScrollGesture', { x: cx, y: cy, xDistance: -Math.round(dk[4] * 0.6), yDistance: 0, gestureSourceType: 'touch', speed: 1200 }).catch((e) => load.errors.push('gesture ' + e.message)); await sleep(700); load.swipes.push({ step: 'fwd' + i, st: await state(), png: await shot('f' + i) }); }
          for (let i = n - 2; i >= 0; i--) { await page.send('Input.synthesizeScrollGesture', { x: cx, y: cy, xDistance: Math.round(dk[4] * 0.6), yDistance: 0, gestureSourceType: 'touch', speed: 1200 }).catch((e) => load.errors.push('gesture ' + e.message)); await sleep(700); load.swipes.push({ step: 'back' + i, st: await state(), png: await shot('b' + i) }); }
        }
        // avatar slider (PR-013 keep-st6): bring the row into view, sample
        const avY = await page.eval(`(() => { const e = document.querySelector('.start-selling-avatars.is-carousel'); if (!e) return null; const r = e.getBoundingClientRect(); return Math.round(r.top + scrollY - innerHeight / 3); })()`);
        if (avY != null) { await page.eval(`(scrollTo({ top: ${avY}, behavior: 'instant' }), 1)`); await sleep(1500); load.avatars = []; for (let k = 0; k < 24; k++) { load.avatars.push(JSON.parse(await page.eval(AV))); await sleep(250); } load.avRect = await page.eval(`JSON.stringify([...document.querySelectorAll('.start-selling-avatars.is-carousel img')].map((i) => { const r = i.getBoundingClientRect(); return [Math.round(r.left * 64) / 64, Math.round(r.width * 64) / 64, Math.round(r.height * 64) / 64]; }))`); }
        await page.close();
        (data[vk] ||= {})[arm] = load; save();
        console.log(`load ${arm} ${vk}: deck ${JSON.stringify(load.geom?.deck)} cw ${load.geom?.cw} shells ${n} h ${load.geom?.shells?.[0]?.[2]} ar ${load.geom?.shells?.[0]?.[3]} snaps ${load.swipes.map((w) => w.st[0] + '/' + w.st[1]).join(' ')} errors ${load.errors.length}`);
      }
    } finally { s.p.kill(); }
  }
} finally { cdp.close(); await chrome.close(); }

// scores
const geomKey = (g) => g && JSON.stringify({ docH: g.docH, deck: g.deck, cw: g.cw, sw: g.sw, shells: g.shells.map((s) => [s[1], s[2], s[4]]) });
const avSeq = (a) => (a || []).map((x) => JSON.stringify(x)).filter((x, i, arr) => i === 0 || x !== arr[i - 1]);
for (const vk of VPL) {
  const D = data[vk] || {}; const sc = {};
  for (const [x, y] of [['C', 'V'], ['C', 'C2'], ['C2', 'V2']]) {
    const a = D[x], b = D[y]; if (!a || !b) { sc[`${x}~${y}`] = 'missing'; continue; }
    const g = { geomEqual: geomKey(a.geom) === geomKey(b.geom), geom0Equal: geomKey(a.geom0) === geomKey(b.geom0), snapsEqual: JSON.stringify(a.swipes.map((w) => w.st.slice(0, 2))) === JSON.stringify(b.swipes.map((w) => w.st.slice(0, 2))),
      snapsA: a.swipes.map((w) => w.st[0]), snapsB: b.swipes.map((w) => w.st[0]), avatarSeqA: avSeq(a.avatars).length, avatarSeqB: avSeq(b.avatars).length, avatarRectsEqual: a.avRect === b.avRect, crops: [] };
    for (let i = 0; i < Math.min(a.swipes.length, b.swipes.length); i++) {
      try { const pa = pngPixels(readFileSync(a.swipes[i].png)), pb = pngPixels(readFileSync(b.swipes[i].png)); const dl = aa(delta(pa, pb)); g.crops.push([a.swipes[i].step, dl.maxLevel, dl.over8Pct]); } catch (e) { g.crops.push([a.swipes[i].step, 'err ' + e.message]); }
    }
    sc[`${x}~${y}`] = g;
  }
  res.scores[vk] = sc;
  console.log(vk, JSON.stringify(Object.fromEntries(Object.entries(sc).map(([k, v]) => [k, typeof v === 'string' ? v : { geom: v.geomEqual, snaps: v.snapsEqual, av: v.avatarRectsEqual, crops: v.crops.map((c) => c[1] + '/' + c[2]).join(' ') }]))));
}
res.endedAt = new Date().toISOString(); save();
console.log('wrote', join(OUT, 'deck.json'));
