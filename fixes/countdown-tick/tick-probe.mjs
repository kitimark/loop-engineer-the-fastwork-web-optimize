// countdown-tick: count probe (no timing claim). Runs several arms of the page side by side in one headless Chrome
// (430x932 DPR 3, mobile, touch), all at the top of the page with the hero countdown on screen, and records for each
// arm: every fire of a timer armed from the countdown component's own lines (site, aim, actual fire time), the hero
// clock's aria-label right after each fire, and every aria-label change.
//
// Forcing the timer grid (env GRID, default 30): an init script replaces setTimeout/setInterval/clearTimeout/
// clearInterval with a model of WebKit's DOMTimer under thermal mitigation, on top of Chrome's own timers:
//   - a timer's nesting level is the level of the timer callback it was created in + 1 (0 outside timers);
//     a repeating timer's level grows by 1 per fire up to 5 (DOMTimer::fired);
//   - at nesting level >= 5 the fire time is rounded UP to the next multiple of GRID ms on performance.now()
//     (DOMTimer::alignedFireTime with Page::domTimerAlignmentInterval = 30 ms in thermal mitigation / low power);
//   - a repeating timer re-arms at its actual fire time + interval (ThreadTimers.cpp), so it drifts.
// (Source references: F-266, research/serious-heat/README.md 3.3.1; WebKit main bdc535f8fe.) GRID=0 keeps the shim
// as a pass-through recorder (Fair). Known gap: microtasks queued by a timer callback run after the shim reset the
// nesting level; WebKit runs them inside the fire. Only __cdGo's first wait (v9, created from a Svelte effect) could
// see a lower level; the 1 s chain itself is created inside the timer callback.
//
// Modes (argv[2]):
//   counts  SECONDS s at the top, all arms in parallel: fires/60 s, skipped and repeated shown seconds, lateness
//   resume  v9 arms: hide the hero clock (instant scroll to 3 viewports) for HIDE s, back to 0, twice; checks the
//           first shown value after each resume against the live chain's value at that second
//   pixels  frozen look: per arm, PIXSHOTS shots of the hero clock 400 ms after its value changed, repeated until two are byte-equal (at rest), paired
//           across arms by equal aria-label; orig2 = a second orig page (A/A)
//   logger  functional check of phone-logger.mjs (P-130): installs it the way an --inject runner does (Runtime.evaluate
//           after load), waits 128 s, reads its summary (120 s window, timer-grid reads) next to this probe's own counts
// Arms (argv[3], comma list): orig (baseline), orig2, tick (fixes/countdown-tick), v9 (fixes/v9-best), v9tick
// (fixes/countdown-tick-v9 on v9-best). Served from hash-pinned copies in out/countdown-tick/snap/<arm>.
//   node tools/lock.mjs run chrome-measure --shared --weight probe --max-seconds 300 --owner fix-countdown-tick -- \
//     env GRID=30 SECONDS=240 node fixes/countdown-tick/tick-probe.mjs counts orig,tick,v9,v9tick
// Output: out/countdown-tick/<mode>-<stamp>.json (+ PNGs for pixels).
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, rmSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { loadavg } from 'node:os';
import { join, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { inflateSync } from 'node:zlib';
import { REPO as WT, resolveTree } from '../../tools/lib/paths.mjs';
const { launchChrome, CDP, gotoAndSettle, sleep } = await import(join(WT, 'tools/lib/cdp.mjs'));

const MODE = process.argv[2] || 'counts';
const ARMS = (process.argv[3] || 'orig,tick,v9,v9tick').split(',');
const GRID = Number(process.env.GRID ?? 30);
const SECONDS = Number(process.env.SECONDS || 240);
const HIDE = Number(process.env.HIDE || 7.4);
const PIXSHOTS = Number(process.env.PIXSHOTS || 6);
const OUT = join(WT, 'out/countdown-tick'); mkdirSync(OUT, { recursive: true });
const STAMP = new Date().toISOString().replace(/[:.]/g, '-');
const BASE = resolveTree('site-pretty');
const NODE = '_app/immutable/nodes/2.DyWL8TcE.js', CSS = '_app/immutable/assets/2.gBuqKVzi.css';
const DEADLINE = Date.parse('2026-11-02T12:00:00+07:00');
if (Date.now() > DEADLINE - 15 * 60e3) { console.error('VOID: too close to (or past) the countdown expiry'); process.exit(3); }
const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex').slice(0, 12);
const SRC = { orig: [], orig2: [], tick: ['fixes/countdown-tick/overlay'], v9: ['fixes/v9-best/overlay'],
  v9tick: ['fixes/countdown-tick-v9/overlay', 'fixes/v9-best/overlay'] };

// hash-pinned snapshot of an arm: the two files, first overlay that has them, else the baseline
function snap(arm) {
  const dir = join(OUT, 'snap', arm), served = {};
  for (const f of [NODE, CSS]) {
    const from = [...SRC[arm].map((d) => join(WT, d, f)), join(BASE, f)].find((p) => existsSync(p));
    mkdirSync(dirname(join(dir, f)), { recursive: true }); copyFileSync(from, join(dir, f)); served[f] = sha(join(dir, f));
  }
  return { dir, served };
}
async function server(label, overlay) {
  const st = join(OUT, `serve-${label}.json`); rmSync(st, { force: true });
  const args = [join(WT, 'tools/serve.mjs'), '--root', BASE, '--overlay', overlay, '--port', '0', '--quiet', '--state', st,
    '--vendors=local', '--https', '--latency', '150', '--no-http-twin', '--no-cache'];
  const p = spawn(process.execPath, args, { stdio: ['ignore', 'ignore', 'inherit'] });
  for (let i = 0; i < 300; i++) { if (existsSync(st)) try { return { p, ...JSON.parse(readFileSync(st, 'utf8')) }; } catch {} await sleep(100); }
  p.kill(); throw new Error(label + ' server did not start');
}
// the countdown component's line range in an arm's JS: function cD( .. the line before `var h = sD();`
function cdRange(file) {
  const lines = readFileSync(file, 'utf8').split('\n');
  const a = lines.findIndex((l) => l.startsWith('function cD(')) + 1;
  const b = lines.findIndex((l, i) => i > a && l.trim() === 'var h = sD();') + 1;
  if (a < 1 || b <= a) throw new Error('countdown range not found in ' + file);
  return [a, b - 1];
}

const shim = (range) => `(() => {
  const G = ${GRID}, nTO = window.setTimeout.bind(window), nCT = window.clearTimeout.bind(window);
  const R = window.__ct = { fires: [], labels: [], arms: [], cdLines: ${JSON.stringify(range)} };
  let nesting = 0, nextId = 5e6; const live = new Map();
  const align = (due, lvl) => (G && lvl >= 5 ? Math.ceil(due / G) * G : due);
  const site = () => { const m = /nodes\\/2\\.DyWL8TcE\\.js:(\\d+):/.exec(new Error().stack.split('\\n').slice(3, 6).join(' ')); return m ? +m[1] : 0; };
  const isCd = (l) => l >= R.cdLines[0] && l <= R.cdLines[1];
  window.__ctHero = () => document.querySelector('.hero-track [role=timer]') || document.querySelector('[role=timer]');
  const label = () => { const t = window.__ctHero(); return t ? t.getAttribute('aria-label') : null; };
  const run = (id, lvl, fn, args, rec) => { const prev = nesting; nesting = Math.min(lvl, 5);
    if (rec) { rec.fire = Date.now(); rec.firePerf = performance.now(); R.fires.push(rec); nTO(() => { rec.label = label(); rec.timers = document.querySelectorAll('[role=timer]').length; }, 0); }
    try { typeof fn === 'function' ? fn(...args) : (0, eval)(String(fn)); } finally { nesting = prev; } };
  window.setTimeout = function (fn, d, ...args) {
    const id = ++nextId, lvl = nesting + 1, l = site(), now = performance.now(), due = align(now + Math.max(0, Number(d) || 0), lvl);
    const rec = isCd(l) ? { kind: 'timeout', site: l, created: Date.now(), delay: Number(d) || 0, lvl } : null;
    if (rec) rec.aim = rec.created + rec.delay;
    live.set(id, nTO(() => { live.delete(id); run(id, lvl, fn, args, rec); }, Math.max(0, due - now)));
    return id; };
  window.setInterval = function (fn, d, ...args) {
    const id = ++nextId, iv = Math.max(0, Number(d) || 0), l = site(); let lvl = nesting + 1, k = 0;
    const created = Date.now();
    const arm = (from) => { const now = performance.now(), due = align(from + iv, lvl);
      live.set(id, nTO(() => { k++; const fireT = performance.now();
        const rec = isCd(l) ? { kind: 'interval', site: l, created, delay: iv, lvl, k } : null;
        if (lvl < 5) lvl++;
        arm(fireT); run(id, lvl, fn, args, rec); }, Math.max(0, due - now))); };
    arm(performance.now()); return id; };
  window.clearTimeout = window.clearInterval = (id) => { if (live.has(id)) { nCT(live.get(id)); live.delete(id); } else nCT(id); };
  new MutationObserver((ms) => { for (const m of ms) if (m.target.getAttribute && m.target.getAttribute('role') === 'timer' && m.attributeName === 'aria-label')
    R.labels.push({ t: Date.now(), label: m.target.getAttribute('aria-label'), first: m.target === window.__ctHero() }); })
    .observe(document, { subtree: true, attributes: true, attributeFilter: ['aria-label'] });
})();`;

async function openPage(cdp, inject) {
  const page = await cdp.newIsolatedPage();
  page.errors = [];
  page.on((m) => {
    if (m.method === 'Runtime.exceptionThrown') page.errors.push((m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text).split('\n')[0]);
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') page.errors.push(`console: ${m.params.args.map((a) => a.value ?? a.description).join(' ')}`.slice(0, 300));
  });
  await page.send('Emulation.setDeviceMetricsOverride', { width: 430, height: 932, deviceScaleFactor: 3, mobile: true });
  await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await page.send('Emulation.setFocusEmulationEnabled', { enabled: true });
  await page.send('Page.addScriptToEvaluateOnNewDocument', { source: inject });
  return page;
}

// shown value in seconds from the aria-label ("d unit, h unit, m unit, s unit" in the page's language)
const secs = (label) => { const n = String(label ?? '').match(/\d+/g); return n && n.length === 4 ? ((+n[0] * 24 + +n[1]) * 60 + +n[2]) * 60 + +n[3] : null; };
const expect = (t) => Math.max(0, Math.ceil((DEADLINE - t) / 1e3));

function analyse(arm, R, w0, w1) {
  // the hero clock's 1 s timer fires (the chain, or the interval), inside the window
  const fires = R.fires.filter((f) => f.delay === 1000 || f.kind === 'timeout').filter((f) => f.fire >= w0 && f.fire <= w1);
  const ones = R.fires.filter((f) => f.delay >= 1 && f.delay <= 1000 && f.fire >= w0 && f.fire <= w1);
  // phase: chain arms -> T0 from the first aim (aim_1 = T0 + 1000); interval arms -> creation time of the 1 s interval
  const firstChain = R.fires.find((f) => f.kind === 'timeout' && f.delay > 0);
  const firstIv = R.fires.find((f) => f.kind === 'interval' && f.delay === 1000);
  const chain = !!firstChain && !firstIv;
  let T0 = null;
  if (chain) { const ks = R.fires.filter((f) => f.kind === 'timeout').map((f) => f.aim); T0 = Math.min(...ks) - 1000; }
  else if (firstIv) T0 = firstIv.created;
  const late = [], vals = [], wrong = [];
  for (const f of fires) {
    const k = chain ? Math.round((f.aim - T0) / 1e3) : f.k;
    const nominal = T0 + k * 1e3;
    late.push(f.fire - nominal);
    const v = secs(f.label);
    vals.push(v);
    if (chain && v !== null && v !== expect(nominal)) wrong.push({ k, v, want: expect(nominal), late: f.fire - nominal });
  }
  let skips = 0, repeats = 0; const skipAt = [];
  for (let i = 1; i < vals.length; i++) { if (vals[i] === null || vals[i - 1] === null) continue; const d = vals[i - 1] - vals[i];
    if (d >= 2) { skips += d - 1; skipAt.push(i); } if (d === 0) repeats++; }
  const labs = R.labels.filter((l) => l.first && l.t >= w0 && l.t <= w1).map((l) => secs(l.label));
  let lSkips = 0; for (let i = 1; i < labs.length; i++) if (labs[i - 1] - labs[i] >= 2) lSkips += labs[i - 1] - labs[i] - 1;
  const sorted = [...late].sort((a, b) => a - b), q = (p) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
  const span = (w1 - w0) / 1e3;
  return { arm, windowS: +span.toFixed(1), phaseModel: chain ? 'chain (T0 from first aim)' : 'interval (T0 = creation)',
    clockFires: fires.length, clockFiresPer60s: +(fires.length / span * 60).toFixed(2), timerFiresFromCountdownLines: ones.length,
    sites: [...new Set(R.fires.map((f) => `${f.kind}@${f.site}/${f.delay}`))],
    shownValues: new Set(vals.filter((v) => v !== null)).size, labelChanges: labs.length,
    skippedSeconds: skips, repeatedSeconds: repeats, skippedSecondsPer10min: +(skips / span * 600).toFixed(2), labelSkips: lSkips,
    lateMs: { min: sorted[0], p50: q(0.5), p95: q(0.95), max: sorted[sorted.length - 1] },
    lateIn0to40: late.filter((x) => x >= 0 && x <= 40).length, wrongValue: wrong.slice(0, 10), wrongCount: wrong.length,
    timersOnPage: [...new Set(R.fires.map((f) => f.timers).filter(Boolean))] };
}

// ---- PNG compare (decoder as in fixes/countdown-faces/pixels.mjs, de-countdown / fix-cd-strip, credit) ----
function pngPixels(buf) {
  let o = 8, w, h, bpp; const idat = [];
  while (o < buf.length) { const len = buf.readUInt32BE(o), type = buf.toString('ascii', o + 4, o + 8), d = buf.subarray(o + 8, o + 8 + len);
    if (type === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); bpp = d[9] === 6 ? 4 : 3; } else if (type === 'IDAT') idat.push(d); o += 12 + len; }
  const raw = inflateSync(Buffer.concat(idat)), stride = w * bpp, px = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) { const f = raw[y * (stride + 1)], line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) { const a = x >= bpp ? px[y * stride + x - bpp] : 0, b = y ? px[(y - 1) * stride + x] : 0, c = x >= bpp && y ? px[(y - 1) * stride + x - bpp] : 0;
      let v = line[x]; if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1; else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      px[y * stride + x] = v & 255; } }
  return { w, h, bpp, px };
}
function pxDiff(a, b) {
  const A = pngPixels(a), B = pngPixels(b);
  if (A.w !== B.w || A.h !== B.h) return { sizeMismatch: [A.w, A.h, B.w, B.h] };
  let n = 0, max = 0;
  for (let i = 0; i < A.px.length; i += A.bpp) { let d = 0; for (let c = 0; c < 3; c++) d = Math.max(d, Math.abs(A.px[i + c] - B.px[i + c])); if (d) n++; max = Math.max(max, d); }
  return { w: A.w, h: A.h, diffPixels: n, diffPct: +(100 * n / (A.w * A.h)).toFixed(3), maxChannelDelta: max };
}
function colours(buf) { const A = pngPixels(buf); const s = new Set(); for (let i = 0; i < A.px.length && s.size < 40; i += A.bpp) s.add(A.px.readUIntBE(i, 3)); return s.size; }

