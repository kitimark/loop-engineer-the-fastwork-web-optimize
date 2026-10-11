import fs from 'node:fs';
const j = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const seg = j.run?.segments?.find((s) => (s.marks || []).length) || j.run?.segments?.[0] || j;
const fr = seg.frames; let i = 1; while (fr[i][2] === fr[i - 1][2]) i++;
const t = fr[i][0]; console.log(Math.round(t - 300));
// print y path: time from t-300, y, dt for frames with dt>34 up to 3s
let prev; for (const f of fr) { if (f[0] < t - 300 || f[0] > t + 2600) continue; const c = f[2] < 600 !== (prev?.[2] < 600) && prev ? 'FLIP' : ''; if (f[1] > 34 || c || Math.round(f[0]-t)%250<17) console.error(Math.round(f[0] - t + 300), f[2], Math.round(f[1]), c); prev = f; }
