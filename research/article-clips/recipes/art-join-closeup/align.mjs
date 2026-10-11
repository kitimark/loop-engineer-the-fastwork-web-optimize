// art-join-closeup: offset (s of video) that best maps an arm's logo-x curve onto the reference's.
// usage: node align.mjs <ref.json> <arm.json> <xlo> <xhi>   prints: dt (arm time = ref time + dt), mean abs error px, n
import { readFileSync } from 'node:fs';
const [rf, af, lo, hi] = process.argv.slice(2);
const R = JSON.parse(readFileSync(rf, 'utf8')).filter(([, x]) => x != null), A = JSON.parse(readFileSync(af, 'utf8')).filter(([, x]) => x != null);
// reference time at which the (monotone part of the) curve reaches x, by interpolation; direction from first/last
const dir = Math.sign(R[R.length - 1][1] - R[0][1]);
const tAt = (C, x) => { for (let i = 1; i < C.length; i++) { const [t0, x0] = C[i - 1], [t1, x1] = C[i]; if (dir * (x - x0) >= 0 && dir * (x1 - x) >= 0 && x1 !== x0) return t0 + (t1 - t0) * (x - x0) / (x1 - x0); } return null; };
const pts = A.filter(([, x]) => x >= Number(lo) && x <= Number(hi));
const d = pts.map(([t, x]) => { const tr = tAt(R, x); return tr == null ? null : t - tr; }).filter((v) => v != null).sort((a, b) => a - b);
const med = d[Math.floor(d.length / 2)];
console.log(JSON.stringify({ dt: Number(med.toFixed(4)), n: d.length, spread: [Number(d[0].toFixed(4)), Number(d[d.length - 1].toFixed(4))] }));
