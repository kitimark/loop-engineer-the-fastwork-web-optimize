// moving fps (moving frames / sum of their dt) and slow share per P-124 record: G sentinel reference (P-129 rev 2, C3)
import fs from 'node:fs';
const dir = process.argv[2];
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json')).sort()) {
  const fr = JSON.parse(fs.readFileSync(`${dir}/${f}`, 'utf8')).run.segments[0].frames;
  let n = 0, sum = 0, slow = 0;
  for (let i = 1; i < fr.length; i++) if (fr[i][2] !== fr[i - 1][2]) { n++; sum += fr[i][1]; if (fr[i][1] > 34) slow++; }
  console.log(f, 'moving fps', (1000 * n / sum).toFixed(1), 'slow share', (100 * slow / n).toFixed(2) + ' %');
}
