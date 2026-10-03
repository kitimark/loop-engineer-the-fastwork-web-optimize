#!/usr/bin/env node
// attr079.mjs: P-079 attribution cycle (cd-strip strip-tc vs st6-rb2) on the page Safari has open (phone or Simulator).
// Counts only, uncounted for the block's W frames. One cycle = one page load, in this order:
//   0. reload at y 0 (scrollTo 0, location.reload), reconnect, readyState complete, settle 8 s; served JS/CSS hashed
//      from the Mac (the page's own origin) and checked against --arm's expected hashes (mismatch: VOID, exit 3).
//   1. census (LayerTree, Timeline off): hero clock digit layers (.face / .strip / .cell under .hero-copy [role=timer]),
//      how many hold a backing store (memory > 0), their MB.
//   2. top window (Timeline on): the page stamps TimeStamp 'cdw0' 650 ms after the next tick of the seconds digit and
//      'cdw1' 4000 ms later; Layout and clock Paint records whose start lies in [cdw0, cdw1).
//   3. re-entry (Timeline on): 'cdmark top', 1 s, 'cdmark out' + scrollTo(3 * innerHeight), 2.5 s, 'cdmark in' +
//      scrollTo(0) in the same page task, 2.5 s; clock Paint records whose start lies in [in, in + 1000 ms).
//   4. pin frames (Timeline OFF, no LayerTree, page polled every 1.5 s): window.__fwMorphDrive({hold: 2000, cycles: 1})
//      (st6-rb2's debug driver, inherited by both arms; it jumps to __pinMax() itself); its frames [t, dt, y, m] kept.
//   5. pin Layout (Timeline on): TimeStamp 'cdcal <performance.now()>' then the same drive; frames kept and mapped to
//      Timeline time through the TimeStamp (timeline ms = page ms + (cdcal start - its page ms)).
// A clock Paint record = a Paint whose clip box is digit-sized (w <= 1.5 x digit width and h <= 1.5 x digit height) or
// strip-sized (w <= 1.5 x digit width, h <= 12 x digit height), digit box from the hero clock's first .digit (sim.mjs
// sizeClass, the Simulator S5 measure). Windows and gates are scored by score079.mjs, not here.
// usage: node fixes/cd-strip/p079/attr079.mjs --arm C|V --cycle <n> --out <file.json> [--page <server port>] [--port 9222]
//        [--no-battery]
// The caller holds the iphone lease (or a Simulator session) and has opened the arm's URL (iphone.mjs open).
import { createHash } from 'node:crypto';
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '../../..');
const { openTab, sleep } = await import(join(REPO, 'tools/lib/wip.mjs'));
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const ARM = opt('--arm'), CYCLE = opt('--cycle'), OUTF = opt('--out');
if (!['C', 'V'].includes(ARM) || !CYCLE || !OUTF) { console.error('usage: attr079.mjs --arm C|V --cycle <n> --out <file.json> [--page <server port>] [--port 9222] [--no-battery]'); process.exit(1); }
const PORT = Number(opt('--port', process.env.FW_IPHONE_PORT || 9222));
// expected served bytes per arm (P-079): V = strip-tc, C = st6-rb2
export const EXPECT = {
  V: { js: '6fa0e1e8a221ccd5aa2983c6dcceaceab239a1535b295e07a0035ff4ea32ef16', css: '982a747d9263ca258ad60aa773d8df4b19cf0dfec10b27a6672b1746a129007d' },
  C: { js: '7bf7c4657d21f1e94c666d582efccda65f20a5498626d22964bfbc5e35124f7a', css: 'f523598b2a24ede87f745d8b6d3b7c61e113559cc6dfdb35744b20bdbcffda97' },
};
const NODE = '_app/immutable/nodes/2.DyWL8TcE.js', CSS = '_app/immutable/assets/2.gBuqKVzi.css';
const sha = (b) => createHash('sha256').update(b).digest('hex');
const self = sha(readFileSync(fileURLToPath(import.meta.url)));
const HEROSEL = '.hero-copy [role=timer] .face.svelte-1quva9c, .hero-copy [role=timer] .strip.svelte-1quva9c, .hero-copy [role=timer] .cell.svelte-1quva9c';
const MB = (x) => Math.round(x / 1e4) / 100;
const QB = (q) => (q && q.length >= 8 ? { w: Math.max(q[0], q[2], q[4], q[6]) - Math.min(q[0], q[2], q[4], q[6]), h: Math.max(q[1], q[3], q[5], q[7]) - Math.min(q[1], q[3], q[5], q[7]) } : null);
const isClock = (q, g) => !!q && !!g && q.w <= 1.5 * g.dw && q.h <= 12 * g.dh;
function flat(records) { const out = []; const walk = (r) => { out.push({ type: r.type, start: r.startTime * 1000, data: r.data }); for (const c of r.children || []) walk(c); }; for (const r of records) walk(r); return out; }
function count(recs, g) {
  const c = { Layout: 0, RecalculateStyles: 0, Paint: 0, clockPaint: 0, clockPaintPx: 0 };
  for (const r of recs) { if (r.type in c) c[r.type]++; if (r.type === 'Paint') { const q = QB(r.data?.clip); if (isClock(q, g)) { c.clockPaint++; c.clockPaintPx += Math.round(q.w * q.h); } } }
  return c;
}
const battery = async () => { if (args.includes('--no-battery')) return null; try { const { batteryInfo } = await import(join(REPO, 'tools/lib/iphone-run.mjs')); const b = batteryInfo(); return b.error ? { error: b.error } : { t: b.t, temperatureC: b.temperatureC, charging: b.IsCharging ?? null }; } catch (e) { return { error: String(e.message || e) }; } };

