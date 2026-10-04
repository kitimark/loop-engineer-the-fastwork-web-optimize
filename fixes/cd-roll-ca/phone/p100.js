// P-100 page script (fixes/cd-roll-ca/phone/p100.html; external file because the mirror server sends script-src 'self'
// for documents it has no production CSP for, which blocks inline scripts)
const UE = { stiffness: 280, damping: 18, mass: 0.3 }, WE = 16;
function GE(e, t, n, r = UE) {
  let { value: i, velocity: a } = e, o = Math.max(0, n);
  for (; o > 0;) { let e = Math.min(o, WE) / 1e3; o -= WE; let n = (-r.stiffness * (i - t) - r.damping * a) / r.mass; ((a += n * e), (i += a * e)); }
  return Math.abs(a) < 0.01 && Math.abs(i - t) < 0.001 ? { state: { value: t, velocity: 0 }, done: !0 } : { state: { value: i, velocity: a }, done: !1 };
}
// V9's __crPath (582d120c), literal
const crPath = (f, t, u = 0) => {
  let T = 1e3 / 60, L = [], K = [[0, f]];
  for (let j = 0; j <= 32; j++) L.push(GE({ value: f, velocity: u }, t, j / 2));
  for (let k = 0; k < 600; k++) {
    let v = L.map((x) => x.state.value), q = Math.abs(v[0] - 2 * v[16] + v[32]) / 128, m = 1, w = L.every((x) => x.done);
    for (; m < 32 && (q * (16 / m) ** 2) / 4 > 5e-4;) m *= 2;
    for (let j = 1; j <= m; j++) K.push([k * T + (16 * j) / m, v[(32 * j) / m]]);
    L = L.map((x) => (x.done ? x : GE(x.state, t, T)));
    K.push([(k + 1) * T, L[0].state.value]);
    if (w) { for (; K.length > 2 && K[K.length - 2][1] === t;) K.splice(K.length - 2, 1); return K.every(([, x]) => x >= 0 && x < 10) ? K : null; }
  }
  return null;
};
const cellsOf = (K) => { const r = []; for (let k = 0; k < 11; k++) { let near = false; for (let j = 0; j < K.length && !near; j++) { const a = K[j][1], b = K[j + 1] ? K[j + 1][1] : a; near = (Math.min(a, b) <= k && k <= Math.max(a, b)) || Math.min(Math.abs(k - a), Math.abs(k - b)) < 1.5; } near && r.push(k); } return r; };
const mode = new URLSearchParams(location.search).get('m') || 'quiet';
const w = document.getElementById('w');
for (let k = 0; k < 11; k++) { const c = document.createElement('span'); c.className = 'cell'; c.textContent = String(k % 10); w.appendChild(c); }
const C = () => w.children[0].offsetHeight || 36;
let v = 9;
const rest = (n) => { const c = C(), m = Math.round(n); for (let k = 0; k < 11; k++) w.children[k].style.transform = `translateY(${(k - m) * c}px)`; };
const place = (n) => { const c = C(); for (let k = 0; k < 11; k++) w.children[k].style.transform = `translateY(${k * c - n * c}px)`; };
rest(v);
let A = [];
const play = (f, t, paused) => {
  const K = crPath(f, t), d = K[K.length - 1][0], c = C(), t0 = performance.now();
  A.forEach((x) => x.cancel());
  A = cellsOf(K).map((k) => {
    const a = w.children[k].animate(K.map(([x, n]) => ({ offset: x / d, transform: `translateY(${k * c - n * c}px)` })), { duration: d, easing: 'linear', fill: 'both' });
    if (paused) { a.pause(); a.currentTime = 0; } else a.startTime = t0;
    return a;
  });
  if (!paused) A[0].onfinish = () => { A.forEach((x) => x.cancel()); A = []; };
};
if (mode === 'paused') play(9, 8, true);
if (mode === 'ca' || mode === 'raf') setInterval(() => {
  const f = v, t = (v + 9) % 10; v = t;
  if (f === 0) { rest(t); return; } // the 0 -> 9 wrap is a long roll in the real page; keep every roll one step here
  if (mode === 'ca') { rest(t); play(f, t, false); return; }
  let s = { value: f, velocity: 0 }, n = performance.now();
  const step = (o) => { const g = GE(s, t, o - n); n = o; s = g.state; place(s.value); if (!g.done) requestAnimationFrame(step); else rest(t); };
  requestAnimationFrame(step);
}, 1000);
