#!/usr/bin/env node
// reveal-paint R (lead, user T-265 #6): which static images in the #people section repaint on g0.0l, at rest, on slow
// drags and on a fast flick, and why. Simulator only, COUNTS (Timeline Paint records with their clip boxes, LayerTree
// paint counts per layer, DOM mutations); Simulator ms are never a verdict (F-084).
// One load per arm (own serve.mjs, plain http, --vendors=local --latency 150), settle RP_SETTLE_MS (9000, g0.0l's touch
// preload runs at load + 1.5 s + idle), then with Timeline on from start to end and a layer census at every phase edge:
//   rest   at RP_REST_Y (default 1400: the deck in view, card shown; reached by an instant jump + 3 s), 4 s at rest
//   slow   two WDA drags 520 px / 1200 ms (P-174's approach stroke), up then down, 1.5 s after each
//   fast   jump to the top, 2.5 s, one WDA flick 300 px / 220 ms up (P-174's FLICK stroke; lands the deck in view), 3 s
// A page logger records every attribute / class / style mutation inside #people (element, attribute) and img loads.
// Each Paint record's clip box (document coordinates in WebKit's Timeline, checked against the census bounds) is given
// to the #people element whose document box overlaps it most (imgs first, then the record, avatars, shells, card),
// using element boxes read at the phase end. Census paints (layersForNode) are excluded by their marks.
//   node tools/lock.mjs run chrome-measure --shared --weight simulator --max-seconds 300 --owner fix-reveal-paint -- \
//     node tools/sim.mjs session --functional --owner fix-reveal-paint -- sh -c 'node tools/sim.mjs wda start && \
//     node fixes/reveal-paint/rp-repaint.mjs L'
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const WT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const { openTab, sleep } = await import(join(WT, 'tools/lib/wip.mjs'));
const { createSession } = await import(join(WT, 'tools/lib/wda.mjs'));
const { compileScript } = await import(join(WT, 'tools/lib/gesture.mjs'));
const { OWNER_INFO_FN } = await import(join(WT, 'fixes/de-offscreen/common.mjs'));
const JS = '_app/immutable/nodes/2.DyWL8TcE.js', CSS = '_app/immutable/assets/2.gBuqKVzi.css';
const sha = (b) => createHash('sha256').update(b).digest('hex').slice(0, 12);
const ARMS = Object.fromEntries((process.env.RP_ARMS || 'L=fixes/g0-0l/overlay,M=fixes/g0-0m/overlay').split(',').map((kv) => { const [k, d] = kv.split('='); return [k, join(WT, d)]; }));
// knock-outs (attribution only; CSS injected after the settle): H = the deck's shell-hold animation off (shell-hold-c,
// fw-c-shell-hold on the far shells while #people starts shrinking); R = the vinyl record's spin off
const KO = {
  H: `#people .start-selling-profile-shell { animation: none !important; }`,
  R: `#people .record, #people .record * { animation: none !important; }`,
};
// script knock-outs: Y = every #people <img> decodes synchronously (decoding="sync"; the page sets decoding="async"),
// to test whether the repaint waves are asynchronous image decodes finishing
const KOJS = { Y: `for (const i of document.querySelectorAll('#people img')) i.decoding = 'sync'; 1` };
const ORDER = process.argv.slice(2).filter((a) => ARMS[a.split('+')[0]] && a.split('+').slice(1).every((k) => KO[k] || KOJS[k]));
if (!ORDER.length) { console.error('usage: rp-repaint.mjs <arm>...'); process.exit(1); }
const TAG = process.env.RP_TAG || 'repaint-' + new Date().toISOString().replace(/[:.]/g, '-');
const D = join(WT, 'out/reveal-paint', TAG); mkdirSync(D, { recursive: true });
const SETTLE = Number(process.env.RP_SETTLE_MS || 9000), REST_Y = Number(process.env.RP_REST_Y || 1400);
// RP_PHASES=fast runs only the flick (the decisive checks); RP_SHOTS=1 adds a burst of Simulator screenshots for 2.5 s
// after the flick stroke and scores every deck photo box in view per shot (pixel spread: a blank, undrawn photo is flat)
const PHASES = (process.env.RP_PHASES || 'rest,slow,fast').split(',');
const SHOTS = process.env.RP_SHOTS === '1';
const UDID = process.env.FW_SIM_UDID;
const { execFile } = await import('node:child_process');
const shot = (f) => new Promise((res) => execFile('xcrun', ['simctl', 'io', UDID, 'screenshot', '--type=png', f], { timeout: 10000 }, (e) => res(!e)));
const { pngPixels } = await import(join(WT, 'fixes/v8-best/gates/pxlib.mjs'));
const PHOTOS = `JSON.stringify([...document.querySelectorAll('#people .start-selling-profile-shell img')].map((i) => { const r = i.getBoundingClientRect(); return [String(i.currentSrc || i.src).split('/').pop().slice(0, 40), Math.round(r.left), Math.round(r.top + scrollY), Math.round(r.width), Math.round(r.height)]; }).filter((x) => x[3] >= 24 && x[4] >= 24))`;
function boxSpread(png, x, y, w, h, top) {
  // standard deviation of luma inside the box inset by 20 % (device px = css * 3; top = page top row in css px)
  const X0 = Math.round((x + w * 0.2) * 3), X1 = Math.round((x + w * 0.8) * 3), Y0 = Math.round((y + h * 0.2 + top) * 3), Y1 = Math.round((y + h * 0.8 + top) * 3);
  let n = 0, s1 = 0, s2 = 0;
  for (let yy = Math.max(0, Y0); yy < Math.min(png.h, Y1); yy += 2) for (let xx = Math.max(0, X0); xx < Math.min(png.w, X1); xx += 2) {
    const o = (yy * png.w + xx) * 4; const l = 0.299 * png.px[o] + 0.587 * png.px[o + 1] + 0.114 * png.px[o + 2]; n++; s1 += l; s2 += l * l; }
  return n ? Math.round(Math.sqrt(Math.max(0, s2 / n - (s1 / n) ** 2)) * 10) / 10 : null;
}
const errText = (e) => e?.message || JSON.stringify(e);
const S = (dir, px, ms, profile) => ({ type: 'stroke', dir, px, ms, profile });
const prog = (name, steps) => compileScript({ name, version: 1, screen: [430, 932], params: { x: 215 }, steps });
const SLOW_UP = prog('rp-slow-up', [S('up', 520, 1200, 'drag')]), SLOW_DOWN = prog('rp-slow-down', [{ type: 'until', cond: 'y>=1400', timeoutMs: 500 }, S('down', 520, 1200, 'drag')]); // the until satisfies the compiler's pull-to-refresh guard; play() skips it (the page is at y >= 1400 there)
const FLICK = prog('rp-flick', [S('up', 300, 220, 'fling')]);
const play = async (wda, p) => { for (const op of p.ops) { if (op.op === 'stroke') await wda.actions(op.actions); else if (op.op === 'pause') await sleep(op.ms); } };

