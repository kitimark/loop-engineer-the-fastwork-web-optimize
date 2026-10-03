// pill-swap Chrome probe: COUNTS ONLY (no timing verdicts). Chrome mobile 430x932 DPR 3 + touch, CPU 6x, fresh
// isolated context per arm, servers started here (--vendors=local --https --latency 150).
// Per arm, per position: scroll there (instant), settle 1.5 s, then a WIN ms trace (devtools.timeline +
// invalidationTracking) and a MutationObserver on the avatar box. Reports: Layout events, layout objects laid out,
// LayoutInvalidationTracking / StyleRecalcInvalidationTracking events whose node is in the avatar box, and Layout events
// that follow an avatar invalidation ("rotator layouts").
//   node tools/lock.mjs run chrome-measure --shared --weight probe --max-seconds 300 --owner pill-swap -- \
//     node fixes/pill-swap/chromeprobe.mjs base,st6,norot [positions]
// Arms: out/pill-swap/snap/<arm>; base = committed baseline. Output: out/pill-swap/chrome/counts-<stamp>.json
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { loadavg } from 'node:os';
import { join } from 'node:path';
import { REPO as WT, resolveTree } from '../../tools/lib/paths.mjs';
const { launchChrome, CDP, gotoAndSettle, sleep } = await import(join(WT, 'tools/lib/cdp.mjs'));

const ARMS = (process.argv[2] || 'base,st6,norot').split(',');
const ONLY = process.argv[3] ? process.argv[3].split(',') : null;
const WIN = Number(process.env.PS_WIN || 4000);
const OUT = join(WT, 'out/pill-swap/chrome');
mkdirSync(OUT, { recursive: true });
const BASE = resolveTree('site-pretty');
const NODE = '_app/immutable/nodes/2.DyWL8TcE.js', CSS = '_app/immutable/assets/2.gBuqKVzi.css';
const dirOf = (arm) => (arm === 'base' ? null : join(WT, 'out/pill-swap/snap', arm));
const fileOf = (arm, f) => (dirOf(arm) && existsSync(join(dirOf(arm), f)) ? join(dirOf(arm), f) : join(BASE, f));
const sha = (b) => createHash('sha256').update(b).digest('hex');

async function server(arm) {
  const st = join(OUT, `serve-${arm}.json`); rmSync(st, { force: true });
  const args = [join(WT, 'tools/serve.mjs'), '--root', BASE, ...(dirOf(arm) ? ['--overlay', dirOf(arm)] : []), '--port', '0', '--quiet', '--no-cache', '--state', st, '--vendors=local', '--https', '--latency', '150', '--no-http-twin'];
  const p = spawn(process.execPath, args, { stdio: ['ignore', 'ignore', 'inherit'] });
  for (let i = 0; i < 300; i++) { if (existsSync(st)) try { return { p, ...JSON.parse(readFileSync(st, 'utf8')) }; } catch {} await sleep(100); }
  p.kill(); throw new Error(arm + ' server did not start');
}

const POS = `(() => { const vh = innerHeight, t = document.querySelector('.hero-track'), av = document.querySelector('.start-selling-avatars.is-carousel');
  const tb = t ? t.getBoundingClientRect().bottom + scrollY : 2 * vh; const at = av ? Math.round(av.getBoundingClientRect().top + scrollY) : null;
  return { vh, heroTrackBottom: Math.round(tb), avatarsTop: at, pos: { top: 0, y300: 300, y600: 600, y900: 900, pastHero: Math.round(tb + 1.2 * vh), pill: at == null ? null : Math.max(0, at - Math.round(vh / 2)) } }; })()`;
const MO_START = `(() => { const av = document.querySelector('.start-selling-avatars.is-carousel'); const S = window.__psMo = { attr: {}, child: 0 };
  if (!av) return 0; S.mo = new MutationObserver((ms) => { for (const m of ms) { if (m.type === 'attributes') S.attr[m.attributeName] = (S.attr[m.attributeName] || 0) + 1; else S.child += m.addedNodes.length + m.removedNodes.length; } });
  S.mo.observe(av, { subtree: true, attributes: true, childList: true }); const r = av.getBoundingClientRect(); return { avTop: Math.round(r.top), inView: r.bottom > 0 && r.top < innerHeight, scrollY: Math.round(scrollY) }; })()`;
