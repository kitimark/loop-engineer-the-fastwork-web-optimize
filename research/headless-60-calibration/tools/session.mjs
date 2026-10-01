#!/usr/bin/env node
// One-off session driver for h60.mjs (cal-headless60). Starts the mirror servers (CLAUDE.md's "lags like live":
// --vendors=local --https --latency 150, port 0) and N parallel h60.mjs processes, each with ITS OWN servers, profile and
// Chrome, then stops everything it started. Run inside ONE exclusive chrome-measure hold (lock.mjs run ... --).
//
//   node session.mjs --arms base=,fix=fixes/<name>/overlay [--par 1] --tag <t> -- <h60.mjs args, e.g. --cpu 6 --runs 5>
//
// An arm with an overlay gets a served-file check first: every overlay file must come back with
// x-mirror-source: overlay and the overlay's bytes (as fix.mjs ab's check).
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, rmSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { dirname, resolve, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { servedGet } from '../../../tools/lib/served-get.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../../..');
const argv = process.argv.slice(2);
const dd = argv.indexOf('--');
const own = dd < 0 ? argv : argv.slice(0, dd), pass = dd < 0 ? [] : argv.slice(dd + 1);
const opt = (n, d) => { const i = own.indexOf(`--${n}`); return i < 0 ? d : own[i + 1]; };
const arms = String(opt('arms', 'base=')).split(',').map((a) => { const [label, ov] = a.split('='); return { label, overlay: ov ? resolve(REPO, ov) : null }; });
const PAR = Number(opt('par', 1));
const TAG = opt('tag', 'h60');
const OUTDIR = join(REPO, 'out', 'h60');
mkdirSync(OUTDIR, { recursive: true });
const procs = [];
const killAll = () => { for (const p of procs) { try { p.kill('SIGTERM'); } catch {} } };
process.on('exit', killAll);
for (const s of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(s, () => process.exit(130));

async function server(stateFile, overlay) {
  rmSync(stateFile, { force: true });
  const a = [join(REPO, 'tools', 'serve.mjs'), '--root', 'site-pretty', ...(overlay ? ['--overlay', overlay] : []), '--port', '0', '--quiet', '--state', stateFile, '--vendors=local', '--https', '--latency', '150'];
  const p = spawn(process.execPath, a, { stdio: ['ignore', 'ignore', 'inherit'], cwd: REPO });
  procs.push(p);
  for (let i = 0; i < 300; i++) {
    if (existsSync(stateFile)) { try { return JSON.parse(readFileSync(stateFile, 'utf8')); } catch {} }
    if (p.exitCode !== null) throw new Error(`server exited ${p.exitCode}`);
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('server did not start');
}
const walk = (d) => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
async function servedCheck(url, overlay) {
  const out = [];
  for (const f of walk(overlay)) {
    const rel = relative(overlay, f);
    const r = await servedGet(url + rel);
    const ok = r.status === 200 && r.headers['x-mirror-source'] === 'overlay' && createHash('sha256').update(r.body).digest('hex') === createHash('sha256').update(readFileSync(f)).digest('hex');
    out.push({ path: '/' + rel, ok, sha256: createHash('sha256').update(readFileSync(f)).digest('hex').slice(0, 12) });
    if (!ok) throw new Error(`served-file check failed for /${rel} on ${url}`);
  }
  return out;
}

const t0 = Date.now();
const jobs = [];
for (let i = 0; i < PAR; i++) {
  const tag = PAR > 1 ? `${TAG}-p${i + 1}` : TAG;
  const urls = [];
  for (const a of arms) {
    const st = await server(join(OUTDIR, `serve-${tag}-${a.label}.json`), a.overlay);
    if (a.overlay) console.log(`[${tag}] ${a.label}: served-file check ${JSON.stringify(await servedCheck(st.url, a.overlay))}`);
    urls.push(`${a.label}=${st.url}`);
  }
  jobs.push({ tag, args: [join(HERE, 'h60.mjs'), ...urls, ...pass, '--tag', tag, '--out', join(OUTDIR, `${tag}.json`)] });
}
console.log(`session ${TAG}: ${PAR} process(es), arms ${arms.map((a) => a.label + (a.overlay ? '=' + relative(REPO, a.overlay) : '')).join(', ')}, h60 args ${pass.join(' ')}`);
const codes = await Promise.all(jobs.map((j) => new Promise((res) => {
  const p = spawn(process.execPath, j.args, { stdio: ['ignore', 'pipe', 'inherit'], cwd: REPO });
  procs.push(p);
  p.stdout.on('data', (b) => process.stdout.write(PAR > 1 ? String(b).replace(/^(?=.)/gm, `{${j.tag}} `) : b));
  p.on('exit', (c) => res(c));
})));
console.log(`session ${TAG} done in ${Math.round((Date.now() - t0) / 1000)} s, exit codes ${codes.join(',')}`);
killAll();
process.exit(codes.some((c) => c) ? 1 : 0);
