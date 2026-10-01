// A fake host for tools/lib/host.mjs, loaded through $FW_TEST_HOST=<this file> (process-wide stub of the
// samplers) so CLI tests of the lock gate, verify.mjs and fix.mjs ab get a deterministic host instead of
// the real, busy Mac. Default: a quiet host (load1 1, 5 % busy, pressure normal) that never sleeps.
// It exports every sampler of host.mjs DEFAULT_SAMPLERS (tests/unit/host.test.mjs checks): with a stub,
// a missing one throws instead of reading the real host (I-024).
//
// Clocks: `mono` is real monotonic time plus every sleep() taken through the stub (sleep resolves at once
// and advances the clock), so a 10 s quiet window costs no wall time in a test. `now` (wall) is mono plus
// any host sleep injected with FAKE_HOST_SUSPEND, so tests do not assume a monotonic wall clock (I-026).
// CPU ticks, the Chrome tree CPU and decompressions accrue over the stub's sleeps only, not real time, so a
// window's percentages are exact however loaded the test machine is (I-027 E).
// Env (each value may be a timeline "v1:untilMs,v2:untilMs,v3": v1 until untilMs of fake monotonic time
// after this module loaded, then the next):
//   FAKE_HOST_LOAD1          load1 (default 1)
//   FAKE_HOST_BUSY           host CPU busy fraction 0-1 (default 0.05); sys = 30 % of it
//   FAKE_HOST_PRESSURE       memory pressure level 1 normal, 2 warn, 4 critical (default 1)
//   FAKE_HOST_CHROME_CORES   CPU cores used by any process tree asked about with treeCpu (default 0.4)
//   FAKE_HOST_DECOMP         decompressions per second (default 10)
//   FAKE_HOST_SUSPEND        "atMs:sec[,atMs:sec]": the host sleeps `sec` s once fake monotonic time passes
//                            atMs (wall clock jumps; ticks and mono stand still; kern.waketime changes)
const M0 = performance.now(), W0 = Date.now();
let offset = 0, jump = 0, wakeAt = Math.floor(W0 / 1000) - 3600;
const suspends = String(process.env.FAKE_HOST_SUSPEND || '').split(',').filter(Boolean).map((p) => { const [at, sec] = p.split(':').map(Number); return { at, sec, done: false }; });
const elapsed = () => performance.now() - M0 + offset;
function checkSuspend() {
  for (const x of suspends) if (!x.done && elapsed() >= x.at) { x.done = true; jump += x.sec * 1000; wakeAt = Math.floor((W0 + elapsed() + jump) / 1000); }
}
export const mono = () => { checkSuspend(); return M0 + elapsed(); };
export const now = () => { checkSuspend(); return W0 + elapsed() + jump; };
export const wake = () => { checkSuspend(); return wakeAt; };
export const sleep = (ms) => { offset += ms; return new Promise((r) => setImmediate(r)); };

function timeline(name, d) {
  const spec = String(process.env[name] ?? d).split(',').map((p) => { const [v, until] = p.split(':'); return { v: Number(v), until: until === undefined ? Infinity : Number(until) }; });
  return () => { const t = elapsed(); return (spec.find((s) => t < s.until) || spec[spec.length - 1]).v; };
}
const load1 = timeline('FAKE_HOST_LOAD1', 1), busy = timeline('FAKE_HOST_BUSY', 0.05), pres = timeline('FAKE_HOST_PRESSURE', 1);
const chromeCores = timeline('FAKE_HOST_CHROME_CORES', 0.4), decomp = timeline('FAKE_HOST_DECOMP', 10);

const N = 8;
let last = 0, busyMs = 0, totalMs = 0, chromeSec = 0, decompN = 0;
// CPU time runs on the fake clock only: the sleeps taken through this stub (I-027 E). Real time between two
// readings is the test process's own overhead, and it made verify's Chrome window (treeCpu outside the tick
// snapshots) count extra Chrome time under load (chromeCpuPct 5.1 for 5). It never runs while the host sleeps.
function advance() {
  checkSuspend();
  const dt = Math.max(0, offset - last);
  last = offset;
  totalMs += dt; busyMs += dt * busy(); chromeSec += (dt / 1000) * chromeCores(); decompN += (dt / 1000) * decomp();
}
export function cpus() {
  advance();
  const b = busyMs, s = b * 0.3;
  return Array.from({ length: N }, () => ({ model: 'FakeCPU', speed: 1, times: { user: b - s, nice: 0, sys: s, idle: totalMs - b, irq: 0 } }));
}
export const loadavg = () => [load1(), load1(), load1()];
export const freemem = () => 2 * 1024 ** 3;
export const pressure = () => pres();
export const decompressions = () => { advance(); return Math.round(decompN); };
export const treeCpu = () => { advance(); return Math.round(chromeSec * 1000) / 1000; };
export const procs = () => ({}); // treeCpu answers instead
