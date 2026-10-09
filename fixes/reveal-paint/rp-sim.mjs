#!/usr/bin/env node
// reveal-paint (fix-reveal-paint, 2026-10-09; user T-265): what the #people card's reveal frame paints in WebKit.
// Simulator only, COUNTS (paint records, painted area, per-layer paint counts, layer memory); Simulator ms are listed
// as description only, never a verdict (F-084).
// Per load of an arm (own serve.mjs, plain http, --vendors=local --latency 150): fresh open, wait for load + RP_SETTLE_MS
// (default 9000: g0.0l's touch preload runs at load + 1.5 s + idle), optional knock-out / candidate CSS injected as a
// <style>, 1.5 s, then:
//   logger: a MutationObserver on #people's class: the frame #people gets +is-visible is console.timeStamp('rp:flip')
//   (the observer runs in the same rendering update, after the rAF callback that set the class);
//   census C0, C0b (LayerTree.layersForNode(<html>): per layer memory + paintCount; C0b - C0 = the census artefact);
//   Timeline on (Page.disable/enable, Timeline.start); timeStamp rp:go; the drive (RP_DRIVE: flick = WDA-sim stroke
//   300 px / 220 ms up from the top, x 215, P-174's FLICK stroke; slow = 3 drags 520 px / 1200 ms; none); 3.5 s;
//   rp:end; Timeline off; census C1; owners of every layer that painted between C0b and C1 or holds >= 1 MB.
// Reads: the flip frame = records from rp:flip to the end of the first Composite that starts after it; per frame
// from -4 to +6 around the flip: Paint count, painted area (CSS px^2 from the clip quads), Layout, RecalculateStyles,
// Composite (ms descriptive).
// Arms: RP_ARMS="L=fixes/g0-0l/overlay,M=fixes/g0-0m/overlay" (overlay dirs relative to the worktree); argv: arm[+KO]...
// with KO keys below, e.g. L L+K L+P L+S. Out: out/reveal-paint/<RP_TAG>/<arm>-<n>.json, one RPLINE per load.
//   node tools/lock.mjs run chrome-measure --shared --weight simulator --max-seconds 300 --owner fix-reveal-paint -- \
//     node tools/sim.mjs session --functional --owner fix-reveal-paint -- sh -c 'node tools/sim.mjs wda start && \
//     node fixes/reveal-paint/rp-sim.mjs L L+K'
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const WT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const { openTab, runAsync, sleep } = await import(join(WT, 'tools/lib/wip.mjs'));
const { createSession } = await import(join(WT, 'tools/lib/wda.mjs'));
const { compileScript } = await import(join(WT, 'tools/lib/gesture.mjs'));
const { OWNER_INFO_FN } = await import(join(WT, 'fixes/de-offscreen/common.mjs'));
const JS = '_app/immutable/nodes/2.DyWL8TcE.js', CSS = '_app/immutable/assets/2.gBuqKVzi.css';
const sha = (b) => createHash('sha256').update(b).digest('hex').slice(0, 12);

const ARMS = Object.fromEntries((process.env.RP_ARMS || 'L=fixes/g0-0l/overlay').split(',').map((kv) => { const [k, d] = kv.split('='); return [k, d === '-' ? null : join(WT, d)]; }));
// knock-outs and quick candidates (CSS injected after load; attribution only unless a candidate says otherwise)
export const KO = {
  // K: no reveal at all: the card held at its shown state, no transition (pb-frames' KO_CSS)
  K: `.start-selling-future > .start-selling-future-card { visibility: visible !important; opacity: 0.999 !important; filter: blur(0px) !important; transition: none !important; }
.start-selling-future:not(.is-visible) > .start-selling-future-card { transform: translateY(0) !important; }`,
  // P: the deck photos never paint (hidden): the reveal without the photos
  P: `#people .start-selling-profile-shell img { visibility: hidden !important; }`,
  // S: candidate shape 1: the showcase (the deck) renders while the card is hidden (card opacity 0 hides it)
  S: `.start-selling-future:not(.is-visible) > .start-selling-future-card .start-selling-future-showcase { visibility: visible; }`,
  // V: candidate shape 2: the whole card renders while hidden (opacity 0), no visibility flip at all
  V: `.start-selling-future:not(.is-visible) > .start-selling-future-card { visibility: visible !important; }`,
  // W: V plus opacity in the card's will-change, so the opacity-0 layer keeps its painted content (WebKit
  // RenderLayerBacking::containsPaintedContent -> Styleable::mayHaveNonZeroOpacity)
  W: `.start-selling-future:not(.is-visible) > .start-selling-future-card { visibility: visible !important; }
.start-selling-future > .start-selling-future-card { will-change: transform, border-radius, opacity !important; }`,
  // I: the instant path's style change at any speed (g0.0l's data-fw-reveal="instant" rule, as a style): for the step drive
  I: `.start-selling-future > .start-selling-future-card { transition: none !important; }`,
  // F / T (attribution of what W still paints at the flip): the hidden state's filter / transform held at the shown value
  F: `.start-selling-future:not(.is-visible) > .start-selling-future-card { filter: blur(0px) !important; }`,
  T: `.start-selling-future:not(.is-visible) > .start-selling-future-card { transform: translateY(0) !important; }`,
  // X (g0.0m candidate part 2): while the card is hidden, the deck's shells keep their layer whatever their data-fw-wc
  // window says, so the pre-painted shells are not re-promoted (and re-painted) when the deck nears during the flick
  X: `.start-selling-future:not(.is-visible) .start-selling-profile-deck > .start-selling-profile-shell[data-fw-wc="0"] { will-change: transform !important; }`,
};