async function shots(page, arm, dir) {
  const out = [];
  for (let i = 0; i < PIXSHOTS; i++) {
    // wait for the next change of the hero clock's label, then 400 ms, then shoot until two shots in a row are
    // byte-equal (the roll is at rest), all inside the same shown second
    const before = await page.eval(`window.__ct.labels.filter((l) => l.first).length`);
    for (let j = 0; j < 100; j++) { await sleep(20); if ((await page.eval(`window.__ct.labels.filter((l) => l.first).length`)) > before) break; }
    await sleep(400);
    const r = await page.eval(`(() => { const t = window.__ctHero(), b = t.getBoundingClientRect();
      return { x: b.left + scrollX, y: b.top + scrollY, w: b.width, h: b.height, label: t.getAttribute('aria-label') }; })()`);
    let buf = null, prev = null, tries = 0;
    for (; tries < 5; tries++) {
      const shot = await page.send('Page.captureScreenshot', { format: 'png', clip: { x: r.x, y: r.y, width: r.w, height: r.h, scale: 1 }, captureBeyondViewport: false });
      buf = Buffer.from(shot.data, 'base64');
      if (prev && prev.equals(buf)) break;
      prev = buf; await sleep(60);
    }
    const after = await page.eval(`window.__ctHero().getAttribute('aria-label')`);
    if (after !== r.label) { out.push({ label: r.label, void: 'label changed during the shot' }); continue; }
    if (tries >= 5) { out.push({ label: r.label, void: 'not at rest (5 shots differ)' }); continue; }
    const f = join(dir, `${arm}-${i}.png`); writeFileSync(f, buf);
    out.push({ label: r.label, secs: secs(r.label), file: f, colours: colours(buf), sha: createHash('sha256').update(buf).digest('hex').slice(0, 12) });
  }
  return out;
}

