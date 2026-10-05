#!/usr/bin/env node
// toolbar-resize page-side arm card driver (P-id from ops; from sim-bisect115.mjs 4e1077d555cd): Simulator Timeline
// mechanism ratios of the in-page arms in pgp-inject.mjs on v9-final as served (fixes/v9-best overlay, JS 647c9ef2b1e2,
// CSS e1359ab9994a). One normal exclusive hold (gesture --timeline is refused in shared and --no-timing slots), <= 10 min:
//   node tools/lock.mjs run chrome-measure --max-seconds 600 --owner fix-toolbar-resize -- sh -c \
//     'node tools/fix.mjs serve v9-best > out/toolbar-resize/servepgp.log 2>&1 & S=$!; \
//      node tools/wait.mjs serve out/serve-v9-best.json --pid $S --owner fix-toolbar-resize --timeout 60 && \
//      SB_BUDGET_S=500 node tools/sim.mjs session --owner fix-toolbar-resize -- \
//        node fixes/toolbar-resize/sim-pgp.mjs <step> ...; E=$?; kill $S; exit $E'
// step = <arm>:H<n>, arm C (control) | nvc | nvn | tps | tp | vu0 | trk | pbx (trk/pbx only if the lead signs the
// literal arm list). Steps: 1. served bytes through the http twin (hash + x-mirror-source overlay; exit 26 on a
// mismatch); 2. wda start; 3. per run: sim.mjs open, sim.mjs gesture flick-hero-v1.json --timeline --inject
// pgp-inject.mjs (arm via $PGP_ARM); 4. after the FIRST run, a format gate: an inject value with ioInstalled, a census
// (vc1) and docH0 > 0, else STOP exit 27 before any further run; 5. budget stop (< 45 s left: the rest is logged as
// dropped; a further hold needs the lead's OK).
// Output: out/toolbar-resize/simpgp/ g-<run>.json, tl-<run>.json, runs.jsonl. Gate: check-pgp.mjs. Score: the frozen
// score-bisect.mjs (cb6f0c97b81b) on the same folder.
import { spawnSync } from 'node:child_process';
import { readFileSync, mkdirSync, appendFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
const WT = new URL('../..', import.meta.url).pathname;
const D = join(WT, 'out/toolbar-resize/simpgp'); mkdirSync(D, { recursive: true });
const STATE = join(WT, 'out/serve-v9-best.json');
const WANT = { css: 'e1359ab9994a', js: '647c9ef2b1e2' };
export const ARMS = ['C', 'nvc', 'nvn', 'tps', 'tp', 'vu0', 'trk', 'pbx'];
const INJ = join(WT, 'fixes/toolbar-resize/pgp-inject.mjs');
const SCRIPT = join(WT, 'fixes/toolbar-resize/flick-hero-v1.json');
const sha = (b) => createHash('sha256').update(b).digest('hex').slice(0, 12);
export const firstRunWhy = (v) => {
  const why = [];
  if (!v || typeof v !== 'object') return ['no inject value'];
  if (!v.ioInstalled) why.push('no showcase IO');
  if (!Array.isArray(v.vc1)) why.push('no census');
  if (!(v.docH0 > 0)) why.push(`docH0 ${v.docH0}`);
  return why;
};
if (import.meta.url === `file://${process.argv[1]}`) {
  const injSha = sha(readFileSync(INJ)), scriptSha = sha(readFileSync(SCRIPT));
  const t0 = Date.now(), budget = Number(process.env.SB_BUDGET_S || 285) * 1000;
  const sh = (args) => { const r = spawnSync('node', args, { cwd: WT, encoding: 'utf8', maxBuffer: 64 << 20 }); const out = `${r.stdout || ''}${r.stderr || ''}`.trim().split('\n'); console.log('  ' + out.slice(-2).join('\n  ')); return r.status; };
  const log = (o) => appendFileSync(join(D, 'runs.jsonl'), JSON.stringify({ at: new Date().toISOString(), ...o }) + '\n');
  const st = JSON.parse(readFileSync(STATE, 'utf8'));
  const hash = async (p) => { const res = await fetch(`http://localhost:${st.httpTwin}${p}`); return { h: sha(Buffer.from(await res.arrayBuffer())), source: res.headers.get('x-mirror-source') }; };
  const served = { css: await hash('/_app/immutable/assets/2.gBuqKVzi.css'), js: await hash('/_app/immutable/nodes/2.DyWL8TcE.js'), port: st.httpTwin };
  log({ served, injectSha: injSha, scriptSha });
  if (served.css.h !== WANT.css || served.js.h !== WANT.js || served.css.source !== 'overlay' || served.js.source !== 'overlay') { console.log(`STOP served bytes: ${JSON.stringify(served)}`); process.exit(26); }
  console.log(`served bytes ok: css ${served.css.h} js ${served.js.h}; inject ${injSha}; script ${scriptSha}`);
  console.log('wda start:'); sh(['tools/sim.mjs', 'wda', 'start']);
  const steps = process.argv.slice(2);
  for (const [i, s] of steps.entries()) {
    if (budget - (Date.now() - t0) < 45000) { console.log(`STOP budget before ${s}`); log({ dropped: steps.slice(i) }); break; }
    const m = s.match(/^(\w+):H(\d+)$/); if (!m || !ARMS.includes(m[1])) { console.log(`bad step ${s}`); continue; }
    const name = `${m[1]}-H${m[2]}`, F = join(D, `g-${name}.json`), TL = join(D, `tl-${name}.json`);
    if (existsSync(F)) { console.log(`exists ${F}`); continue; }
    process.env.PGP_ARM = m[1] === 'C' ? 'none' : m[1];
    const o = sh(['tools/sim.mjs', 'open', `http://localhost:${st.httpTwin}/`]);
    const g = sh(['tools/sim.mjs', 'gesture', SCRIPT, '--label', `pgp-${name}`, '--out', F, '--timeline', TL, '--inject', INJ]);
    let inj = null; try { const gj = JSON.parse(readFileSync(F, 'utf8')); inj = (gj.run?.inject || gj.inject || [])[0]?.value ?? null; if (typeof inj === 'string') inj = JSON.parse(inj); } catch {}
    console.log(`SB ${name} open ${o} gesture ${g} t+${Math.round((Date.now() - t0) / 1000)} s inject ${JSON.stringify(inj).slice(0, 300)}`);
    log({ step: s, name, open: o, gesture: g, inject: inj });
    if (i === 0) { const why = firstRunWhy(inj); if (why.length) { console.log(`STOP first-run gate: ${why.join('; ')}`); log({ stop: 'first-run gate', why }); process.exit(27); } }
  }
}
