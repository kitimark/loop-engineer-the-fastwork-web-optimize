// Tier B runner (tools/bench.mjs gain | calibrate | reconfirm): ABBA runs of the topics' micro-scenarios
// at a CPU throttle, one fresh page per run, with the host gate of tools/lib/host.mjs (I-017) around every
// run: load1 at start and end, host CPU from tick deltas, the measured Chrome's own CPU (its process
// tree), other CPU = host - Chrome, memory pressure, a host sleep inside the run (sleptSec / woke, I-026);
// classifyRun() flags each run invalid / warn.
import os from 'node:os';
import { snapshot, between, treeCpuSec, classifyRun, waitQuiet, THRESHOLDS } from './host.mjs';
import { tierBRun } from './bench-scenario.mjs';

const r1 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 10) / 10);

/**
 * `sides` {A: {url}, B: {url}}, `scenarios` [{key, viewport, segment|spot}] (all one viewport per call),
 * runs per side. Returns [{side, pair, scenarios: {key: metrics}, host}], ABBA: A B, B A, A B, ...
 */
export async function runGain({ cdp, chromePid, sides, scenarios, runs = 5, cpu = 6, timeDomain = 'timeTicks', maxLoad = null, dwellFrames = 20, log = () => {}, gateTimeout = false }) {
  const out = [];
  const byVp = {};
  for (const s of scenarios) (byVp[s.viewport] ||= []).push(s);
  for (let k = 0; k < runs; k++) {
    for (const side of k % 2 ? ['B', 'A'] : ['A', 'B']) {
      for (const [viewport, list] of Object.entries(byVp)) {
        let recheckQuiet, recheckSleptSec;
        if (maxLoad != null) {
          // wait (still holding the lock) up to 60 s for a quiet host before each run
          const q = await waitQuiet({ maxWaitSec: 60, windowSec: 5, thresholds: { ...THRESHOLDS, quietMaxLoad1: maxLoad, quietMinWindowSec: 5 } });
          recheckQuiet = q.quiet; recheckSleptSec = q.sleptSec;
          if (!q.quiet) log(`  host not quiet after ${q.waitedSec} s (${q.reasons.join(', ')}): running anyway, flagged`);
        }
        const s0 = await snapshot(), c0 = await treeCpuSec(chromePid);
        const r = await tierBRun(cdp, sides[side].url, { viewport, cpu, timeDomain, scenarios: list, dwellFrames });
        const s1 = await snapshot(), c1 = await treeCpuSec(chromePid);
        const h = between(s0, s1);
        const chromeCpuPct = c0 != null && c1 != null && h.windowSec > 0 ? r1((100 * (c1 - c0)) / (h.windowSec * os.cpus().length)) : null;
        const otherBusyPct = h.busyPct != null && chromeCpuPct != null ? r1(h.busyPct - chromeCpuPct) : h.busyPct;
        const flags = classifyRun({ load1Start: h.load1Start, otherBusyPct, pressureMax: h.pressureMax, gateTimeout, recheckQuiet, sleptSec: h.sleptSec, woke: h.woke, recheckSleptSec });
        const host = { ...h, chromeCpuPct, otherBusyPct, recheckQuiet, ...flags };
        out.push({ side, pair: k, viewport, scenarios: r.scenarios, host });
        const first = list[0].key;
        log(`[run ${k + 1}/${runs} ${side} ${viewport}] ${Object.entries(r.scenarios).map(([key, m]) => `${key}: ${m.error ? m.error : `style+layout ${r1(m.styleLayoutMs)} ms, script ${r1(m.scriptMs)} ms, ${m.frames} frames`}`).join('; ')}  | load1 ${h.load1Start}-${h.load1End}, other CPU ${otherBusyPct ?? '?'} %${h.sleptSec > 0 || h.woke ? `, slept ${h.sleptSec ?? '?'} s` : ''}${flags.loadInvalid ? ' CONTAMINATED' : flags.loadWarn ? ' warn' : ''}${first ? '' : ''}`);
      }
    }
  }
  return out;
}

/**
 * Values of `metric` for scenario `key` per side, plus the host records of those runs. A run whose metric is not
 * a finite number (missing, null, NaN, Infinity, a string) is left out of a/b and reported in `errors`, so bench
 * gain / calibrate / reconfirm end INCONCLUSIVE instead of handing it to bench-stats, which throws on it (I-034).
 */
export function series(runs, key, metric) {
  const ok = (r) => r.scenarios[key] && !r.scenarios[key].error;
  const finite = (x) => typeof x === 'number' && Number.isFinite(x);
  const pick = (side) => runs.filter((r) => r.side === side && ok(r) && finite(r.scenarios[key][metric])).map((r) => r.scenarios[key][metric]);
  const hosts = runs.filter((r) => r.scenarios[key]).map((r) => r.host);
  const errors = [
    ...runs.filter((r) => r.scenarios[key]?.error).map((r) => r.scenarios[key].error),
    ...runs.filter((r) => ok(r) && !finite(r.scenarios[key][metric])).map((r) => `${metric} not a finite number (${r.scenarios[key][metric]}) on side ${r.side}`),
  ];
  return { a: pick('A'), b: pick('B'), hosts, errors };
}

/** load1 / other-CPU range of a set of host records, for the verdict line. */
export function hostRange(hosts) {
  const l = hosts.flatMap((h) => [h.load1Start, h.load1End]).filter((x) => x != null);
  const o = hosts.map((h) => h.otherBusyPct).filter((x) => x != null);
  return { load1Min: l.length ? Math.min(...l) : null, load1Max: l.length ? Math.max(...l) : null, otherBusyMax: o.length ? Math.max(...o) : null, stub: hosts.find((h) => h.stub)?.stub };
}
export const fmtHost = (r) => `load1 ${r.load1Min ?? '?'}-${r.load1Max ?? '?'}, other CPU <= ${r.otherBusyMax ?? '?'} %${r.stub ? ', HOST STUBBED' : ''}`;
