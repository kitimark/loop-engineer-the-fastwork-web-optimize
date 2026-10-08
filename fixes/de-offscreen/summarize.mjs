#!/usr/bin/env node
// de-offscreen: summarize out/de-offscreen/{chrome,sim}-<arm>.json into per-layer rows, per-build totals by viewport
// relation, the ranked off-screen offenders, and what g0.0e / g0.0f add over v0 (by owner selector).
//   node fixes/de-offscreen/summarize.mjs [--engine chrome|sim] [--md] [--json out/de-offscreen/summary.json]
// Chrome: the layer box is the layer rect through its `transform` (screen space, CSS px: checked against the owner's
// getBoundingClientRect, see the README); memory is an ESTIMATE = drawsContent area x DPR^2 x 4 B (a full raster; Chrome
// rasters only tiles near the viewport, so off-screen estimates are upper bounds). Paints: paintCount deltas.
// WebKit: the layer box is `bounds` (absolute page coords) minus scroll; memory is WebKit's own `memory` (backing store);
// paints: Timeline Paint records attributed by clip quad, and paintCount deltas net of the census artefact.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { WT, relate } from './common.mjs';

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const ENGINES = opt('--engine') ? [opt('--engine')] : ['chrome', 'sim'];
const OUT = join(WT, opt('--dir', 'out/de-offscreen'));
const ARMS = ['v0', 'e', 'f'];
const MB = (b) => Math.round(b / 1e4) / 100;

function chromeBox(l) {
  const t = l.transform || [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  const pts = [[0, 0], [l.width, 0], [0, l.height], [l.width, l.height]].map(([x, y]) => { x += l.offsetX || 0; y += l.offsetY || 0; const w = t[3] * x + t[7] * y + t[15] || 1; return [(t[0] * x + t[4] * y + t[12]) / w, (t[1] * x + t[5] * y + t[13]) / w]; });
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]); const x = Math.min(...xs), y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}
function seen(rel, ow, vw, vh) {
  if (rel.where !== 'on' && rel.where !== 'partial') return rel.where;
  if (ow.hidden) return 'hidden';
  if (ow.clipped) { const c = ow.clipped; const r = relate({ x: c[0], y: c[1], w: c[2], h: c[3] }, vw, vh); if (r.where === 'off' || r.where === 'empty') return 'hidden'; }
  return rel.where;
}
const animTxt = (a) => `${a.name || a.props}${a.timeline && a.timeline !== 'doc' ? '@' + a.timeline : ''}${a.inf ? '∞' : ''}`;

function rowsChrome(r, pos) {
  const P = r.positions[pos]; if (!P?.C1) return null;
  const dpr = r.viewport.dpr, vw = r.viewport.w, vh = r.viewport.h;
  const pc = (C) => Object.fromEntries((C?.layers || []).map((l) => [l.layerId, l.paintCount || 0]));
  const p0 = pc(P.C0w || P.C0), p1 = pc(P.C1), p2 = pc(P.C2);
  return P.C1.layers.map((l) => {
    const o = P.owners[l.layerId] || {}; const ow = o.owner || {};
    const box = chromeBox(l); const rel = relate(box, vw, vh);
    const draws = !!l.drawsContent && !l.invisible && l.width * l.height > 0;
    return { id: l.layerId, sel: ow.sel || (l.backendNodeId ? '?' : '(no node)'), path: ow.path || '', box: [box.x, box.y, box.w, box.h].map(Math.round), ...rel,
      seen: seen(rel, ow, vw, vh), hiddenBy: ow.hidden || null, clipped: ow.clipped || null, draws, mem: draws ? l.width * l.height * dpr * dpr * 4 : 0, idle: l.layerId in p0 ? p1[l.layerId] - p0[l.layerId] : null, scroll: l.layerId in p2 ? p2[l.layerId] - p1[l.layerId] : null,
      reasons: o.reasons || [], own: (ow.own || []).filter((a) => a.state === 'running').map(animTxt), sub: (ow.sub || []).map(animTxt), subRunning: ow.subRunning || 0,
      wc: ow.style?.['will-change'] || null, data: ow.data || {} };
  });
}

