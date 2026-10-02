// W-driver Timeline twin for the Simulator (de-counts-sim, 2026-10-02): iphone-runner's srwin.mjs (the phone's style-recalc
// block driver, sr2.sh), unchanged except the tab picker (./simtab.mjs: the visible tab), no default r3 path, and
// meta.device. Same driver as the phone runs, so their Timeline record STRUCTURE compares 1:1 (phonecounts.mjs reads
// both). Its fps/frame numbers are Simulator timing: never a verdict (F-084).
// Scripted window run: the iphone.mjs scroll sequence (reload, 8 s settle, rAF log, 3 s idle, scrollBy 250 smooth
// every 300 ms) but stopping once scrollY >= stopY (0 = full page), then 2 s hold. Optional r3-logger injection.
// Records document.getAnimations() counts (total, ViewTimeline/ScrollTimeline) before scrolling.
// usage: node tlwin.mjs <out.json> <label> <stopY|0> [--r3]   (TIMELINE variant: Page.enable + Timeline.start around the probe; attribution only, not an A/B metric)
import { readFileSync, writeFileSync } from 'node:fs';
import { openTab, sleep } from './simtab.mjs';
const [out, label, stopYArg = '0'] = process.argv.slice(2);
const R3 = process.argv.includes('--r3');
const stopY = Number(stopYArg);
let c = await openTab((u) => u.startsWith('http'));
const host = new URL(await c.evaluate('location.href')).host;
await c.evaluate(`scrollTo({top: 0, behavior: 'instant'}); setTimeout(() => location.reload(), 400); 'ok'`);
c.close();
await sleep(2500);
c = await openTab(host);
// early frame log from reconnect (~2 s after navigation start) through the settle: catches the idle panel mount
await c.evaluate(`(() => { const E = window.__early = { t0nav: Math.round(performance.now()), frames: [] }; let l = performance.now();
  const f = (t) => { E.frames.push([Math.round(t), Math.round((t - l) * 10) / 10, Math.round(scrollY)]); l = t; if (!E.stop) requestAnimationFrame(f); }; requestAnimationFrame(f); return 'ok'; })()`).catch(() => {});
for (let i = 0; i < 60; i++) { if ((await c.evaluate('document.readyState')) === 'complete') break; await sleep(500); }
await sleep(8000);
const early = JSON.parse(await c.evaluate('(() => { const E = window.__early; if (!E) return "null"; E.stop = true; return JSON.stringify(E); })()'));
if (R3) await c.evaluate(readFileSync(process.env.R3_PATH, 'utf8') + '; "ok"');
const anims = JSON.parse(await c.evaluate(`JSON.stringify((() => { const a = document.getAnimations(); const tl = (x) => x.timeline ? x.timeline.constructor.name : 'none';
  const by = {}; for (const x of a) by[tl(x)] = (by[tl(x)] || 0) + 1; return {total: a.length, byTimeline: by, scrollY: Math.round(scrollY), panel: !!document.querySelector('.start-selling-morph-panel'), panelImgSrc: document.querySelectorAll('.start-selling-morph-panel img[src]').length, panelImg: document.querySelectorAll('.start-selling-morph-panel img').length}; })())`));