const MO_STOP = `(() => { const S = window.__psMo; S.mo && S.mo.disconnect(); return { attr: S.attr, child: S.child }; })()`;
// backend node ids of the avatar box and its imgs (to match invalidation-tracking node ids)
async function avatarNodeIds(page) {
  const { result } = await page.send('Runtime.evaluate', { expression: `[document.querySelector('.start-selling-avatars.is-carousel'), ...document.querySelectorAll('.start-selling-avatars.is-carousel img')].filter(Boolean)`, returnByValue: false });
  const props = await page.send('Runtime.getProperties', { objectId: result.objectId, ownProperties: true });
  const ids = new Set();
  for (const p of props.result) { if (!/^\d+$/.test(p.name)) continue; const d = await page.send('DOM.describeNode', { objectId: p.value.objectId }); ids.add(d.node.backendNodeId); }
  return ids;
}

const CATS = ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'disabled-by-default-devtools.timeline.invalidationTracking'];
async function traced(page, ms) {
  const events = [];
  const off = page.on((m) => { if (m.method === 'Tracing.dataCollected') events.push(...m.params.value); });
  await page.send('Tracing.start', { traceConfig: { includedCategories: CATS, recordMode: 'recordAsMuchAsPossible' }, transferMode: 'ReportEvents' });
  await sleep(ms);
  const done = page.waitFor((m) => m.method === 'Tracing.tracingComplete', 60000);
  await page.send('Tracing.end'); await done; off();
  return events;
}
function analyze(events, avIds) {
  const names = new Map(); for (const e of events) if (e.ph === 'M' && e.name === 'thread_name') names.set(`${e.pid}:${e.tid}`, e.args.name);
  const by = new Map();
  for (const e of events) { const k = `${e.pid}:${e.tid}`; if (names.get(k) !== 'CrRendererMain') continue; if (!by.has(k)) by.set(k, []); by.get(k).push(e); }
  let main = null; for (const [k, l] of by) if (!main || l.length > main.length) main = l;
  if (!main) return null;
  main.sort((a, b) => a.ts - b.ts);
  const isAv = (d) => d && (avIds.has(d.nodeId) || /start-selling-avatars/.test(d.nodeName || ''));
  const layouts = [], inv = { layout: 0, style: 0, avLayout: 0, avStyle: 0, avLayoutReasons: {}, avStyleReasons: {} };
  let pendingAv = false, pendingReasons = [];
  for (const e of main) {
    const d = e.args?.data;
    if (e.name === 'LayoutInvalidationTracking') { inv.layout++; if (isAv(d)) { inv.avLayout++; inv.avLayoutReasons[d.reason] = (inv.avLayoutReasons[d.reason] || 0) + 1; pendingAv = true; pendingReasons.push(d.reason); } }
    if (e.name === 'StyleRecalcInvalidationTracking' || e.name === 'StyleInvalidatorInvalidationTracking') { inv.style++; if (isAv(d)) { inv.avStyle++; const r = d.reason || d.invalidationList?.[0]?.classes?.join?.(',') || e.name; inv.avStyleReasons[r] = (inv.avStyleReasons[r] || 0) + 1; } }
    if (e.name === 'Layout' && e.ph === 'X') {
      const b = e.args?.beginData || {};
      layouts.push({ dirty: b.dirtyObjects, total: b.totalObjects, partial: b.partialLayout, av: pendingAv, reasons: pendingReasons.slice(0, 4), ms: +(e.dur / 1000).toFixed(2) });
      pendingAv = false; pendingReasons = [];
    }
  }
  const sum = (xs, f) => xs.reduce((a, x) => a + (f(x) || 0), 0);
  const ult = main.filter((e) => e.name === 'UpdateLayoutTree' && e.ph === 'X');
  return {
    layouts: layouts.length, layoutObjects: sum(layouts, (l) => l.dirty), avLayouts: layouts.filter((l) => l.av).length, avLayoutObjects: sum(layouts.filter((l) => l.av), (l) => l.dirty),
    avLayoutList: layouts.filter((l) => l.av).slice(0, 12), bigLayouts: layouts.filter((l) => l.dirty > 50).length,
    styleRecalcs: ult.length, elementsStyled: sum(ult, (e) => e.args?.elementCount ?? e.args?.endData?.elementCount), paints: main.filter((e) => e.name === 'Paint').length,
    invalidations: inv,
  };
}

