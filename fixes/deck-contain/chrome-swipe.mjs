// P-143 (deck-contain) Chrome counts: per-frame Layout and style counts over the profile deck band during a scripted
// swipe, per arm. Headless Chrome, 430x932 DPR 3 mobile + touch, CPU 1x (counts only, no timing verdict; ms printed and
// never judged), shared lane (weight probe). Each step is a cold load in a fresh isolated context of the v9.1d base
// (served bytes checked against the pins, else exit 26); the arm's CSS goes in a <style> after load, as in the
// Simulator driver. Swipe: scrollTo 10 px per rAF from 0 to 2600 (same as sim-swipe.mjs), a console.timeStamp per step;
// trace events between two step marks belong to the frame of the first. Per frame: Layout events, their
// beginData.dirtyObjects, UpdateLayoutTree events and elementCount, Paint events.
// usage: node fixes/deck-contain/chrome-swipe.mjs <hold> <base url> <arm>:<k> ...   (arms as in sim-swipe.mjs)
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync, appendFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { loadavg } from 'node:os';
import { launchChrome, CDP, gotoAndSettle, sleep, tempProfileDir, headedUA } from '../../tools/lib/cdp.mjs';
import { REPO as WT } from '../../tools/lib/paths.mjs';
import { PINS, ARMS, APPLIED, TO, PX, DECK } from './sim-swipe.mjs';
const HERE = dirname(new URL(import.meta.url).pathname);
const [HOLD, URL0, ...STEPS] = process.argv.slice(2);
if (!HOLD || !URL0 || !STEPS.length || STEPS.some((s) => !/^(C|PC|A3|A4|R3):\d+$/.test(s))) { console.error('usage: chrome-swipe.mjs <hold> <url> <arm>:<k> ...'); process.exit(2); }
const sha = (b) => createHash('sha256').update(b).digest('hex').slice(0, 12);
const DIR = join(WT, 'out/deck-contain/chrome', HOLD); if (existsSync(DIR)) { console.log(`HOLD-EXISTS ${DIR} (rev 1.1 N4)`); process.exit(27); } mkdirSync(DIR, { recursive: true });
const runs = join(DIR, 'runs.jsonl');
const get = async (u) => sha(Buffer.from(await (await fetch(u)).arrayBuffer()));
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const served = { js: await get(new URL('_app/immutable/nodes/2.DyWL8TcE.js', URL0)), css: await get(new URL('_app/immutable/assets/2.gBuqKVzi.css', URL0)) };
if (served.js !== PINS.js || served.css !== PINS.css) { console.log(`SERVED-MISMATCH ${JSON.stringify(served)}`); process.exit(26); }
const prof = tempProfileDir(join(WT, 'out', 'chrome-fn'), 'deck-contain-swipe');
const ch = await launchChrome({ port: 0, profileDir: prof, headless: true, windowSize: '1920,1400', args: ['--ignore-certificate-errors'] });
const cdp = await CDP.connect(ch.wsUrl);
try {
  for (const [i, step] of STEPS.entries()) {
    const [arm] = step.split(':');
    const rec = { hold: HOLD, step, arm, i, served, engine: 'chrome', load1Start: +loadavg()[0].toFixed(2), startedAt: new Date().toISOString() };
    const page = await cdp.newIsolatedPage();
    try {
      if (ch.userAgent) await page.send('Emulation.setUserAgentOverride', { userAgent: headedUA(ch.userAgent) });
      await page.send('Emulation.setDeviceMetricsOverride', { width: 430, height: 932, deviceScaleFactor: 3, mobile: true, screenWidth: 430, screenHeight: 932 });
      await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
      await gotoAndSettle(page, URL0); await sleep(3000);
      if (ARMS[arm]) {
        const css = readFileSync(join(HERE, 'arms', ARMS[arm]), 'utf8'); rec.armCss = sha(Buffer.from(css));
        await page.eval(`(() => { const s = document.createElement('style'); s.id = 'sw-arm'; s.textContent = ${JSON.stringify(css)}; document.head.appendChild(s); return 1; })()`);
      }
      await sleep(500);
      rec.deck = await page.eval(DECK);
      rec.applied = APPLIED[arm](rec.deck);
      const evs = [];
      const off = cdp.on((m) => { if (m.method === 'Tracing.dataCollected' && m.sessionId === page.sessionId) evs.push(...m.params.value); });
      await page.send('Tracing.start', { traceConfig: { includedCategories: ['devtools.timeline', 'disabled-by-default-devtools.timeline'], recordMode: 'recordAsMuchAsPossible' }, transferMode: 'ReportEvents' });
      await sleep(300);
      await page.eval(`new Promise((res) => { let y = 0; const max = Math.min(${TO}, document.documentElement.scrollHeight - innerHeight);
        const st = () => { y = Math.min(max, y + ${PX}); scrollTo({ top: y, behavior: 'instant' }); console.timeStamp('dcy:' + y); if (y < max) requestAnimationFrame(st); else setTimeout(res, 300); };
        requestAnimationFrame(st); })`);
      const done = page.waitFor((m) => m.method === 'Tracing.tracingComplete', 30000);
      await page.send('Tracing.end'); await done; off();
      const marks = evs.filter((e) => e.name === 'TimeStamp' && /^dcy:/.test(e.args?.data?.message || '')).map((e) => [e.ts, +e.args.data.message.slice(4)]).sort((a, b) => a[0] - b[0]);
      const frames = marks.map(([ts, y]) => ({ y, ts, lay: 0, layMs: 0, dirty: 0, ult: 0, ultEl: 0, paints: 0 }));
      const at = (ts) => { let lo = -1; for (let k = 0; k < marks.length && marks[k][0] <= ts; k++) lo = k; return lo; };
      for (const e of evs) {
        if (e.ph !== 'X' && e.ph !== 'B') continue;
        const k = at(e.ts); if (k < 0) continue; const f = frames[k];
        if (e.name === 'Layout') { f.lay++; f.layMs += (e.dur || 0) / 1000; f.dirty += e.args?.beginData?.dirtyObjects || 0; }
        else if (e.name === 'UpdateLayoutTree') { f.ult++; f.ultEl += e.args?.elementCount || e.args?.beginData?.elementCount || 0; }
        else if (e.name === 'Paint') f.paints++;
      }
      for (const f of frames) { f.layMs = +f.layMs.toFixed(3); delete f.ts; }
      rec.frames = frames;
    } catch (e) { rec.error = String(e.stack || e.message || e); }
    await page.close();
    rec.load1End = +loadavg()[0].toFixed(2);
    appendFileSync(runs, JSON.stringify(rec) + '\n');
    const band = (rec.frames || []).filter((f) => rec.deck && f.y > rec.deck.top - rec.deck.ih && f.y < rec.deck.bottom);
    const mean = (k) => band.length ? (band.reduce((a, f) => a + f[k], 0) / band.length).toFixed(2) : 'n/a';
    console.log(`STEP chrome ${HOLD} ${step} applied ${rec.applied} deck ${rec.deck?.w}x${rec.deck?.h} band n ${band.length} lay/f ${mean('lay')} dirty/f ${mean('dirty')} ult/f ${mean('ult')} ultEl/f ${mean('ultEl')} paint/f ${mean('paints')} (layMs/f ${mean('layMs')}, never judged)${rec.error ? ' ERROR ' + rec.error.split('\n')[0] : ''}`);
  }
} finally { cdp.close(); await ch.close(); try { rmSync(prof, { recursive: true, force: true }); } catch {} }