// an arm token may end in @p0-p1 (step drive range for that load), e.g. L+I@0.60-0.63 (a negative sibling: no flip)
// JS knock-outs (g0.0m rev 3 question, lead ruling 3): hide the hidden card from AT / focus with an attribute set while
// .is-visible is off and cleared in the same task as the flip (a MutationObserver on the section's class runs as a
// microtask after the page's own class write, before the next rendering update, like a write inside l() would)
const togg = (set, clear) => `(() => { const sec = document.querySelector('#people .start-selling-future') || document.querySelector('.start-selling-future'); const card = sec && sec.querySelector(':scope > .start-selling-future-card'); if (!card) return 'no card';
  const f = () => { if (sec.classList.contains('is-visible')) { ${clear} } else { ${set} } }; f(); new MutationObserver(f).observe(sec, { attributes: true, attributeFilter: ['class'] }); return 1; })()`;
export const KOJS = {
  // N: inert on the card while hidden
  N: togg('card.inert = true;', 'card.inert = false;'),
  // A: aria-hidden on the card while hidden (AT only; focus stays)
  A: togg("card.setAttribute('aria-hidden', 'true');", "card.removeAttribute('aria-hidden');"),
  // Z (rev 3 candidate): aria-hidden on the card plus tabindex -1 on its focusable descendants while hidden (the old
  // tabindex kept in a WeakMap, no attribute of ours), all restored at the flip; no CSS selector reads either attribute
  Z: togg("card.setAttribute('aria-hidden', 'true'); const m = (window.__rpTab ||= new WeakMap()); for (const e of card.querySelectorAll('a[href], button, input, select, textarea, [tabindex]')) { if (!m.has(e)) m.set(e, e.getAttribute('tabindex')); e.tabIndex = -1; }",
          "card.removeAttribute('aria-hidden'); const m = (window.__rpTab ||= new WeakMap()); for (const e of card.querySelectorAll('a[href], button, input, select, textarea, [tabindex]')) { if (!m.has(e)) continue; const v = m.get(e); if (v == null) e.removeAttribute('tabindex'); else e.setAttribute('tabindex', v); m.delete(e); }"),
};
const ORDER = process.argv.slice(2).filter((a) => { const b = a.split('@')[0]; return ARMS[b.split('+')[0]] && b.split('+').slice(1).every((k) => KO[k] || KOJS[k]); });
if (!ORDER.length) { console.error('usage: rp-sim.mjs <arm>[+KO]... (arms from RP_ARMS)'); process.exit(1); }
const TAG = process.env.RP_TAG || new Date().toISOString().replace(/[:.]/g, '-');
const D = join(WT, 'out/reveal-paint', TAG); mkdirSync(D, { recursive: true });
const DRIVE = process.env.RP_DRIVE || 'flick';
// step drive: rest at hero-track progress p0 (census there), then one instant scrollTo to p1 inside the Timeline window
const [P0, P1] = (process.env.RP_STEP || '0.70,0.73').split(',').map(Number);
const YAT = (p) => `(() => { const t = document.querySelector('.hero-track'), b = t.getBoundingClientRect(); return Math.round(b.top + scrollY + ${p} * Math.max(1, b.height - innerHeight)); })()`;
const SETTLE = Number(process.env.RP_SETTLE_MS || 9000);
const BUDGET = Number(process.env.RP_BUDGET_S || 270) * 1000, T0 = Date.now();
const errText = (e) => e?.message || JSON.stringify(e);