const INSTALL = `(() => {
  if (window.__rr) return 0;
  const L = window.__rr = { m: [], ev: [], mk: [], f: [], on: false };
  const tick = () => { if (L.on) L.f.push([Date.now(), scrollY]); requestAnimationFrame(tick); }; requestAnimationFrame(tick);
  const people = document.getElementById('people');
  const nm = (el) => { if (!el || el.nodeType !== 1) return '?'; const c = (typeof el.className === 'string' ? el.className : el.getAttribute('class') || '').trim().split(/\\s+/).filter((x) => x && !/^svelte-/.test(x)).slice(0, 2).join('.');
    return el.tagName.toLowerCase() + (c ? '.' + c : ''); };
  new MutationObserver((ms) => { const t = performance.now(); for (const m of ms) { if (L.m.length > 60000) return;
    const el = m.target; L.m.push([t, nm(el), m.type === 'attributes' ? m.attributeName : m.type, m.type === 'attributes' ? String(el.getAttribute(m.attributeName)).slice(0, 80) : '']); } })
    .observe(people, { subtree: true, attributes: true, childList: true, characterData: true });
  people.addEventListener('load', (e) => { if (e.target.tagName === 'IMG') L.ev.push([performance.now(), 'imgload', String(e.target.currentSrc || '').slice(-50)]); }, { capture: true });
  L.mark = (n) => { L.mk.push([performance.now(), n, scrollY]); console.timeStamp('rr:' + n); };
  return 1;
})()`;
// document boxes of the #people elements a paint can belong to (most specific first)
const BOXES = `JSON.stringify((() => { const y = scrollY, x = scrollX, out = []; const p = document.getElementById('people'); if (!p) return out;
  const add = (el, kind) => { const r = el.getBoundingClientRect(); if (r.width < 1 || r.height < 1) return;
    const c = (typeof el.className === 'string' ? el.className : el.getAttribute('class') || '').trim().split(/\\s+/).filter((q) => q && !/^svelte-/.test(q)).slice(0, 2).join('.');
    const sh = el.closest('.start-selling-profile-shell'); const si = sh ? [...sh.parentElement.children].indexOf(sh) : -1;
    out.push({ kind, sel: el.tagName.toLowerCase() + (c ? '.' + c : '') + (si >= 0 && kind !== 'shell' ? ' @shell' + si : si >= 0 ? ' #' + si : ''), src: el.tagName === 'IMG' ? String(el.currentSrc || el.src || '').split('/').pop().slice(0, 40) : undefined,
      b: [r.left + x, r.top + y, r.width, r.height].map(Math.round) }); };
  for (const el of p.querySelectorAll('img')) add(el, 'img');
  for (const el of p.querySelectorAll('.record, .start-selling-avatars, .start-selling-future-people-o, .start-selling-future-title, .start-selling-future-community-pill, .start-selling-profile-tabs')) add(el, 'part');
  for (const el of p.querySelectorAll('.start-selling-profile-shell')) add(el, 'shell');
  for (const el of p.querySelectorAll('.start-selling-future-card')) add(el, 'card');
  return out; })())`;