const servers = {}, served = {}, ranges = {};
for (const arm of ARMS) {
  const s = snap(arm.replace(/2$/, '')); served[arm] = s.served; ranges[arm] = cdRange(join(s.dir, NODE));
  servers[arm] = await server(arm, s.dir);
}
const ch = await launchChrome({ port: 0, headless: true, profileDir: join(OUT, `chrome-profile-${MODE}`) });
const cdp = await CDP.connect(ch.wsUrl);
await cdp.send('Security.setIgnoreCertificateErrors', { ignore: true }).catch(() => {});
const res = { mode: MODE, arms: ARMS, grid: GRID, seconds: SECONDS, served, ranges, browser: ch.browser, startedAt: new Date().toISOString(), load1: [loadavg()[0]] };
const pages = {};
try {
  for (const arm of ARMS) { pages[arm] = await openPage(cdp, shim(ranges[arm])); }
  await Promise.all(ARMS.map((arm) => gotoAndSettle(pages[arm], servers[arm].url, { quietMs: 1500, maxMs: 45000 })));
  for (const arm of ARMS) await pages[arm].eval(`(document.documentElement.style.scrollBehavior = 'auto', scrollTo(0, 0), 1)`);
  await sleep(6000); // past the first five fires (nesting level 5: the grid applies from there)
  const w0 = Date.now();
  if (MODE === 'counts') {
    await sleep(SECONDS * 1000);
  } else if (MODE === 'resume') {
    res.resumes = Object.fromEntries(ARMS.map((a) => [a, []]));
    for (let c = 0; c < 2; c++) {
      await sleep(20000 + c * 3300);
      await Promise.all(ARMS.map((a) => pages[a].eval(`(scrollTo(0, Math.round(document.documentElement.scrollHeight * 0.4)), 1)`)));
      await sleep(HIDE * 1000 + c * 450);
      for (const a of ARMS) { const t = await pages[a].eval(`(window.__ctBack = Date.now(), scrollTo(0, 0), window.__ctBack)`); res.resumes[a].push({ back: t }); }
      await sleep(4000);
    }
    await sleep(5000);
  } else if (MODE === 'logger') {
    const L = await import(join(WT, 'fixes/countdown-tick/phone-logger.mjs'));
    res.loggerInstall = {};
    for (const a of ARMS) res.loggerInstall[a] = await pages[a].eval(L.install);
    await sleep(128000);
    res.logger = {};
    for (const a of ARMS) { const r = JSON.parse(await pages[a].eval(L.read)); res.logger[a] = { n: r.n, summary: r.summary }; }
  } else if (MODE === 'pixels') {
    const dir = join(OUT, `pixels-${STAMP}`); mkdirSync(dir, { recursive: true });
    const got = await Promise.all(ARMS.map((a) => shots(pages[a], a, dir)));
    res.shots = Object.fromEntries(ARMS.map((a, i) => [a, got[i]]));
  }
  const w1 = Date.now();
  res.load1.push(loadavg()[0]);
  res.window = { from: new Date(w0).toISOString(), seconds: (w1 - w0) / 1e3 };
  res.raw = {};
  for (const arm of ARMS) {
    const R = await pages[arm].eval(`window.__ct`);
    res.raw[arm] = { fires: R.fires.length, labels: R.labels.length };
    (res.arms_ ||= {})[arm] = { ...analyse(arm, R, w0, w1), errors: pages[arm].errors.slice(0, 5) };
    if (MODE === 'resume') {
      // per resume: the first label change of the hero clock after scrolling back, vs the live chain's value then
      const a = res.arms_[arm];
      // phase: the chain's first aim - 1 s (v9tick), or the 1 s interval's creation time (v9: countdown-faces' __cdT0)
      const firstIv = R.fires.find((f) => f.kind === 'interval' && f.delay === 1000);
      const chainT0 = firstIv ? firstIv.created : (() => { const t = R.fires.filter((f) => f.kind === 'timeout' && f.delay > 0).map((f) => f.aim); return t.length ? Math.min(...t) - 1000 : null; })();
      for (const r of res.resumes[arm]) {
        const first = R.labels.find((l) => l.first && l.t >= r.back);
        const nextFire = R.fires.find((f) => f.fire >= r.back);
        r.firstLabelAfter = first ? { dt: first.t - r.back, secs: secs(first.label) } : null;
        if (chainT0 !== null && first) { const k = Math.floor((first.t - chainT0) / 1e3); r.liveChainValue = expect(chainT0 + k * 1e3); r.equal = r.liveChainValue === r.firstLabelAfter.secs; }
        r.nextFire = nextFire ? { dt: nextFire.fire - r.back, secs: secs(nextFire.label) } : null;
        const hiddenLabels = R.labels.filter((l) => l.first && l.t > r.back - HIDE * 1000 && l.t < r.back).length;
        r.labelChangesWhileHidden = hiddenLabels;
      }
      a.T0 = chainT0;
    }
  }
  if (MODE === 'pixels') {
    const pairs = [];
    const A = res.shots;
    const cmp = (x, y) => { for (const s of A[x] || []) { if (!s.file) continue; const t = (A[y] || []).find((u) => u.file && u.label === s.label);
      if (t) pairs.push({ a: x, b: y, label: s.label, bytesEqual: s.sha === t.sha, colours: [s.colours, t.colours], ...pxDiff(readFileSync(s.file), readFileSync(t.file)) }); } };
    if (ARMS.includes('orig2')) cmp('orig', 'orig2');
    cmp('orig', 'tick'); cmp('v9', 'v9tick'); cmp('orig', 'v9');
    res.pairs = pairs;
  }
} finally {
  for (const p of Object.values(pages)) await p.close().catch(() => {});
  cdp.close(); await ch.close(); for (const s of Object.values(servers)) s.p.kill();
}
const file = join(OUT, `${MODE}-${STAMP}.json`);
writeFileSync(file, JSON.stringify(res, null, 1));
const brief = Object.values(res.arms_ || {}).map((a) => ({ arm: a.arm, s: a.windowS, fires60: a.clockFiresPer60s, skips: a.skippedSeconds, reps: a.repeatedSeconds,
  late: `${a.lateMs.min}..${a.lateMs.max}`, in0to40: `${a.lateIn0to40}/${a.clockFires}`, wrong: a.wrongCount, err: a.errors.length }));
console.log(JSON.stringify({ file, grid: GRID, brief, resumes: res.resumes, logger: res.logger, pairs: res.pairs?.map((p) => `${p.a}/${p.b} ${p.label} eq=${p.bytesEqual} diff=${p.diffPixels} max=${p.maxChannelDelta}`) }, null, 1));
