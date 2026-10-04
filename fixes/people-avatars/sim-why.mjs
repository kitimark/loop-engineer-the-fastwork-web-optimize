// people-avatars: what makes WebKit lay out the whole view about every frame while #people is on screen and the O is
// at rest (sim-o.mjs "still": ~73 Layouts / 2 s, root 430x775, with or without the O's transitions)? Counts only, no
// timing (F-084). At three positions (people: title mid-screen with the O open; above: 2 screens above the title;
// below: 3 screens below it) it lists document.getAnimations() (target, kind, property/name, state) and counts
// Layout / Paint in a 2 s Timeline with the parent record chain of each Layout. Then, at "people", bisects with
// injected styles that pause running animations (all of #people, the community pill, the O, the whole page).
// Run as the command of a FUNCTIONAL Simulator session, in the shared lane:
//   node tools/lock.mjs run chrome-measure --shared --weight simulator --max-seconds 300 --owner fix-hero-exit-threaded -- \
//     node tools/sim.mjs session --functional --owner fix-hero-exit-threaded -- node fixes/people-avatars/sim-why.mjs --snap <abs dir>
// Output: out/people-avatars/sim-why-<stamp>.json
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { REPO as WT, resolveTree } from '../../tools/lib/paths.mjs';
const { openTab, sleep } = await import(join(WT, 'tools/lib/wip.mjs'));

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const SNAP = arg('--snap');
if (!SNAP) throw new Error('--snap <abs snapshot dir>');
const OUT = join(WT, 'out/people-avatars');
mkdirSync(OUT, { recursive: true });
const STAMP = new Date().toISOString().replace(/[:.]/g, '-');
const PAUSE = (sel) => `${sel}, ${sel} * { animation-play-state: paused !important; transition: none !important; }`;
const BISECT = [
  // fix-toolbar-resize's arm: the only query containers above #platform on mobile (CSS l.1658); WebKit runs interleaved
  // layouts inside style resolution for query containers (Document.cpp l.2843-2918, StyleTreeResolver.cpp l.1535-1666)
  ['orbit-card container-type normal', '.mobile-deck .orbit-card { container-type: normal !important; }'],
  ['pause #people', PAUSE('#people')],
  ['pause community pill', PAUSE('.start-selling-future-community-pill')],
  ['pause O', PAUSE('.start-selling-future-people-o')],
  ['pause showcase', PAUSE('.start-selling-future-showcase')],
  ['pause whole page', PAUSE('html')],
];

async function server() {
  const st = join(OUT, 'serve-sim-why.json'); rmSync(st, { force: true });
  const p = spawn(process.execPath, [join(WT, 'tools/serve.mjs'), '--root', resolveTree('site-pretty'), '--overlay', SNAP, '--port', '0', '--no-cache', '--quiet', '--state', st, '--vendors=local'], { stdio: ['ignore', 'ignore', 'inherit'] });
  for (let i = 0; i < 300; i++) { if (existsSync(st)) try { return { p, ...JSON.parse(readFileSync(st, 'utf8')) }; } catch {} await sleep(100); }
  p.kill(); throw new Error('server did not start');
}
const wh = (q) => (q ? `${Math.round(Math.abs(q[2] - q[0]))}x${Math.round(Math.abs(q[5] - q[1]))}` : '?');
function analyse(records) {
  const c = { RenderingFrame: 0, RecalculateStyles: 0, Layout: 0, Paint: 0, paintMpx: 0, chains: {}, scripts: {} };
  const walk = (r, chain) => {
    if (r.type in c) c[r.type]++;
    if (r.type === 'Layout') { const k = chain.map((x) => x.type + (x.data?.scriptLine ? `@${(x.data.scriptName || x.data.url || '').split('/').pop()}:${x.data.scriptLine}` : '')).join(' > ') + ` [${wh(r.data?.root)}]`; c.chains[k] = (c.chains[k] || 0) + 1; }
    if (r.type === 'Paint') { const q = r.data?.clip; if (q) c.paintMpx += Math.abs((q[2] - q[0]) * (q[5] - q[1])) / 1e6; }
    if (r.data?.scriptLine && (r.type === 'FunctionCall' || r.type === 'TimerFire' || r.type === 'FireAnimationFrame' || r.type === 'EvaluateScript')) {
      const k = `${r.type}@${(r.data.scriptName || r.data.url || '').split('/').pop()}:${r.data.scriptLine}`; c.scripts[k] = (c.scripts[k] || 0) + 1; }
    for (const ch of r.children || []) walk(ch, [...chain, r]);
  };
  records.forEach((r) => walk(r, []));
  c.paintMpx = +c.paintMpx.toFixed(2);
  c.chains = Object.fromEntries(Object.entries(c.chains).sort((a, b) => b[1] - a[1]).slice(0, 12));
  c.scripts = Object.fromEntries(Object.entries(c.scripts).sort((a, b) => b[1] - a[1]).slice(0, 12));
  return c;
}
const ANIMS = `(() => { const d = (e) => { if (!e) return '?'; const id = e.id ? '#' + e.id : ''; const cl = typeof e.className === 'string' ? e.className : (e.className?.baseVal || '');
    const r = e.getBoundingClientRect(); return e.tagName.toLowerCase() + id + '.' + cl.replace(/svelte-\\S+/g, '').trim().split(/\\s+/).slice(0, 3).join('.') + ' @' + Math.round(r.top) + ',' + Math.round(r.left) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height); };
  return document.getAnimations().filter((a) => a.playState === 'running').map((a) => ({ t: d(a.effect?.target), kind: a.constructor.name,
    what: a.transitionProperty || a.animationName || '', iter: a.effect?.getTiming?.().iterations, dur: a.effect?.getTiming?.().duration,
    props: (() => { try { return [...new Set(a.effect.getKeyframes().flatMap((k) => Object.keys(k).filter((x) => !['offset', 'easing', 'composite', 'computedOffset'].includes(x))))].join(','); } catch { return ''; } })() })); })()`;

