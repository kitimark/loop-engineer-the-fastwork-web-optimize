#!/usr/bin/env node
// End-of-page reader (fix-g0-box; user T-228 #98/#101; a pure reader: no device, no measurement). G runs of the g0 program
// (g-fastshort-g0.json, 38d7fe5d7fa8: the P-164 records in out/g0bp/runs, the eop kit's in out/eopp/runs).
// Two parts per run (segment 0), the user's order (T-228 #101):
//   APPROACH (first priority): the drags down the page, from the "approach" mark to the first open trigger O1 (g0b-read's
//     triggers(): the first prevented upward touchmove while closed = g0's jack taking the page at the pin, y ~5213).
//   END (second): from O1 to the run's end (E strokes, re-approaches at the pin, the menu's opens and closes).
// A frame [t, dt, scrollY, innerHeight] covers (t - dt, t]. Finger-down = it overlaps a contact (touchstart to the next
// touchend/touchcancel; de-offscreen's p164-fingerdown-read rule). Counts per part: finger-down frames > 50 (twins 46/54)
// and > 34 (30/38), and the same for all frames of the part. Each finger-down frame > 50 is listed with its y, its ms since
// the contact's touchstart, and the Timeline time inside its span by record type (Composite, Layout, RecalculateStyles,
// FireAnimationFrame + EventDispatch + TimerFire + ObserverCallback as "script"), when tl-<run>.json exists.
// END target (lead 2026-10-09): the CLOSE-START frame = the longest frame in [close trigger, + 700 ms] (g0b-read's tween
// window); per run its median dt and the count over 34 (30/38).
//   node fixes/g0-box/phone/eop-read.mjs [runs dir=out/eopp/runs] [--runs EC1,EV1,...] [--json out.json] | --selftest
// No verdict rules here: a card names them (written before its data) and reads these numbers.
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
// triggers() and med() are copied verbatim from g0b-read.mjs (lines 45, 62-77): importing it runs its main.
const med = (a) => { const s = a.filter((x) => x != null).sort((x, y) => x - y); const n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : null; };
const END_SLACK = 8;
export function triggers(seg) {
  const docH = seg.docH1 ?? seg.docH ?? 0, ih = Math.max(...(seg.frames ?? []).map((r) => r[3]), 0) || seg.vh0 || 0;
  const out = []; let open = false, prevY = null;
  const usePv = (seg.touches ?? []).some((r) => r[1] === 'm' && r[4] === 1); // the recorder saw the page's preventDefault
  for (const r of seg.touches ?? []) {
    const [t, kind, , , pv, sy, cy] = r;
    if (kind === 's') { prevY = cy; continue; }
    if (kind === 'e' || kind === 'c') { prevY = null; continue; }
    if (kind !== 'm' || prevY == null || cy == null) continue;
    const d = prevY - cy; prevY = cy;
    if (!open && d > 0 && (usePv ? pv === 1 : sy >= docH - ih - END_SLACK)) { out.push({ t, kind: 'open' }); open = true; }
    else if (open && d < 0 && (usePv ? pv === 1 : true)) { out.push({ t, kind: 'close' }); open = false; }
  }
  return out;
}

const r1 = (x) => (Number.isFinite(x) ? Math.round(x * 10) / 10 : null);
export function contacts(touches) {
  const out = []; let cur = null;
  for (const r of touches ?? []) {
    if (r[1] === 's') { if (cur) out.push(cur); cur = { a: r[0], b: null }; }
    else if (cur && (r[1] === 'e' || r[1] === 'c')) { cur.b = r[0]; out.push(cur); cur = null; }
  }
  if (cur) { cur.b = Infinity; out.push(cur); }
  return out;
}
const SCRIPT = new Set(['FireAnimationFrame', 'EventDispatch', 'TimerFire', 'ObserverCallback', 'EvaluateScript', 'FunctionCall']);
export function tlSpans(tl) { // [a, b, kind] leaf-ish spans: Composite, Layout, RecalculateStyles, script (top-most script record only)
  const out = []; if (!tl) return out;
  const walk = (r, inScript) => {
    const a = r.startTime * 1000 - tl.offsetMs, b = (r.endTime ?? r.startTime) * 1000 - tl.offsetMs;
    if (r.type === 'Composite' || r.type === 'Layout' || r.type === 'RecalculateStyles') out.push([a, b, r.type]);
    const sc = !inScript && SCRIPT.has(r.type); if (sc) out.push([a, b, 'script']);
    for (const c of r.children || []) walk(c, inScript || sc);
  };
  for (const r of tl.recs || []) walk(r, false);
  return out;
}
export function inSpan(spans, lo, hi) { // per kind: the union of its records' spans clipped to (lo, hi] (nested records count once)
  const by = {};
  for (const [a, b, k] of spans) { const x = Math.max(a, lo), y = Math.min(b, hi); if (y > x) (by[k] ||= []).push([x, y]); }
  const o = {};
  for (const [k, iv] of Object.entries(by)) {
    iv.sort((p, q) => p[0] - q[0]); let s = 0, ca = iv[0][0], cb = iv[0][1];
    for (const [x, y] of iv.slice(1)) { if (x > cb) { s += cb - ca; ca = x; cb = y; } else cb = Math.max(cb, y); }
    o[k] = r1(s + cb - ca);
  }
  return o;
}
const cnt = (dts) => ({ gt30: dts.filter((d) => d > 30).length, gt34: dts.filter((d) => d > 34).length, gt38: dts.filter((d) => d > 38).length,
  gt46: dts.filter((d) => d > 46).length, gt50: dts.filter((d) => d > 50).length, gt54: dts.filter((d) => d > 54).length, n: dts.length });

