// hero-park on the iOS Simulator: functional steps, frozen-frame pixels and the cost card's counts (no timing; Simulator
// ms are descriptive only, F-084). Arms (default C,V,C2): C = v9.1d (fixes/hp-base/overlay, a pristine copy built with
// `fix.mjs apply hp-base --from v9-1d --reset`), V = v9.1d + hero-park (fixes/hero-park/overlay), C2 = C again on its
// own server (A/A). Served hashes are checked against --pins (a mismatch is VOID, exit 3).
// Per arm, with a finger marked down (a synthetic `touchstart` on window: heTS only sets heTouch, so heRest never parks
// and every park below is heSc's own):
//   1 functional: scrollTo steps relative to the hero's end E (heEnd = track top + track height - innerHeight):
//     E-400, E+60, E+20, E-100, E+300, 10; .he-css read 300 ms after each step (Runtime.evaluate does not await promises in WebKit); then touchend + E-200 + 700 ms (heRest).
//   2 pixels: at E+60, E+300, E+700 (the hero's last screen still on view): time-based animations paused at t = 0,
//     400 ms, one `simctl io screenshot` (the composited screen). Diffs: V vs C and C2 vs C, full screen, the status bar
//     (top 59 CSS px) left out; "beyond A/A" = pixels that differ in V vs C where C2 vs C does not.
//   3 counts: a scripted swipe 0 -> 2800 px, 10 px per rAF (scrollTo, scroll events fire), WebKit Timeline on
//     (maxCallStackDepth 4). Per band of the frame's scrollY (hero 0..E, past-end E..track end, below 2800): frames,
//     RecalculateStyles (outermost) and their ms, engine-scheduled style invalidations, outermost Layouts and their ms.
//   console errors: Console.enable replays the page's messages; errors are counted per arm.
//   node tools/lock.mjs run chrome-measure --shared --weight simulator --max-seconds 300 --owner fix-hero-exit-threaded -- \
//     node tools/sim.mjs session --functional --owner fix-hero-exit-threaded -- node fixes/hero-park/sim-park.mjs [--arms C,V,C2]
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { join } from 'node:path';
import { REPO as WT, resolveTree } from '../../tools/lib/paths.mjs';
const { openTab, sleep, timelineSyncJs, findTimeStamp } = await import(join(WT, 'tools/lib/wip.mjs'));
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const NODE = '_app/immutable/nodes/2.DyWL8TcE.js', CSS = '_app/immutable/assets/2.gBuqKVzi.css';
const DIRS = { C: join(WT, 'fixes/hp-base/overlay'), C2: join(WT, 'fixes/hp-base/overlay'), V: join(WT, 'fixes/hero-park/overlay') };
const PINS = Object.fromEntries((arg('--pins', 'C=941aa13e5bdf/f1997edf5309,C2=941aa13e5bdf/f1997edf5309,V=be22bf861949/f1997edf5309')).split(',').map((s) => s.split('=')));
const ARMS = arg('--arms', 'C,V,C2').split(',');
const TO = +arg('--to', '2800');
const UDID = process.env.FW_SIM_UDID;
if (!UDID) { console.error('FW_SIM_UDID not set: run inside tools/sim.mjs session'); process.exit(1); }
const STAMP = new Date().toISOString().replace(/[:.]/g, '-');
const OUT = join(WT, 'out/hero-park/sim', STAMP); mkdirSync(OUT, { recursive: true });
const sha = (b) => createHash('sha256').update(b).digest('hex').slice(0, 12);

