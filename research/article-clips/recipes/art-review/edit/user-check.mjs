// edit-article-p1 (read-only): the user's own records (herouser): window first touch -> last touch + 3 s, logged span.
import fs from 'node:fs';
const DIR = '.claude/worktrees/agent-a4147eb3c10989361/out/wc/runs';
for (const id of ['20261010T104514Z-ar-herouser-orig', '20261010T104634Z-ar-herouser-g0m']) {
  const r = JSON.parse(fs.readFileSync(`${DIR}/${id}.json`, 'utf8'));
  const fr = r.frames || r.run.segments[0].frames; const ts = (r.touches || []).map((t) => t[0]);
  const a = Math.min(...ts) - 0.001, b = Math.max(...ts) + 3000; const w = fr.filter((f) => f[0] > a && f[0] <= b);
  console.log(id.slice(0, 16), 'window', ((b - a) / 1000).toFixed(1), 's; logged in window', ((w.at(-1)[0] - a) / 1000).toFixed(1), 's; last frame t', (fr.at(-1)[0] / 1000).toFixed(1), 'n', w.length, '>34', w.filter((f) => f[1] > 34).length, '>50', w.filter((f) => f[1] > 50).length, 'worst', Math.round(Math.max(...w.map((f) => f[1]))));
}
