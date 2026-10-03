#!/usr/bin/env node
// rest-script: check every visible frame recorded by rot.mjs against the original rotator's rule, and compare frozen shots.
// usage: node analyse.mjs --st6 <rot st6 json> --fix <rot fix json> [--st6replay <json>] [--fixreplay <json>] [--out <json>]
import { readFileSync, writeFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const load = (p) => (p ? JSON.parse(readFileSync(p, 'utf8')) : null);
const TOL = 0.25;     // ms, currentTime rounding
const DUR = 220;

function check(run) {
  const out = { arm: run.arm, w: run.w, reduced: run.reduced, fatal: run.fatal || null, errors: run.errors, docs: [] };
  const maps = {};                          // "x|sliding" -> srcs json
  for (const doc of run.docs) {
    const ev = doc.events.slice().sort((a, b) => a[1] - b[1]);
    const gate = doc.gate.slice().sort((a, b) => a[0] - b[0]);
    const fr = doc.frames;
    const D = { label: doc.label, frames: fr.length, visible: 0, mism: { srcs: 0, sliding: 0, eff: 0, xlog: 0, srcsMap: 0 }, examples: [], entries: [] };
    // x before each event, from the event log (x starts at 0; 'end' advances it)
    let x = 0, xlogBad = 0; const len = doc.d ? doc.d.length : null;
    const evx = ev.map((e) => { if (e[2] !== x) xlogBad++; const r = { k: e[0], t: e[1], x }; if (e[0] === 'end') x = len ? (x + 1) % len : x + 1; r.xAfter = x; return r; });
    D.mism.xlog = xlogBad; D.events = ev.length; D.len = len;
    let ei = 0, gi = 0, cx = 0, lastStart = null, lastKind = null, gateState = gate.length ? gate[0][1] : 'active', gateOffSince = -1;
    // per slide: F1 = stamp of the first frame after the slide start, F2 = the next frame's. The original's animations
    // start at F1 or F2 (Chrome: a compositor start can resolve a frame late; until then currentTime reads 0), so a
    // slide fits when ONE S0 in {F1, F2} explains every visible sliding frame: eff = clamp(T - S0, 0, 220).
    const slides = new Map();     // start time -> { F1, F2, frames: [[T, eff]], enteredMid }
    let S = null, wasVis = false, frozenSkipped = 0;
    for (let i = 0; i < fr.length; i++) {
      const [T, tn, tro, vis] = fr[i];
      while (ei < evx.length && evx[ei].t < tn) { const e = evx[ei++]; cx = e.xAfter; lastKind = e.k; if (e.k === 'start') { lastStart = e.t; S = { t: e.t, F1: null, F2: null, frames: [], enteredMid: null }; slides.set(e.t, S); } }
      while (gi < gate.length && gate[gi][0] < tn) { gateState = gate[gi][1]; if (gateState !== 'active') gateOffSince = gate[gi][0]; gi++; }
      if (lastKind === 'start' && S) { if (S.F1 === null) S.F1 = T; else if (S.F2 === null) S.F2 = T; }
      const slidingExp = lastKind === 'start' && !(gateOffSince > lastStart) ? 1 : 0;
      if (!vis) { wasVis = false; continue; }
      // frames after a freeze (animations paused, timers held) until the unfreeze are not the page's own
      if ((doc.frz || []).some(([a, b]) => T > a && (b === null || tn < b))) { frozenSkipped++; continue; }
      D.visible++;
      const [, , , , y, sliding, srcs, anims] = fr[i];
      const bad = [];
      if (sliding !== slidingExp) { D.mism.sliding++; bad.push('sliding'); }
      const key = `${cx}|${sliding}|${srcs.length}`, sj = JSON.stringify(srcs);
      if (maps[key] === undefined) maps[key] = sj; else if (maps[key] !== sj) { D.mism.srcsMap++; bad.push('srcsMap'); }
      let effRec = null;
      if (sliding && anims.length) {
        const effs = anims.map((a) => (a[1] === null ? null : a[1] - a[2]));
        effRec = effs[0];
        if (effs.some((e) => e === null || Math.abs(e - effs[0]) > TOL)) bad.push('effSpread');
        if (slidingExp && S) { S.frames.push([T, effRec]); if (S.enteredMid === null) S.enteredMid = !wasVis && T > S.F1; }
      }
      if (!wasVis) D.entries.push({ i, T: +T.toFixed(2), y, x: cx, sliding, slidingExp, effRec: effRec === null ? null : +effRec.toFixed(2), sinceF1: slidingExp && S ? +(T - S.F1).toFixed(2) : null, ok: !bad.length });
      if (bad.length && D.examples.length < 12) D.examples.push({ i, T: +T.toFixed(2), y, bad, x: cx, sliding, slidingExp, effRec, srcs, anims, lastStart });
      wasVis = true;
    }
    D.frozenSkipped = frozenSkipped;
    const fit = (s, S0) => S0 !== null && s.frames.every(([T, e]) => e !== null && Math.abs(Math.min(e, DUR) - Math.max(0, Math.min(T - S0, DUR))) <= TOL);
    D.slides = { visible: 0, F1: 0, F2: 0, both: 0, none: 0, midEntries: { F1: 0, F2: 0, both: 0, none: 0 }, noneEx: [] };
    for (const s of slides.values()) {
      if (!s.frames.length) continue;
      D.slides.visible++;
      const a = fit(s, s.F1), b = fit(s, s.F2);
      const k = a && b ? 'both' : a ? 'F1' : b ? 'F2' : 'none';
      D.slides[k]++;
      if (s.enteredMid) D.slides.midEntries[k]++;
      if (k === 'none') { D.mism.eff++; if (D.slides.noneEx.length < 4) D.slides.noneEx.push({ F1: s.F1, F2: s.F2, mid: s.enteredMid, frames: s.frames.slice(0, 6).map(([T, e]) => [+(T - s.F1).toFixed(1), e]) }); }
    }
    out.docs.push(D);
  }
  out.maps = maps;
  out.shots = run.shots.map((s) => ({ label: s.label, kind: s.kind, ph: s.ph, mutAfter: s.mutAfter, sliding: s.rec[5], eff: s.rec[7]?.length ? +(s.rec[7][0][1] - s.rec[7][0][2]).toFixed(2) : null }));
  return out;
}

function pngPixels(buf) {
  let o = 8, w, h, bpp, idat = [];
  while (o < buf.length) { const len = buf.readUInt32BE(o), type = buf.toString('ascii', o + 4, o + 8), d = buf.subarray(o + 8, o + 8 + len);
    if (type === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); bpp = d[9] === 6 ? 4 : 3; } else if (type === 'IDAT') idat.push(d); o += 12 + len; }
  const raw = inflateSync(Buffer.concat(idat)); const stride = w * bpp; const px = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) { const f = raw[y * (stride + 1)], line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) { const a = x >= bpp ? px[y * stride + x - bpp] : 0, b = y ? px[(y - 1) * stride + x] : 0, c = x >= bpp && y ? px[(y - 1) * stride + x - bpp] : 0;
      let v = line[x]; if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1; else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      px[y * stride + x] = v & 255; } }
  return { w, h, bpp, px };
}
function pxDiff(fa, fb) {
  const A = pngPixels(readFileSync(fa)), B = pngPixels(readFileSync(fb));
  if (A.w !== B.w || A.h !== B.h) return { sizeMismatch: [A.w, A.h, B.w, B.h] };
  let n = 0, max = 0, colours = new Set();
  for (let i = 0; i < A.px.length; i += A.bpp) { let d = 0; for (let c = 0; c < 3; c++) d = Math.max(d, Math.abs(A.px[i + c] - B.px[i + c])); if (d) n++; max = Math.max(max, d); if (colours.size < 4) colours.add(A.px.readUIntBE(i, 3)); }
  return { w: A.w, h: A.h, diffPixels: n, maxChannelDelta: max, blank: colours.size < 2 };
}
// Simulator shots: full-screen screenshots, each with a magenta viewport calibration taken right after; crop the row
function cropRow(file, cal, rect) {
  const C = pngPixels(readFileSync(cal)); let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
  for (let y = 0; y < C.h; y++) for (let x = 0; x < C.w; x++) { const i = (y * C.w + x) * C.bpp; if (C.px[i] > 245 && C.px[i + 1] < 10 && C.px[i + 2] > 245) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } }
  const sc = (x1 - x0 + 1) / rect.iw, pad = 6;
  const A = pngPixels(readFileSync(file));
  const cx = Math.max(0, Math.round(x0 + rect.left * sc) - pad), cy = Math.max(0, Math.round(y0 + rect.top * sc) - pad), cw = Math.round(rect.w * sc) + 2 * pad, ch = Math.round(rect.h * sc) + 2 * pad;
  const out = Buffer.alloc(cw * ch * 3);
  for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) { const si = ((cy + y) * A.w + cx + x) * A.bpp, di = (y * cw + x) * 3; if (cy + y < A.h && cx + x < A.w) { out[di] = A.px[si]; out[di + 1] = A.px[si + 1]; out[di + 2] = A.px[si + 2]; } }
  return { w: cw, h: ch, bpp: 3, px: out, view: [x0, y0, x1 - x0 + 1, y1 - y0 + 1], sc: +sc.toFixed(4) };
}
function bufDiff(A, B) {
  if (A.w !== B.w || A.h !== B.h) return { sizeMismatch: [A.w, A.h, B.w, B.h] };
  let n = 0, max = 0;
  for (let i = 0; i < A.px.length; i += 3) { let d = 0; for (let c = 0; c < 3; c++) d = Math.max(d, Math.abs(A.px[i + c] - B.px[i + c])); if (d) n++; max = Math.max(max, d); }
  return { w: A.w, h: A.h, diffPixels: n, maxChannelDelta: max };
}
function shotCompare(run, replay) {
  if (!run || !replay) return null;
  return run.shots.map((s) => {
    const r = replay.replays.find((q) => q.label === s.label);
    if (!r || r.error) return { label: s.label, error: r ? r.error : 'no replay' };
    if (s.cal) { const A = cropRow(s.file, s.cal, s.rect), B = cropRow(r.file, r.cal, r.rect); return { label: s.label, mutAfter: s.mutAfter, topDelta: r.topDelta, leftDelta: r.leftDelta, view: [A.view, B.view], ...bufDiff(A, B) }; }
    return { label: s.label, mutAfter: s.mutAfter, topDelta: r.topDelta, leftDelta: r.leftDelta, ...pxDiff(s.file, r.file) };
  });
}

