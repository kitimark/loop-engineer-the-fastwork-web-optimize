// F3 edge-residual scorer (fix-nav-morph; draft ticket f3-edge-residual, fixes/nav-morph/README.md). Data only: reads
// phone run files and their WebKit Timeline files, never a device.
//
// Usage:
//   node fixes/nav-morph/edge-score.mjs --line C=13083:13 --line V=13378:13 \
//     --run C:<frames.json>:<timeline.json> --run V:<frames.json>:<timeline.json> ... [--seg 0] [--out <file.json>]
// <frames.json>: an iphone.mjs gesture file (run.segments[seg].frames = [t, dt, y, innerHeight]) or a scroll file
//   (frames = [t, dt, y]); t and dt in page ms (performance.now clock).
// <timeline.json>: {syncT, syncTL, recs} (iphone.mjs --timeline, I-079), or an array of those (one per segment).
//   Page time of a record = (startTime - syncTL) * 1000 + syncT.
// --line ARM=L:C: the IO callback's start line:column in that arm's served nodes/2.DyWL8TcE.js. A FunctionCall with
//   that scriptLine/scriptColumn under an IntersectionObserver ObserverCallback stamps the crossing.
//
// Per run:
//   crossing = the first frame k with t_k >= the IO callback's page time (the frame whose rendering update carried it);
//   window = frames k-2 .. k+10; edge frames = window frames with dt > 34 (twins dt > 30, dt > 38 reported);
//   each edge frame k' is matched to the RenderingFrame record that contains the previous stamp t_{k'-1} (+-1 ms; the
//   stamp is the logger's rAF inside a RenderingFrame, so the work that delays stamp k' is the rest of that
//   RenderingFrame; checked on the 10-01 fixture e-tc2: rAF stamp 16285 inside RenderingFrame 16275-16404);
//   buckets of that RenderingFrame (ms):
//     style     = RecalculateStyles durations, with the Layout nested inside them (outermost only);
//     layout    = Layout records not inside a RecalculateStyles (e.g. inside the Composite record);
//     paint     = Paint records;
//     compositeRecord = the Composite record's own time (its duration minus the RecalculateStyles/Layout/Paint inside it). The name is the record type only;
//       which work the record stands for (layer commit, flush) is UNRESOLVED and not claimed.
//     script    = FunctionCall, FireAnimationFrame, ObserverCallback, EventDispatch, TimerFire (outermost only);
//   owner = the largest bucket if it is >= 50 % of the RenderingFrame, else "split"; no matched record = "unmatched";
//   a matched RenderingFrame shorter than half of dt = "outside" (the gap is not in a recorded rendering update).
//   run score = the owner of the run's longest edge frame, or "none" when the window has no frame > 34.
//   void run: no IO callback at the arm's line, or the crossing outside the recorded frame span (no frame at or after
//   it, or fewer than 3 frames before it: frame k-2 needs its own previous stamp); no RenderingFrame records.
// Control check (arm C), per valid run: the longest window frame has dt >= 75 AND style + Composite record (total,
//   nested Layout/Paint included) >= 60 % of its RenderingFrame. The block is VOID unless >= 3 of 4 C runs pass.
// Decision (arm V, valid runs; the ticket needs 4):
//   runs with an edge frame (> 34): < 2 -> CLOSE (not on the touch path); 2 -> INCONCLUSIVE (at most one more block);
//   >= 3 -> the same score in >= 3 runs: style -> STYLE (inert lift candidate); paint or compositeRecord -> PAINT-COMPOSITE
//   (image src candidate; paint and compositeRecord count as one score here); anything else -> SPLIT (name the threshold).
//   The same decision is computed with > 30 and > 38 in place of > 34; if either differs: threshold-sensitive.
import { readFileSync, writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const opt = (k) => { const out = []; for (let i = 0; i < args.length; i++) if (args[i] === k) out.push(args[++i]); return out; };
const lines = Object.fromEntries(opt('--line').map((s) => { const [a, lc] = s.split('='); const [l, c] = lc.split(':').map(Number); return [a, { line: l, col: c }]; }));
const seg = Number(opt('--seg')[0] ?? 0);
const runs = opt('--run').map((s) => { const [arm, frames, tl] = s.split(':'); return { arm, frames, tl }; });
if (!runs.length || !Object.keys(lines).length) { console.error('usage: edge-score.mjs --line ARM=L:C ... --run ARM:frames.json:timeline.json ... [--seg 0] [--out f]'); process.exit(1); }

const R1 = (x) => Math.round(x * 10) / 10;
const dur = (r) => (r.endTime != null && r.startTime != null ? (r.endTime - r.startTime) * 1000 : 0);
const SCRIPT = new Set(['FunctionCall', 'FireAnimationFrame', 'ObserverCallback', 'EventDispatch', 'TimerFire']);

function buckets(rf) {
  const b = { style: 0, layout: 0, paint: 0, compositeRecord: 0, script: 0 }; let styleTotal = 0, compositeTotal = 0;
  const walk = (r, inStyle, inScript) => {
    const d = dur(r);
    if (r.type === 'RecalculateStyles' && !inStyle) { b.style += d; styleTotal += d; }
    if (r.type === 'Layout' && !inStyle) b.layout += d;
    if (r.type === 'Paint') b.paint += d;
    if (r.type === 'Composite') {
      compositeTotal += d;
      const inner = (r.children || []).filter((c) => ['RecalculateStyles', 'Layout', 'Paint'].includes(c.type)).reduce((a, c) => a + dur(c), 0);
      b.compositeRecord += Math.max(0, d - inner);
    }
    if (SCRIPT.has(r.type) && !inScript) b.script += d;
    for (const c of r.children || []) walk(c, inStyle || r.type === 'RecalculateStyles', inScript || SCRIPT.has(r.type));
  };
  for (const c of rf.children || []) walk(c, false, false);
  const total = dur(rf);
  const top = Object.entries(b).sort((x, y) => y[1] - x[1])[0];
  const owner = total > 0 && top[1] >= 0.5 * total ? top[0] : 'split';
  return { total: R1(total), owner, buckets: Object.fromEntries(Object.entries(b).map(([k, v]) => [k, R1(v)])), styleTotal: R1(styleTotal), compositeTotal: R1(compositeTotal) };
}

function scoreRun({ arm, frames: ff, tl: tf }) {
  const res = { arm, frames: ff.split('/').pop(), timeline: tf.split('/').pop(), void: null };
  const fj = JSON.parse(readFileSync(ff, 'utf8'));
  const F = fj.run?.segments?.[seg]?.frames ?? fj.frames;
  let T = JSON.parse(readFileSync(tf, 'utf8')); if (Array.isArray(T)) T = T[seg];
  const L = lines[arm]; if (!L) throw new Error(`no --line for arm ${arm}`);
  if (!F?.length || !T?.recs) { res.void = 'no frames or no Timeline records'; return res; }
  const pt = (s) => (s - T.syncTL) * 1000 + T.syncT;
  const rfs = []; let io = null;
  const walk = (r, inIO) => {
    if (r.type === 'RenderingFrame') rfs.push(r);
    const isIO = r.type === 'ObserverCallback' && r.data?.type === 'IntersectionObserver';
    if (inIO && r.type === 'FunctionCall' && /nodes\/2\.DyWL8TcE\.js$/.test(r.data?.scriptName || '') && r.data?.scriptLine === L.line && (L.col == null || r.data?.scriptColumn === L.col)) io ??= pt(r.startTime);
    for (const c of r.children || []) walk(c, inIO || isIO);
  };
  for (const r of T.recs) walk(r, false);
  if (!rfs.length) { res.void = 'no RenderingFrame records'; return res; }
  if (io == null) { res.void = `no IntersectionObserver callback at ${L.line}:${L.col}`; return res; }
  const k = F.findIndex((f) => f[0] >= io);
  if (k < 0 || k - 2 < 1) { res.void = `crossing at ${Math.round(io)} outside the recorded frames ${F[0][0]}-${F[F.length - 1][0]}`; return res; }
  res.crossing = { t: Math.round(io), frame: k, y: F[k][2], dt: F[k][1] };
  const win = []; for (let i = k - 2; i <= Math.min(F.length - 1, k + 10); i++) win.push(i);
  const match = (i) => {
    const t0 = F[i - 1][0];
    const c = rfs.filter((r) => pt(r.startTime) - 1 <= t0 && t0 <= pt(r.endTime) + 1).sort((a, b) => dur(b) - dur(a))[0];
    if (!c) return null;
    const b = buckets(c);
    if (b.total < 0.5 * F[i][1]) b.owner = 'outside';
    return b;
  };
  res.window = win.map((i) => ({ rel: i - k, dt: F[i][1], y: F[i][2] }));
  const edge = (thr) => win.filter((i) => F[i][1] > thr);
  res.edge = edge(34).map((i) => ({ rel: i - k, dt: F[i][1], y: F[i][2], rf: match(i) }));
  res.edgeCount = { gt30: edge(30).length, gt34: res.edge.length, gt38: edge(38).length };
  const longest = (thr) => { const e = edge(thr).sort((a, b) => F[b][1] - F[a][1])[0]; if (e == null) return 'none'; const m = match(e); return m ? m.owner : 'unmatched'; };
  res.score = { gt30: longest(30), gt34: longest(34), gt38: longest(38) };
  if (arm === 'C') {
    const top = win.slice().sort((a, b) => F[b][1] - F[a][1])[0]; const m = match(top);
    res.controlCheck = { dt: F[top][1], rel: top - k, rf: m, pass: !!m && m.owner !== 'outside' && F[top][1] >= 75 && m.total > 0 && (m.styleTotal + m.compositeTotal) >= 0.6 * m.total };
  }
  return res;
}

function decide(V, key) {
  const withEdge = V.filter((r) => r.score[key] !== 'none');
  if (withEdge.length < 2) return 'CLOSE';
  if (withEdge.length === 2) return 'INCONCLUSIVE';
  const cls = (s) => (s === 'paint' || s === 'compositeRecord' ? 'paint-composite' : s);
  const n = {}; for (const r of withEdge) n[cls(r.score[key])] = (n[cls(r.score[key])] || 0) + 1;
  if ((n.style || 0) >= 3) return 'STYLE';
  if ((n['paint-composite'] || 0) >= 3) return 'PAINT-COMPOSITE';
  return 'SPLIT';
}

const out = { tool: 'fix-nav-morph edge-score.mjs', at: new Date().toISOString(), lines, seg, runs: runs.map(scoreRun) };
const valid = (a) => out.runs.filter((r) => r.arm === a && !r.void);
const C = valid('C'), V = valid('V');
out.control = { valid: C.length, pass: C.filter((r) => r.controlCheck?.pass).length };
out.control.verdict = out.control.pass >= 3 ? 'OK' : 'VOID (fewer than 3 of 4 C runs pass)';
out.decision = { validV: V.length, gt34: decide(V, 'gt34'), gt30: decide(V, 'gt30'), gt38: decide(V, 'gt38') };
out.decision.thresholdSensitive = out.decision.gt30 !== out.decision.gt34 || out.decision.gt38 !== out.decision.gt34;
out.decision.final = out.control.verdict !== 'OK' ? 'VOID' : V.length < 4 ? `INCOMPLETE (${V.length} valid V runs)` : out.decision.gt34;
for (const r of out.runs) {
  if (r.void) { console.log(`${r.arm} ${r.frames}: VOID ${r.void}`); continue; }
  console.log(`${r.arm} ${r.frames}: crossing t ${r.crossing.t} y ${r.crossing.y}; edge >34 ${r.edgeCount.gt34} (>30 ${r.edgeCount.gt30}, >38 ${r.edgeCount.gt38}); score ${r.score.gt34}` +
    (r.edge.length ? `; ${r.edge.map((e) => `${e.dt}ms@${e.rel >= 0 ? '+' : ''}${e.rel} ${e.rf ? `${e.rf.owner} ${JSON.stringify(e.rf.buckets)} of ${e.rf.total}` : 'unmatched'}`).join(' | ')}` : '') +
    (r.controlCheck ? `; control check ${r.controlCheck.pass ? 'PASS' : 'FAIL'} (${r.controlCheck.dt} ms @${r.controlCheck.rel})` : ''));
}
console.log(`control ${out.control.pass}/${out.control.valid} pass -> ${out.control.verdict}`);
console.log(`decision: ${out.decision.final} (>34 ${out.decision.gt34}, >30 ${out.decision.gt30}, >38 ${out.decision.gt38}${out.decision.thresholdSensitive ? ', threshold-sensitive' : ''})`);
const o = opt('--out')[0]; if (o) writeFileSync(o, JSON.stringify(out, null, 1));