const res = { schema: 'cd-strip-attr079/1', tool: 'attr079.mjs', sha256: self, arm: ARM, cycle: CYCLE, startedAt: new Date().toISOString(), errors: [] };
res.battery = { start: await battery() };
const PAGE = opt('--page'); // the arm's server port: picks Safari's tab by it (one tab per port), else any http page
let c = await openTab((u) => /^https?:/.test(u) && (!PAGE || new URL(u).port === String(PAGE)), { port: PORT });
const origin = await c.evaluate('location.origin');
res.port = new URL(origin).port; // never the host (LAN address, Hard rule 12)
await c.evaluate(`scrollTo({ top: 0, behavior: 'instant' }); setTimeout(() => location.reload(), 400); 'ok'`);
c.close(); await sleep(2500);
c = await openTab((u) => u.startsWith(origin), { port: PORT });
for (let i = 0; i < 60 && (await c.evaluate('document.readyState')) !== 'complete'; i++) await sleep(500);
await sleep(8000);
const ev = (e) => c.evaluate(e);
try {
  // 0. served bytes
  const js = sha(Buffer.from(await (await fetch(`${origin}/${NODE}`)).arrayBuffer())), css = sha(Buffer.from(await (await fetch(`${origin}/${CSS}`)).arrayBuffer()));
  res.served = { js, css, ok: js === EXPECT[ARM].js && css === EXPECT[ARM].css };
  if (!res.served.ok) throw Object.assign(new Error(`VOID: arm ${ARM} serves JS ${js.slice(0, 12)} CSS ${css.slice(0, 12)}`), { void: true });
  await ev(`(() => { const hero = document.querySelector('.hero-copy [role=timer]'); const nums = [...hero.querySelectorAll('.number')];
    const X = window.__cs = { ticks: 0, w: null };
    new MutationObserver(() => { X.ticks++; if (X.arm) { X.arm = false; setTimeout(() => { console.timeStamp('cdw0'); setTimeout(() => { console.timeStamp('cdw1'); X.w = 'done'; }, 4000); }, 650); } })
      .observe(nums[nums.length - 1], { attributes: true, attributeFilter: ['data-value'] });
    const d = hero.querySelector('.digit').getBoundingClientRect(); X.g = { dw: d.width, dh: d.height, vw: innerWidth, vh: innerHeight, dpr: devicePixelRatio };
    return 'ok'; })()`);
  const g = res.geom = await ev('__cs.g');
  // 1. census
  await c.send('LayerTree.enable');
  try {
    const root = (await c.send('DOM.getDocument')).root.nodeId;
    const hn = new Set((await c.send('DOM.querySelectorAll', { nodeId: root, selector: HEROSEL })).nodeIds);
    const L = (await c.send('LayerTree.layersForNode', { nodeId: root })).layers || [];
    const H = L.filter((l) => hn.has(l.nodeId));
    res.census = { layers: L.length, heroNodes: hn.size, heroLayers: H.length, heroBacked: H.filter((l) => l.memory > 0).length, heroMB: MB(H.reduce((a, l) => a + (l.memory || 0), 0)), memoryMB: MB(L.reduce((a, l) => a + (l.memory || 0), 0)) };
  } finally { await c.send('LayerTree.disable').catch(() => {}); }
  console.log(`census ${JSON.stringify(res.census)}`);
  // Timeline
  let recs = [];
  c.on((m) => { if (m.method === 'Timeline.eventRecorded') recs.push(m.params.record); });
  await c.send('Page.disable'); await c.send('Page.enable');
  await c.send('Timeline.enable'); await c.send('Timeline.setInstruments', { instruments: ['Timeline'] });
  // 2. top window
  recs = [];
  await c.send('Timeline.start', { maxCallStackDepth: 1 });
  await ev(`(__cs.w = null, __cs.arm = true, 0)`);
  for (let i = 0; i < 12 && (await ev('__cs.w')) !== 'done'; i++) await sleep(1000);
  await sleep(300); await c.send('Timeline.stop');
  { const f = flat(recs); const ts = (n) => f.find((r) => r.type === 'TimeStamp' && r.data?.message === n)?.start;
    const w0 = ts('cdw0'), w1 = ts('cdw1');
    res.top = w0 == null || w1 == null ? { error: 'no cdw0/cdw1 TimeStamp' } : { windowMs: Math.round(w1 - w0), ...count(f.filter((r) => r.start >= w0 && r.start < w1), g) }; }
  console.log(`top ${JSON.stringify(res.top)}`);
  // 3. re-entry
  recs = [];
  await c.send('Timeline.start', { maxCallStackDepth: 1 });
  await ev(`(console.timeStamp('cdmark top'), 0)`); await sleep(1000);
  await ev(`(console.timeStamp('cdmark out'), scrollTo({ top: innerHeight * 3, behavior: 'instant' }), 0)`); await sleep(2500);
  await ev(`(console.timeStamp('cdmark in'), scrollTo({ top: 0, behavior: 'instant' }), 0)`); await sleep(2500);
  await c.send('Timeline.stop');
  { const f = flat(recs); const ts = (n) => f.find((r) => r.type === 'TimeStamp' && r.data?.message === n)?.start;
    const tin = ts('cdmark in');
    res.reentry = tin == null ? { error: 'no cdmark in TimeStamp' } : { first1s: count(f.filter((r) => r.start >= tin && r.start < tin + 1000), g), after: count(f.filter((r) => r.start >= tin + 1000), g) }; }
  console.log(`reentry ${JSON.stringify(res.reentry)}`);
  // 4. pin frames, Timeline off
  const drive = async (tag) => { await ev(`(${tag ? `console.timeStamp('cdcal ' + performance.now()), ` : ''}window.__fwMorphDrive({ hold: 2000, cycles: 1 }), 0)`);
    for (let i = 0; i < 20; i++) { await sleep(1500); const v = await ev('window.__fwMD'); if (v) return JSON.parse(v); } throw new Error('__fwMD timeout'); };
  if ((await ev('typeof window.__fwMorphDrive')) !== 'function') throw new Error('no __fwMorphDrive on this page');
  { const md = await drive(false); res.pinFrames = { atOne: md.atOne, frames: md.frames }; }
  console.log(`pin frames atOne ${JSON.stringify(res.pinFrames.atOne)}`);
  await sleep(1500);
  // 5. pin Layout, Timeline on
  recs = [];
  await c.send('Timeline.start', { maxCallStackDepth: 1 });
  const md = await drive(true);
  await c.send('Timeline.stop');
  { const f = flat(recs); const cal = f.find((r) => r.type === 'TimeStamp' && /^cdcal /.test(r.data?.message || ''));
    if (!cal) res.pinTimeline = { error: 'no cdcal TimeStamp' };
    else { const off = cal.start - Number(cal.data.message.split(' ')[1]);
      res.pinTimeline = { offMs: Math.round(off * 10) / 10, atOne: md.atOne, frames: md.frames, recs: f.filter((r) => ['Layout', 'RecalculateStyles', 'Paint'].includes(r.type)).map((r) => [Math.round((r.start - off) * 10) / 10, r.type[0], r.type === 'Paint' && isClock(QB(r.data?.clip), g) ? 1 : 0]) }; } }
  await c.send('Timeline.disable').catch(() => {});
} catch (e) { res.errors.push(String(e.message || e)); if (e.void) process.exitCode = 3; else process.exitCode = 1; console.error(e.message || e); }
c.close();
res.battery.end = await battery();
mkdirSync(dirname(OUTF), { recursive: true });
writeFileSync(OUTF, JSON.stringify(res));
console.log(`wrote ${OUTF} (attr079 sha256 ${self.slice(0, 12)})`);
