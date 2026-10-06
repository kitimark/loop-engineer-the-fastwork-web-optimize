// people-gpu (fix-people-gpu): what drives WebKit's per-frame layouts at the #people title at rest on v10 (F-227 on the
// current build)? Simulator, COUNTS ONLY. At the title (O open, card shown) it lists the running animations (target,
// on screen or not, inside #people or not) and counts RenderingFrame / Layout (+ roots) / Paint (+ rects) in 2 s windows,
// then bisects by pausing groups (CSS animation-play-state + pausing their WAAPI animations, also new ones):
//   none | hero accent | scroll cue | countdown | whole hero track | everything outside #people
//   node tools/lock.mjs run chrome-measure --shared --weight simulator --max-seconds 240 --owner fix-people-gpu -- \
//     node tools/sim.mjs session --functional --owner fix-people-gpu -- node fixes/people-gpu/gates/pg-why.mjs --snap <abs dir>
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { REPO as WT, resolveTree } from '../../../tools/lib/paths.mjs';
const { openTab, sleep, TIMELINE_START } = await import(join(WT, 'tools/lib/wip.mjs'));
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const SNAP = arg('--snap'); if (!SNAP) throw new Error('--snap <abs dir>');
const OUT = join(WT, 'out/people-gpu'); mkdirSync(OUT, { recursive: true });
const STAMP = new Date().toISOString().replace(/[:.]/g, '-');
// --groups outside: cumulative bisect of what is left once the hero track is paused (lead: nav first, then the next
// sections in page order); everything else stays as before
const GROUPS = arg('--groups') === 'outside' ? [
  ['hero track', '.hero-track'],
  ['+ nav', '.hero-track, .start-selling-top-nav'],
  ['+ feed', '.hero-track, .start-selling-top-nav, section.feed'],
  ['+ pain, commission', '.hero-track, .start-selling-top-nav, section.feed, section.pain, section.commission'],
  ['outside #people', 'body > *:not(#people)'],
] : [
  ['none', null],
  ['hero accent', '.accent-path, .hero-title'],
  ['scroll cue', '.scroll-float, .he-bob'],
  ['countdown', '.cell, [class*="countdown"], [class*="cd-"]'],
  ['hero track', '.hero-track'],
  ['outside #people', 'body > *:not(#people)'],
];
const PAUSE = (sel) => `(() => { document.getElementById('pg-why')?.remove(); window.__pgSel = ${JSON.stringify(sel)}; if (!window.__pgAnimate) { const o = Element.prototype.animate; window.__pgAnimate = o;
    Element.prototype.animate = function (...a) { const x = o.apply(this, a); try { if (window.__pgSel && this.closest(window.__pgSel) && !this.closest('#people')) x.pause(); } catch {} return x; }; }
  let n = 0; if (window.__pgSel) { const s = document.createElement('style'); s.id = 'pg-why'; const q = window.__pgSel.split(',').map((x) => x.trim()); s.textContent = q.map((x) => x + ':not(#people *), ' + x + ' *:not(#people *), ' + x + ' *::before, ' + x + ' *::after').join(', ') + ' { animation-play-state: paused !important; }'; document.head.append(s);
    for (const a of document.getAnimations()) { const t = a.effect && a.effect.target; try { if (t && t.closest && t.closest(window.__pgSel) && !t.closest('#people') && a.playState === 'running') { a.pause(); n++; } } catch {} } }
  return n; })()`;
const RESUMEALL = `(() => { for (const a of document.getAnimations()) { try { if (a.playState === 'paused') a.play(); } catch {} } return 1; })()`;
const ANIMS = `(() => { return document.getAnimations().filter((a) => a.playState === 'running').map((a) => { const t = a.effect && a.effect.target; const r = t && t.getBoundingClientRect ? t.getBoundingClientRect() : null;
  return [a.constructor.name, a.transitionProperty || a.animationName || 'waapi', t ? t.tagName.toLowerCase() + '.' + String(t.className && t.className.baseVal !== undefined ? t.className.baseVal : t.className).replace(/svelte-\\w+/g, '').trim().split(/\\s+/).slice(0, 2).join('.') : '?',
    r ? Math.round(r.width) + 'x' + Math.round(r.height) + '@' + Math.round(r.top) : '', r && r.bottom > 0 && r.top < innerHeight ? 'on' : 'off', t && t.closest && t.closest('#people') ? 'people' : 'out'].join(' '); }); })()`;
