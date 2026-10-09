// people-blink mechanism reader for pb-frames.mjs records (Simulator): per load and phase, when #people got .is-visible
// (page ms after the phase mark, scrollY), the scroll speed over the frame before the flip, whether data-fw-reveal was
// set (B2/B3 gate), the card's transitions that started, and the deck photo loads (before the first phase = preloaded).
// usage: node fixes/people-blink/pb-mech.mjs out/people-blink/<tag>/pb.json
import { readFileSync } from 'node:fs';
const r = JSON.parse(readFileSync(process.argv[2], 'utf8'));
for (const L of r.loads) {
  const p0 = L.geom?.perf0 ?? 0;
  const mk = L.mk.map(([t, , , n]) => [t, n]);
  const phases = mk.filter(([, n]) => !n.includes(':') && !['start', 'refs', 'stop'].includes(n));
  const firstPhase = phases[0]?.[0] ?? Infinity;
  const photos = L.ev.filter(([, e, , s]) => e === 'imgload' && /post-|service-/.test(s));
  const pre = photos.filter(([t]) => t < firstPhase).length;
  console.log(`== ${L.arm}${L.rep}: deck photo loads before the first phase ${pre}, during phases ${photos.length - pre}`);
  for (let k = 0; k < phases.length; k++) {
    const [t0, name] = phases[k], t1 = phases[k + 1]?.[0] ?? mk.find(([t, n]) => n === 'refs')?.[0] ?? Infinity;
    const m = L.m.filter(([t]) => t >= t0 && t < t1), ev = L.ev.filter(([t]) => t >= t0 && t < t1);
    const flips = m.filter(([, n, a, d]) => /section#people/.test(n) && a === 'class' && /[+-]is-visible/.test(d));
    const attr = m.filter(([, , a]) => a === 'data-fw-reveal');
    const tr = ev.filter(([, e, n]) => e === 'transitionstart' && /future-card/.test(n)).map(([t, , , p]) => `${p}@${Math.round(t - t0)}`);
    const f = L.f.filter(([t]) => t >= t0 && t < t1);
    for (const fl of flips) {
      const i = f.findIndex(([t]) => t >= fl[0]);
      const a = f[i - 2], b = f[i - 1];
      const v = a && b ? (b[2] - a[2]) / (b[0] - a[0]) : null;
      console.log(`  ${name}: ${fl[3]} at +${Math.round(fl[0] - t0)} ms y ${Math.round(b?.[2] ?? NaN)}, speed ${v == null ? '?' : v.toFixed(2)} px/ms`);
    }
    console.log(`  ${name}: data-fw-reveal ${attr.map(([t, , , v]) => `${v}@${Math.round(t - t0)}`).join(' ') || 'never'}; card transitions ${tr.join(' ') || 'none'}; max y ${Math.round(Math.max(0, ...f.map((x) => x[2])))}`);
  }
}