export function readRun(g, tl) {
  const seg = g.run.segments[0];
  const ap = (seg.marks || []).find((m) => m[1] === 'approach');
  const tr = triggers(seg); const o1 = tr.find((x) => x.kind === 'open');
  const t0 = ap ? ap[0] : seg.frames[0]?.[0] ?? 0, t1 = o1 ? o1.t : Infinity;
  const C = contacts(seg.touches); const spans = tlSpans(tl);
  const down = (f) => C.find((c) => c.a < f[0] && c.b > f[0] - f[1]);
  const part = (lo, hi) => {
    const fr = seg.frames.filter((f) => f[0] > lo && f[0] <= hi);
    const fd = fr.filter((f) => down(f));
    const slow = fd.filter((f) => f[1] > 50).map((f) => {
      const c = down(f), tlx = spans.length ? inSpan(spans, f[0] - f[1], f[0]) : null;
      // lift-off class (de-offscreen README §7.4, 8b3da1d6): a frame ending within 120 ms before the contact's touchend
      // (or 20 ms after) with < 5 ms of page work (Layout, style, script) is the G drag's lift-off / the OS, not the page
      const page = tlx ? (tlx.Layout || 0) + (tlx.RecalculateStyles || 0) + (tlx.script || 0) : null;
      const liftoff = Number.isFinite(c.b) && f[0] >= c.b - 120 && f[0] <= c.b + 20 && page != null && page < 5;
      return { t: f[0], dt: f[1], y: f[2], sinceDown: r1(f[0] - c.a), beforeLift: Number.isFinite(c.b) ? r1(c.b - f[0]) : null, liftoff, tl: tlx };
    });
    return { frames: fr.length, fingerDown: cnt(fd.map((f) => f[1])), all: cnt(fr.map((f) => f[1])), slow50: slow, liftoff50: slow.filter((x) => x.liftoff).length };
  };
  const closes = tr.filter((x) => x.kind === 'close').map((x) => {
    const w = seg.frames.filter((f) => f[0] >= x.t && f[0] <= x.t + 700); if (!w.length) return null;
    const m = w.reduce((p, f) => (f[1] > p[1] ? f : p)); return { t: m[0], dt: m[1], after: r1(m[0] - x.t), tl: spans.length ? inSpan(spans, m[0] - m[1], m[0]) : null };
  }).filter(Boolean);
  const cdt = closes.map((c) => c.dt);
  return { o1: o1 ? r1(o1.t) : null, approachEndY: o1 ? seg.frames.filter((f) => f[0] <= o1.t).at(-1)?.[2] ?? null : null,
    approach: part(t0, t1), end: part(t1, Infinity), closeStart: { n: closes.length, medianDt: med(cdt), gt30: cdt.filter((d) => d > 30).length, gt34: cdt.filter((d) => d > 34).length, gt38: cdt.filter((d) => d > 38).length, frames: closes } };
}

