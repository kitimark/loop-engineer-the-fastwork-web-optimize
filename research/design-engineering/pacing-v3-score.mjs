#!/usr/bin/env node
// Score pacing v3 (pacing/v3.html). The reading is pre-registered in pacing-result.md §5; this file implements it.
//
//   node research/design-engineering/pacing-v3-score.mjs <file.json>... [--json]
//
// A file is one __fwPacingV3Get() result (or a JSON array of them):
//   mode "session"  a viewer's session (driver F): picks per arm + objective numbers per visit
//   mode "g"        one state under driver G (WDA gesture): objective numbers only
//   page "fw-pacing-v3-urls"  a real-page A/B (F stage of a fix): picks per question key
// Several session files pool the decision arm (e.g. set 1 + set 2). Several G files are grouped by state.
//
// "chosen" = the version the viewer said FOLLOWED THE FINGER BETTER. Reading table (§5):
//   arm      chosen state means           counts as
//   drag     drag-none                     control passes (the load is felt when the UI itself waits on it)
//   passive  scroll-passive                the non-passive listener was felt as worse  <- DECISION ARM
//   hero     hero-none                     the scroll-linked rAF effect under load was felt as worse
//   steady   drag-steady                   clumped load (the trace) felt worse than the same mean spread evenly
import fs from 'node:fs';

const args = process.argv.slice(2);
const asJson = args.includes('--json');
const files = args.filter((a) => a !== '--json');
if (!files.length) { console.error('usage: pacing-v3-score.mjs <file.json>... [--json]'); process.exit(2); }

const q = (a, p) => { const s = a.filter(Number.isFinite).sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : null; };
const med = (a) => q(a, 0.5);
const r1 = (x) => (x == null ? null : Math.round(x * 10) / 10);
const binom1 = (k, n) => { // one-sided P(X >= k), p = 0.5
  let c = 1, s = 0; const t = 2 ** n;
  for (let i = 0; i <= n; i++) { if (i >= k) s += c; c = c * (n - i) / (i + 1); }
  return Math.round(1000 * s / t) / 1000;
};
const TH = { j34: 34, j50: 50, frame: 1000 / 60 };

// ------------------------------------------------------------------------------------------------ objective
// One visit (a state shown once, or one G run): rAF gaps while the content moves, touch-to-scroll, touchmove
// queue delay (handler time - event timeStamp), drag lag (rAF time - timeStamp of the touchmove it shows),
// cancelable share of touchmoves, and what the load delivered.
export function visitMetrics(v) {
  const r = v.rec, raf = r.raf, touch = r.touch;
  const moves = touch.filter((t) => t[0] === 1);
  const starts = touch.filter((t) => t[0] === 0);
  const m = { state: v.state, surface: v.surface, frames: raf.length, touchmoves: moves.length, touches: starts.length };
  const gapsMoving = [];
  if (v.surface === 'scroll') {
    for (let i = 1; i < raf.length; i++) if (raf[i][1] !== raf[i - 1][1]) gapsMoving.push(raf[i][0] - raf[i - 1][0]);
    // touch-to-scroll: from touchstart's timeStamp to the first rAF whose scrollY differs from the one before it
    const tts = [];
    for (const s of starts) {
      const i0 = raf.findIndex((f) => f[0] >= s[1]);
      if (i0 < 1) continue;
      const y0 = raf[i0 - 1][1];
      const end = touch.find((t) => (t[0] === 2 || t[0] === 3) && t[1] > s[1]);
      for (let i = i0; i < raf.length; i++) {
        if (end && raf[i][0] > end[1] + 50) break; // a tap or a hold: no scroll from this touch
        if (Math.abs(raf[i][1] - y0) >= 1) { tts.push(raf[i][0] - s[1]); break; }
      }
    }
    m.touchToScrollMs = { n: tts.length, p50: r1(med(tts)), p90: r1(q(tts, 0.9)), all: tts.map(r1) };
  } else {
    // drag: frames while a touchmove is applied (finger down and moved); lag per frame that shows a new move
    const lag = [];
    let prevTs = null;
    for (let i = 0; i < raf.length; i++) {
      const f = raf[i];
      if (f[2] == null) { prevTs = null; continue; }
      if (i > 0 && raf[i - 1][2] != null) gapsMoving.push(f[0] - raf[i - 1][0]);
      if (f[2] !== prevTs) lag.push(f[0] - f[2]);
      prevTs = f[2];
    }
    m.dragLagMs = { n: lag.length, p50: r1(med(lag)), p90: r1(q(lag, 0.9)), max: r1(lag.length ? Math.max(...lag) : null) };
  }
  m.movingGaps = {
    n: gapsMoving.length, p50: r1(med(gapsMoving)), p95: r1(q(gapsMoving, 0.95)), max: r1(gapsMoving.length ? Math.max(...gapsMoving) : null),
    gt34: gapsMoving.filter((g) => g > TH.j34).length, gt50: gapsMoving.filter((g) => g > TH.j50).length,
  };
  const qd = moves.map((t) => t[2] - t[1]);
  m.touchmoveQueueMs = { p50: r1(med(qd)), p90: r1(q(qd, 0.9)), max: r1(qd.length ? Math.max(...qd) : null), negative: qd.filter((x) => x < -1).length };
  m.cancelableShare = moves.length ? Math.round(100 * moves.filter((t) => t[3]).length / moves.length) / 100 : null;
  m.extraCalls = v.extraCalls ?? null;
  const L = v.load || {};
  const longChunks = (L.chunks || []).filter((c) => c[1] >= 16.7).length;
  m.load = { mode: L.mode, busyShare: L.busyShare, skipped: L.skipped, chunks: (L.chunks || []).length, longChunks, elapsedMs: L.elapsedMs };
  return m;
}

