// countdown-tick: a model of the 1 Hz tick, no browser. How many displayed seconds skip (value drops by >= 2 between
// two ticks) or repeat (same value at two ticks) over 10 min, for the original setInterval and two chain variants,
// at Fair (no grid) and under WebKit's 30 ms timer grid (thermal mitigation; DOMTimer::alignedFireTime rounds the
// fire time UP to the next multiple of 30 ms on the monotonic clock, once the timer reached the max nesting level; a
// repeating timer re-arms at its actual fire time + interval, ThreadTimers.cpp; F-266).
//   arm 'orig'    : setInterval(e, 1000), e writes Date.now()
//   arm 'chain'   : spec 3.3.1 as written, setTimeout aimed at T0 + k*1000, the tick writes Date.now()
//   arm 'nominal' : the same chain, the tick writes T0 + k*1000 (the epoch second it was aimed at)
// The phase r = (deadline - T0) mod 1000 decides whether a late fire crosses a displayed-second boundary. The model
// sweeps r over 0..999 ms (1 ms steps) and the grid phase over 0..27 ms (3 ms steps), with lateness (main thread)
// uniform in [0, J] ms on top of the grid.
//   node fixes/countdown-tick/model.mjs [--jitter 2] [--seconds 600]
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? Number(process.argv[i + 1]) : d; };
const J = arg('--jitter', 2), SECONDS = arg('--seconds', 600);
let seed = 12345;
const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32);
const ceilGrid = (t, grid, g) => (grid ? Math.ceil((t - g) / grid) * grid + g : t);
const D = 1e9; // deadline (ms); T0 = D - (q*1000 + r)

function run(arm, r, grid, g) {
  const T0 = D - (100000 * 1000 + r);
  const val = (w) => Math.max(0, Math.ceil((D - w) / 1e3));
  const ticks = [];
  let fires = 0;
  if (arm === 'orig') {
    let f = T0 + 1000, n = 0;
    while (f < T0 + SECONDS * 1000) {
      n++;
      const fire = (n >= 5 ? ceilGrid(f, grid, g) : f) + rnd() * J;
      fires++;
      ticks.push(val(Math.floor(fire)));
      f = fire + 1000; // re-arm at the actual fire time + interval
    }
  } else {
    let K = 1, n = 0;
    for (;;) {
      const aim = T0 + K * 1000;
      if (aim >= T0 + SECONDS * 1000) break;
      n++;
      const fire = (n >= 5 ? ceilGrid(aim, grid, g) : aim) + rnd() * J;
      fires++;
      const now = Math.floor(fire), kNow = Math.floor((now - T0) / 1e3);
      ticks.push(arm === 'nominal' ? val(T0 + Math.max(K, kNow) * 1000) : val(now));
      K = Math.max(K + 1, kNow + 1);
    }
  }
  let skips = 0, repeats = 0;
  for (let i = 1; i < ticks.length; i++) {
    const d = ticks[i - 1] - ticks[i];
    if (d >= 2) skips += d - 1;
    if (d === 0) repeats++;
  }
  return { fires, skips, repeats };
}

const rows = {};
for (const arm of ['orig', 'chain', 'nominal']) for (const grid of [0, 30]) {
  let loads = 0, bad = 0, skips = 0, repeats = 0, fires = 0, worst = 0;
  for (let r = 0; r < 1000; r++) for (let g = 0; g < (grid || 1); g += 3) {
    const x = run(arm, r, grid, g);
    loads++; fires += x.fires; skips += x.skips; repeats += x.repeats;
    if (x.skips || x.repeats) bad++;
    worst = Math.max(worst, x.skips);
  }
  rows[`${arm} grid${grid}`] = {
    loads,
    firesPer60s: +(fires / loads / (SECONDS / 60)).toFixed(2),
    skipsPer10min: +((skips / loads) * 600 / SECONDS).toFixed(3),
    repeatsPer10min: +((repeats / loads) * 600 / SECONDS).toFixed(3),
    loadsWithAnySkipOrRepeat: `${((100 * bad) / loads).toFixed(1)} %`,
    worstLoadSkips: worst,
  };
}
console.log(JSON.stringify({ jitterMs: J, seconds: SECONDS, rows }, null, 1));
