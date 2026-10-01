// Score wkcounts.mjs runs into per-window WebKit work counts (de-counts-sim). Counts only; durations appear only as
// the class cut CUT (default 2 ms: "heavy" Layout / RS, FP-4's bimodal cut, arch-sim amendment 6) and are reported
// at 1 and 5 ms too (a count that changes with the cut is "cut-sensitive").
// Window i = Timeline records whose startTime lies in [mark wk:<k>, mark wk:c:<k>) (performance.mark TimeStamps).
// usage: node wkscore.mjs <run.json>... [--json out.json] [--windows idle,w9,w10]  (prints one table per run)
import { readFileSync, writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const ji = args.indexOf('--json'); const jsonOut = ji >= 0 ? args.splice(ji, 2)[1] : null;
const wi = args.indexOf('--windows'); const only = wi >= 0 ? args.splice(wi, 2)[1].split(',') : null;
const CUT = Number(process.env.CUT || 2);
const short = (u) => String(u || '').split('/').pop();
const topFrame = (st) => {
  const f = (Array.isArray(st) ? st : st?.callFrames || []).find((x) => x.url && x.url !== '[native code]');
  return f ? `${f.functionName || '(anon)'} ${short(f.url)}:${f.lineNumber}` : '(no js)';
};
const area = (q) => (q ? Math.abs((q[2] - q[0]) * (q[5] - q[1])) : 0);

export function score(run, recs) {
  const flat = [];
  const walk = (x, anc) => { flat.push({ type: x.type, s: x.startTime, e: x.endTime ?? x.startTime, anc, data: x.data || {}, st: x.stackTrace }); for (const ch of x.children || []) walk(ch, [...anc, x.type]); };
  for (const x of recs) walk(x, []);
  flat.sort((a, b) => a.s - b.s);
  const marks = {};
  for (const f of flat) if (f.type === 'TimeStamp' && String(f.data.message || '').startsWith('wk:')) marks[f.data.message.slice(3)] = f.s;
  const vw = run.geo.iw, vh = run.geo.ih;
  const out = [];
  const spans = [];
  spans.push(['idle-a', marks['idle-a'], marks['idle-b']]);
  spans.push(['idle-b', marks['idle-b'], marks['c:idle']]);
  for (const w of run.windows) if (w.k !== 'idle') spans.push([w.k, marks[w.k], marks[`c:${w.k}`]]);
  for (const [k, a, b] of spans) {
    if (a == null || b == null) { out.push({ k, missing: true }); continue; }
    const R = flat.filter((f) => f.s >= a && f.s < b);
    const dur = (f) => (f.e - f.s) * 1000;
    const rs = R.filter((f) => f.type === 'RecalculateStyles');
    const rsOuter = rs.filter((f) => !f.anc.includes('RecalculateStyles'));
    const lay = R.filter((f) => f.type === 'Layout');
    const nested = lay.filter((f) => f.anc.includes('RecalculateStyles'));
    const isView = (f) => { const q = f.data.root; return q && Math.round(q[0]) === 0 && Math.round(q[1]) === 0 && q[2] - q[0] >= vw - 1 && q[5] - q[1] >= vh - 1; };
    const forced = (f) => f.anc.some((x) => x === 'FunctionCall' || x === 'TimerFire' || x === 'EventDispatch' || x === 'FireAnimationFrame' || x === 'ObserverCallback' || x === 'EvaluateScript');
    const paint = R.filter((f) => f.type === 'Paint');
    const sched = R.filter((f) => f.type === 'ScheduleStyleRecalculation');
    const inv = R.filter((f) => f.type === 'InvalidateLayout');
    const hist = (xs) => { const h = {}; for (const x of xs) { const t = topFrame(x.st); h[t] = (h[t] || 0) + 1; } return Object.entries(h).sort((p, q) => q[1] - p[1]).slice(0, 4); };
    const heavy = (xs, cut) => xs.filter((f) => dur(f) >= cut).length;
    const w = run.windows.find((x) => x.k === (k.startsWith('idle') ? 'idle' : k));
    const wPrevIdx = run.windows.indexOf(w) - 1;
    const prevL = wPrevIdx >= 0 ? run.windows[wPrevIdx].layers : run.L0;
    let layers = null;
    if (w && w.layers && !w.layers.err && prevL && !prevL.err && !k.startsWith('idle-a')) {
      const P = prevL.L, C = w.layers.L;
      let created = 0, destroyed = 0, repaint = 0, repainted = 0;
      for (const id in C) { if (!(id in P)) { created++; repaint += C[id][0]; if (C[id][0]) repainted++; } else { const d = C[id][0] - P[id][0]; repaint += d; if (d > 0) repainted++; } }
      for (const id in P) if (!(id in C)) destroyed++;
      layers = { n: w.layers.n, created, destroyed, paintCountDelta: repaint, layersRepainted: repainted, memMB: Math.round(w.layers.mem / 1e5) / 10 };
    }
    const page = k === 'idle-a' ? w?.pageA : w?.page;
    const mo = k === 'idle-a' ? w?.moA : w?.mo;
    out.push({
      k, y: w?.y ?? 0, ms: Math.round((b - a) * 1000),
      frames: R.filter((f) => f.type === 'RenderingFrame').length,
      rs: rsOuter.length, rsForced: rsOuter.filter(forced).length, rsWithNested: rsOuter.filter((f) => nested.some((n) => n.s >= f.s && n.e <= f.e)).length, nestedLayout: nested.length,
      rsHeavy: heavy(rsOuter, CUT), rsHeavy1: heavy(rsOuter, 1), rsHeavy5: heavy(rsOuter, 5),
      layout: lay.length, layoutOuter: lay.length - nested.length, layoutView: lay.filter(isView).length,
      layoutHeavy: heavy(lay, CUT), layoutHeavy1: heavy(lay, 1), layoutHeavy5: heavy(lay, 5), layoutViewHeavy: lay.filter((f) => isView(f) && dur(f) >= CUT).length,
      layoutViewHeavy10: lay.filter((f) => isView(f) && dur(f) >= 10).length,
      // per outermost RS that contains nested Layout: [nested count, of them view-rooted, of them >= CUT ms]
      nestEvents: rsOuter.map((x) => { const inn = nested.filter((n) => n.s >= x.s && n.e <= x.e); return inn.length ? [inn.length, inn.filter(isView).length, inn.filter((n) => dur(n) >= CUT).length] : null; }).filter(Boolean),
      layoutRootArea: Math.round(lay.reduce((s, f) => s + area(f.data.root), 0)),
      paint: paint.length, paintArea: Math.round(paint.reduce((s, f) => s + area(f.data.clip), 0)),
      composite: R.filter((f) => f.type === 'Composite').length,
      schedStyle: sched.length, invalidateLayout: inv.length, schedTop: hist(sched), invTop: hist(inv),
      timerFire: R.filter((f) => f.type === 'TimerFire').length, observer: R.filter((f) => f.type === 'ObserverCallback').length,
      layers, mo, sub: page?.sub ? { n: page.sub.n, subtree: page.sub.subtree, top: Object.entries(page.sub.top).sort((p, q) => q[1] - p[1]).slice(0, 3) } : null,
      anims: page ? [page.anims, page.running] : null,
      animEvents: null,
    });
  }
  // Animation.trackingUpdate events per window (inspector stopwatch seconds, same clock as Timeline after Page.enable)
  for (const o of out) {
    const sp = spans.find((s) => s[0] === o.k);
    if (!sp || sp[1] == null) continue;
    const ev = run.anim.filter((e) => e.t >= sp[1] && e.t < sp[2]);
    const by = {}; for (const e of ev) by[e.animationState] = (by[e.animationState] || 0) + 1;
    o.animEvents = { n: ev.length, by, newProps: ev.filter((e) => e.transitionProperty || e.animationName).length };
  }
  return out;
}

const COLS = ['k', 'y', 'frames', 'rs', 'rsForced', 'nestedLayout', 'rsHeavy', 'layoutOuter', 'layoutView', 'layoutHeavy', 'layoutViewHeavy', 'layoutViewHeavy10', 'paint', 'paintArea', 'composite', 'schedStyle', 'invalidateLayout'];
const all = {};
for (const f of args) {
  const run = JSON.parse(readFileSync(f));
  const recs = JSON.parse(readFileSync(f.replace(/\.json$/, '.tl.json')));
  const rows = score(run, recs);
  all[run.meta.label] = { meta: run.meta, geo: { docH: run.geo.docH, maxY: run.geo.maxY, vp: `${run.geo.iw}x${run.geo.ih}`, ua: run.geo.ua }, rows };
  console.log(`\n== ${run.meta.label} (${f}) docH ${run.geo.docH} vp ${run.geo.iw}x${run.geo.ih}`);
  console.log([...COLS, 'layers n/+/-/Δpaint', 'mo attr/add', 'subtree', 'anims', 'animEv', 'nest[n/view/heavy]'].join('\t'));
  for (const r of rows) {
    if (only && !only.includes(r.k)) continue;
    if (r.missing) { console.log(`${r.k}\tMISSING marks`); continue; }
    console.log([...COLS.map((c) => r[c]), r.layers ? `${r.layers.n}/${r.layers.created}/${r.layers.destroyed}/${r.layers.paintCountDelta}` : '-', r.mo ? `${r.mo.attr}/${r.mo.add}` : '-', r.sub ? r.sub.subtree : 0, r.anims ? r.anims.join('/') : '-', r.animEvents ? r.animEvents.n : '-', r.nestEvents.map((e) => e.join('/')).join(' ')].join('\t'));
  }
}
if (jsonOut) writeFileSync(jsonOut, JSON.stringify(all, null, 1));
