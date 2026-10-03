// F-183 decisive local check (fix-nav-morph): fixes/nav-morph/inherit-mini.html (no Fastwork code) in the Simulator,
// and in headless Chrome when --chrome is given. Serves the page from a temp overlay dir. Prints window.__run()'s JSON.
//   node tools/lock.mjs run chrome-measure --shared --weight simulator --max-seconds 300 --owner fix-nav-morph -- \
//     node tools/sim.mjs session --functional --owner fix-nav-morph -- node fixes/nav-morph/inherit-mini-sim.mjs
import { spawn, execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, readFileSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO as WT, resolveTree } from '../../tools/lib/paths.mjs';
const { openTab, sleep } = await import(join(WT, 'tools/lib/wip.mjs'));
const OV = join(WT, 'out/f3r/minipage'); mkdirSync(OV, { recursive: true });
copyFileSync(join(WT, 'fixes/nav-morph/inherit-mini.html'), join(OV, 'f183-mini.html'));
copyFileSync(join(WT, 'fixes/nav-morph/inherit-mini.js'), join(OV, 'f183-mini.js')); // CSP: script-src 'self'
const st = join(OV, 'serve.json'); rmSync(st, { force: true });
const p = spawn(process.execPath, [join(WT, 'tools/serve.mjs'), '--root', resolveTree('site-pretty'), '--overlay', OV, '--port', '0', '--quiet', '--no-cache', '--state', st, '--vendors=local'], { stdio: ['ignore', 'ignore', 'inherit'] });
const res = {};
try {
  let s = null; for (let i = 0; i < 300 && !s; i++) { if (existsSync(st)) try { s = JSON.parse(readFileSync(st, 'utf8')); } catch {} if (!s) await sleep(100); }
  const url = `http://localhost:${s.port}/f183-mini.html`;
  execFileSync(process.execPath, [join(WT, 'tools/sim.mjs'), 'open', url], { stdio: ['ignore', 'ignore', 'inherit'] });
  await sleep(2500);
  const c = await openTab(`localhost:${s.port}/f183-mini`);
  await c.evaluate('(window.__run(), 1)');
  let out = null; for (let i = 0; i < 40 && !out; i++) { await sleep(250); out = await c.evaluate('window.__out || null'); }
  res.webkit = JSON.parse(out); c.close();
  console.log('WEBKIT', out);
} finally { p.kill(); writeFileSync(join(WT, 'out/f3r', 'inherit-mini.json'), JSON.stringify(res, null, 1)); }