const wh = (q) => (q ? `${Math.round(Math.abs(q[2] - q[0]))}x${Math.round(Math.abs(q[5] - q[1]))}` : '?');
function count(recs) {
  const c = { frames: 0, layouts: 0, paints: 0, styles: 0, roots: {}, rects: {} };
  const walk = (r) => { if (r.type === 'RenderingFrame') c.frames++; else if (r.type === 'Layout') { c.layouts++; const k = wh(r.data?.root); c.roots[k] = (c.roots[k] || 0) + 1; } else if (r.type === 'Paint') { c.paints++; const k = wh(r.data?.clip); c.rects[k] = (c.rects[k] || 0) + 1; } else if (r.type === 'RecalculateStyles') c.styles++; for (const ch of r.children || []) walk(ch); };
  recs.forEach(walk);
  const top = (o) => Object.fromEntries(Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, 5));
  return { ...c, roots: top(c.roots), rects: top(c.rects) };
}
const st = join(OUT, `serve-why-${process.pid}.json`); rmSync(st, { force: true });
const p = spawn(process.execPath, [join(WT, 'tools/serve.mjs'), '--root', resolveTree('site-pretty'), '--overlay', SNAP, '--port', '0', '--no-cache', '--quiet', '--state', st, '--vendors=local'], { stdio: ['ignore', 'ignore', 'inherit'] });
const res = { tool: 'fixes/people-gpu/gates/pg-why.mjs', snap: SNAP, startedAt: new Date().toISOString(), windows: [] };
try {
  let s = null; for (let k = 0; k < 300 && !s; k++) { if (existsSync(st)) try { s = JSON.parse(readFileSync(st, 'utf8')); } catch {} if (!s) await sleep(100); }
  const url = `http://localhost:${s.port}/?why=${Date.now()}`;
  execFileSync(process.execPath, [join(WT, 'tools/sim.mjs'), 'open', url], { stdio: ['ignore', 'ignore', 'inherit'] });
  await sleep(2000);
  const c = await openTab(`localhost:${s.port}`);
  for (let k = 0; k < 40 && (await c.evaluate('document.readyState')) !== 'complete'; k++) await sleep(500);
  await sleep(2500);
  const g = await c.evaluate(`(() => { const h = document.getElementById('future-heading'); const r = h.getBoundingClientRect(); return { ih: innerHeight, titleTop: Math.round(r.top + scrollY), titleH: Math.round(r.height) }; })()`);
  const yTitle = Math.round(g.titleTop + g.titleH / 2 - g.ih / 2);
  for (const f of [0.3, 0.6, 1]) { await c.evaluate(`(window.scrollTo(0, ${Math.round(yTitle * f)}), 0)`); await sleep(500); }
  await c.evaluate(`(window.scrollTo(0, ${yTitle + 2 * g.ih}), 0)`); await sleep(1200);
  await c.evaluate(`(window.scrollTo(0, ${yTitle}), 0)`); await sleep(4000);
  res.geo = { ...g, yTitle };
  res.anims = await c.evaluate(ANIMS);
  console.log('at the title y', yTitle, 'running animations:', res.anims.length); for (const a of res.anims) console.log('  ', a);
  let recs = [];
  c.on((m) => { if (m.method === 'Timeline.eventRecorded') recs.push(m.params.record); });
  for (const [m, prm] of TIMELINE_START.slice(0, 4)) await c.send(m, prm);
  for (const [name, sel] of GROUPS) {
    await c.evaluate(RESUMEALL); const paused = await c.evaluate(PAUSE(sel)); await sleep(900);
    recs = []; await c.send('Timeline.start', { maxCallStackDepth: 1 }); await sleep(2000); await c.send('Timeline.stop'); await sleep(1000);
    const n = count(recs); res.windows.push({ name, sel, paused, ...n });
    console.log(`${name.padEnd(16)} paused ${String(paused).padStart(3)} | frames ${n.frames} layouts ${n.layouts} paints ${n.paints} styles ${n.styles} roots ${JSON.stringify(n.roots)} rects ${JSON.stringify(n.rects)}`);
  }
  await c.evaluate(`(window.__pgSel = null, document.getElementById('pg-why')?.remove(), 0)`);
  c.close();
} finally { p.kill(); }
res.endedAt = new Date().toISOString();
writeFileSync(join(OUT, `pg-why-${STAMP}.json`), JSON.stringify(res, null, 1));
console.log('WROTE', join(OUT, `pg-why-${STAMP}.json`));
process.exit(0);
