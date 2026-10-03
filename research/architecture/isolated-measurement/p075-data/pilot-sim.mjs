// T-029 countdown isolation pilot, Simulator part (arch-isolated-measure). Counts only (F-084). Adapted from
// fixes/cd-roll-ca/sim-counts.mjs (window counts) with the freeze scoped to the hero clock subtree.
// Run as the command of a FUNCTIONAL sim session in the shared lane. Arms: label=overlayDir ('-' = baseline) =jsSha12.
//   node pilot-sim.mjs <out.json> <reps> C=-=4606120cf392 Vf=<dir>=638b8e03e81c C6=<dir>=5e37af69bcc4 V7=<dir>=73dff152e454
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
const WT = '<checkout>';
const S = '<scratch>';
const { openTab, sleep } = await import(join(WT, 'tools/lib/wip.mjs'));
const { resolveTree } = await import(join(WT, 'tools/lib/paths.mjs'));
const OUTF = process.argv[2];
const REPS = Number(process.argv[3] || 2);
const ARMS = process.argv.slice(4).map((s) => { const [label, dir, sha] = s.split('='); return { label, dir: dir === '-' ? null : dir, sha }; });
const WIN = 4000;
const NODE = '_app/immutable/nodes/2.DyWL8TcE.js';
const BASE = resolveTree('site-pretty');
const t00 = Date.now();

const KEEP_FREEZE = `(() => { const hero = [...document.querySelectorAll('[role=timer]')].find((t) => !t.classList.contains('inverse') && t.getBoundingClientRect().width > 0);
  if (!hero) return { error: 'no hero clock' }; hero.setAttribute('data-iso-keep', '');
  const inKeep = (el) => !!(el && el.closest && el.closest('[data-iso-keep]'));
  const st = document.createElement('style'); st.textContent = '*:not([data-iso-keep], [data-iso-keep] *) { animation-play-state: paused !important; }'; document.head.append(st);
  const orig = Element.prototype.animate; Element.prototype.animate = function (...a) { const an = orig.apply(this, a); if (!inKeep(this)) an.pause(); return an; };
  let n = 0, kept = 0; for (const a of document.getAnimations()) { const t = a.effect && a.effect.target; if (inKeep(t)) { kept++; continue; } a.pause(); n++; }
  let s = 0; for (const svg of document.querySelectorAll('svg')) if (!inKeep(svg) && svg.querySelector('animate, animateTransform, animateMotion, set')) { svg.pauseAnimations(); s++; }
  return { paused: n, keptRunning: kept, smil: s }; })()`;
// ticks: mutation bursts in the hero clock subtree separated by > 300 ms
const INSTALL = `(() => { const hero = [...document.querySelectorAll('[role=timer]')].find((t) => !t.classList.contains('inverse') && t.getBoundingClientRect().width > 0);
  if (!hero) return 'no hero'; const X = window.__pt = { ticks: 0, muts: 0, last: -1e9 };
  new MutationObserver((ms) => { X.muts += ms.length; const t = performance.now(); if (t - X.last > 300) X.ticks++; X.last = t; })
    .observe(hero, { subtree: true, childList: true, characterData: true, attributes: true });
  return 'ok'; })()`;
