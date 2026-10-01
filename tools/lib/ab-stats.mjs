// The per-metric statistics of `fix.mjs ab` (results.json "metrics"), kept free of side effects so the
// unit tests can call them (tests/unit/ab-stats.test.mjs).
//
// Pairing (incident I-018 review): baseline and patched values are paired by run index (ABBA: run i of
// the baseline and run i of the patched page ran back to back). A metric some runs lack (a run without
// CDP metrics, a failed trace: no number) drops that run's pair from that metric only, never shifts the
// pairs after it; every metric reports its own n (complete pairs) and the run indices it skipped.

export const median = (xs) => { const s = [...xs].sort((a, b) => a - b); const n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : null; };
const r1 = (x) => (x == null ? null : Math.round(x * 10) / 10);

/**
 * results: verify.json results; metrics: {phase: [[key, name, dir]]} (dir +1: higher is better), read
 * from result[`${phase}Summary`][key]. A phase no result recorded is left out; so is a metric without
 * a single complete pair.
 */
export function stats(results, vp, labelA, labelB, metrics) {
  const out = {};
  const side = (label) => results.filter((r) => !r.diff && r.viewport === vp && r.label === label);
  const A = side(labelA), B = side(labelB);
  const runIds = [...new Set([...A, ...B].map((r) => r.run))].sort((x, y) => x - y);
  for (const [phase, list] of Object.entries(metrics)) {
    const key = `${phase}Summary`;
    if (![...A, ...B].some((r) => r[key])) continue; // --idle 0 / no --trace-frames: phase not recorded
    const ph = {};
    for (const [m, name, dir] of list) {
      const val = (rs, run) => { const v = rs.find((r) => r.run === run)?.[key]?.[m]; return typeof v === 'number' ? v : null; };
      const pairs = [], skipped = [];
      for (const run of runIds) { const a = val(A, run), b = val(B, run); if (a == null || b == null) skipped.push(run); else pairs.push([a, b]); }
      if (!pairs.length) continue; // e.g. no CDP metrics recorded
      const a = pairs.map((p) => p[0]), b = pairs.map((p) => p[1]);
      const ma = median(a), mb = median(b);
      const n = pairs.length;
      let verdict = n < 3 ? `n=${n} (need >=3 runs for a verdict)` : 'within noise';
      if (n >= 3) {
        const better = dir > 0 ? Math.min(...b) > Math.max(...a) : Math.max(...b) < Math.min(...a);
        const worse = dir > 0 ? Math.max(...b) < Math.min(...a) : Math.min(...b) > Math.max(...a);
        if (better) verdict = 'better (ranges do not overlap)'; else if (worse) verdict = 'WORSE (ranges do not overlap)';
      }
      ph[m] = {
        name, higherIsBetter: dir > 0, n, ...(skipped.length ? { skippedRuns: skipped } : {}),
        baseline: { median: r1(ma), min: r1(Math.min(...a)), max: r1(Math.max(...a)), runs: a },
        patched: { median: r1(mb), min: r1(Math.min(...b)), max: r1(Math.max(...b)), runs: b },
        delta: r1(mb - ma), deltaPct: ma ? r1((100 * (mb - ma)) / Math.abs(ma)) : null,
        pairedDeltas: pairs.map(([x, y]) => r1(y - x)), verdict,
      };
    }
    out[phase] = ph;
  }
  return out;
}
