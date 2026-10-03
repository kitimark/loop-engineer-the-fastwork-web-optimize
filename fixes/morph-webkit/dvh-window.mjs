// Print frames in a y window where ih changes: node win.mjs <file> <yHi> <yLo>  (first stretch moving from yHi down to yLo)
import { readFileSync } from 'node:fs';
const j = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const F = j.frames || j.run?.segments?.[0]?.frames;
const hi = +process.argv[3], lo = +process.argv[4];
// every ih-change stretch whose y lies within [lo, hi+250]
for (let i = 1; i < F.length; i++) {
  if (F[i][3] !== F[i - 1][3] && F[i][2] <= hi + 250 && F[i][2] >= lo - 50) {
    let a = i; while (a > 1 && i - a < 25 && !(F[a][2] >= hi + 100)) a--;
    let b = i; while (b < F.length - 1 && F[b + 1][3] !== F[b][3] || (b < F.length - 1 && b - i < 4)) b++;
    console.log(`--- ih change stretch at frame ${i}`);
    for (let k = Math.max(1, i - 12); k <= Math.min(F.length - 1, b + 4); k++) {
      const f = F[k]; const ch = f[3] !== F[k - 1][3] ? ` ih ${F[k - 1][3]}->${f[3]}` : '';
      console.log(`${k} t ${f[0]} dt ${f[1]} y ${f[2]}${ch}${f[1] > 34 ? '  <-- >34' : ''}`);
    }
    i = b + 1;
  }
}
