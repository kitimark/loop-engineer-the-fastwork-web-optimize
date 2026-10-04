// morph-scroll rev 4 mechanism check (iOS Simulator, Mobile Safari; no timing): no root snap, and a part-open morph
// settles to an end once the scroll rests, by the last direction. Scripted scrolls only (no touch: the settle's
// "finger down" gate needs the G driver on the phone). Per case: jump to p0, wait, jump to p1, sample p for 2 s.
// Run as the command of a FUNCTIONAL Simulator session, in the shared lane:
//   node tools/lock.mjs run chrome-measure --shared --weight simulator --max-seconds 300 --owner fix-hero-exit-threaded -- \
//     node tools/sim.mjs session --functional --owner fix-hero-exit-threaded -- node fixes/morph-scroll/settle-sim.mjs --snap <abs dir>[,<abs dir>]
// Output: out/morph-scroll/settle-sim-<stamp>.json
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, basename } from 'node:path';
import { REPO as WT, resolveTree } from '../../tools/lib/paths.mjs';
const { openTab, sleep } = await import(join(WT, 'tools/lib/wip.mjs'));

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const SNAPS = (arg('--snap') || '').split(',').filter(Boolean);
if (!SNAPS.length) throw new Error('--snap <abs snapshot dir>[,<abs dir>]');
const OUT = join(WT, 'out/morph-scroll');
mkdirSync(OUT, { recursive: true });
const STAMP = new Date().toISOString().replace(/[:.]/g, '-');
// [name, p0, p1, expected end]: the jump p0 -> p1 sets the direction
const CASES = [
  ['open from closed, rest at 0.40', 0, 0.4, 1],
  ['open from closed, rest at 0.20', 0, 0.2, 0],
  ['close from open, rest at 0.60', 1, 0.6, 0],
  ['close from open, rest at 0.80', 1, 0.8, 1],
  ['rest at 0.50 after opening', 0.3, 0.5, 1],
  ['rest at 0.50 after closing', 0.7, 0.5, 0],
];

async function server(snap, i) {
  const st = join(OUT, `serve-settle-${i}.json`); rmSync(st, { force: true });
  const p = spawn(process.execPath, [join(WT, 'tools/serve.mjs'), '--root', resolveTree('site-pretty'), '--overlay', snap, '--port', '0', '--no-cache', '--quiet', '--state', st, '--vendors=local'], { stdio: ['ignore', 'ignore', 'inherit'] });
  for (let k = 0; k < 300; k++) { if (existsSync(st)) try { return { p, ...JSON.parse(readFileSync(st, 'utf8')) }; } catch {} await sleep(100); }
  p.kill(); throw new Error('server did not start');
}
const GEO = `(() => { const e = document.querySelector('.fw-ms-end'); const t = e ? e.offsetHeight : 0; const max = document.documentElement.scrollHeight - innerHeight;
  return { t, max, y: scrollY, p: t ? +((scrollY - (max - t)) / t).toFixed(3) : null }; })()`;
const res = { tool: 'morph-scroll settle-sim (fix-hero-exit-threaded)', startedAt: new Date().toISOString(), builds: {} };
for (const [i, snap] of SNAPS.entries()) {
  const s = await server(snap, i);
  const url = `http://localhost:${s.port}/`;
  const b = (res.builds[basename(snap)] = { cases: [] });
  try {
    execFileSync(process.execPath, [join(WT, 'tools/sim.mjs'), 'open', url], { stdio: ['ignore', 'ignore', 'inherit'] });
    const c = await openTab(`localhost:${s.port}`);
    for (let k = 0; k < 40 && (await c.evaluate('document.readyState')) !== 'complete'; k++) await sleep(500);
    await sleep(2500);
    // walk down so lazy content above settles the page height, then read the root's snap setup
    for (const f of [0.25, 0.5, 0.75, 1]) { await c.evaluate(`(window.scrollTo(0, document.documentElement.scrollHeight * ${f}), 0)`); await sleep(700); }
    b.snap = await c.evaluate(`(() => { const cs = getComputedStyle(document.documentElement); const al = [...document.querySelectorAll('*')].filter((e) => { const a = getComputedStyle(e).scrollSnapAlign; return a && a !== 'none'; });
      return { rootSnapType: cs.scrollSnapType, bodySnapType: getComputedStyle(document.body).scrollSnapType, msOn: document.documentElement.classList.contains('fw-ms'), alignCount: al.length, alignSample: al.slice(0, 4).map((e) => e.className.toString().slice(0, 50)) }; })()`);
    console.log(basename(snap), 'snap', JSON.stringify(b.snap));
    const g = await c.evaluate(GEO);
    const yAt = (p) => Math.round(g.max - g.t + p * g.t);
    // far from the end: nothing may move by itself
    await c.evaluate(`(window.scrollTo(0, ${Math.round(g.max * 0.5)}), 0)`); await sleep(400);
    const a0 = await c.evaluate('scrollY'); await sleep(1500); const a1 = await c.evaluate('scrollY');
    b.midPage = { y0: a0, y1: a1, moved: a1 !== a0 };
    console.log('  mid page rest: moved', a1 !== a0);
    for (const [name, p0, p1, want] of CASES) {
      await c.evaluate(`(window.scrollTo({ top: ${yAt(p0)}, behavior: 'instant' }), 0)`); await sleep(1500);
      const before = await c.evaluate(GEO);
      await c.evaluate(`(window.scrollTo({ top: ${yAt(p1)}, behavior: 'instant' }), 0)`);
      const samples = [];
      for (const ms of [100, 150, 250, 500, 1000, 2000]) { await sleep(ms - (samples.at(-1)?.[0] ?? 0)); samples.push([ms, (await c.evaluate(GEO)).p]); }
      const end = samples.at(-1)[1];
      const ok = Math.abs(end - want) < 0.01;
      b.cases.push({ name, p0, p1, want, before: before.p, samples, end, ok });
      console.log(`  ${ok ? 'OK  ' : 'FAIL'} ${name}: p ${before.p} -> ${p1}, samples ${samples.map((x) => x[0] + 'ms ' + x[1]).join(', ')}`);
    }
    c.close();
  } finally { s.p.kill(); }
}
res.endedAt = new Date().toISOString();
const f = join(OUT, `settle-sim-${STAMP}.json`);
writeFileSync(f, JSON.stringify(res, null, 1));
console.log('WROTE', f);
