#!/usr/bin/env node
// One-off (ts-headless): run a command, sample its whole process tree with ps every 250 ms and print wall time and
// the tree's CPU seconds (the last cputime seen per pid, summed; up to 250 ms of each process's last activity is lost).
//   node treecpu.mjs <out.json> -- <cmd> [args...]
import { spawn, spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const dd = process.argv.indexOf('--');
const out = process.argv[2];
const [cmd, ...args] = process.argv.slice(dd + 1);
const secs = (t) => { const m = t.trim().match(/^(?:(\d+)-)?(?:(\d+):)?(\d+):(\d+(?:\.\d+)?)$/); if (!m) return 0; return (Number(m[1] || 0) * 86400) + (Number(m[2] || 0) * 3600) + Number(m[3]) * 60 + Number(m[4]); };
const t0 = performance.now();
const child = spawn(cmd, args, { stdio: 'inherit', env: process.env });
const seen = new Map(); // pid -> {cpu, comm}
function sample() {
  const r = spawnSync('ps', ['-A', '-o', 'pid=,ppid=,time=,comm='], { encoding: 'utf8' });
  const kids = {}, info = {};
  for (const l of r.stdout.split('\n')) { const m = l.trim().match(/^(\d+)\s+(\d+)\s+(\S+)\s+(.*)$/); if (!m) continue; (kids[m[2]] ||= []).push(m[1]); info[m[1]] = { cpu: secs(m[3]), comm: m[4] }; }
  const tree = [String(child.pid)];
  for (let i = 0; i < tree.length; i++) for (const k of kids[tree[i]] || []) tree.push(k);
  for (const p of tree) if (info[p]) { const prev = seen.get(p); if (!prev || info[p].cpu >= prev.cpu) seen.set(p, info[p]); }
}
const iv = setInterval(sample, 250);
sample();
child.on('exit', (code) => {
  clearInterval(iv);
  const wall = (performance.now() - t0) / 1000;
  const byComm = {};
  for (const v of seen.values()) { const k = v.comm.includes('Chrome') ? (v.comm.includes('Helper') ? 'chrome-helpers' : 'chrome-browser') : v.comm.split('/').pop(); byComm[k] = Math.round(((byComm[k] || 0) + v.cpu) * 100) / 100; }
  const total = Math.round([...seen.values()].reduce((a, v) => a + v.cpu, 0) * 100) / 100;
  const rec = { cmd: [cmd, ...args].join(' ').replace(/https?:\/\/(localhost|127\.0\.0\.1):\d+/g, '<origin>'), code, wallSec: Math.round(wall * 10) / 10, treeCpuSec: total, byComm, pids: seen.size };
  writeFileSync(out, JSON.stringify(rec, null, 1));
  console.log(`treecpu: wall ${rec.wallSec} s, tree CPU ${total} s (${JSON.stringify(byComm)}), ${seen.size} pids, exit ${code}`);
  process.exit(code ?? 1);
});