const S = (dir, px, ms, profile) => ({ type: 'stroke', dir, px, ms, profile });
const P = (ms) => ({ type: 'pause', ms });
const PROGS = {
  flick: [S('up', 300, 220, 'fling')],
  slow: [S('up', 520, 1200, 'drag'), P(300), S('up', 520, 1200, 'drag'), P(300), S('up', 520, 1200, 'drag')],
};

const INSTALL = `(() => {
  if (window.__rp) return 0;
  const L = window.__rp = { flips: [], f: [], on: false };
  const people = document.getElementById('people');
  const sy = Object.getOwnPropertyDescriptor(window, 'scrollY') || Object.getOwnPropertyDescriptor(Object.getPrototypeOf(window), 'scrollY');
  const tick = () => { if (L.on) L.f.push([performance.now(), sy.get.call(window)]); requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
  new MutationObserver((ms) => { for (const m of ms) { const was = /(^|\\s)is-visible(\\s|$)/.test(m.oldValue || ''), now = people.classList.contains('is-visible');
    if (was !== now) { console.timeStamp(now ? 'rp:flip' : 'rp:unflip'); L.flips.push([performance.now(), now ? 1 : 0, sy.get.call(window), people.getAttribute('data-fw-reveal')]); } } })
    .observe(people, { attributes: true, attributeFilter: ['class'], attributeOldValue: true });
  return 1;
})()`;
const STATE = `JSON.stringify((() => { const p = document.getElementById('people'), card = p && p.querySelector('.start-selling-future-card'); const cs = card ? getComputedStyle(card) : null;
  const shells = [...document.querySelectorAll('#people .start-selling-profile-shell')];
  const im = shells.flatMap((s) => [...s.querySelectorAll('img')]);
  return { y: scrollY, vh: innerHeight, cls: p && p.className, render: p && p.getAttribute('data-start-selling-render'), scene: p && p.getAttribute('data-start-selling-scene'),
    card: cs && { vis: cs.visibility, op: cs.opacity, f: cs.filter, t: cs.transform, wc: cs.willChange, fwwc: card.getAttribute('data-fw-wc'), top: Math.round(card.getBoundingClientRect().top + scrollY), h: Math.round(card.getBoundingClientRect().height) },
    imgs: [im.filter((i) => i.complete && i.naturalWidth > 0).length, im.length] }; })())`;

function flat(records) { const out = []; const walk = (r, parent) => { out.push({ type: r.type, start: r.startTime * 1000, end: (r.endTime ?? r.startTime) * 1000, data: r.data, parent }); for (const ch of r.children || []) walk(ch, r.type); }; for (const r of records) walk(r, null); return out; }
const quadArea = (q) => { if (!Array.isArray(q) || q.length < 8) return 0; let a = 0; for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; a += q[2 * i] * q[2 * j + 1] - q[2 * j] * q[2 * i + 1]; } return Math.abs(a) / 2; };

async function layers(c) {
  const doc = await c.send('DOM.getDocument');
  const html = (doc.root.children || []).find((n) => n.nodeName === 'HTML') || doc.root;
  const L = (await c.send('LayerTree.layersForNode', { nodeId: html.nodeId })).layers || [];
  return L.map((l) => ({ id: l.layerId, node: l.nodeId, mem: l.memory || 0, paints: l.paintCount || 0, b: l.bounds && [l.bounds.x, l.bounds.y, l.bounds.width, l.bounds.height] }));
}
async function owners(c, ids) {
  const fresh = new Map((await layers(c)).map((l) => [l.id, l])); const out = {};
  for (const id of ids) { const l = fresh.get(id); if (!l?.node) continue;
    try { const { object } = await c.send('DOM.resolveNode', { nodeId: l.node }); const r = await c.send('Runtime.callFunctionOn', { objectId: object.objectId, functionDeclaration: OWNER_INFO_FN, returnByValue: true });
      const v = r.result?.value || {}; out[id] = { sel: v.sel, path: v.path, hidden: v.hidden, rect: v.rect }; await c.send('Runtime.releaseObject', { objectId: object.objectId }).catch(() => {}); } catch (e) { out[id] = { err: errText(e).slice(0, 60) }; } }
  return out;
}