const servers = {};
for (const arm of ARMS) servers[arm] = await server(arm);
const ch = await launchChrome({ port: 0, profileDir: join(OUT, 'chrome-profile') });
const cdp = await CDP.connect(ch.wsUrl);
await cdp.send('Security.setIgnoreCertificateErrors', { ignore: true }).catch(() => {});
const res = { tool: 'pill-swap chromeprobe (counts only)', win: WIN, browser: ch.browser, startedAt: new Date().toISOString(), load1: [loadavg()[0]], arms: {} };
try {
  for (const arm of ARMS) {
    const url = `https://localhost:${servers[arm].port}/`;
    const served = {};
    for (const f of [NODE, CSS]) {
      const want = sha(readFileSync(fileOf(arm, f)));
      const page0 = null; void page0;
      served[f.split('/').pop()] = want.slice(0, 12);
    }
    const page = await cdp.newIsolatedPage();
    await page.send('DOM.enable');
    await page.send('Emulation.setDeviceMetricsOverride', { width: 430, height: 932, deviceScaleFactor: 3, mobile: true });
    await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await page.send('Emulation.setFocusEmulationEnabled', { enabled: true });
    await page.send('Page.bringToFront');
    await gotoAndSettle(page, url, { quietMs: 2000 }); await sleep(1500);
    // served-file check from inside the page (the server's https cert is self-signed)
    const got = await page.eval(`Promise.all(${JSON.stringify([NODE, CSS])}.map(async (f) => { const b = await (await fetch('/' + f, { cache: 'no-store' })).arrayBuffer(); const h = await crypto.subtle.digest('SHA-256', b); return [...new Uint8Array(h)].map((x) => x.toString(16).padStart(2, '0')).join('').slice(0, 12); }))`);
    if (got[0] !== served['2.DyWL8TcE.js'] || got[1] !== served['2.gBuqKVzi.css']) throw new Error(`VOID ${arm}: served ${got} expected ${Object.values(served)}`);
    await page.send('Emulation.setCPUThrottlingRate', { rate: 6 }); await sleep(1000);
    const geo = await page.eval(POS);
    await page.eval(`(scrollTo({ top: ${geo.pos.pastHero}, behavior: 'instant' }), 0)`); await sleep(1500);
    await page.eval(`(scrollTo({ top: 0, behavior: 'instant' }), 0)`); await sleep(1500);
    const avIds = await avatarNodeIds(page);
    const out = { served, geo, positions: {} };
    for (const [name, y] of Object.entries(geo.pos)) {
      if (y == null || (ONLY && !ONLY.includes(name))) continue;
      await page.eval(`(scrollTo({ top: ${y}, behavior: 'instant' }), 0)`); await sleep(1500);
      const st = await page.eval(MO_START);
      const ev = await traced(page, WIN);
      const mo = await page.eval(MO_STOP);
      const a = analyze(ev, avIds);
      out.positions[name] = { y, state: st, mutations: mo, ...a };
      console.log(`${arm} ${name} y ${st.scrollY} avTop ${st.avTop} inView ${st.inView} | mo ${JSON.stringify(mo.attr)} child ${mo.child} | L ${a.layouts} objs ${a.layoutObjects} big ${a.bigLayouts} | avL ${a.avLayouts} objs ${a.avLayoutObjects} | inv ${JSON.stringify(a.invalidations.avLayoutReasons)} | RS ${a.styleRecalcs} els ${a.elementsStyled} paint ${a.paints}`);
    }
    res.arms[arm] = out;
    res.load1.push(loadavg()[0]);
    await page.close?.();
  }
} finally {
  cdp.close(); await ch.close(); for (const s of Object.values(servers)) s.p.kill();
}
const f = join(OUT, `counts-${res.startedAt.replace(/[:.]/g, '-')}.json`);
writeFileSync(f, JSON.stringify(res, null, 1));
console.log('wrote', f, 'load1', res.load1.map((x) => x.toFixed(1)).join(','));
