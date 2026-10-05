// P-146 (deck-contain, post-data follow-up of P-143) Simulator driver = sim-swipe.mjs (P-143) plus swipe pooling: each step
// repeats the cold open + settle + arm + swipe until the pooled deck-band frame count reaches POOL_N (120) or POOL_MAX
// (4) swipes, and stores every swipe's frames in one record (P-143 S1: a C swipe gave 46-61 band frames, arms 105-162).
// Arms: PC2 (content-free height + content-visibility: hidden, the control), S844 (P-143's strict + 844 px, informative).
// The rest of this header is P-143's:
// P-143 (deck-contain) Simulator driver: per-frame WebKit Timeline Layout records and ms over the profile deck band
// during a scripted swipe, per arm, in one Simulator session inside a normal exclusive chrome-measure hold (P-133's
// form: 600 s, cold boot). Adapted from
// fixes/morph-scroll/t194/swipe-sim.mjs (fix-hero-exit-threaded, db8dc091 on fix/settle-cache): same server start,
// open, Timeline start (Page.disable -> Page.enable -> Timeline.start, F-047), same swipe (scrollTo 10 px per rAF,
// scroll events fire, no toolbar change) and the same record walk (outermost Layout / RecalculateStyles per
// RenderingFrame). Added here: pinned arms, served-bytes gate (exit 26), the arm-applied read, the deck geometry read
// before the swipe, the host-load stop (load1 > 200 before a step: exit 28), the budget stop, and one JSON line per
// step (runs.jsonl) with every frame's y and counts, for the frozen scorer score-p143.mjs.
// Simulator ms are a within-session mechanism ratio, never a gain (F-084); this driver judges nothing.
// usage (inside: node tools/lock.mjs run chrome-measure --max-seconds 600 --owner fix-deck-contain -- node tools/sim.mjs
//   session --owner fix-deck-contain -- ...):
//   node fixes/deck-contain/sim-swipe-p146.mjs <hold> <step> [<step> ...]     step = <arm>:<k>, arm C | PC2 | A3 | A4 | R3 | S844
// env: SB_BUDGET_S (default 500): a step whose estimated end passes it is not started (logged as dropped).
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, rmSync, writeFileSync, mkdirSync, appendFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { loadavg } from 'node:os';
import { REPO as WT, resolveTree } from '../../tools/lib/paths.mjs';
const { openTab, sleep, timelineSyncJs, findTimeStamp } = await import(join(WT, 'tools/lib/wip.mjs'));
const HERE = dirname(new URL(import.meta.url).pathname);
export const PINS = { js: '941aa13e5bdf', css: 'f1997edf5309' }; // v9.1d served bytes (int-v8 f857ea8d, patch ce2d32a1bbbb)
export const ARMS = { W: null, C: null, PC2: 'pc2-cv-hidden.css', A3: 'a3-pad.css', A4: 'a4-cq.css', R3: 'r3-pad-only.css', S844: 'pc-strict844.css' };
export const POOL_N = 120, POOL_MAX = 4;
// what the deck's computed style must show for the arm to count as applied (pb = padding-block-end in px, ct = the
// profile chrome's container-type)
export const APPLIED = {
  C: (d) => d.contain === 'none' && d.pb === 0 && d.ct === 'normal' && d.cv !== 'hidden',
  W: (d) => d.contain === 'none' && d.pb === 0 && d.ct === 'normal' && d.cv !== 'hidden', // uncounted warm-up: the base, one swipe, never scored
  PC2: (d) => d.cv === 'hidden' && d.pb > 0 && d.ct === 'normal',
  S844: (d) => d.contain === 'strict' && Math.abs(d.h - 844) < 0.01,
  A3: (d) => d.contain === 'size layout' && d.pb > 0 && d.ct === 'normal',
  A4: (d) => d.contain === 'size layout' && d.pb === 0 && d.ct === 'inline-size',
  R3: (d) => d.contain === 'none' && d.pb > 0 && d.ct === 'normal',
};
export const HOST_MAX = 200, TO = 2600, PX = 10;
const OVL = join(WT, 'fixes/deck-contain--base/overlay');
const NODE = '_app/immutable/nodes/2.DyWL8TcE.js', CSSF = '_app/immutable/assets/2.gBuqKVzi.css';
const sha = (b) => createHash('sha256').update(b).digest('hex').slice(0, 12);
export const DECK = `(() => { const d = document.querySelector('.start-selling-profile-deck'), r = d.getBoundingClientRect(), cs = getComputedStyle(d);
  return { top: r.top + scrollY, bottom: r.bottom + scrollY, h: r.height, w: r.width, contain: cs.contain, bs: cs.boxSizing, ar: cs.aspectRatio,
    pb: parseFloat(cs.paddingBottom) || 0, ct: getComputedStyle(d.parentElement).containerType || 'normal',
    cv: cs.contentVisibility, ih: innerHeight, iw: innerWidth, docH: document.documentElement.scrollHeight }; })()`;