const st6 = load(arg('--st6')), fix = load(arg('--fix'));
const res = { st6: st6 && check(st6), fix: fix && check(fix) };
if (res.st6 && res.fix) {
  const a = res.st6.maps, b = res.fix.maps; let same = 0, diff = [];
  for (const k of Object.keys(b)) if (a[k] !== undefined) (a[k] === b[k] ? same++ : diff.push(k));
  res.mapsCompare = { common: same + diff.length, same, diff, onlyFix: Object.keys(b).filter((k) => a[k] === undefined) };
}
res.pixFixVsSt6 = shotCompare(fix, load(arg('--fixreplay')));      // fix's frozen shots vs st6-rb2 reproducing the same state
res.pixAA = shotCompare(st6, load(arg('--st6replay')));            // st6-rb2 shots vs st6-rb2 reproducing them (control)
const sum = (r) => r && r.docs.map((d) => `${d.label}: visible ${d.visible}, events ${d.events}, mism ${JSON.stringify(d.mism)}, entries ${d.entries.length} (bad ${d.entries.filter((e) => !e.ok).length}), slides ${JSON.stringify(d.slides && { ...d.slides, noneEx: undefined })}`).join(' | ');
console.log('st6', st6?.w, sum(res.st6), res.st6?.fatal || '');
console.log('fix', fix?.w, sum(res.fix), res.fix?.fatal || '');
if (res.mapsCompare) console.log('srcs map', JSON.stringify(res.mapsCompare));
for (const k of ['pixFixVsSt6', 'pixAA']) if (res[k]) console.log(k, res[k].map((p) => `${p.label.replace(/^\w+-\d+-/, '')}:${p.error || (p.sizeMismatch ? 'size' : p.diffPixels + '/' + p.maxChannelDelta)}${p.topDelta ? ' dy' + p.topDelta : ''}${p.mutAfter ? ' MUT' + p.mutAfter : ''}`).join(' '));
for (const r of [res.st6, res.fix]) if (r) for (const d of r.docs) { for (const e of d.examples.slice(0, 4)) console.log(' ', r.arm, d.label, JSON.stringify(e).slice(0, 400)); for (const e of d.slides.noneEx) console.log('  NONE', r.arm, d.label, JSON.stringify(e)); }
if (arg('--out')) writeFileSync(arg('--out'), JSON.stringify(res, null, 1));