function selftest() {
  const bad = []; const ok = (c, m) => { if (!c) bad.push(m); };
  const fr = (t, dt, y) => [t, dt, y, 775];
  const seg = { docH: 6000, vh0: 775, marks: [[100, 'approach'], [3000, 'E20-close']],
    frames: [fr(50, 16, 0), fr(200, 16, 100), fr(260, 60, 400), fr(400, 55, 900), fr(600, 40, 1000), fr(1100, 16, 5213), fr(1300, 16, 5213), fr(1340, 36, 5213), fr(2100, 16, 5213)],
    touches: [[150, 's', 1, 1, 0, 0, 700], [180, 'm', 1, 1, 0, 50, 650], [300, 'e', 1, 1, 0, 400, 500],
      [1000, 's', 1, 1, 0, 5213, 700], [1050, 'm', 1, 1, 1, 5213, 650], [1150, 'e', 1, 1, 0, 5213, 600],
      [1200, 's', 1, 1, 0, 5213, 300], [1250, 'm', 1, 1, 1, 5213, 400], [1400, 'e', 1, 1, 0, 5213, 500]] };
  const tl = { offsetMs: 0, recs: [{ type: 'RenderingFrame', startTime: 0.21, endTime: 0.26, children: [{ type: 'Composite', startTime: 0.22, endTime: 0.25 }, { type: 'FireAnimationFrame', startTime: 0.21, endTime: 0.215 }] }] };
  const r = readRun({ run: { segments: [seg] } }, tl);
  ok(r.o1 === 1050, `o1 ${r.o1}`);
  ok(r.approach.frames === 4 && r.approach.fingerDown.gt50 === 1 && r.approach.all.gt50 === 2, `approach ${JSON.stringify(r.approach.fingerDown)} all ${JSON.stringify(r.approach.all)}`);
  ok(r.approach.slow50[0]?.y === 400 && r.approach.slow50[0].sinceDown === 110 && r.approach.slow50[0].tl?.Composite === 30 && r.approach.slow50[0].tl?.script === 5, `slow ${JSON.stringify(r.approach.slow50)}`);
  ok(r.closeStart.n === 1 && r.closeStart.medianDt === 36 && r.closeStart.gt34 === 1 && r.closeStart.gt38 === 0, `close ${JSON.stringify(r.closeStart)}`);
  ok(r.end.fingerDown.gt34 === 1, `end ${JSON.stringify(r.end.fingerDown)}`);
  console.log(bad.length ? `SELFTEST FAIL\n- ${bad.join('\n- ')}` : 'SELFTEST ok (approach / end split at O1, finger-down, slow-frame Timeline split, close-start frame)');
  return bad.length ? 1 : 0;
}

const args = process.argv.slice(2);
const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop());
if (isMain && args.includes('--selftest')) process.exit(selftest());
if (isMain) {
  const ji = args.indexOf('--json'), ri = args.indexOf('--runs');
  const dir = args.find((a, i) => !a.startsWith('--') && (ji < 0 || i !== ji + 1) && (ri < 0 || i !== ri + 1)) || 'out/eopp/runs';
  const runs = ri >= 0 ? args[ri + 1].split(',') : ['EC1', 'EC2', 'EC3', 'EC4', 'EV1', 'EV2', 'EV3', 'EV4', 'EK1', 'EK2', 'EK3', 'EK4', 'EK5', 'EK6', 'EC5', 'EC6', 'EV5', 'EV6'];
  const res = { runs: {}, arms: {} };
  for (const run of runs) {
    const f = join(dir, `g-${run}.json`); if (!existsSync(f)) continue;
    const tf = join(dir, `tl-${run}.json`);
    const r = readRun(JSON.parse(readFileSync(f, 'utf8')), existsSync(tf) ? JSON.parse(readFileSync(tf, 'utf8')) : null);
    res.runs[run] = r; const a = run[1]; (res.arms[a] ||= []).push(run);
    const A = r.approach, fd = A.fingerDown;
    console.log(`${run} approach (to O1 at y ${r.approachEndY}): ${A.frames} frames, finger-down >50 ${fd.gt50} (${fd.gt46}/${fd.gt54}; lift-off ${A.liftoff50}) >34 ${fd.gt34} (${fd.gt30}/${fd.gt38}); all >50 ${A.all.gt50} >34 ${A.all.gt34} | end: finger-down >50 ${r.end.fingerDown.gt50} >34 ${r.end.fingerDown.gt34}; close-start n ${r.closeStart.n} median ${r.closeStart.medianDt} >34 ${r.closeStart.gt34} (${r.closeStart.gt30}/${r.closeStart.gt38})`);
    for (const s of A.slow50) console.log(`   >50 y ${s.y} dt ${s.dt} +${s.sinceDown} ms (lift in ${s.beforeLift})${s.liftoff ? ' LIFT-OFF' : ''} ${s.tl ? JSON.stringify(s.tl) : ''}`);
  }
  for (const [a, rs] of Object.entries(res.arms)) {
    const v = (k) => rs.map((x) => res.runs[x].approach.fingerDown[k]);
    console.log(`ARM ${a} (${rs.join(' ')}): approach finger-down >50 ${v('gt50').join(',')} (lift-off ${rs.map((x) => res.runs[x].approach.liftoff50).join(',')}; median ${med(v('gt50'))}; 46: ${med(v('gt46'))}, 54: ${med(v('gt54'))}) >34 ${v('gt34').join(',')} (median ${med(v('gt34'))}); close-start median of runs ${med(rs.map((x) => res.runs[x].closeStart.medianDt))}`);
  }
  if (ji >= 0) writeFileSync(args[ji + 1], JSON.stringify(res, null, 1));
}