function frames(f, flipT) {
  // frame boundaries: the end of each Composite record (one per rendering update in WebKit)
  const comps = f.filter((r) => r.type === 'Composite').sort((a, b) => a.start - b.start);
  const k = comps.findIndex((r) => r.start >= flipT);
  if (k < 0) return { error: 'no Composite after the flip' };
  const rows = [];
  for (let i = Math.max(0, k - Number(process.env.RP_BEFORE || 20)); i <= Math.min(comps.length - 1, k + Number(process.env.RP_AFTER || 10)); i++) {
    const lo = i === 0 ? comps[0].start - 50 : comps[i - 1].end, hi = comps[i].end;
    const in_ = f.filter((r) => r.start >= lo && r.start < hi);
    const paints = in_.filter((r) => r.type === 'Paint');
    const ms = (t) => Math.round(in_.filter((r) => r.type === t).reduce((s, r) => s + (r.end - r.start), 0) * 10) / 10;
    rows.push({ rel: i - k, t: Math.round(comps[i].start - flipT), paints: paints.length, area: Math.round(paints.reduce((s, r) => s + quadArea(r.data?.clip), 0)),
      paintMs: ms('Paint'), compMs: Math.round((comps[i].end - comps[i].start) * 10) / 10, layouts: in_.filter((r) => r.type === 'Layout').length, layoutMs: ms('Layout'),
      styles: in_.filter((r) => r.type === 'RecalculateStyles').length, styleMs: ms('RecalculateStyles'), paintParents: [...new Set(paints.map((r) => r.parent))].join('|'),
      big: paints.filter((r) => quadArea(r.data?.clip) > 20000).map((r) => [Math.round(quadArea(r.data.clip)), Math.round((r.end - r.start) * 10) / 10]).slice(0, 8) });
  }
  return { rows };
}