const s = await server();
const url = `http://localhost:${s.port}/`;
const res = { tool: 'people-avatars sim-why (fix-hero-exit-threaded)', snap: SNAP.replace(WT + '/', ''), startedAt: new Date().toISOString(), windows: [] };
try {
  execFileSync(process.execPath, [join(WT, 'tools/sim.mjs'), 'open', url], { stdio: ['ignore', 'ignore', 'inherit'] });
  const c = await openTab(`localhost:${s.port}`);
  for (let i = 0; i < 40 && (await c.evaluate('document.readyState')) !== 'complete'; i++) await sleep(500);
  await sleep(3000);
  const geo = await c.evaluate(`(() => { const h = document.getElementById('future-heading'); const vh = innerHeight;
    const t = h.getBoundingClientRect().top + scrollY; return { vh, title: Math.round(t), above: Math.round(t - 2 * vh), people: Math.round(t - vh / 2), below: Math.round(t + 3 * vh) }; })()`);
  res.geo = geo;
  const go = (y) => c.evaluate(`(window.scrollTo(0, ${y}), 0)`);
  let recs = [];
  c.on((m) => { if (m.method === 'Timeline.eventRecorded') recs.push(m.params.record); });
  await c.send('Page.enable');
  await c.send('Timeline.enable');
  await c.send('Timeline.setInstruments', { instruments: ['Timeline'] });
  const win = async (name, extra = {}) => {
    const anims = await c.evaluate(ANIMS);
    recs = [];
    await c.send('Timeline.start', { maxCallStackDepth: 2 });
    await sleep(2000);
    await c.send('Timeline.stop');
    await sleep(1200);
    const a = analyse(recs);
    const w = { name, ...extra, y: await c.evaluate('Math.round(scrollY)'), anims, counts: a };
    console.log(`${name}: layout ${a.Layout} paint ${a.Paint} (${a.paintMpx} Mpx) frames ${a.RenderingFrame} style ${a.RecalculateStyles}; running anims ${anims.length}`);
    console.log('   chains', JSON.stringify(a.chains));
    console.log('   scripts', JSON.stringify(a.scripts));
    for (const x of anims.slice(0, 15)) console.log('   anim', JSON.stringify(x));
    res.windows.push(w);
  };
  for (const pos of ['above', 'people', 'below']) {
    await go(geo[pos]); await sleep(pos === 'people' ? 4000 : 2500);
    await win(pos);
  }
  await go(geo.people); await sleep(3000);
  for (const [name, css] of BISECT) {
    await c.evaluate(`(() => { document.getElementById('fw-why')?.remove(); const st = document.createElement('style'); st.id = 'fw-why'; st.textContent = ${JSON.stringify(css)}; document.head.append(st); return 1; })()`);
    await sleep(800);
    await win('people, ' + name, { css });
  }
  await c.evaluate(`(document.getElementById('fw-why')?.remove(), 0)`); await sleep(800);
  await win('people, styles removed');
  await c.send('Timeline.disable').catch(() => {});
  c.close();
} finally { s.p.kill(); }
res.endedAt = new Date().toISOString();
const f = join(OUT, `sim-why-${STAMP}.json`);
writeFileSync(f, JSON.stringify(res, null, 1));
console.log('WROTE', f);
