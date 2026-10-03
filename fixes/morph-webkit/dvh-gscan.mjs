// For G run files: innerHeight-change frames, and whether a prevented touchmove (the jack active, i.e. C() true:
// morph target or value > 0.001) happened within 100 ms before the change. Usage: node gscan.mjs <files...>
import { readFileSync } from 'node:fs';
const tot = { files: 0, ihCh: 0, ihChJack: 0, ihChEnd: 0 }; const ex = [];
for (const file of process.argv.slice(2)) {
  let j; try { j = JSON.parse(readFileSync(file, 'utf8')); } catch { continue; }
  for (const s of j.run?.segments || []) {
    if (!s.frames || !s.touches) continue; tot.files++;
    const F = s.frames, T = s.touches.filter((x) => x[1] === 'm');
    const maxY = Math.max(...F.map((f) => f[2]));
    let ti = 0;
    for (let i = 1; i < F.length; i++) {
      if (F[i][3] === F[i - 1][3]) continue;
      tot.ihCh++;
      if (F[i][2] >= maxY - 300) tot.ihChEnd++;
      while (ti < T.length && T[ti][0] < F[i][0] - 100) ti++;
      const near = T.slice(ti).filter((x) => x[0] <= F[i][0]);
      if (near.some((x) => x[4] === 1)) { tot.ihChJack++; if (ex.length < 12) ex.push({ file: file.split('/').slice(-2).join('/'), frame: i, t: F[i][0], y: F[i][2], ih: `${F[i - 1][3]}->${F[i][3]}`, prevented: near.filter((x) => x[4]).length, moves: near.length }); }
    }
  }
}
console.log(JSON.stringify(tot)); for (const e of ex) console.log(JSON.stringify(e));
