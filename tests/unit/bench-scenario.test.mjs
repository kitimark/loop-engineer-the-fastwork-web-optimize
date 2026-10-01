// tools/lib/bench-scenario.mjs scenarioClock() (incident I-027 C): the scenario's own waits (quiet period,
// settle, warm-up, spot wait/window) run on the stubbed host's fake clock under $FW_TEST_HOST only; on the
// real host they are Date.now + setTimeout, exactly as before.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { node, FAKE_HOST } from '../helpers.mjs';

const SCENARIO = new URL('../../tools/lib/bench-scenario.mjs', import.meta.url).href;

test('real host (no FW_TEST_HOST): scenarioClock() is Date.now + setTimeout, unchanged', async () => {
  assert.ok(!process.env.FW_TEST_HOST, 'this test process has no host stub');
  const { scenarioClock } = await import(SCENARIO);
  const c = await scenarioClock();
  assert.equal(c.stub, undefined);
  assert.ok(Math.abs(c.now() - Date.now()) < 50, 'wall clock');
  const t0 = Date.now();
  await c.sleep(120);
  assert.ok(Date.now() - t0 >= 110, `a 120 ms sleep took ${Date.now() - t0} ms of real time`);
  assert.equal(await scenarioClock(), c, 'resolved once per process');
});

test('stubbed host (FW_TEST_HOST): the stub\'s clock, a 60 s wait costs no wall time', () => {
  const code = `import('${SCENARIO}').then(async (m) => {
    const c = await m.scenarioClock(), t0 = c.now(), w0 = Date.now();
    await c.sleep(60000);
    console.log(JSON.stringify({ stub: c.stub, fakeSec: (c.now() - t0) / 1000, wallMs: Date.now() - w0 }));
  });`;
  const r = node('--input-type=module', ['-e', code], { env: { FW_TEST_HOST: FAKE_HOST } });
  assert.equal(r.code, 0, r.out);
  const x = JSON.parse(r.stdout);
  assert.equal(x.stub, FAKE_HOST);
  assert.ok(x.fakeSec >= 60 && x.fakeSec < 61, `fake clock advanced ${x.fakeSec} s`);
  assert.ok(x.wallMs < 5000, `took ${x.wallMs} ms of wall time`);
});