function rowsSim(r, pos) {
  const P = r.positions[pos]; if (!P?.C1) return null;
  const vw = r.page.iw, vh = r.page.ih, y = P.C1.y;
  const by = (C) => Object.fromEntries((C?.layers || []).map((l) => [l.id, l.paints]));
  const p0b = by(P.C0b), p1 = by(P.C1), p1b = by(P.C1b), p0 = by(P.C0);
  // Timeline Paint records: clip quad -> box; space decided by the caller (abs = page coords, view = viewport coords)
  const paints = (P.timeline?.paints || []).map((p) => { const q = p.clip; if (!q || q.length < 8) return null; const xs = [q[0], q[2], q[4], q[6]], ys = [q[1], q[3], q[5], q[7]]; const x = Math.min(...xs), yy = Math.min(...ys); return { w: p.w, x, y: yy, wd: Math.max(...xs) - x, ht: Math.max(...ys) - yy }; }).filter(Boolean);
  const rows = P.C1.layers.map((l) => {
    const o = P.owners[l.id] || {}; const ow = o.owner || {};
    const b = l.b ? { x: l.b[0], y: l.b[1] - y, w: l.b[2], h: l.b[3] } : null; const rel = relate(b, vw, vh);
    const art = l.id in p1b ? p1b[l.id] - p1[l.id] : null, artC0 = l.id in p0b && l.id in p0 ? p0b[l.id] - p0[l.id] : null;
    const raw = l.id in p0b ? p1[l.id] - p0b[l.id] : null;
    return { id: l.id, sel: (ow.sel || (l.node ? '?' : '(no node)')) + (l.pseudo ? '::' + l.pseudo : ''), path: ow.path || '', box: b ? [b.x, b.y, b.w, b.h].map(Math.round) : null, ...rel,
      seen: seen(rel, ow, vw, vh), hiddenBy: ow.hidden || null, clipped: ow.clipped || null, draws: l.mem > 0, mem: l.mem, isNew: !(l.id in p0b), total: l.paints, pcRaw: raw, artefact: art, artefactC0: artC0, pcNet: raw == null ? null : raw - Math.max(art ?? 0, artC0 ?? 0),
      reasons: o.reasons || [], own: (ow.own || []).filter((a) => a.state === 'running').map(animTxt), sub: (ow.sub || []).map(animTxt), subRunning: ow.subRunning || 0,
      wc: ow.style?.['will-change'] || null, data: ow.data || {}, rect: ow.rect || null, cb: l.cb };
  });
  // attribute each Timeline Paint to the smallest layer whose (page) box contains the paint box's centre, in both spaces
  for (const sp of ['abs', 'view']) {
    for (const p of paints) {
      const cx = p.x + p.wd / 2, cy = (sp === 'abs' ? p.y - y : p.y) + p.ht / 2;
      let best = null; for (const rw of rows) { const b = rw.box; if (!b || !(b[2] > 0)) continue; if (cx >= b[0] && cx <= b[0] + b[2] && cy >= b[1] && cy <= b[1] + b[3] && (!best || b[2] * b[3] < best.box[2] * best.box[3])) best = rw; }
      if (best) { const k = `tl_${sp}_${p.w}`; best[k] = (best[k] || 0) + 1; }
    }
  }
  return { rows, paints: paints.map((p) => ({ ...p, relAbs: relate({ x: p.x, y: p.y - y, w: p.wd, h: p.ht }, vw, vh).where, relView: relate({ x: p.x, y: p.y, w: p.wd, h: p.ht }, vw, vh).where })) };
}