function png(buf) {
  if (buf.readUInt32BE(12) !== 0x49484452) throw new Error('not a PNG');
  let o = 8, w, h, bpp, depth, inter, idat = [];
  while (o < buf.length) { const len = buf.readUInt32BE(o), type = buf.toString('ascii', o + 4, o + 8), d = buf.subarray(o + 8, o + 8 + len);
    if (type === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); depth = d[8]; bpp = d[9] === 6 ? 4 : d[9] === 2 ? 3 : 0; inter = d[12]; } else if (type === 'IDAT') idat.push(d); o += 12 + len; }
  if (depth !== 8 || !bpp || inter) throw new Error(`PNG format not handled: depth ${depth}, bpp ${bpp}, interlace ${inter}`);
  const raw = inflateSync(Buffer.concat(idat)); const stride = w * bpp; const px = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) { const f = raw[y * (stride + 1)], line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)), row = y * stride;
    for (let x = 0; x < stride; x++) { const a = x >= bpp ? px[row + x - bpp] : 0, b = y ? px[row - stride + x] : 0, c = x >= bpp && y ? px[row - stride + x - bpp] : 0;
      let v = line[x]; if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1; else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      px[row + x] = v & 255; } }
  return { w, h, bpp, px };
}
let shotN = 0;
const shot = (tag) => { const f = join(OUT, `${String(++shotN).padStart(3, '0')}-${tag}.png`); execFileSync('xcrun', ['simctl', 'io', UDID, 'screenshot', '--type=png', f], { stdio: ['ignore', 'ignore', 'pipe'] }); return png(readFileSync(f)); };
// per-pixel max channel difference, rows below the status bar only (skipRows screen px)
const diffMap = (a, b, skipRows) => { const n = a.w * a.h, d = new Uint8Array(n); for (let i = skipRows * a.w; i < n; i++) { const p = i * a.bpp, q = i * b.bpp; d[i] = Math.max(Math.abs(a.px[p] - b.px[q]), Math.abs(a.px[p + 1] - b.px[q + 1]), Math.abs(a.px[p + 2] - b.px[q + 2])); } return d; };

