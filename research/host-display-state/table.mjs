import { readFileSync } from 'node:fs';
const rows = readFileSync(process.argv[2], 'utf8').trim().split('\n').map((l) => JSON.parse(l));
const st = (s) => s.display === 'on' ? 'on' : s.display === 'off' ? 'off' : '?';
console.log('| # | hold (topic, store) | span (UTC) | n, idle | display | wake | power | base fps | fix fps | pmset transitions inside |');
console.log('|---|---|---|---|---|---|---|---|---|---|');
rows.forEach((r, i) => {
  const m = r.file.match(/(?:worktrees\/(agent-[0-9a-f]+)\/)?out\/ab\/([^/]+)\//);
  const store = m[1] ? `wt ${m[1].slice(6, 13)}` : 'main';
  const span = `${r.start.slice(5, 10)} ${r.start.slice(11, 16)}-${r.end.slice(11, 16)}`;
  const disp = st(r.s0) === st(r.s1) ? st(r.s0) : `${st(r.s0)} → ${st(r.s1)}`;
  const wake = r.s0.wake === r.s1.wake ? r.s0.wake : `${r.s0.wake} → ${r.s1.wake}`;
  const pw = r.s0.power === r.s1.power ? r.s0.power : `${r.s0.power} → ${r.s1.power}`;
  console.log(`| ${i + 1} | ${m[2]} (${store}) | ${span} | ${r.runs}, ${r.idle ?? 'pre-I-002'} | ${disp} | ${wake} | ${pw} | ${r.baseFps} | ${r.fixFps ?? '—'} | ${r.trans.join('; ') || '—'} |`);
});