// paint metric: Chrome paintCount deltas (idle + scroll); WebKit repaintCount delta C0b -> C1 net of the census artefact (a new layer: its total)
const PAINT = { chrome: (x) => (x.idle || 0) + (x.scroll || 0), sim: (x) => (x.pcNet ?? x.total ?? 0) };
const summary = {};
for (const eng of ENGINES) {
  summary[eng] = {};
  for (const arm of ARMS) {
    const f = join(OUT, `${eng}-${arm}.json`); if (!existsSync(f)) continue;
    const r = JSON.parse(readFileSync(f, 'utf8'));
    summary[eng][arm] = { served: r.served, errors: r.errors, page: r.page, positions: {} };
    for (const pos of ['top', 'B']) {
      const got = eng === 'chrome' ? { rows: rowsChrome(r, pos) } : rowsSim(r, pos);
      if (!got || !got.rows) continue;
      const rows = got.rows;
      const tot = {}; for (const w of ['on', 'partial', 'hidden', 'off', 'empty']) { const xs = rows.filter((x) => x.seen === w); tot[w] = { n: xs.length, mb: MB(xs.reduce((s, x) => s + x.mem, 0)), paints: xs.reduce((s, x) => s + PAINT[eng](x), 0) }; }
      const paintKey = PAINT[eng];
      const off = rows.filter((x) => (x.seen === 'off' || x.seen === 'hidden') && (x.mem > 0 || paintKey(x) > 0 || x.own.length || x.subRunning || x.wc))
        .sort((a, b) => b.mem - a.mem || paintKey(b) - paintKey(a));
      summary[eng][arm].positions[pos] = { y: r.positions[pos].C1.y, n: rows.length, mb: MB(rows.reduce((s, x) => s + x.mem, 0)), byWhere: tot, rows, offenders: off.map((x) => x.id), paints: got.paints || null,
        running: r.positions[pos].running, timeline: r.positions[pos].timeline ? { idleMs: r.positions[pos].timeline.idleMs, scrollMs: r.positions[pos].timeline.scrollMs, idle: r.positions[pos].timeline.idle, scroll: r.positions[pos].timeline.scroll } : null };
    }
  }
}
if (opt('--json')) writeFileSync(join(WT, opt('--json')), JSON.stringify(summary));

// ---- print ----------------------------------------------------------------------------------------------------------
const pr = (s) => console.log(s);
for (const eng of ENGINES) for (const pos of ['top', 'B']) {
  pr(`\n## ${eng} ${pos}`);
  pr('| build | y | layers | MB | on n/MB/paints | partial n/MB/paints | hidden n/MB/paints | off n/MB/paints |'); pr('|---|---|---|---|---|---|---|---|');
  for (const arm of ARMS) { const s = summary[eng][arm]?.positions[pos]; if (!s) continue; const b = s.byWhere; const t = (w) => `${b[w].n} / ${b[w].mb} / ${b[w].paints}`; pr(`| ${arm} | ${s.y} | ${s.n} | ${s.mb} | ${t('on')} | ${t('partial')} | ${t('hidden')} | ${t('off')} |`); }
  // group by owner selector: count + MB + paints, per arm, and the delta vs v0
  const groups = {};
  for (const arm of ARMS) { const s = summary[eng][arm]?.positions[pos]; if (!s) continue;
    for (const x of s.rows) { const k = `${x.sel}|${x.seen}`; const g = (groups[k] ||= {}); const a = (g[arm] ||= { n: 0, mem: 0, paint: 0, anim: new Set(), wc: new Set(), gap: [] });
      a.n++; a.mem += x.mem; a.paint += PAINT[eng](x); for (const t of [...x.own, ...x.sub]) a.anim.add(t); if (x.wc) a.wc.add(x.wc); if (x.gap) a.gap.push(x.gap); } }
  const rowsG = Object.entries(groups).map(([k, g]) => ({ k, g, d: ((g.e?.n || 0) + (g.f?.n || 0)) - 2 * (g.v0?.n || 0), dm: ((g.e?.mem || 0) + (g.f?.mem || 0)) - 2 * (g.v0?.mem || 0) }))
    .filter((x) => x.d !== 0 || Math.abs(x.dm) > 1e5).sort((a, b) => Math.abs(b.dm) - Math.abs(a.dm) || Math.abs(b.d) - Math.abs(a.d)).slice(0, 25);
  pr(`\nowner groups that differ from v0 (${eng} ${pos}): n / MB / paints per build`);
  pr('| owner | where | v0 | g0.0e | g0.0f | anims / will-change |'); pr('|---|---|---|---|---|---|');
  const c = (a) => (a ? `${a.n} / ${MB(a.mem)} / ${a.paint}` : '-');
  for (const { k, g } of rowsG) { const [sel, where] = k.split('|'); const any = g.e || g.f || g.v0; pr(`| ${sel.slice(0, 70)} | ${where}${any.gap.length ? ' ' + Math.min(...any.gap) + '-' + Math.max(...any.gap) : ''} | ${c(g.v0)} | ${c(g.e)} | ${c(g.f)} | ${[...any.anim].slice(0, 3).join(' ')}${any.wc.size ? ' wc:' + [...any.wc].join(',') : ''} |`); }
}