const res = { tool: 'hero-park sim-park', startedAt: STAMP, to: TO, arms: {} };
const shots = {};
let voided = false;
for (const arm of ARMS) {
  const st = join(OUT, `serve-${arm}.json`);
  const p = spawn(process.execPath, [join(WT, 'tools/serve.mjs'), '--root', resolveTree('site-pretty'), '--overlay', DIRS[arm], '--port', '0', '--no-cache', '--quiet', '--state', st, '--vendors=local'], { stdio: ['ignore', 'ignore', 'inherit'] });
  const R = (res.arms[arm] = { dir: DIRS[arm] });
  let c = null;
  try {
    let s = null; for (let k = 0; k < 300 && !s; k++) { if (existsSync(st)) try { s = JSON.parse(readFileSync(st, 'utf8')); } catch {} if (!s) await sleep(100); }
    if (!s) throw new Error('server did not start');
    const url = `http://localhost:${s.port}/`;
    R.served = sha(Buffer.from(await (await fetch(new URL(NODE, url))).arrayBuffer())) + '/' + sha(Buffer.from(await (await fetch(new URL(CSS, url))).arrayBuffer()));
    if (PINS[arm] && R.served !== PINS[arm]) { R.void = `served ${R.served} != pin ${PINS[arm]}`; voided = true; console.log(`ARM ${arm} VOID ${R.void}`); continue; }
    execFileSync(process.execPath, [join(WT, 'tools/sim.mjs'), 'open', url], { stdio: ['ignore', 'ignore', 'inherit'] });
    await sleep(2500);
    c = await openTab(`localhost:${s.port}`);
    for (let k = 0; k < 40 && (await c.evaluate('document.readyState')) !== 'complete'; k++) await sleep(500);
    const errs = []; c.on((m) => { if (m.method === 'Console.messageAdded' && m.params.message.level === 'error') errs.push(String(m.params.message.text).slice(0, 160)); });
    await c.send('Console.enable').catch(() => {});
    await sleep(4000);
    const ev = (x) => c.evaluate(x);
    R.page = await ev(`(() => { const t = document.querySelector('.hero-track'); const r = t.getBoundingClientRect(); return { ih: innerHeight, heOn: t.classList.contains('he-on'), top: r.top + scrollY, h: r.height, E: r.top + scrollY + Math.max(1, r.height - innerHeight), rm: matchMedia('(prefers-reduced-motion: reduce)').matches }; })()`);
    const E = Math.round(R.page.E), trackEnd = Math.round(R.page.top + R.page.h);
    const live = () => ev(`document.querySelector('.hero-track').classList.contains('he-css')`);
    const go = async (y) => { await ev(`window.scrollTo({ top: ${y}, behavior: 'instant' })`); await sleep(300); return { y: await ev('scrollY'), live: await live() }; };
    // 1 functional (finger down)
    await ev(`window.dispatchEvent(new Event('touchstart')), 1`);
    R.steps = [];
    for (const [name, y] of [['E-400', E - 400], ['E+60', E + 60], ['E+20', E + 20], ['E-100', E - 100], ['E+300', E + 300], ['top', 10]]) R.steps.push([name, ...Object.values(await go(y))]);
    await go(E - 200);
    await ev(`window.dispatchEvent(new Event('touchend')), 1`);
    await sleep(700); R.steps.push(['rest E-200 +700ms', await ev('scrollY'), await live()]);
    // 2 pixels (finger down again)
    await ev(`window.dispatchEvent(new Event('touchstart')), 1`);
    await go(E - 300);
    shots[arm] = {};
    for (const [name, y] of [['E+60', E + 60], ['E+300', E + 300], ['E+700', Math.min(E + 700, trackEnd - 60)]]) {
      await go(y);
      R[`px ${name}`] = await ev(`(() => { let n = 0; for (const a of document.getAnimations()) { if (a.timeline === document.timeline) { try { a.pause(); a.currentTime = 0; n++; } catch {} } } return { paused: n, live: document.querySelector('.hero-track').classList.contains('he-css'), y: scrollY }; })()`);
      await sleep(400);
      shots[arm][name] = shot(`${arm}-${name}`);
      await ev(`(() => { for (const a of document.getAnimations()) if (a.timeline === document.timeline && a.playState === 'paused') a.play(); return 1; })()`);
    }
    // 3 counts: scripted swipe 0 -> TO (finger still down)
    await go(0); await sleep(800);
    const recs = []; c.on((m) => { if (m.method === 'Timeline.eventRecorded') recs.push(m.params.record); });
    for (const [m, prm] of [['Page.disable', {}], ['Page.enable', {}], ['Timeline.enable', {}], ['Timeline.setInstruments', { instruments: ['Timeline'] }], ['Timeline.start', { maxCallStackDepth: 4 }]]) await c.send(m, prm);
    await sleep(500);
    const syncT = await ev(timelineSyncJs('hp-sync'));
    await ev(`(() => { window.__sw = []; window.__swDone = false; let y = 0; const max = Math.min(${TO}, document.documentElement.scrollHeight - innerHeight);
      const st = () => { y = Math.min(max, y + 10); window.scrollTo({ top: y, behavior: 'instant' }); __sw.push([performance.now(), y, document.querySelector('.hero-track').classList.contains('he-css') ? 1 : 0]); if (y < max) requestAnimationFrame(st); else __swDone = true; };
      requestAnimationFrame(st); return 1; })()`);
    for (let k = 0; k < 200 && !(await ev('window.__swDone')); k++) await sleep(250);
    await sleep(800);
    const sw = await ev('window.__sw');
    await c.send('Timeline.stop').catch(() => {});
    await sleep(1500);
    await ev(`window.dispatchEvent(new Event('touchend')), 1`);
    const syncTL = findTimeStamp(recs, 'hp-sync'); if (syncTL == null) throw new Error('no timeline sync');
    const off = syncTL * 1000 - syncT;
    const at = (tl) => { const t = tl - off; let f = null; for (const e of sw) { if (e[0] <= t) f = e; else break; } return f; };
    const band = (y) => (y < E ? 'hero 0..E' : y < trackEnd ? 'past end E..track end' : `below track end..${TO}`);
    const B = {};
    for (const r of recs) {
      if (r.type !== 'RenderingFrame') continue;
      const f = at(r.startTime * 1000); if (!f || r.startTime * 1000 - off > sw.at(-1)[0] + 20) continue;
      const o = (B[band(f[1])] ||= { frames: 0, liveFrames: 0, rs: 0, rsMs: 0, schedEngine: 0, lay: 0, layMs: 0 });
      o.frames++; o.liveFrames += f[2];
      const walk = (x, inLR, js) => {
        const d = ((x.endTime ?? x.startTime) - x.startTime) * 1000;
        const isJs = js || ['FunctionCall', 'EventDispatch', 'TimerFire', 'FireAnimationFrame', 'ObserverCallback'].includes(x.type);
        if (x.type === 'RecalculateStyles' && !inLR) { o.rs++; o.rsMs += d; }
        if (x.type === 'Layout' && !inLR) { o.lay++; o.layMs += d; }
        if (x.type === 'ScheduleStyleRecalculation' && !isJs) o.schedEngine++;
        for (const ch of x.children || []) walk(ch, inLR || x.type === 'Layout' || x.type === 'RecalculateStyles', isJs);
      };
      walk(r, false, false);
    }
    for (const o of Object.values(B)) { o.rsMs = +o.rsMs.toFixed(1); o.layMs = +o.layMs.toFixed(1); }
    R.bands = B; R.E = E; R.trackEnd = trackEnd;
    R.consoleErrors = errs;
    writeFileSync(join(OUT, `tl-${arm}.json`), JSON.stringify({ offsetMs: off, sw, recs }));
    console.log(`ARM ${arm} served ${R.served} page ${JSON.stringify(R.page)} errors ${errs.length}`);
    console.log(`  steps ${R.steps.map((s) => `${s[0]}@${Math.round(s[1])}:${s[2] ? 'live' : 'parked'}`).join(' ')}`);
    for (const [k, o] of Object.entries(B)) console.log(`  ${arm} ${k.padEnd(24)} frames ${String(o.frames).padStart(4)} live ${String(o.liveFrames).padStart(4)} | RS ${o.rs} (${(o.rs / o.frames).toFixed(2)}/f, ${o.rsMs} ms) engSched ${o.schedEngine} (${(o.schedEngine / o.frames).toFixed(2)}/f) | Layout ${o.lay} (${(o.lay / o.frames).toFixed(2)}/f, ${o.layMs} ms)`);
  } catch (e) { R.error = String(e.stack || e.message || e); console.log(arm, 'error', R.error.split('\n')[0]); }
  finally { try { c?.close(); } catch {} p.kill(); rmSync(st, { force: true }); }
}
// pixel diffs
if (shots.C) {
  const skip = Math.round(59 * 3);
  for (const name of Object.keys(shots.C)) {
    const C = shots.C[name], V = shots.V?.[name], C2 = shots.C2?.[name];
    if (!V || !C2 || V.w !== C.w || C2.w !== C.w) continue;
    const dv = diffMap(C, V, skip), da = diffMap(C, C2, skip);
    let vAny = 0, vBeyond = 0, vBeyond8 = 0, vMax = 0, vMaxBeyond = 0, aAny = 0, aMax = 0;
    for (let i = 0; i < dv.length; i++) { if (da[i]) { aAny++; if (da[i] > aMax) aMax = da[i]; } if (dv[i]) { vAny++; if (dv[i] > vMax) vMax = dv[i]; if (!da[i]) { vBeyond++; if (dv[i] > 8) vBeyond8++; if (dv[i] > vMaxBeyond) vMaxBeyond = dv[i]; } } }
    const tot = C.w * (C.h - skip);
    res[`pixels ${name}`] = { screen: [C.w, C.h], VvsC: vAny, VvsCmax: vMax, beyondAA: vBeyond, beyondAApct: +(100 * vBeyond / tot).toFixed(4), beyondAAover8: vBeyond8, beyondAAmax: vMaxBeyond, AA: aAny, AAmax: aMax };
    console.log(`PIXELS ${name}: V vs C ${vAny} px (max ${vMax}); beyond A/A ${vBeyond} px (${res[`pixels ${name}`].beyondAApct} %, >8: ${vBeyond8}, max ${vMaxBeyond}); A/A C2 vs C ${aAny} px (max ${aMax})`);
  }
}
writeFileSync(join(OUT, 'sim-park.json'), JSON.stringify(res, null, 1));
console.log('WROTE', join(OUT, 'sim-park.json'));
process.exit(voided ? 3 : 0);
