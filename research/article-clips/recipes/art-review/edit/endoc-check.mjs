// edit-article-p1 (read-only): clip 4 / Day 7 numbers from the endoc frame logs. Windows by page marks:
// take = (O1, after-1s] as wc-read.mjs; approx clip windows = (O1 - 0.3 s, O1 + 12.7 s] and (O1 - 0.3 s, O1 + 4.2 s].
import fs from 'node:fs';
const DIR = '.claude/worktrees/agent-a4147eb3c10989361/out/wc/runs';
for (const id of ['20261010T125906Z-ar-endoc-orig', '20261010T130126Z-ar-endoc-g0m', '20261010T130503Z-ar-endoc-orig', '20261010T130321Z-ar-endoc-g0m']) {
  const r = JSON.parse(fs.readFileSync(`${DIR}/${id}.json`, 'utf8'));
  const seg = r.run.segments.find((s) => (s.marks || []).length);
  const m = (n) => seg.marks.find((x) => x[1] === n)?.[0];
  const o1 = m('O1-open-fast-60px-50ms'), a1 = m('after-1s');
  const st = (a, b) => { const f = seg.frames.filter((x) => x[0] > a && x[0] <= b); return `n ${f.length} >34 ${f.filter((x) => x[1] > 34).length} >50 ${f.filter((x) => x[1] > 50).length} >100 ${f.filter((x) => x[1] > 100).length} max ${Math.round(Math.max(...f.map((x) => x[1])))}`; };
  console.log(id.slice(9, 16), id.slice(-4), '| take', ((a1 - o1) / 1000).toFixed(2), 's', st(o1, a1), '| 13 s', st(o1 - 300, o1 + 12700), '| 4.5 s', st(o1 - 300, o1 + 4200));
}