const loadOk = (m) => m.load.mode !== 'trace' || (m.load.busyShare >= 0.4 && m.load.busyShare <= 0.75 && m.load.skipped <= 0.2 * Math.max(1, m.load.chunks));

// ------------------------------------------------------------------------------------------------ inputs
const docs = [];
for (const f of files) {
  const j = JSON.parse(fs.readFileSync(f, 'utf8'));
  for (const d of Array.isArray(j) ? j : [j]) docs.push({ file: f, d });
}
const out = { sessions: [], pooled: null, g: null, urls: [] };

// ------------------------------------------------------------------------------------------------ sessions
const WIN = { drag: 'drag-none', passive: 'scroll-passive', hero: 'hero-none', steady: 'drag-steady' };
for (const { file, d } of docs.filter((x) => x.d.mode === 'session')) {
  const S = { file, set: d.set, rafMs: d.rafMs, startedAt: d.startedAt, arms: {}, catch: null, sideFirst: 0, counted: 0, flags: [], perState: {} };
  if (d.rafMs > 25) S.flags.push(`rAF ${d.rafMs} ms: Low Power Mode (30 Hz)? read with care`);
  for (const t of d.trials) {
    for (const v of t.visits || []) {
      const m = visitMetrics(v);
      (S.perState[v.state] ??= []).push(m);
      if (!t.practice && !loadOk(m)) S.flags.push(`trial ${t.n} ${v.state}: load not delivered (busyShare ${m.load.busyShare}, skipped ${m.load.skipped}/${m.load.chunks})`);
    }
    if (t.practice) continue;
    S.counted++; if (t.choice === 'first') S.sideFirst++;
    if (t.arm === 'catch') { S.catch = { choice: t.choice, rating: t.rating }; continue; }
    const g = (S.arms[t.arm] ??= { win: WIN[t.arm], k: 0, n: 0, rows: [] });
    g.n++; if (t.chosen === g.win) g.k++;
    g.rows.push({ n: t.n, first: t.first, second: t.second, choice: t.choice, chosen: t.chosen, rating: t.rating, again: t.again });
  }
  // aggregate objective numbers per state (medians over visits)
  S.objective = Object.fromEntries(Object.entries(S.perState).map(([st, ms]) => [st, aggregate(ms)]));
  delete S.perState;
  if (S.sideFirst >= S.counted - 1 || S.sideFirst <= 1) S.flags.push(`side bias: version 1 chosen ${S.sideFirst}/${S.counted}`);
  if (S.catch && S.catch.rating >= 4) S.flags.push(`catch rated ${S.catch.rating} (very different) for two identical versions: ratings unreliable this session`);
  S.reading = readSession(S);
  out.sessions.push(S);
}

function aggregate(ms) {
  const pick = (f) => ms.map(f).filter((x) => x != null);
  return {
    visits: ms.length,
    movingGapP50: r1(med(pick((m) => m.movingGaps.p50))), movingGt34: pick((m) => m.movingGaps.gt34).reduce((a, b) => a + b, 0),
    movingGt50: pick((m) => m.movingGaps.gt50).reduce((a, b) => a + b, 0), movingFrames: pick((m) => m.movingGaps.n).reduce((a, b) => a + b, 0),
    touchToScrollP50: r1(med(ms.flatMap((m) => (m.touchToScrollMs ? m.touchToScrollMs.all : [])))),
    dragLagP50: r1(med(pick((m) => m.dragLagMs && m.dragLagMs.p50))), dragLagP90: r1(med(pick((m) => m.dragLagMs && m.dragLagMs.p90))),
    queueP50: r1(med(pick((m) => m.touchmoveQueueMs.p50))), queueP90: r1(med(pick((m) => m.touchmoveQueueMs.p90))),
    cancelableShare: r1(med(pick((m) => m.cancelableShare))), busyShare: med(pick((m) => m.load.busyShare)),
  };
}

