#!/usr/bin/env node
// Run N simultaneous A/A measurements (plain baseline vs itself), each exactly like `fix.mjs ab --aa`
// (two own mirror servers with the ab defaults --vendors=local --https --latency 150, verify.mjs mobile 6x),
// but each with its own Chrome profile dir, its own out dir, and its own PRIVATE lock dir.
//
// Locking: the caller must hold the real shared chrome-measure lease (lock.mjs acquire ... --owner
// measure-parallel) for the whole experiment. Each child verify gets FW_STATE_DIR=<private dir>, so its
// own process lock is taken instantly in that private dir and, above all, its exit can't delete the
// shared lease (I-005: a same-owner re-entrant verify drops the outer lease on exit). No --no-lock.
//
// Usage: node par.mjs --conc 2 --runs 3 --tag c2 --scratch <dir> [--stagger-ms 0]
// Writes <scratch>/<tag>/p<i>/verify.json, <scratch>/<tag>/p<i>/log.jsonl (timestamped stdout), <scratch>/<tag>/meta.json
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import os from 'node:os';

const WT = new URL('../../..', import.meta.url).pathname.replace(/\/$/, '');
const { resolveTree } = await import(join(WT, 'tools/lib/paths.mjs'));
const argv = process.argv.slice(2);
const opt = (n, d) => (argv.includes(`--${n}`) ? argv[argv.indexOf(`--${n}`) + 1] : d);
const CONC = Number(opt('conc', 1)), RUNS = Number(opt('runs', 3)), TAG = opt('tag', `c${CONC}`);
const SCRATCH = opt('scratch');
const STAGGER = Number(opt('stagger-ms', 0));
if (!SCRATCH) { console.error('--scratch <dir> required'); process.exit(2); }
const BASE = resolveTree('site-pretty');
const dir = join(SCRATCH, TAG);
mkdirSync(dir, { recursive: true });

async function startServer(stateFile) {
  rmSync(stateFile, { force: true });
  const a = [join(WT, 'tools/serve.mjs'), '--root', BASE, '--port', '0', '--quiet', '--state', stateFile, '--vendors=local', '--https', '--latency', '150'];
  const proc = spawn(process.execPath, a, { stdio: ['ignore', 'ignore', 'inherit'], cwd: WT });
  for (let i = 0; i < 200; i++) {
    if (existsSync(stateFile)) { try { return { proc, ...JSON.parse(readFileSync(stateFile, 'utf8')) }; } catch {} }
    if (proc.exitCode !== null) throw new Error('server exited');
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('server did not start');
}

const servers = [];
const killAll = () => { for (const p of [...servers, ...children]) try { p.kill(); } catch {} };
const children = [];
process.on('exit', killAll);
for (const s of ['SIGINT', 'SIGTERM']) process.once(s, () => { killAll(); process.exit(130); });

// servers first (sequentially: avoids the I-001 concurrent-cert-generation race), then all verifies at once
const procs = [];
for (let i = 0; i < CONC; i++) {
  const pd = join(dir, `p${i}`);
  rmSync(pd, { recursive: true, force: true });
  mkdirSync(pd, { recursive: true });
  const a = await startServer(join(pd, 'serve-base.json'));
  const b = await startServer(join(pd, 'serve-base2.json'));
  servers.push(a.proc, b.proc);
  procs.push({ i, pd, base: a.url, base2: b.url });
}
const meta = { tag: TAG, conc: CONC, runs: RUNS, stagger: STAGGER, startedAt: new Date().toISOString(), loadStart: os.loadavg(), procs: [] };
await Promise.all(procs.map(async (p) => {
  await new Promise((r) => setTimeout(r, p.i * STAGGER));
  const lockDir = join(p.pd, 'private-lock');
  const vArgs = [join(WT, 'tools/verify.mjs'), `base=${p.base}`, `base2=${p.base2}`, '--runs', String(RUNS), '--cpu', '6', '--viewport', 'mobile',
    '--out', p.pd, '--result', join(p.pd, 'verify.json'), '--owner', 'measure-parallel', '--profile', join(SCRATCH, 'profiles', `p${p.i}`)];
  const t0 = new Date().toISOString();
  const child = spawn(process.execPath, vArgs, { cwd: WT, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, FW_STATE_DIR: lockDir, FW_LOCK_OWNER: 'measure-parallel' } });
  children.push(child);
  const log = join(p.pd, 'log.jsonl');
  child.stdout.on('data', (d) => appendFileSync(log, JSON.stringify({ ts: new Date().toISOString(), s: String(d) }) + '\n'));
  child.stderr.on('data', (d) => appendFileSync(log, JSON.stringify({ ts: new Date().toISOString(), err: String(d) }) + '\n'));
  const code = await new Promise((r) => child.on('exit', r));
  meta.procs.push({ i: p.i, start: t0, end: new Date().toISOString(), code });
  console.log(`[${TAG}] p${p.i} exit ${code}`);
}));
meta.endedAt = new Date().toISOString();
meta.loadEnd = os.loadavg();
writeFileSync(join(dir, 'meta.json'), JSON.stringify(meta, null, 1));
killAll();
console.log(`[${TAG}] done ${meta.startedAt} .. ${meta.endedAt}`);
