// Re-cut a costcard-sim.mjs output into the card's events (fix-nav-morph). In the Simulator the approach flings reach
// the end with momentum and the morph may start inside the last approach stroke (rep 1: every arm at m = 1 by the
// 'start' mark; rep 2: V and D only at the scripted 'start' stroke), so events are cut per stroke at the logger's
// touchstarts instead of at the gesture marks:
//   morph-start: the stroke whose touchstart reads --morph 0 while the next reads 1, touchstart to next touchstart
//                (its momentum and the tween included)
//   push-1:      the next stroke (the first pin push after the load: the cold first pin)
//   push-n:      the following strokes (the last ends at the 'hold' mark; the card takes their median per load)
//   hold:        4 s idle at the pin, 'hold' mark to 'end' mark (hold-frame = hold / RenderingFrame)
// Counts come from the run's saved Timeline segment file and gesture record (paths in the input), so this reads saved
// records only. Writes <input without .json>-cut.json in the same shape (runs[].windows) for costcard-build.mjs --sim.
//   node fixes/nav-morph/costcard-sim-read.mjs out/costcard/costcard-sim-r1-<ts>.json [...]
import { readFileSync, writeFileSync } from 'node:fs';

const quadArea = (q) => { if (!Array.isArray(q) || q.length < 8) return 0; const xs = [q[0], q[2], q[4], q[6]], ys = [q[1], q[3], q[5], q[7]]; return (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys)); };
const TYPES = ['RenderingFrame', 'RecalculateStyles', 'Layout', 'Paint', 'Composite', 'FunctionCall', 'EventDispatch', 'FireAnimationFrame', 'TimerFire', 'ObserverCallback', 'ScheduleStyleRecalculation', 'InvalidateLayout'];

function cut(tl, inj) {
  const off = tl.offsetMs;
  const mk = (k) => (inj.marks || []).find(([n]) => n === 'fwg:' + k)?.[1];
  const tHold = mk('hold'), tEnd = mk('end');
  if (tHold == null || tEnd == null) throw new Error('no hold/end mark');
  // cut per stroke at the logger's touchstarts: the stroke whose touchstart still reads --morph 0 while the next reads 1
  // starts the morph (rep 1: the last approach fling in every arm; rep 2 V and D: the scripted 'start' stroke)
  const ts = (inj.ts || []).filter(([t]) => t < tHold).sort((a, b) => a[0] - b[0]);
  const k = ts.map(([, , m]) => m).lastIndexOf(0);
  if (k < 0 || k === ts.length - 1) throw new Error('no morph-start stroke');
  const ws = [];
  for (let i = k; i < ts.length; i++) ws.push({ kind: i === k ? 'morph-start' : i === k + 1 ? 'push-1' : 'push-n', t0: ts[i][0], t1: i + 1 < ts.length ? ts[i + 1][0] : tHold });
  ws.push({ kind: 'hold', t0: tHold, t1: tEnd });
  const flat = [];
  const walk = (r) => { if (r.startTime != null) flat.push(r); for (const c of r.children || []) walk(c); };
  for (const r of tl.recs || []) walk(r);
  const firstRec = flat.length ? Math.min(...flat.map((r) => r.startTime * 1000 - off)) : null;
  return ws.map((w) => {
    const R = flat.filter((r) => { const t = r.startTime * 1000 - off; return t >= w.t0 && t < w.t1; });
    const o = { kind: w.kind, ms: w.t1 - w.t0, timelineCovers: firstRec != null && firstRec <= w.t0 };
    for (const ty of TYPES) o[ty] = R.filter((r) => r.type === ty).length;
    o.paintArea = Math.round(R.filter((r) => r.type === 'Paint').reduce((a, r) => a + quadArea(r.data?.clip), 0));
    o.eventDispatch = R.filter((r) => r.type === 'EventDispatch').reduce((a, r) => { const t = r.data?.type || '?'; a[t] = (a[t] || 0) + 1; return a; }, {});
    o.fcBy = R.filter((r) => ['FunctionCall', 'FireAnimationFrame', 'TimerFire'].includes(r.type)).reduce((a, r) => { const d = r.data || {}; const k = `${r.type === 'FunctionCall' ? '' : r.type + ' '}${String(d.scriptName || '').split('/').pop()}:${d.scriptLine ?? ''}`; a[k] = (a[k] || 0) + 1; return a; }, {});
    o.listenerOps = (inj.ops || []).filter(([t]) => t >= w.t0 && t < w.t1).map(([, m]) => m);
    const tm = (inj.tm || []).filter(([t]) => t >= w.t0 && t < w.t1);
    o.touchmoves = { n: tm.length, cancelable: tm.filter((x) => x[1]).length, prevented: tm.filter((x) => x[2]).length };
    o.msUnjudged = Object.fromEntries(['RecalculateStyles', 'Layout', 'Paint', 'Composite', 'FunctionCall'].map((ty) => [ty, Math.round(R.filter((r) => r.type === ty).reduce((a, r) => a + ((r.endTime ?? r.startTime) - r.startTime) * 1000, 0) * 10) / 10]));
    return o;
  });
}

for (const f of process.argv.slice(2)) {
  const d = JSON.parse(readFileSync(f, 'utf8'));
  for (const r of d.runs) {
    if (r.void || r.error || !r.gesture?.saved) continue;
    const G = JSON.parse(readFileSync(r.gesture.saved, 'utf8'));
    const pick = (G.run?.inject || []).map((x) => ({ seg: x.seg, v: typeof x.value === 'string' ? JSON.parse(x.value) : x.value })).find((x) => x.v?.marks?.some(([n]) => n === 'fwg:start'));
    const segFile = pick.seg === 0 ? r.gesture.timeline : r.gesture.timeline.replace(/\.json$/, `-seg${pick.seg}.json`);
    const TL = JSON.parse(readFileSync(segFile, 'utf8'));
    r.windowsRaw = r.windows;
    r.windows = cut(TL, pick.v);
    r.cut = 'costcard-sim-read.mjs: morph-start / push-1 (= raw start) / push-n (= raw push-1 + push-n) / hold';
    const ms = r.windows.find((w) => w.kind === 'morph-start');
    console.log(`${r.arm} r${r.rep}: morph-start ${ms ? `${ms.ms} ms, frames ${ms.RenderingFrame} style ${ms.RecalculateStyles} layout ${ms.Layout} paint ${ms.Paint} comp ${ms.Composite} ops ${ms.listenerOps.length} covered ${ms.timelineCovers}` : 'none'}`);
  }
  const out = f.replace(/\.json$/, '-cut.json');
  writeFileSync(out, JSON.stringify(d, null, 1));
  console.log('wrote', out);
}