function readSession(S) {
  const R = {};
  const drag = S.arms.drag;
  R.control = !drag ? 'missing' : drag.k === drag.n ? `PASS (drag-none chosen ${drag.k}/${drag.n}): the session is sensitive` : `FAIL (drag-none chosen ${drag.k}/${drag.n}): session not sensitive, the other arms are reported, not read`;
  const sensitive = drag && drag.k === drag.n && !S.flags.some((f) => f.includes('load not delivered'));
  const p = S.arms.passive;
  if (p) {
    const pv = binom1(p.k, p.n);
    const v = !sensitive ? 'not read (control failed or load not delivered)'
      : p.k === p.n ? `FELT: passive chosen ${p.k}/${p.n} (p ${pv}): the non-passive touchmove under fastwork-like load followed the finger worse (n=1 viewer, OBSERVED)`
      : p.k === p.n - 1 ? `LEANING: passive chosen ${p.k}/${p.n} (p ${pv}): run the other set, read pooled`
      : p.k === 0 ? `REVERSED: non-passive chosen ${p.n - p.k}/${p.n}: check the G mechanism numbers before reading anything`
      : `NOT FELT: passive chosen ${p.k}/${p.n} (p ${pv}): in this setup the listener change must win on G numbers alone`;
    R.passive = v;
  }
  const dir = (arm, yes, no) => {
    const a = S.arms[arm]; if (!a) return 'missing';
    if (!sensitive) return `not read (${a.k}/${a.n})`;
    return a.k === a.n ? `${yes} (${a.k}/${a.n}, direction only)` : a.k === 0 ? `${no} (0/${a.n}, direction only)` : `null (${a.k}/${a.n})`;
  };
  R.hero = dir('hero', 'scroll-linked rAF effect under load felt as worse', 'reversed: the loaded hero was chosen');
  R.steady = dir('steady', 'clumped load felt worse than the same mean spread evenly', 'reversed: the clumped trace was chosen over steady');
  return R;
}

// pooled decision arm across sessions (e.g. set 1 + set 2)
if (out.sessions.length > 1) {
  const sens = out.sessions.filter((s) => s.reading.control.startsWith('PASS') && !s.flags.some((f) => f.includes('load not delivered')));
  const k = sens.reduce((a, s) => a + (s.arms.passive?.k || 0), 0), n = sens.reduce((a, s) => a + (s.arms.passive?.n || 0), 0);
  const pv = binom1(k, n);
  out.pooled = { sessions: sens.length, passive: `${k}/${n}`, p: pv,
    reading: n < 8 ? 'fewer than 8 sensitive decision pairs: not pooled' : k >= 7 ? `FELT (pooled ${k}/${n}, p ${pv})` : k <= 5 ? `NOT FELT (pooled ${k}/${n})` : `INCONCLUSIVE (pooled ${k}/${n})` };
}