const tlRecs = [];
c.on((m) => { if (m.method === 'Timeline.eventRecorded') tlRecs.push(m.params.record); });
for (const [m, p] of [['Page.disable', {}], ['Page.enable', {}], ['Timeline.enable', {}], ['Timeline.setInstruments', { instruments: ['Timeline'] }], ['Timeline.start', { maxCallStackDepth: Number(process.env.TLDEPTH || 1) }]]) { try { await c.send(m, p); } catch (e) { console.error(m, JSON.stringify(e.message || e)); } }
const PROBE = `(async () => {
  const fp = {frames: []};
  fp.syncT = performance.now(); performance.mark('tl-sync');
  let last = performance.now();
  const loop = (t) => { fp.frames.push([Math.round(t * 10) / 10, Math.round((t - last) * 10) / 10, Math.round(scrollY)]); last = t; if (!fp.stop) requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const marks = {}; const vh0 = innerHeight;
  marks.idle = [performance.now()]; await sleep(${Number(process.env.IDLE_MS || 3000)}); marks.idle.push(performance.now());
  marks.scroll = [performance.now()];
  const maxY = document.documentElement.scrollHeight - innerHeight;
  const stopAt = ${stopY} > 0 ? Math.min(${stopY}, maxY - 5) : maxY - 5;
  const flingY = ${Number(process.env.FLING_Y || 0)};
  if (flingY > 0) { // ST-2d fling-hold: W steps to flingY, hold, then one smooth flick of FLING_DY
    while (scrollY < flingY && performance.now() - marks.scroll[0] < 45000) { window.scrollBy({top: Math.min(250, flingY - scrollY), behavior: 'smooth'}); await sleep(300); }
    await sleep(400); marks.hold = [performance.now()]; await sleep(${Number(process.env.HOLD_MS || 1500)}); marks.hold.push(performance.now());
    marks.flick = [performance.now()]; window.scrollBy({top: ${Number(process.env.FLING_DY || 700)}, behavior: 'smooth'});
    let ly = -1; for (let i = 0; i < 40 && scrollY !== ly; i++) { ly = scrollY; await sleep(150); } marks.flick.push(performance.now());
  } else
  while (scrollY < stopAt && performance.now() - marks.scroll[0] < 45000) { window.scrollBy({top: 250, behavior: 'smooth'}); await sleep(300); }
  marks.scroll.push(performance.now());
  // PUSH (style-recalc block): at the end, synthetic wheel pushes past the end (the morph's window wheel listener:
  // any deltaY >= 1 targets m = 1, 680 ms tween), then HOLD_END_MS hold. --morph read before/after.
  const morphOf = () => { const el = document.querySelector('[style*="--morph:"]'); return el ? el.style.getPropertyValue('--morph') : null; };
  let morph0 = null, morph1 = null;
  if (${Number(process.env.PUSH || 0)}) {
    await sleep(400); morph0 = morphOf(); marks.push = [performance.now()];
    for (let i = 0; i < 6; i++) { window.dispatchEvent(new WheelEvent('wheel', {deltaY: 60, cancelable: true, bubbles: true})); await sleep(80); }
    await sleep(1000); marks.push.push(performance.now());
  }
  marks.bottom = [performance.now()]; await sleep(${Number(process.env.HOLD_END_MS || (stopY > 0 ? 2000 : 3000))}); marks.bottom.push(performance.now());
  morph1 = morphOf();
  fp.stop = true;
  const sections = [...document.querySelectorAll('section[id], [id="people"], [id="platform"]')].map((e) => [e.id, Math.round(e.getBoundingClientRect().top + scrollY), Math.round(e.getBoundingClientRect().height)]);
  return {syncT: fp.syncT, marks, maxY, morph0, morph1, sections, docH: document.documentElement.scrollHeight, vh0, vh: innerHeight, href: location.href, ua: navigator.userAgent,
    r3hero: window.__r3 ? window.__r3.summary(0, 900) : null, r3region: window.__r3 ? window.__r3.summary(${Number(process.env.R3_Y0 || 1700)}, ${Number(process.env.R3_Y1 || 2200)}) : null, r3all: window.__r3 ? window.__r3.summary() : null, r3frames: window.__r3 ? window.__r3.frames : null, ...fp};
})()`;
await c.evaluate(`window.__wr = undefined; ${PROBE}.then(v => { window.__wr = JSON.stringify(v); }, e => { window.__wr = JSON.stringify({err: String(e && e.stack || e)}); }); 'started'`);
let res = null; const t0 = Date.now();
while (!res && Date.now() - t0 < 90000) { await sleep(1500); const v = await c.evaluate('window.__wr || null'); if (v) res = JSON.parse(v); }
try { await c.send('Timeline.stop'); } catch (e) {}
await sleep(10000);
try { await c.send('Page.disable'); } catch (e) {}
c.close();
if (!res) throw new Error('probe did not finish');
if (res.err) throw new Error(res.err);
const sum = (f) => { const tot = f.reduce((x, y) => x + y, 0); return { frames: f.length, fps: Math.round((10 * f.length) / (tot / 1000 || 1)) / 10, gt20: f.filter((x) => x > 20).length, gt34: f.filter((x) => x > 34).length, gt50: f.filter((x) => x > 50).length, gt100: f.filter((x) => x > 100).length, max: Math.max(0, ...f) }; };
res.summary = {};
for (const ph of ['idle', 'scroll', 'bottom']) { const [a, b] = res.marks[ph]; res.summary[ph] = sum(res.frames.filter(([t]) => t >= a && t <= b).map(([, dt]) => dt)); }
const [a, b] = res.marks.scroll;
const sc = res.frames.filter(([t]) => t >= a && t <= b);
const inWin = (lo, hi) => sum(sc.filter(([, , y]) => y >= lo && y <= hi).map(([, dt]) => dt));
res.summary.hero0_900 = inWin(0, 900);
res.summary.r1700_2200 = inWin(1700, 2200);
res.anims = anims; res.early = early; if (early) { const d = early.frames.slice(1).map((x) => x[1]); res.summary.early = { t0nav: early.t0nav, frames: d.length, gt34: d.filter((x) => x > 34).length, gt50: d.filter((x) => x > 50).length, max: Math.max(0, ...d), slow: early.frames.slice(1).filter((x) => x[1] > 34).map((x) => `${Math.round(x[1])}@t${x[0]}`).join(" ") }; }
res.meta = { device: process.env.FW_SIM_SESSION ? 'simulator' : 'unknown', owner: 'de-counts-sim', label, stopY, r3: R3, date: new Date().toISOString() };
const flat = []; const walk = (r, d) => { const { children, ...rest } = r; flat.push({ ...rest, d }); for (const ch of children || []) walk(ch, d + 1); };
for (const r of tlRecs) walk(r, 0);
const sync = flat.find((r) => r.type === 'TimeStamp' && JSON.stringify(r.data || {}).includes('tl-sync'));
res.tl = { records: tlRecs.length, flat: flat.length, sync: sync ? sync.startTime : null };
writeFileSync(out.replace(/\.json$/, '.tl.json'), JSON.stringify({ syncT: res.syncT, syncTL: res.tl.sync, recs: tlRecs }));
if (sync) {
  const off = sync.startTime * 1000 - res.syncT; // TL ms = page ms + off
  const toTL = (t) => (t + off) / 1000;
  const [a0, b0] = res.marks.scroll;
  const longs = res.frames.map((f, i) => [f, i]).filter(([[t, dt, y]]) => t >= a0 && t <= b0 && dt > 34 && y >= Number(process.env.R3_Y0 || 1700) && y <= Number(process.env.R3_Y1 || 2300));
  res.tl.long = longs.map(([[t, dt, y], i]) => {
    const s0 = toTL(t - dt), s1 = toTL(t);
    const top = flat.filter((r) => r.d === 0 && r.endTime >= s0 && r.startTime <= s1);
    const kids = flat.filter((r) => r.d >= 1 && r.startTime >= s0 && r.startTime <= s1 && r.endTime);
    const byType = {}; for (const r of kids) { if (r.d !== 1) continue; byType[r.type] = Math.round(((byType[r.type] || 0) + (r.endTime - r.startTime) * 1000) * 10) / 10; }
    const big = kids.filter((r) => (r.endTime - r.startTime) * 1000 > 3).map((r) => `${r.type}${r.d}:${Math.round((r.endTime - r.startTime) * 10000) / 10}${r.data && (r.data.type || r.data.url || r.data.name) ? '(' + String(r.data.type || r.data.name || '') + (r.data.url ? ' ' + String(r.data.url).split('/').pop() + ':' + r.data.lineNumber : '') + ')' : ''}${r.stackTrace && r.stackTrace[0] ? '[' + (r.stackTrace[0].functionName || '?') + ' ' + String(r.stackTrace[0].url || '').split('/').pop() + ':' + r.stackTrace[0].lineNumber + ']' : ''}`);
    const rfs = top.filter((r) => r.type === 'RenderingFrame').map((r) => Math.round((r.endTime - r.startTime) * 10000) / 10);
    const nb = res.frames.slice(Math.max(0, i - 2), i + 3).map((f) => Math.round(f[1]));
    return { dt: Math.round(dt), y, nb, rfs, byType, big };
  });
  for (const l of res.tl.long) console.log(`  TL ${l.dt}@${l.y} nb[${l.nb}] RF[${l.rfs}] ${JSON.stringify(l.byType)}\n     ${l.big.join(' ')}`);
} else console.log('  TL: no sync mark found; records', tlRecs.length);
writeFileSync(out, JSON.stringify(res));
const s = res.summary; if (res.marks.push) { const [p0,p1]=res.marks.push; s.push = sum(res.frames.filter(([t])=>t>=p0&&t<=p1).map(([,dt])=>dt)); }
const worst = sc.reduce((m, f) => (f[1] > m[1] ? f : m), [0, 0, 0]);
console.log(`${label}: morph ${res.morph0}->${res.morph1} | panel@start ${anims.panel} imgs ${anims.panelImgSrc}/${anims.panelImg} | anims ${anims.total} ${JSON.stringify(anims.byTimeline)} | scroll fps ${s.scroll.fps} >34 ${s.scroll.gt34} >50 ${s.scroll.gt50} max ${s.scroll.max}@${worst[2]} | hero0-900 >34 ${s.hero0_900.gt34} >50 ${s.hero0_900.gt50} max ${s.hero0_900.max} | 1700-2200 >34 ${s.r1700_2200.gt34} >50 ${s.r1700_2200.gt50} max ${s.r1700_2200.max} | idle ${s.idle.fps} fps >34 ${s.idle.gt34} max ${s.idle.max} | hold ${s.bottom.fps} | early(from ${s.early?.t0nav}ms) >34 ${s.early?.gt34} >50 ${s.early?.gt50} max ${s.early?.max} [${s.early?.slow}]`);
console.log('  slow:', sc.filter(([, dt]) => dt > 34).map(([, dt, y]) => `${Math.round(dt)}@${y}`).join(' '));
if (R3 && res.r3region) console.log(`  r3 ${process.env.R3_Y0 || 1700}-${process.env.R3_Y1 || 2200}: long ${res.r3region.longFrames} named ${res.r3region.named}:`, res.r3region.frames.map((f) => `${Math.round(f.ms)}@${f.y}[${[...f.prevEv.map((e) => '<' + e), ...f.ev].join('; ')}]`).join('  '));
process.exit(0);