function count(records, range) {
  const c = { RenderingFrame: 0, RecalculateStyles: 0, Layout: 0, Paint: 0, Composite: 0, FireAnimationFrame: 0, countdownRaf: 0, framesWithRecalc: 0 };
  const isCd = (r) => r.type === 'FunctionCall' && /nodes\/2\.DyWL8TcE\.js/.test(r.data?.scriptName || '') && r.data.scriptLine >= range[0] && r.data.scriptLine <= range[1];
  const walk = (r, F) => {
    if (r.type in c) c[r.type]++;
    if (r.type === 'FireAnimationFrame' && (r.children || []).some(isCd)) c.countdownRaf++;
    if (r.type === 'RecalculateStyles' && F) F.recalc = true;
    for (const ch of r.children || []) walk(ch, F);
  };
  for (const r of records) { const F = r.type === 'RenderingFrame' ? {} : null; walk(r, F); if (F && F.recalc) c.framesWithRecalc++; }
  return c;
}
async function server(a) {
  const st = join(S, `serve-sim-${a.label}.json`); rmSync(st, { force: true });
  const args = [join(WT, 'tools/serve.mjs'), '--root', BASE, '--port', '0', '--quiet', '--no-cache', '--state', st, '--vendors=local'];
  if (a.dir) args.push('--overlay', a.dir);
  const p = spawn(process.execPath, args, { stdio: ['ignore', 'ignore', 'inherit'] });
  for (let i = 0; i < 300; i++) { if (existsSync(st)) try { return { p, ...JSON.parse(readFileSync(st, 'utf8')) }; } catch {} await sleep(100); }
  p.kill(); throw new Error(a.label + ' server did not start');
}
const res = { tool: 'scratch pilot-sim.mjs (arch-isolated-measure)', windowMs: WIN, reps: REPS, startedAt: new Date().toISOString(), arms: ARMS.map((a) => ({ label: a.label, sha: a.sha })), rows: [] };
const servers = {};
try {
  for (const a of ARMS) {
    const s = await server(a); servers[a.label] = s;
    const url = `http://localhost:${s.port}/`;
    const js = await (await fetch(new URL(NODE, url))).text();
    const sha = createHash('sha256').update(js).digest('hex').slice(0, 12);
    if (sha !== a.sha) { console.error(`VOID ${a.label}: serves ${sha}, expected ${a.sha}`); process.exitCode = 3; throw new Error('hash'); }
    const L = js.split('\n'); s.range = [L.findIndex((l) => l.startsWith('var UE = { stiffness')) + 1, L.findIndex((l) => l.startsWith('var lD = h('))];
    console.log('ARM', a.label, sha, 'countdown lines', s.range.join('-'));
  }
  for (let rep = 1; rep <= REPS; rep++) {
    const order = rep % 2 ? ARMS : [...ARMS].reverse();
    for (const a of order) for (const mode of rep % 2 ? ['full', 'freeze'] : ['freeze', 'full']) {
      const s = servers[a.label]; const url = `http://localhost:${s.port}/?r=${rep}${mode[0]}`;
      execFileSync(process.execPath, [join(WT, 'tools/sim.mjs'), 'open', url], { stdio: ['ignore', 'ignore', 'inherit'] });
      const c = await openTab(`localhost:${s.port}`);
      for (let i = 0; i < 40 && (await c.evaluate('document.readyState')) !== 'complete'; i++) await sleep(300);
      await sleep(1500);
      let recs = [];
      c.on((m) => { if (m.method === 'Timeline.eventRecorded') recs.push(m.params.record); });
      await c.send('Page.enable'); await c.send('Timeline.enable'); await c.send('Timeline.setInstruments', { instruments: ['Timeline'] });
      await c.evaluate('(window.scrollTo(0, 0), 0)'); await sleep(1000);
      const frozen = mode === 'freeze' ? await c.evaluate(KEEP_FREEZE) : null;
      const inst = await c.evaluate(INSTALL);
      await sleep(500);
      recs = []; const k0 = await c.evaluate('[window.__pt.ticks, window.__pt.muts]');
      await c.send('Timeline.start', { maxCallStackDepth: 1 });
      await sleep(WIN);
      await c.send('Timeline.stop');
      const k1 = await c.evaluate('[window.__pt.ticks, window.__pt.muts]');
      await sleep(300);
      const row = { rep, arm: a.label, mode, frozen, inst, ticks: k1[0] - k0[0], muts: k1[1] - k0[1], records: recs.length, counts: count(recs, s.range) };
      res.rows.push(row);
      console.log(JSON.stringify({ rep, arm: a.label, mode, ticks: row.ticks, muts: row.muts, c: row.counts, frozen, s: Math.round((Date.now() - t00) / 1000) }));
      await c.send('Timeline.disable').catch(() => {});
      await c.evaluate("(setTimeout(() => { location.href = 'about:blank'; }, 50), 0)").catch(() => {}); await sleep(400); // park: blank tabs are never picked (I-037)
      c.close();
      writeFileSync(OUTF, JSON.stringify({ ...res, partial: true }, null, 1));
    }
  }
} finally { for (const s of Object.values(servers)) s.p.kill(); }
res.endedAt = new Date().toISOString();
writeFileSync(OUTF, JSON.stringify(res, null, 1));
console.log('WROTE', OUTF);
