// countdown-tick P-130: in-page change logger for the hero countdown, in the --inject contract of
// tools/lib/gesture-run.mjs loadInject (exports install / read as expression strings). No polling: one
// MutationObserver on the hero clock's aria-label (the [role=timer] inside .hero-track), one record per change:
// [Date.now(), performance.now() rounded to 0.1 ms, shown value in seconds (d,h,m,s from the label), document.hidden].
// read returns {n, recs, summary} where summary counts, over the window from the first logged change to 120 s after it:
// changes, distinct values, skips (consecutive logged values that drop by >= 2 s; each counts value drop - 1) with
// their positions (index, t since the window start, from, to), repeats, hidden records, and the gaps between changes
// (min / p50 / max ms). Values outside the window are kept in recs, not counted.
// Timer-grid read (P-130 note 5): a chain of 32 setTimeout(0) hops, once at install and once 121 s after the first
// change (after the window). From hop 8 on the chain is past WebKit's max nesting level (5), so the gap between hops is
// the alignment grid: ~30 ms under thermal mitigation, ~8 ms if that is the grid, ~4 ms (the nesting clamp) at Fair.
// summary.grid = {start, end}, each {p50, min, max} ms of the hop gaps 8..31 (one burst lasts <= 1 s).
export const name = 'countdown-tick-logger';
export const install = `(() => {
  if (window.__ctLog) return 'already';
  const L = window.__ctLog = { recs: [], err: null, grid: {} };
  const gridProbe = (key) => {
    const ts = [];
    const hop = () => {
      ts.push(performance.now());
      if (ts.length < 32) return void setTimeout(hop, 0);
      const d = []; for (let i = 8; i < ts.length; i++) d.push(ts[i] - ts[i - 1]);
      d.sort((a, b) => a - b); const r = (x) => Math.round(x * 10) / 10;
      L.grid[key] = { at: Date.now(), p50: r(d[d.length >> 1]), min: r(d[0]), max: r(d[d.length - 1]) };
    };
    setTimeout(hop, 0);
  };
  gridProbe('start');
  const secs = (s) => { const n = String(s || '').match(/\\d+/g); return n && n.length === 4 ? ((+n[0] * 24 + +n[1]) * 60 + +n[2]) * 60 + +n[3] : null; };
  const hero = () => document.querySelector('.hero-track [role=timer]');
  const start = () => {
    const t = hero();
    if (!t) return false;
    new MutationObserver(() => {
      L.recs.push([Date.now(), Math.round(performance.now() * 10) / 10, secs(t.getAttribute('aria-label')), document.hidden]);
      if (!L.endArmed) { L.endArmed = 1; setTimeout(() => gridProbe('end'), 121000); }
    })
      .observe(t, { attributes: true, attributeFilter: ['aria-label'] });
    L.recs.push([Date.now(), Math.round(performance.now() * 10) / 10, secs(t.getAttribute('aria-label')), document.hidden, 'initial']);
    return true;
  };
  if (!start()) new MutationObserver((ms, mo) => { if (start()) mo.disconnect(); }).observe(document, { childList: true, subtree: true });
  return 'installed';
})()`;
export const read = `(() => {
  const L = window.__ctLog; if (!L) return JSON.stringify({ n: 0, error: 'not installed' });
  const ch = L.recs.filter((r) => r[4] !== 'initial');
  const t0 = ch.length ? ch[0][0] : 0, w = ch.filter((r) => r[0] - t0 <= 120000);
  let skips = 0, repeats = 0; const at = [], gaps = [];
  for (let i = 1; i < w.length; i++) {
    const d = w[i - 1][2] - w[i][2]; gaps.push(w[i][0] - w[i - 1][0]);
    if (d >= 2) { skips += d - 1; at.push([i, w[i][0] - t0, w[i - 1][2], w[i][2]]); }
    if (d === 0) repeats++;
  }
  gaps.sort((a, b) => a - b);
  const summary = { windowMs: w.length ? w[w.length - 1][0] - t0 : 0, changes: w.length, distinct: new Set(w.map((r) => r[2])).size,
    skips, skipAt: at, repeats, hidden: w.filter((r) => r[3]).length,
    gapMs: gaps.length ? { min: gaps[0], p50: gaps[gaps.length >> 1], max: gaps[gaps.length - 1] } : null, grid: L.grid };
  return JSON.stringify({ n: L.recs.length, recs: L.recs, summary });
})()`;
