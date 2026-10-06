// I-218: synthetic finger records (`iphone.mjs record --touches` format) for tests/unit/gesture-from-record.test.mjs and
// tests/e2e/gesture-from-record.test.mjs: a small finger + scroll model, no phone. Finger samples every 9 ms, frames every
// 16.7 ms, scroll following the finger past a 10 px slop and coasting after a fast lift (tau 0.45 s).
/**
 * A record from finger contacts. Each contact: {at (ms after the record start), ms, path(u) -> finger clientY for u in
 * [0, 1], hold (ms the finger rests before the lift), x}. Returns {frames, touches, href, vw, vh0, meta}.
 */
export function makeRecord(contacts, { seconds = 20, y0 = 0, maxY = 5200, tau = 0.45, t0 = 5000, slop = 10, multiAt = null } = {}) {
  const ev = []; // [t, kind, y, x]
  for (const c of contacts) {
    const a = t0 + c.at, move = c.ms, hold = c.hold || 0;
    ev.push([a, 's', c.path(0), c.x ?? 215]);
    for (let t = 9; t < move; t += 9) ev.push([a + t, 'm', c.path(t / move), c.x ?? 215]);
    ev.push([a + move, 'm', c.path(1), c.x ?? 215]);
    if (hold) for (let t = 9; t < hold; t += 9) ev.push([a + move + t, 'm', c.path(1), c.x ?? 215]);
    ev.push([a + move + hold, 'e', c.path(1), c.x ?? 215]);
  }
  ev.sort((p, q) => p[0] - q[0]);
  const frames = [], touches = [];
  let y = y0, v = 0, down = null, ei = 0, last = t0;
  for (let t = t0; t <= t0 + seconds * 1000; t += 16.7) {
    while (ei < ev.length && ev[ei][0] <= t) {
      const [te, k, fy, fx] = ev[ei++];
      if (k === 's') { down = { fy0: fy, y0: y, prev: [te, fy], lastV: 0 }; v = 0; }
      else if (down) {
        const d = down.fy0 - fy; // finger up = scroll down
        y = Math.max(0, Math.min(maxY, down.y0 + Math.sign(d) * Math.max(0, Math.abs(d) - slop)));
        if (te > down.prev[0]) down.lastV = (down.prev[1] - fy) / (te - down.prev[0]);
        down.prev = [te, fy];
        if (k === 'e') { v = Math.abs(down.lastV) > 0.2 ? down.lastV : 0; down = null; }
      }
      touches.push([Math.round(te * 10) / 10, k, k === 'e' ? 0 : (multiAt !== null && Math.abs(te - t0 - multiAt) < 5 ? 2 : 1), 1, 0, Math.round(y), Math.round(fy), Math.round(te * 10) / 10, Math.round(fx)]);
    }
    if (!down && v) { const dt = t - last; y = Math.max(0, Math.min(maxY, y + v * dt)); v *= Math.exp(-dt / (tau * 1000)); if (Math.abs(v) < 0.02 || y <= 0 || y >= maxY) v = 0; }
    frames.push([Math.round(t * 10) / 10, Math.round((t - last) * 10) / 10, Math.round(y), 775]);
    last = t;
  }
  return { frames, touches, href: 'http://lan-host:5401/', vw: 430, vh0: 775, meta: { label: 'finger', touches: { fields: ['t', 'kind', 'touches', 'cancelable', 'defaultPrevented', 'scrollY', 'clientY', 'timeStamp', 'clientX'] } } };
}
export const lin = (a, b) => (u) => a + (b - a) * u;
export const ease = (a, b) => (u) => a + (b - a) * (u * u * (3 - 2 * u));
/** finger accelerating to the lift (a flick): position u^2 */
export const flick = (a, b) => (u) => a + (b - a) * u * u;

// the fixture scene: a flick up, a long slow drag up (held at the end), a flick down, a tap, a drag up-then-down
export const SCENE = [
  { at: 500, ms: 300, path: flick(650, 350) }, // up 300 px, lift ~2000 px/s: a fling
  { at: 3000, ms: 3000, path: lin(780, 80), hold: 300 }, // up 700 px slowly, then rests 300 ms: split in two, a hold
  { at: 7500, ms: 250, path: flick(300, 500) }, // down 200 px, fast: a down fling (needs y >= 300 first)
  { at: 9500, ms: 120, path: lin(500, 503) }, // a tap (3 px): dropped
  { at: 11000, ms: 1200, path: (u) => (u < 0.5 ? 700 - 400 * u : 500 + 300 * (u - 0.5)) }, // up 200 then down 150 in one contact
];

