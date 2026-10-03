// Runs inside a shared-lane hold: start one server per arm, hash-check, run pilot-chrome.mjs for one mode, kill servers.
// node chrome-hold.mjs <mode> <out.json> <reps> label=dir|-=sha12 ...
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
const WT = '<checkout>';
const S = '<scratch>';
const [mode, out, reps, ...armArgs] = process.argv.slice(2);
const arms = armArgs.map((s) => { const [label, dir, sha] = s.split('='); return { label, dir: dir === '-' ? null : dir, sha }; });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const procs = [];
let code = 0;
try {
  const builds = [];
  for (const a of arms) {
    const st = `${S}/serve-${a.label}.json`; rmSync(st, { force: true });
    const args = [`${WT}/tools/serve.mjs`, '--root', 'site-pretty', '--port', '0', '--quiet', '--no-cache', '--vendors=local', '--state', st];
    if (a.dir) args.push('--overlay', a.dir);
    const p = spawn(process.execPath, args, { cwd: WT, stdio: ['ignore', 'ignore', 'inherit'] }); procs.push(p);
    let info = null;
    for (let i = 0; i < 300 && !info; i++) { if (existsSync(st)) try { info = JSON.parse(readFileSync(st, 'utf8')); } catch {} if (!info) await sleep(100); }
    if (!info) throw new Error(`${a.label} server did not start`);
    const url = `http://localhost:${info.port}/`;
    const js = await (await fetch(new URL('_app/immutable/nodes/2.DyWL8TcE.js', url))).text();
    const sha = createHash('sha256').update(js).digest('hex').slice(0, 12);
    console.log('ARM', a.label, sha, sha === a.sha ? 'ok' : `VOID expected ${a.sha}`);
    if (sha !== a.sha) { code = 3; throw new Error('hash mismatch'); }
    builds.push('--build', `${a.label}=${url}`);
  }
  const r = spawnSync(process.execPath, [`${S}/pilot-chrome.mjs`, '--out', out, '--modes', mode, '--reps', reps, ...builds], { stdio: 'inherit' });
  code = r.status ?? 1;
} catch (e) { console.error(String(e.message || e)); if (!code) code = 1; }
finally { for (const p of procs) p.kill(); }
process.exit(code);