const ANIMS = `JSON.stringify(document.getElementById('people').getAnimations({ subtree: true }).filter((a) => a.playState === 'running').map((a) => { const t = a.effect && a.effect.target; return [a.animationName || a.transitionProperty || a.constructor.name, t ? t.tagName.toLowerCase() + '.' + String(t.className || '').split(' ')[0] : '?']; }))`;

function flat(records) { const out = []; const walk = (r) => { out.push({ type: r.type, start: r.startTime * 1000, end: (r.endTime ?? r.startTime) * 1000, data: r.data }); for (const ch of r.children || []) walk(ch); }; for (const r of records) walk(r); return out; }
const qbox = (q) => { if (!Array.isArray(q) || q.length < 8) return null; const xs = [q[0], q[2], q[4], q[6]], ys = [q[1], q[3], q[5], q[7]]; const x = Math.min(...xs), y = Math.min(...ys); return [x, y, Math.max(...xs) - x, Math.max(...ys) - y]; };
const inter = (a, b) => Math.max(0, Math.min(a[0] + a[2], b[0] + b[2]) - Math.max(a[0], b[0])) * Math.max(0, Math.min(a[1] + a[3], b[1] + b[3]) - Math.max(a[1], b[1]));
function attribute(box, boxes) {
  if (!box) return 'nobox';
  const A = box[2] * box[3]; if (A <= 0) return 'empty';
  // most specific element that covers >= 50 % of the paint box, else the best overlap; outside #people: 'other'
  let best = null;
  for (const e of boxes) { const i = inter(box, e.b); if (!i) continue; const cov = i / A, fit = i / (e.b[2] * e.b[3]);
    const score = cov >= 0.5 ? 2 + fit : cov; if (!best || score > best.score) best = { e, score, cov, fit }; }
  return best ? `${best.e.sel}${best.e.src ? ' ' + best.e.src : ''}` : 'other';
}
async function layers(c) {
  const doc = await c.send('DOM.getDocument'); const html = (doc.root.children || []).find((n) => n.nodeName === 'HTML') || doc.root;
  return ((await c.send('LayerTree.layersForNode', { nodeId: html.nodeId })).layers || []).map((l) => ({ id: l.layerId, node: l.nodeId, mem: l.memory || 0, paints: l.paintCount || 0, b: l.bounds && [l.bounds.x, l.bounds.y, l.bounds.width, l.bounds.height] }));
}
async function owners(c, ids) {
  const fresh = new Map((await layers(c)).map((l) => [l.id, l])); const out = {};
  for (const id of ids) { const l = fresh.get(id); if (!l?.node) continue;
    try { const { object } = await c.send('DOM.resolveNode', { nodeId: l.node }); const r = await c.send('Runtime.callFunctionOn', { objectId: object.objectId, functionDeclaration: OWNER_INFO_FN, returnByValue: true });
      const v = r.result?.value || {}; out[id] = { sel: v.sel, path: v.path, style: v.style, data: v.data }; await c.send('Runtime.releaseObject', { objectId: object.objectId }).catch(() => {}); } catch (e) { out[id] = { err: errText(e).slice(0, 60) }; } }
  return out;
}