const wda = DRIVE === 'none' || DRIVE === 'step' ? null : await createSession({ base: process.env.RP_WDA || 'http://127.0.0.1:8101', simulator: true });
const prog = DRIVE === 'none' || DRIVE === 'step' ? null : compileScript({ name: 'rp-' + DRIVE, version: 1, screen: [430, 932], params: { x: 215 }, steps: PROGS[DRIVE] });
const n = {};
try {
  for (const armK of ORDER) {
    if (Date.now() - T0 > BUDGET - 45000) { console.log(`STOP budget before ${armK}`); break; }
    const [armB, rng] = armK.split('@'); const [arm, ...kos] = armB.split('+'); n[armK] = (n[armK] || 0) + 1;
    const [p0, p1] = rng ? rng.split('-').map(Number) : [P0, P1];
    const out = join(D, `${armK}-${n[armK]}.json`);
    const st = join(D, `serve-${arm}.json`); rmSync(st, { force: true });
    const p = spawn(process.execPath, [join(WT, 'tools/serve.mjs'), '--root', 'site-pretty', ...(ARMS[arm] ? ['--overlay', ARMS[arm]] : []), '--port', '0', '--quiet', '--state', st,
      '--vendors=local', '--latency', '150', '--owner', 'fix-reveal-paint', '--doing', `reveal-paint sim ${armK}`], { cwd: WT, stdio: ['ignore', 'ignore', 'inherit'] });
    const rec = { tool: 'fixes/reveal-paint/rp-sim.mjs', arm: armK, drive: DRIVE, ko: kos.map((k) => KO[k] || KOJS[k]), errors: [] };
    try {
      let s = null; for (let k = 0; k < 300 && !s; k++) { if (existsSync(st)) try { s = JSON.parse(readFileSync(st, 'utf8')); } catch {} if (!s) await sleep(100); }
      if (!s) throw new Error('server did not start');
      const base = `http://localhost:${s.port}/`;
      rec.served = { js: sha(Buffer.from(await (await fetch(base + JS)).arrayBuffer())), css: sha(Buffer.from(await (await fetch(base + CSS)).arrayBuffer())) };
      const key = `rp=${armK}-${n[armK]}-${Date.now()}`, url = `${base}?${key}`;
      spawnSync('node', ['tools/sim.mjs', 'open', url], { cwd: WT, encoding: 'utf8' });
      process.env.FW_TAB_HOST = `localhost:${s.port}`;
      let c = null;
      for (let i = 0; i < 8 && !c; i++) { let t; try { t = await openTab((u) => u.startsWith(base)); } catch (e) { await sleep(1000); continue; }
        const nav = await t.evaluate("(performance.getEntriesByType('navigation')[0] || {}).name || ''").catch(() => ''); if (String(nav).includes(key)) c = t; else { t.close(); await sleep(1000); } }
      if (!c) throw new Error('no fresh tab');
      for (let i = 0; i < 80; i++) { if ((await c.evaluate("document.readyState === 'complete'")) === true) break; await sleep(250); }
      await sleep(SETTLE);
      if (kos.some((k) => KO[k])) { await c.evaluate(`(() => { const s = document.createElement('style'); s.id = 'rp-ko'; s.textContent = ${JSON.stringify(kos.filter((k) => KO[k]).map((k) => KO[k]).join('\n'))}; document.head.appendChild(s); return 1; })()`); }
      for (const k of kos.filter((k) => KOJS[k])) rec.koJs = [...(rec.koJs || []), [k, await c.evaluate(KOJS[k])]];
      // 2.5 s: an injected rule that turns the hidden card visible runs through the hidden state's delayed visibility
      // transition (visibility 0s linear 1.6s), which beats even !important in the cascade
      await c.evaluate('(scrollTo(0, 0), 1)'); await sleep(2500);
      if (DRIVE === 'step') { rec.step = [p0, p1]; rec.y0 = await c.evaluate(YAT(p0)); rec.y1 = await c.evaluate(YAT(p1)); await c.evaluate(`(scrollTo(0, ${rec.y0}), 1)`); await sleep(2500); }
      await c.evaluate(INSTALL);
      rec.pre = JSON.parse(await c.evaluate(STATE));
      await c.send('DOM.enable').catch(() => {}); await c.send('LayerTree.enable');
      const C0 = await layers(c), C0b = await layers(c);
      const recs = []; c.on((m) => { if (m.method === 'Timeline.eventRecorded') recs.push(m.params.record); });
      await c.send('Page.disable').catch(() => {}); await c.send('Page.enable').catch(() => {});
      await c.send('Timeline.enable'); await c.send('Timeline.setInstruments', { instruments: ['Timeline'] }).catch(() => {});
      await c.send('Timeline.start', { maxCallStackDepth: 1 });
      await c.evaluate("(window.__rp.on = true, console.timeStamp('rp:idle0'), 1)");
      await sleep(Number(process.env.RP_IDLE_MS || 3000)); // RP_IDLE_MS (lead ruling 2: idle paints at the top over 30 s)
      await c.evaluate("(console.timeStamp('rp:go'), 1)");
      if (DRIVE === 'step') { await c.evaluate(`(scrollTo(0, ${rec.y1}), 1)`); await sleep(1500); }
      if (prog) for (const op of prog.ops) { if (op.op === 'stroke') await wda.actions(op.actions); else if (op.op === 'pause') await sleep(op.ms); }
      await sleep(DRIVE === 'step' ? 500 : 3500);
      await c.evaluate("(console.timeStamp('rp:end'), window.__rp.on = false, 1)");
      await sleep(300); await c.send('Timeline.stop'); await c.send('Timeline.disable').catch(() => {});
      const C1 = await layers(c);
      rec.post = JSON.parse(await c.evaluate(STATE));
      const lg = JSON.parse(await c.evaluate('JSON.stringify({ flips: window.__rp.flips, f: window.__rp.f })'));
      rec.flips = lg.flips; rec.rafFrames = lg.f;
      const f = flat(recs); const ts = (m) => f.find((r) => r.type === 'TimeStamp' && r.data?.message === m)?.start;
      const flipT = ts('rp:flip'); rec.marks = { idle0: ts('rp:idle0'), go: ts('rp:go'), flip: flipT, end: ts('rp:end') };
      { const a = rec.marks.idle0, b = rec.marks.go; const ps = f.filter((r) => r.type === 'Paint' && r.start >= a && r.start < b);
        rec.idle = { ms: Math.round(b - a), paints: ps.length, area: Math.round(ps.reduce((s2, r) => s2 + quadArea(r.data?.clip), 0)), layouts: f.filter((r) => r.type === 'Layout' && r.start >= a && r.start < b).length, styles: f.filter((r) => r.type === 'RecalculateStyles' && r.start >= a && r.start < b).length }; }
      rec.frames = flipT == null ? { error: 'no flip in the window' } : frames(f, flipT);
      if (flipT != null) rec.raw = f.filter((r) => r.start >= flipT - 300 && r.start < flipT + 400 && ['Paint', 'Composite', 'Layout', 'RecalculateStyles', 'RenderingFrame', 'TimeStamp'].includes(r.type)).map((r) => ({ ...r, start: Math.round((r.start - flipT) * 10) / 10, end: Math.round((r.end - flipT) * 10) / 10 }));
      const by0 = new Map(C0.map((l) => [l.id, l])), by0b = new Map(C0b.map((l) => [l.id, l]));
      const delta = C1.map((l) => ({ ...l, d: l.paints - (by0b.get(l.id)?.paints ?? 0), art: (by0b.get(l.id)?.paints ?? 0) - (by0.get(l.id)?.paints ?? 0), isNew: !by0b.has(l.id), mem0: by0b.get(l.id)?.mem ?? 0 }));
      const ids = delta.filter((l) => l.d > l.art + 0 || l.isNew || l.mem >= 1e6 || l.mem0 >= 1e6).map((l) => l.id);
      rec.layers = { n0: C0b.length, n1: C1.length, mem0: C0b.reduce((s, l) => s + l.mem, 0), mem1: C1.reduce((s, l) => s + l.mem, 0), changed: delta.filter((l) => ids.includes(l.id)), owners: await owners(c, ids) };
      rec.types = f.reduce((o, r) => ((o[r.type] = (o[r.type] || 0) + 1), o), {});
      // RP_VISIT="4000,0,..." (lead ruling 2: does the extra layer memory stay for the whole visit?): after the drive, an
      // instant jump to each y, 4 s, then the layer census total (MB) and the card's state
      if (process.env.RP_VISIT) { rec.visit = [];
        for (const y of process.env.RP_VISIT.split(',').map(Number)) { await c.evaluate(`(scrollTo(0, ${y}), 1)`); await sleep(4000);
          const L = await layers(c); rec.visit.push({ y, sy: await c.evaluate('Math.round(scrollY)'), layers: L.length, mb: Math.round(L.reduce((s2, l) => s2 + l.mem, 0) / 1e5) / 10, card: JSON.parse(await c.evaluate(STATE)) }); } }
      c.close();
    } catch (e) { rec.errors.push(errText(e)); }
    finally { p.kill(); }
    writeFileSync(out, JSON.stringify(rec));
    const fr = rec.frames?.rows?.find((r) => r.rel === 0);
    const others = (rec.frames?.rows || []).filter((r) => r.rel !== 0);
    const top = others.slice().sort((a, b) => b.paintMs - a.paintMs)[0];
    const pl = (rec.layers?.changed || []).filter((l) => l.d > l.art).map((l) => `${(rec.layers.owners[l.id]?.sel || '?').slice(0, 40)}:${l.d}${l.isNew ? 'n' : ''}`).slice(0, 8).join(' ');
    console.log(`RPLINE ${armK}-${n[armK]} idle ${JSON.stringify(rec.idle)} served ${rec.served?.js}/${rec.served?.css} pre ${JSON.stringify(rec.pre?.card)} imgs ${rec.pre?.imgs} flips ${JSON.stringify(rec.flips?.slice(0, 2))} `
      + `flipframe ${fr ? `paints ${fr.paints} area ${fr.area} paintMs ${fr.paintMs} comp ${fr.compMs} lay ${fr.layouts} sty ${fr.styles}` : JSON.stringify(rec.frames?.error)} `
      + `| worst other frame ${top ? `rel ${top.rel} paints ${top.paints} area ${top.area} paintMs ${top.paintMs} comp ${top.compMs}` : '-'} `
      + `layers ${rec.layers?.n0}->${rec.layers?.n1} MB ${Math.round((rec.layers?.mem0 || 0) / 1e5) / 10}->${Math.round((rec.layers?.mem1 || 0) / 1e5) / 10} painted ${pl}${rec.errors.length ? ' ERR ' + rec.errors.join('; ') : ''}`);
  }
} finally { await wda?.close().catch(() => {}); }