// ------------------------------------------------------------------------------------------------ G runs
const gdocs = docs.filter((x) => x.d.mode === 'g');
if (gdocs.length) {
  const byState = {};
  for (const { file, d } of gdocs) {
    if (!d.visit) continue;
    const m = visitMetrics(d.visit);
    (byState[d.state] ??= []).push({ file, label: d.label || null, rafMs: d.rafMs, ...m });
  }
  const runMed = (rs, f) => rs.map(f).filter((x) => x != null);
  const G = { states: {}, reading: {} };
  for (const [st, rs] of Object.entries(byState)) {
    G.states[st] = {
      runs: rs.length,
      touchToScrollP50: runMed(rs, (m) => m.touchToScrollMs?.p50),
      dragLagP50: runMed(rs, (m) => m.dragLagMs?.p50), dragLagP90: runMed(rs, (m) => m.dragLagMs?.p90),
      queueP50: runMed(rs, (m) => m.touchmoveQueueMs.p50),
      movingGt34: runMed(rs, (m) => m.movingGaps.gt34), movingGt50: runMed(rs, (m) => m.movingGaps.gt50), movingFrames: runMed(rs, (m) => m.movingGaps.n),
      cancelableShare: runMed(rs, (m) => m.cancelableShare), busyShare: runMed(rs, (m) => m.load.busyShare), loadOk: rs.every(loadOk),
    };
  }
  // the G reading (§5): per-run medians, separated when the two sets of runs do not overlap (>= 3 runs each)
  const sep = (a, b, minDiff) => {
    if (a.length < 3 || b.length < 3) return `too few runs (${a.length} vs ${b.length})`;
    const d = (med(b) ?? 0) - (med(a) ?? 0);
    if (Math.min(...b) > Math.max(...a) && d >= minDiff) return `SEPARATED: +${r1(d)} ms (runs ${a.map(r1).join(',')} vs ${b.map(r1).join(',')})`;
    if (Math.max(...b) < Math.min(...a) && -d >= minDiff) return `SEPARATED, reversed: ${r1(d)} ms`;
    return `overlap: ${r1(d)} ms median difference (runs ${a.map(r1).join(',')} vs ${b.map(r1).join(',')})`;
  };
  const S = G.states;
  if (S['scroll-passive'] && S['scroll-nonpassive']) {
    G.reading.passiveTouchToScroll = sep(S['scroll-passive'].touchToScrollP50, S['scroll-nonpassive'].touchToScrollP50, TH.frame);
    G.reading.passiveQueue = sep(S['scroll-passive'].queueP50, S['scroll-nonpassive'].queueP50, 0);
    G.reading.passiveCancelable = `cancelable share passive ${S['scroll-passive'].cancelableShare.join(',')} vs non-passive ${S['scroll-nonpassive'].cancelableShare.join(',')}`;
  }
  if (S['drag-none'] && S['drag-trace']) G.reading.dragLagControl = sep(S['drag-none'].dragLagP90, S['drag-trace'].dragLagP90, TH.frame); // p90: the load blocks some frames, so the median barely moves (Chrome check: p50 31 vs 32, p90 32 vs 83 ms)
  out.g = G;
}

// ------------------------------------------------------------------------------------------------ real-page A/B
// a urls file is one result (page fw-pacing-v3-urls) or the whole localStorage "fwPacingV3urls" object {key: result}
const isUrls = (d) => d && (d.page === 'fw-pacing-v3-urls' || (!d.page && !d.mode && Object.values(d).some((v) => v && v.page === 'fw-pacing-v3-urls')));
for (const { file, d } of docs.filter((x) => isUrls(x.d))) {
  for (const res of d.page ? [d] : Object.values(d).filter((v) => v && v.page === 'fw-pacing-v3-urls')) {
    const n = res.trials.length, kA = res.trials.filter((t) => t.chosen === 'A').length;
    const byOrder = {};
    for (const t of res.trials) { const o = (byOrder[t.order] ??= { A: 0, n: 0 }); o.n++; if (t.chosen === 'A') o.A++; }
    out.urls.push({ file, q: res.q, a: res.a, b: res.b, n, chosenA: kA, chosenB: n - kA, pA: binom1(kA, n), pB: binom1(n - kA, n), byOrder,
      ratings: res.trials.map((t) => t.rating), reading: n < 4 ? 'fewer than 4 pairs: not read' : kA === n ? `A followed better ${kA}/${n}` : kA === 0 ? `B followed better ${n}/${n}` : `mixed ${kA}/${n} A` });
  }
}

if (asJson) { console.log(JSON.stringify(out, null, 1)); process.exit(0); }
for (const S of out.sessions) {
  console.log(`== session ${S.file} set ${S.set} rAF ${S.rafMs} ms, ${S.counted} counted pairs, version 1 chosen ${S.sideFirst}/${S.counted}`);
  for (const [a, g] of Object.entries(S.arms)) console.log(`  ${a.padEnd(8)} ${g.win} chosen ${g.k}/${g.n}  ${g.rows.map((r) => `${r.chosen === g.win ? '+' : '-'}${r.rating ?? ''}`).join(' ')}`);
  console.log(`  catch    ${JSON.stringify(S.catch)}`);
  for (const [k, v] of Object.entries(S.reading)) console.log(`  READ ${k}: ${v}`);
  for (const f of S.flags) console.log(`  FLAG ${f}`);
  for (const [st, o] of Object.entries(S.objective)) console.log(`  obj ${st.padEnd(18)} ${JSON.stringify(o)}`);
}
if (out.pooled) console.log('== pooled decision arm', JSON.stringify(out.pooled));
if (out.g) {
  console.log('== G runs');
  for (const [st, o] of Object.entries(out.g.states)) console.log(`  ${st.padEnd(18)} ${JSON.stringify(o)}`);
  for (const [k, v] of Object.entries(out.g.reading)) console.log(`  READ ${k}: ${v}`);
}
for (const u of out.urls) console.log(`== urls ${u.q} (${u.a} vs ${u.b}): ${u.reading}; A ${u.chosenA}/${u.n} (p ${u.pA}), by order ${JSON.stringify(u.byOrder)}`);