test('I-032 layers probes: LayerTree enabled only when used; per window count / max / added / paints from LayerTree events', () => {
  // an in-process fake page (no Chrome): the window's RESET is followed by two layer lists and two layerPainted
  // events; with pc, the lists carry paintCount (as Chrome 148+, which sends no layerPainted: there the counts win)
  const code = `import('${SCENARIO}').then(async (m) => {
    const sent = [];
    let pc = false;
    const L = (id, n) => (pc ? { layerId: id, paintCount: n } : { layerId: id });
    const mk = () => {
      const ls = new Set();
      const emit = (method, params) => { for (const f of [...ls]) f({ method, params }); };
      return {
        on: (f) => { ls.add(f); return () => ls.delete(f); },
        waitFor: (pred) => new Promise((res) => { const f = (x) => { if (pred(x)) { ls.delete(f); res(x); } }; ls.add(f); }),
        send: async (method) => {
          sent.push(method);
          if (method === 'Page.navigate') setTimeout(() => emit('Page.loadEventFired', {}), 5);
          if (method === 'LayerTree.enable') queueMicrotask(() => emit('LayerTree.layerTreeDidChange', { layers: [L(1, 4), L(2, 1)] }));
          return {};
        },
        eval: async (e) => {
          if (e.startsWith('window.__bench.reset(')) {
            emit('LayerTree.layerTreeDidChange', { layers: [L(1, 4), L(2, 1), L(3, 2)] }); // layer 3 appears (2 paints before: not counted)
            emit('LayerTree.layerPainted', { layerId: 3, clip: { width: 10, height: 10 } }); emit('LayerTree.layerPainted', { layerId: 1, clip: { width: 10, height: 10 } });
            emit('LayerTree.layerTreeDidChange', { layers: [L(1, 5), L(3, 4)] }); // layer 1 +1, layer 3 +2
            return true;
          }
          if (e.startsWith('window.__bench.read(')) return { counts: {}, frames: 10, errors: [] };
          if (e.startsWith('window.__bench.quiesce(')) return { frames: 2, capped: false };
          if (e.includes('function benchGeometry')) return { maxY: 2000, innerHeight: 932, segments: {}, spots: { top: { y: 0 } } };
          if (e.startsWith('window.__bench ? window.__bench.errors')) return [];
          return undefined;
        },
        close: async () => {},
      };
    };
    const cdp = { newIsolatedPage: async () => mk() };
    const plan = (probes) => ({ viewport: 'mobile', probes, windows: [{ label: 'top', spot: 'top' }], segments: {}, spots: { top: { at: 'top', wait: 0, window: 1 } } });
    const a = await m.tierASession(cdp, 'http://x/', plan({ c: { kind: 'layers', metric: 'count' }, x: { kind: 'layers', metric: 'max' }, n: { kind: 'layers', metric: 'added' }, p: { kind: 'layers', metric: 'paints' } }), { settleMs: 0 });
    const sentA = sent.splice(0);
    pc = true;
    const c = await m.tierASession(cdp, 'http://x/', plan({ c: { kind: 'layers', metric: 'count' }, n: { kind: 'layers', metric: 'added' }, p: { kind: 'layers', metric: 'paints' } }), { settleMs: 0 });
    sent.splice(0);
    const b = await m.tierASession(cdp, 'http://x/', plan({ q: { kind: 'querySelector', selector: '.a' } }), { settleMs: 0 });
    console.log(JSON.stringify({ a: a.windows.top.counts, c: c.windows.top.counts, sentA, b: b.windows.top.counts, sentB: sent, kinds: m.CDP_KINDS }));
  });`;
  const r = node('--input-type=module', ['-e', code], { env: { FW_TEST_HOST: FAKE_HOST, FW_BENCH_TEST_FAST: '1' } });
  assert.equal(r.code, 0, r.out);
  const x = JSON.parse(r.stdout);
  assert.deepEqual(x.a, { c: 2, x: 3, n: 1, p: 2 }, 'no paintCount in the lists: count at the end 2, max 3, layer 3 added, 2 layerPainted events');
  assert.deepEqual(x.c, { c: 2, n: 1, p: 3 }, 'paintCount in the lists: paints = the rises of listed layers (1 +1, 3 +2), not the 2 layerPainted events, not layer 3\'s first count');
  assert.ok(x.sentA.includes('LayerTree.enable'));
  assert.equal(x.sentA.includes('Performance.enable'), false, 'a layers probe needs no Performance domain');
  assert.equal(x.sentB.includes('LayerTree.enable'), false, 'no layers probe: LayerTree stays off');
  assert.ok(x.kinds.includes('layers'));
});

test('ts-headless openPage: the UA override only when given (Tier A), before the emulation; none for Tier B', async () => {
  const { openPage } = await import(SCENARIO);
  const sent = [];
  const page = { on: () => () => {}, send: async (method, params) => { sent.push([method, params]); return {}; } };
  const cdp = { newIsolatedPage: async () => page };
  await openPage(cdp, { viewport: 'mobile' });
  assert.equal(sent.some(([m]) => m === 'Emulation.setUserAgentOverride'), false, 'Tier B (headed): its CDP sequence is unchanged');
  const tierB = sent.splice(0).map(([m]) => m);
  await openPage(cdp, { viewport: 'mobile', userAgent: 'Mozilla/5.0 Chrome/1.0.0.0' });
  const ms = sent.map(([m]) => m);
  assert.deepEqual(ms.filter((m) => m !== 'Emulation.setUserAgentOverride'), tierB, 'otherwise the same sequence');
  assert.ok(ms.indexOf('Emulation.setUserAgentOverride') < ms.indexOf('Emulation.setDeviceMetricsOverride'));
  assert.deepEqual(sent.find(([m]) => m === 'Emulation.setUserAgentOverride')[1], { userAgent: 'Mozilla/5.0 Chrome/1.0.0.0' });
});
