// Per stop (downward flick that comes to rest) in a herouser record: times relative to the landing (first still frame
// after the flip), labelled by the original page's code phases (derived geometry, see classify.mjs):
// F = flip/reveal start (+0..250 ms), R = reveal end, opacity reaching 1 (flip +650..850), O = 'o' widen
// (crossing +1420..+2340), D = page drifting without a touch, '.' = other.
import fs from 'node:fs';
const j = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const fr = j.frames, S = j.touches.filter((t) => t[1] === 's'), E = j.touches.filter((t) => t[1] === 'e');
const zero = S.map((s) => [s, E.find((e) => e[0] > s[0])]).filter(([s, e]) => e && e[6] === s[6] && e[5] === s[5]);
console.log('zero-movement touch pairs (t, scrollY):', zero.map(([s, e]) => `${s[0]}-${e[0]} y${s[5]}`).join(', ') || 'none');
console.log('stop | flick touch | crossing y242 | flip y600 | landing t, y | settles at | still until next touch | 2 s after landing: >34 / >50 | long frames (+ms after landing, label) | o-widen window: frames, mean dt');
let n = 0;
for (let k = 0; k < S.length; k++) {
  const s = S[k], e = E.find((x) => x[0] > s[0]);
  if (!e || e[5] <= s[5] + 20) continue;
  const next = S[k + 1]?.[0] ?? fr.at(-1)[0];
  const seg = fr.filter((x) => x[0] > s[0] && x[0] <= next);
  const cross = seg.find((x) => x[2] >= 242)[0], flip = seg.find((x) => x[2] >= 600)[0];
  let land = null; for (let i = 1; i < seg.length; i++) if (seg[i][0] > flip && seg[i][2] === seg[i - 1][2]) { land = seg[i - 1]; break; }
  let settle = seg.at(-1); for (let i = seg.length - 1; i > 0; i--) if (seg[i][2] !== seg[i - 1][2]) { settle = seg[i]; break; }
  const w = seg.filter((x) => x[0] > land[0] && x[0] <= land[0] + 2000);
  const lab = (x) => {
    const t = x[0];
    if (t - flip <= 250) return 'F';
    if (t - flip >= 650 && t - flip <= 850) return 'R';
    if (t - cross >= 1420 && t - cross <= 2340) return 'O';
    if (t <= settle[0]) return 'D';
    return '.';
  };
  const ow = fr.filter((x) => x[0] > cross + 1420 && x[0] <= Math.min(cross + 2340, next));
  n++;
  console.log([n, s[0], `${cross} (+${cross - s[0]})`, `${flip}`, `${land[0]}, y${land[2]}`, `y${settle[2]} @+${settle[0] - land[0]}`, `${next - land[0]} ms`,
    `${w.filter((x) => x[1] > 34).length} / ${w.filter((x) => x[1] > 50).length}`,
    w.filter((x) => x[1] > 34).map((x) => `${x[1]}@+${x[0] - land[0]}${lab(x)}`).join(' ') || '-',
    `${ow.length}, ${(ow.reduce((a, q) => a + q[1], 0) / ow.length).toFixed(1)} ms (max ${Math.max(...ow.map((q) => q[1]))})`].join(' | '));
}