async function main() {
  const [HOLD, ...STEPS] = process.argv.slice(2);
  if (!HOLD || !STEPS.length || STEPS.some((s) => !/^(W|C|PC2|A3|A4|R3|S844):\d+$/.test(s))) { console.error('usage: sim-swipe.mjs <hold> <arm>:<k> ...'); process.exit(2); }
  const BUDGET = +(process.env.SB_BUDGET_S || 500), T0 = Date.now();
  const DIR = join(WT, 'out/deck-contain/sim146', HOLD); if (existsSync(DIR)) { console.log(`HOLD-EXISTS ${DIR} (rev 1.1 N4: a new hold name, or rename a VOID-HOST folder to <hold>-void1)`); process.exit(27); } mkdirSync(DIR, { recursive: true });
  const runs = join(DIR, 'runs.jsonl');
  const st = join(DIR, `serve-${process.pid}.json`); rmSync(st, { force: true });
  const p = spawn(process.execPath, [join(WT, 'tools/serve.mjs'), '--root', resolveTree('site-pretty'), '--overlay', OVL, '--port', '0', '--no-cache', '--quiet', '--state', st, '--vendors=local'], { stdio: ['ignore', 'ignore', 'inherit'] });
  let code = 0, swipeEst = null; // P-146: the budget is checked per swipe (a step starts only if one swipe fits; pooling stops when the next would not)
  try {
    let s = null; for (let k = 0; k < 300 && !s; k++) { if (existsSync(st)) try { s = JSON.parse(readFileSync(st, 'utf8')); } catch {} if (!s) await sleep(100); }
    if (!s) throw new Error('server did not start');
    const url = `http://localhost:${s.port}/`;
    const served = { js: sha(Buffer.from(await (await fetch(new URL(NODE, url))).arrayBuffer())), css: sha(Buffer.from(await (await fetch(new URL(CSSF, url))).arrayBuffer())) };
    if (served.js !== PINS.js || served.css !== PINS.css) { console.log(`SERVED-MISMATCH ${JSON.stringify(served)} pins ${JSON.stringify(PINS)}`); code = 26; return; }
    for (const [i, step] of STEPS.entries()) {
      const [arm] = step.split(':');
      const elapsed = (Date.now() - T0) / 1000;
      if (swipeEst != null && elapsed + swipeEst > BUDGET) { const rec = { hold: HOLD, step, dropped: "budget", elapsed, est: swipeEst }; appendFileSync(runs, JSON.stringify(rec) + '\n'); console.log('DROPPED', step, 'budget', elapsed.toFixed(0), '+', est.toFixed(0), '>', BUDGET); continue; }
      const load1Start = +loadavg()[0].toFixed(2);
      if (load1Start > HOST_MAX) { console.log(`VOID-HOST load1 ${load1Start} > ${HOST_MAX} before ${step}`); appendFileSync(runs, JSON.stringify({ hold: HOLD, step, voidHost: load1Start }) + '\n'); code = 28; return; }
      const t1 = Date.now();
      const rec = { hold: HOLD, step, arm, i, served, load1Start, startedAt: new Date().toISOString() };
      rec.swipes = []; rec.frames = [];
      const bandN = () => rec.deck ? rec.frames.filter((f) => f.y > rec.deck.top - rec.deck.ih && f.y < rec.deck.bottom).length : 0;
      for (let sIdx = 0; sIdx < (arm === 'W' ? 1 : POOL_MAX) && !rec.error; sIdx++) {
      const ts = Date.now();
      if (sIdx > 0 && swipeEst != null && (ts - T0) / 1000 + swipeEst > BUDGET) { rec.poolStopped = 'budget'; break; }
      let c = null;
      try {
        execFileSync(process.execPath, [join(WT, 'tools/sim.mjs'), 'open', url], { stdio: ['ignore', 'ignore', 'inherit'] });
        await sleep(2500);
        c = await openTab(`localhost:${s.port}`);
        for (let k = 0; k < 40 && (await c.evaluate('document.readyState')) !== 'complete'; k++) await sleep(500);
        await sleep(4000);
        if (ARMS[arm]) {
          const css = readFileSync(join(HERE, 'arms', ARMS[arm]), 'utf8'); rec.armCss = sha(Buffer.from(css));
          await c.evaluate(`(() => { const s = document.createElement('style'); s.id = 'sw-arm'; s.textContent = ${JSON.stringify(css)}; document.head.appendChild(s); return 1; })()`);
        }
        await sleep(500);
        const deck = await c.evaluate(DECK);
        if (!rec.deck) rec.deck = deck;
        rec.applied = (rec.applied ?? true) && APPLIED[arm](deck);
        const recs = [];
        c.on((m) => { if (m.method === 'Timeline.eventRecorded') recs.push(m.params.record); });
        for (const [m, prm] of [['Page.disable', {}], ['Page.enable', {}], ['Timeline.enable', {}], ['Timeline.setInstruments', { instruments: ['Timeline'] }], ['Timeline.start', { maxCallStackDepth: 4 }]]) await c.send(m, prm);
        await sleep(500);
        const syncT = await c.evaluate(timelineSyncJs('sw-sync'));
        await c.evaluate(`(() => { window.__sw = []; window.__swDone = false; let y = 0; const max = Math.min(${TO}, document.documentElement.scrollHeight - innerHeight);
          const st = () => { y = Math.min(max, y + ${PX}); window.scrollTo({ top: y, behavior: 'instant' }); __sw.push([performance.now(), y]); if (y < max) requestAnimationFrame(st); else __swDone = true; };
          requestAnimationFrame(st); return 1; })()`);
        for (let k = 0; k < 240 && !(await c.evaluate('window.__swDone')); k++) await sleep(250);
        await sleep(1000);
        const sw = await c.evaluate('window.__sw');
        await c.send('Timeline.stop').catch(() => {});
        await sleep(1500);
        const syncTL = findTimeStamp(recs, 'sw-sync');
        if (syncTL == null) throw new Error('no sync');
        const off = syncTL * 1000 - syncT;
        const yAt = (tl) => { const t = tl - off; let f = null; for (const e of sw) { if (e[0] <= t) f = e; else break; } return f ? f[1] : null; };
        const frames = [];
        for (const r of recs) {
          if (r.type !== 'RenderingFrame') continue;
          const y = yAt(r.startTime * 1000); if (y == null || r.startTime * 1000 - off > sw.at(-1)[0] + 20) continue;
          const o = { y, lay: 0, layMs: 0, layView: 0, rs: 0, rsMs: 0, invLay: 0, paints: 0 };
          const walk = (x, inLR) => {
            const d = ((x.endTime ?? x.startTime) - x.startTime) * 1000;
            if (x.type === 'Layout' && !inLR) { o.lay++; o.layMs += d; const q = x.data?.root || []; if (q.length && Math.abs(q[2] - q[0]) > 400) o.layView++; }
            if (x.type === 'RecalculateStyles' && !inLR) { o.rs++; o.rsMs += d; }
            if (x.type === 'InvalidateLayout') o.invLay++;
            if (x.type === 'Paint') o.paints++;
            for (const ch of x.children || []) walk(ch, inLR || x.type === 'Layout' || x.type === 'RecalculateStyles');
          };
          walk(r, false);
          o.layMs = +o.layMs.toFixed(3); o.rsMs = +o.rsMs.toFixed(3);
          frames.push(o);
        }
        const yMax = sw.at(-1)?.[1] ?? null;
        rec.swipe = { steps: Math.min(rec.swipe?.steps ?? Infinity, sw.length), yMax: Math.min(rec.swipe?.yMax ?? Infinity, yMax ?? -1) };
        rec.swipes.push({ s: sIdx, steps: sw.length, yMax, frames: frames.length, top: deck.top, h: deck.h, docH: deck.docH, applied: APPLIED[arm](deck) });
        rec.frames.push(...frames);
        writeFileSync(join(DIR, `tl-${step.replace(':', '-')}-s${sIdx}.json`), JSON.stringify({ offsetMs: off, sw, recs }));
      } catch (e) { rec.error = String(e.stack || e.message || e); }
      finally { try { c?.close(); } catch {} }
      const per = (Date.now() - ts) / 1000; swipeEst = Math.max(swipeEst ?? 0, per + 3);
      if (bandN() >= POOL_N) break;
      }
      rec.bandN = bandN();
      rec.load1End = +loadavg()[0].toFixed(2);
      rec.stepS = +((Date.now() - t1) / 1000).toFixed(1);
      // (P-146: swipeEst is set per swipe above)
      appendFileSync(runs, JSON.stringify(rec) + '\n');
      const band = (rec.frames || []).filter((f) => rec.deck && f.y > rec.deck.top - rec.deck.ih && f.y < rec.deck.bottom);
      const mean = (k) => band.length ? (band.reduce((a, f) => a + f[k], 0) / band.length).toFixed(2) : 'n/a';
      console.log(`STEP ${HOLD} ${step} applied ${rec.applied} deck ${rec.deck?.w}x${rec.deck?.h} top ${rec.deck?.top} swipes ${rec.swipes?.length ?? 0}${rec.poolStopped ? " (pool stopped: " + rec.poolStopped + ")" : ""} frames ${rec.frames?.length ?? 0} band n ${band.length} lay/f ${mean('lay')} layMs/f ${mean('layMs')} | load1 ${load1Start} -> ${rec.load1End} | ${rec.stepS} s${rec.error ? ' ERROR ' + rec.error.split('\n')[0] : ''}`);
    }
  } catch (e) { console.log('ERROR', e.stack || e.message || e); code = 1; }
  finally { p.kill(); rmSync(st, { force: true }); process.exitCode = code; }
}
if (process.argv[1] && import.meta.url === new URL('file://' + process.argv[1]).href) await main();