const wda = await createSession({ base: process.env.RP_WDA || 'http://127.0.0.1:8101', simulator: true });
try {
  for (const armK of ORDER) {
    const [arm, ...kos] = armK.split('+');
    const st = join(D, `serve-${arm}.json`); rmSync(st, { force: true });
    const p = spawn(process.execPath, [join(WT, 'tools/serve.mjs'), '--root', 'site-pretty', '--overlay', ARMS[arm], '--port', '0', '--quiet', '--state', st,
      '--vendors=local', '--latency', '150', '--owner', 'fix-reveal-paint', '--doing', `reveal-paint repaint census ${arm}`], { cwd: WT, stdio: ['ignore', 'ignore', 'inherit'] });
    const rec = { tool: 'fixes/reveal-paint/rp-repaint.mjs', arm: armK, ko: kos.map((k) => KO[k] || KOJS[k]), restY: REST_Y, errors: [], phases: {}, census: {} };
    try {
      let s = null; for (let k = 0; k < 300 && !s; k++) { if (existsSync(st)) try { s = JSON.parse(readFileSync(st, 'utf8')); } catch {} if (!s) await sleep(100); }
      if (!s) throw new Error('server did not start');
      const base = `http://localhost:${s.port}/`;
      rec.served = { js: sha(Buffer.from(await (await fetch(base + JS)).arrayBuffer())), css: sha(Buffer.from(await (await fetch(base + CSS)).arrayBuffer())) };
      const key = `rr=${arm}-${Date.now()}`;
      spawnSync('node', ['tools/sim.mjs', 'open', `${base}?${key}`], { cwd: WT, encoding: 'utf8' });
      process.env.FW_TAB_HOST = `localhost:${s.port}`;
      let c = null;
      for (let i = 0; i < 8 && !c; i++) { let t; try { t = await openTab((u) => u.startsWith(base)); } catch { await sleep(1000); continue; }
        const nav = await t.evaluate("(performance.getEntriesByType('navigation')[0] || {}).name || ''").catch(() => ''); if (String(nav).includes(key)) c = t; else { t.close(); await sleep(1000); } }
      if (!c) throw new Error('no fresh tab');
      for (let i = 0; i < 80; i++) { if ((await c.evaluate("document.readyState === 'complete'")) === true) break; await sleep(250); }
      await sleep(SETTLE);
      const kcss = kos.filter((k) => KO[k]).map((k) => KO[k]).join('\n');
      if (kcss) await c.evaluate(`(() => { const s = document.createElement('style'); s.textContent = ${JSON.stringify(kcss)}; document.head.appendChild(s); return 1; })()`);
      for (const k of kos.filter((k) => KOJS[k])) rec.koJs = [...(rec.koJs || []), await c.evaluate(KOJS[k])];
      await c.evaluate(INSTALL);
      await c.evaluate(`(scrollTo(0, ${REST_Y}), 1)`); await sleep(3000);
      await c.send('DOM.enable').catch(() => {}); await c.send('LayerTree.enable');
      // LayerTree.layerTreeDidChange arrival times (Mac clock), and each mark's Mac time, to place layer-tree changes
      const recs = [], ltc = [], macMk = []; c.on((m) => { if (m.method === 'Timeline.eventRecorded') recs.push(m.params.record); else if (m.method === 'LayerTree.layerTreeDidChange') ltc.push(Date.now()); });
      rec.ltc = ltc; rec.macMarks = macMk;
      const mark = async (n) => { macMk.push([n, Date.now()]); await c.evaluate(`(window.__rr.mark(${JSON.stringify(n)}), 1)`); macMk[macMk.length - 1].push(Date.now()); };
      const census = async (n) => { await mark('c0:' + n); rec.census[n] = await layers(c); await mark('c1:' + n); };
      await c.send('Page.disable').catch(() => {}); await c.send('Page.enable').catch(() => {});
      await c.send('Timeline.enable'); await c.send('Timeline.setInstruments', { instruments: ['Timeline'] }).catch(() => {});
      await c.send('Timeline.start', { maxCallStackDepth: 2 });
      await census('start');
      rec.anims = JSON.parse(await c.evaluate(ANIMS));
      rec.boxes = {};
      if (PHASES.includes('rest')) {
        await mark('rest'); await sleep(4000); await mark('rest:end');
        rec.boxes.rest = JSON.parse(await c.evaluate(BOXES));
        await census('rest');
      }
      if (PHASES.includes('slow')) {
        await mark('slow'); await play(wda, SLOW_UP); await sleep(1500); await play(wda, SLOW_DOWN); await sleep(1500); await mark('slow:end');
        rec.boxes.slow = JSON.parse(await c.evaluate(BOXES));
        await census('slow');
      }
      await c.evaluate('(scrollTo(0, 0), 1)'); await sleep(2500);
      await census('top');
      await c.evaluate('(window.__rr.on = true, 1)');
      await mark('fast'); await play(wda, FLICK);
      if (SHOTS && UDID) { rec.shots = []; const end = Date.now() + 2500; let i = 0;
        while (Date.now() < end) { const f = join(D, `${armK}-shot-${String(i++).padStart(2, '0')}.png`); const t0 = Date.now(); const ok = await shot(f); rec.shots.push([f, t0, Date.now(), ok]); }
        await sleep(500); } else await sleep(3000);
      await mark('fast:end');
      await c.evaluate('(window.__rr.on = false, 1)');
      rec.boxes.fast = JSON.parse(await c.evaluate(BOXES));
      if (SHOTS && UDID) {
        rec.photos = JSON.parse(await c.evaluate(PHOTOS));
        // page top row in the shot: a fixed magenta bar at top 0 (px-sim.mjs's calibration)
        await c.evaluate(`(() => { const d = document.createElement('div'); d.id = 'rr-cal'; d.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:6px;background:#f0f;z-index:2147483647'; document.body.appendChild(d); return 1; })()`);
        await sleep(400); const cf = join(D, `${armK}-cal.png`); await shot(cf); await c.evaluate(`(document.getElementById('rr-cal').remove(), 1)`);
        const cp = pngPixels(readFileSync(cf)); let row = -1;
        for (let yy = 0; yy < Math.min(cp.h, 800) && row < 0; yy++) { const o = (yy * cp.w + Math.round(cp.w / 2)) * 4; if (cp.px[o] > 220 && cp.px[o + 1] < 40 && cp.px[o + 2] > 220) row = yy; }
        rec.calTop = row >= 0 ? row / 3 : 0;
      }
      await census('fast');
      await c.send('Timeline.stop'); await c.send('Timeline.disable').catch(() => {});
      const lg = JSON.parse(await c.evaluate('JSON.stringify(window.__rr)'));
      rec.marks = lg.mk; rec.mut = lg.m; rec.imgEv = lg.ev; rec.rafY = lg.f;
      if (rec.shots) {
        // per shot: scrollY at the shot's middle (page rAF log, Date.now: the Simulator shares the Mac clock), then the
        // spread of every deck photo box fully in view; flat (< 4) = drawn blank
        const yAt = (t) => { let y = null; for (const [d, sy] of lg.f) { if (d <= t) y = sy; else break; } return y; };
        rec.shotScores = rec.shots.map(([f, t0, t1, ok]) => { if (!ok) return null; const tm = (t0 + t1) / 2, sy = yAt(tm); if (sy == null) return null;
          const png = pngPixels(readFileSync(f)); const vh = png.h / 3 - rec.calTop;
          const inView = rec.photos.filter(([, x, y, w, h]) => x >= 0 && x + w <= 430 && y - sy >= 0 && y - sy + h <= vh);
          const sc = inView.map(([n, x, y, w, h]) => [n, boxSpread(png, x, y - sy, w, h, rec.calTop)]);
          return { t: Math.round(tm), sy, n: sc.length, flat: sc.filter((x) => x[1] != null && x[1] < 4).map((x) => x[0]), scores: sc }; });
      }
      const f = flat(recs); const ts = (n) => f.find((r) => r.type === 'TimeStamp' && r.data?.message === 'rr:' + n)?.start;
      const censusWins = Object.keys(rec.census).map((n) => [ts('c0:' + n), ts('c1:' + n) + 30]);
      const inCensus = (t) => censusWins.some(([a, b]) => a != null && t >= a && t <= b);
      const pm = (n) => lg.mk.find((x) => x[1] === n)?.[0];
      for (const [ph, endN, bx] of [['rest', 'rest:end', 'rest'], ['slow', 'slow:end', 'slow'], ['fast', 'fast:end', 'fast']].filter(([p]) => PHASES.includes(p))) {
        const a = ts(ph), b = ts(endN); if (a == null || b == null) { rec.errors.push('missing marks ' + ph); continue; }
        const paints = f.filter((r) => r.type === 'Paint' && r.start >= a && r.start < b && !inCensus(r.start));
        const by = {};
        for (const r of paints) { const bxx = qbox(r.data?.clip); const k = attribute(bxx, rec.boxes[bx]); (by[k] ||= { n: 0, area: 0, ms: 0 }); by[k].n++; by[k].area += bxx ? Math.round(bxx[2] * bxx[3]) : 0; by[k].ms += r.end - r.start; }
        for (const v of Object.values(by)) v.ms = Math.round(v.ms * 10) / 10;
        const muts = {}; const pa = pm(ph), pb = pm(endN);
        for (const m of lg.m) if (m[0] >= pa && m[0] < pb) { const k = m[1] + ' ' + m[2]; muts[k] = (muts[k] || 0) + 1; }
        // raw paints of the phase: [t ms from the phase start, ms, box, rotated?, element]
        const raw = paints.map((r) => { const q = r.data?.clip || []; const bxx = qbox(q); const rot = q.length >= 8 && Math.abs(q[1] - q[3]) > 0.5;
          return [Math.round(r.start - a), Math.round((r.end - r.start) * 100) / 100, bxx && bxx.map(Math.round), rot ? 1 : 0, attribute(bxx, rec.boxes[bx])]; });
        // a repeat = a paint whose box is >= 80 % covered by one earlier paint box of the phase (an invalidation of content
        // already painted), as opposed to a first paint of a region (tiles coming into coverage, new layers)
        let rep = 0; const repBy = {};
        raw.forEach((x, i) => { if (!x[2]) return; const A = x[2][2] * x[2][3]; if (!A) return;
          if (raw.slice(0, i).some((y) => y[2] && inter(x[2], y[2]) >= 0.8 * A)) { rep++; repBy[x[4]] = (repBy[x[4]] || 0) + 1; } });
        rec.phases[ph] = { ms: Math.round(b - a), paints: paints.length, repeats: rep, repBy, rotated: raw.filter((x) => x[3]).length, raw, by, muts, imgLoads: lg.ev.filter((e) => e[0] >= pa && e[0] < pb).length,
          layouts: f.filter((r) => r.type === 'Layout' && r.start >= a && r.start < b && !inCensus(r.start)).length };
      }
      // per layer paint counts between censuses (each census also adds its own paints to some layers: start -> rest
      // counts the rest window plus one census)
      const C = rec.census, seq = ['start', 'rest', 'slow', 'top', 'fast'].filter((k) => C[k]);
      const ids = new Set(); const delta = {};
      for (let i = 1; i < seq.length; i++) { const A = new Map((C[seq[i - 1]] || []).map((l) => [l.id, l])); for (const l of C[seq[i]] || []) { const d = l.paints - (A.get(l.id)?.paints ?? 0); if (d > 0) { (delta[l.id] ||= {})[seq[i]] = d; ids.add(l.id); } } }
      rec.layerPaints = delta; rec.owners = await owners(c, [...ids]);
      c.close();
    } catch (e) { rec.errors.push(errText(e)); }
    finally { p.kill(); }
    const nrun = (globalThis.__rrN ||= {}); nrun[armK] = (nrun[armK] || 0) + 1;
    writeFileSync(join(D, `${armK}-${nrun[armK]}.json`), JSON.stringify(rec));
    const flipT = (rec.mut || []).find((m) => m[2] === 'class' && /is-visible/.test(m[3]))?.[0];
    const shotLine = rec.shotScores ? ` shots ${rec.shotScores.filter(Boolean).map((x) => `${x.flat.length}/${x.n}`).join(' ')}` : '';
    console.log(`RRLINE ${armK}-${nrun[armK]}${shotLine} served ${rec.served?.js}/${rec.served?.css} ${Object.entries(rec.phases).map(([k, v]) => `${k}: paints ${v.paints} layouts ${v.layouts} imgloads ${v.imgLoads}`).join(' | ')}${rec.errors.length ? ' ERR ' + rec.errors.join('; ') : ''}`);
  }
} finally { await wda.close().catch(() => {}); }
