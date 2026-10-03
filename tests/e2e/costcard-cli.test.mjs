// tools/costcard.mjs CLI (incident I-083): reads saved records (raw Chrome traces via a records file or --trace, Sim
// Timeline files, a probe's pre-cut windows, P-076 tick records) and writes <out>.json + <out>.md. No browser, no lock.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { node, tool, tempDir } from '../helpers.mjs';

const CC = tool('costcard.mjs');
const URL_ = 'https://localhost:5300/_app/immutable/nodes/2.TEST.js';
const S = 1e6;
// a minimal trace: renderer main thread, a 1 s callback at 1-based line 100, `calls` extra element calls per event,
// one Layout and one element Paint (nodeId 42) per event, 10 main frames per event
function trace(calls) {
  const ev = [{ ph: 'M', name: 'thread_name', pid: 1, tid: 7, args: { name: 'CrRendererMain' } }];
  for (let i = 0; i < 6; i++) {
    const t = (1 + i) * S;
    ev.push({ ph: 'X', name: 'FunctionCall', pid: 1, tid: 7, ts: t, dur: 100, args: { data: { url: URL_, lineNumber: 100 } } });
    if (i === 5) break;
    for (let k = 0; k < calls; k++) ev.push({ ph: 'X', name: 'FunctionCall', pid: 1, tid: 7, ts: t + 1000 + k, dur: 1, args: { data: { url: URL_, lineNumber: 150 } } });
    ev.push({ ph: 'X', name: 'Layout', pid: 1, tid: 7, ts: t + 3000, dur: 100, args: { beginData: { dirtyObjects: 4 } } });
    ev.push({ ph: 'X', name: 'Paint', pid: 1, tid: 7, ts: t + 4000, dur: 100, args: { data: { nodeId: 42, clip: [0, 0, 10, 0, 10, 10, 0, 10] } } });
    for (let k = 0; k < 10; k++) ev.push({ ph: 'X', name: 'BeginMainThreadFrame', pid: 1, tid: 7, ts: t + 5000 + k * 90000, dur: 1 });
  }
  return { traceEvents: ev, metadata: { source: 'test' } };
}
const simTimeline = (calls) => {
  const recs = [];
  for (let i = 0; i < 6; i++) {
    const t = 1 + i;
    recs.push({ type: 'TimerFire', startTime: t, endTime: t + 0.001, children: [{ type: 'FunctionCall', startTime: t, endTime: t + 0.001, data: { scriptName: URL_, scriptLine: 100 } }] });
    if (i === 5) break;
    recs.push({ type: 'RenderingFrame', startTime: t + 0.01, endTime: t + 0.02, children: [
      ...Array.from({ length: calls }, (_, k) => ({ type: 'FunctionCall', startTime: t + 0.011 + k * 1e-4, endTime: t + 0.0111 + k * 1e-4, data: { scriptName: URL_, scriptLine: 150 } })),
      { type: 'Paint', startTime: t + 0.015, endTime: t + 0.016, data: { clip: [0, 0, 100, 0, 100, 100, 0, 100] } }] });
  }
  return { syncT: 0, syncTL: 0, recs };
};

function fixtureDir() {
  const d = tempDir('fw-costcard-');
  mkdirSync(join(d, 'rec'));
  writeFileSync(join(d, 'rec', 'c1.json'), JSON.stringify(trace(3)));
  writeFileSync(join(d, 'rec', 'c2.json'), JSON.stringify(trace(4)));
  writeFileSync(join(d, 'rec', 'v1.json'), JSON.stringify(trace(0)));
  writeFileSync(join(d, 'rec', 'sim-c.json'), JSON.stringify(simTimeline(3)));
  writeFileSync(join(d, 'rec', 'sim-v.json'), JSON.stringify(simTimeline(0)));
  writeFileSync(join(d, 'rec', 'census-c.json'), JSON.stringify({ layers: [{ backendNodeId: 42, width: 20, height: 10, drawsContent: true }] }));
  writeFileSync(join(d, 'rec', 'records.json'), JSON.stringify({ loads: [
    { arm: 'C', rep: 1, mode: 'full', trace: 'c1.json', nodeIds: { clock: [42] }, census: 'census-c.json', layerScale: 1 },
    { arm: 'C2', rep: 1, mode: 'full', trace: 'c2.json', nodeIds: { clock: [42] } },
    { arm: 'V', rep: 1, mode: 'full', trace: 'v1.json', nodeIds: { clock: [42] } },
    { arm: 'V', rep: 2, mode: 'freeze', trace: 'v1.json' }, // no element-runs check: VOID
    { arm: 'C', rep: 1, mode: 'full', engine: 'sim', timeline: 'sim-c.json', rect: { x: 50, y: 0, w: 100, h: 100 } },
    { arm: 'V', rep: 1, mode: 'full', engine: 'sim', timeline: 'sim-v.json', rect: { x: 50, y: 0, w: 100, h: 100 } },
  ] }));
  return d;
}

test('records file with raw Chrome traces and Sim timelines -> card json + md, VOID listed, inputs relative', () => {
  const d = fixtureDir();
  mkdirSync(join(d, 'fixes', 'demo'), { recursive: true });
  const r = node(CC, ['--records', 'rec/records.json', '--topic', 'demo', '--arms', 'C,V', '--control', 'C', '--aa', 'C2', '--element', 'clock',
    '--event', 'fire:nodes/2.TEST.js:100', '--period-ms', '1000', '--code', 'nodes/2.TEST.js:100-200', '--nodes', 'clock'], { cwd: d });
  assert.equal(r.code, 0, r.stderr + r.stdout);
  assert.match(r.stdout, /^COSTCARD fixes\/demo\/costcard\.json \+ \.md: 2 row\(s\), arms C,V \(control C, A\/A C2\), 6 load\(s\), 1 VOID/m);
  assert.match(r.stdout, /clock \/ tick \(chrome, FULL\): script codeCalls C 4 V 1/);
  assert.match(r.stdout, /clock \/ tick \(sim, FULL\): script codeCalls C 4 V 1/);
  assert.match(r.stdout, /VOID clock V\/chrome\/FRZ\/r2: FRZ element-runs check missing/);
  const card = JSON.parse(readFileSync(join(d, 'fixes', 'demo', 'costcard.json'), 'utf8'));
  assert.equal(card.schema, 'fw-costcard/1');
  assert.ok(card.inputs.length >= 5 && card.inputs.every((p) => !p.startsWith('/')), `inputs relative: ${card.inputs}`);
  const chrome = card.rows.find((x) => x.engine === 'chrome'), sim = card.rows.find((x) => x.engine === 'sim');
  assert.equal(chrome.arms.V.full.delta.codeCalls.d, -3);
  assert.equal(chrome.arms.V.full.delta.codeCalls.tol, 2);
  assert.equal(chrome.fields[2].C.layers.median, 1);
  assert.equal(chrome.fields[3].elementPaints.C.median, 1);
  assert.equal(sim.fields[3].elementPaintMpx.C.median, (50 * 100 * 9) / 1e6);
  const md = readFileSync(join(d, 'fixes', 'demo', 'costcard.md'), 'utf8');
  assert.match(md, /\| clock \/ tick \| chrome \|/);
  assert.match(md, /\| clock \/ tick \| sim \|/);
  assert.match(md, /repaint area on the element \(device Mpx\), FULL: C 0\.05 · V 0\.05/);
  assert.ok(!md.includes(d), 'no absolute temp path in the md');
});

test('--trace flags, out/costcard default without a fixes/<topic> dir, --print', () => {
  const d = fixtureDir();
  const r = node(CC, ['--trace', 'C=rec/c1.json', '--trace', 'V=rec/v1.json', '--trace', 'V/freeze=rec/v1.json', '--event', 'fire:nodes/2.TEST.js:100', '--code', 'nodes/2.TEST.js:100-200', '--print'], { cwd: d });
  assert.equal(r.code, 0, r.stderr + r.stdout);
  assert.ok(existsSync(join(d, 'out', 'costcard', 'costcard-card.json')));
  assert.ok(existsSync(join(d, 'out', 'costcard', 'costcard-card.md')));
  assert.match(r.stdout, /# Rendering cost card/);
  assert.match(r.stdout, /no A\/A arm \(tol = the 2-count floor\)/);
  assert.match(r.stdout, /VOID element V\/chrome\/FRZ\/r1: FRZ element-runs check missing/);
});

test('a probe\'s pre-cut windows (fix-nav-morph shape) and P-076 tick records are read as they are', () => {
  const d = tempDir('fw-costcard-');
  const w = (k) => [{ kind: 'start', ms: 1200, mainFrames: 80, layouts: 4 * k }, { kind: 'push-1', ms: 300, mainFrames: 20, layouts: 6 * k }, { kind: 'push-n', ms: 300, mainFrames: 20, layouts: 2 * k }, { kind: 'hold', ms: 4000, mainFrames: 40, layouts: 4 * k }];
  writeFileSync(join(d, 'nav.json'), JSON.stringify({ tool: 'probe', loads: [{ build: 'C', rep: 1, windows: w(1) }, { build: 'C2', rep: 1, windows: w(1) }, { build: 'V', rep: 1, windows: w(0) }] }));
  const r = node(CC, ['--records', 'nav.json', '--aa', 'C2', '--element', 'nav morph', '--event', 'mark', '--per-frame', 'hold', '--out', 'card'], { cwd: d });
  assert.equal(r.code, 0, r.stderr + r.stdout);
  assert.match(r.stdout, /5 row\(s\), arms C,V \(control C, A\/A C2\)/);
  assert.match(r.stdout, /nav morph \/ hold-frame \(chrome, FULL\): script - \| layout layouts C 0\.1 V 0/);
  const fires = Array.from({ length: 7 }, (_, i) => (1 + i) * S);
  const cd = fires.flatMap((t) => [t, t + 10, t + 20]);
  writeFileSync(join(d, 'tick.json'), JSON.stringify({ results: [{ rep: 1, build: 'C', mode: 'full', timers: 1, fires0: [], fires1: fires, cd }, { rep: 1, build: 'V', mode: 'full', timers: 1, fires0: [], fires1: fires, cd: fires }] }));
  const t = node(CC, ['--records', 'tick.json', '--event', 'fire:2.DyWL8TcE.js:1', '--out', 'tick'], { cwd: d });
  assert.equal(t.code, 0, t.stderr + t.stdout);
  assert.match(t.stdout, /element \/ tick \(chrome, FULL\): script codeCalls C 3 V 1/);
});

test('usage errors exit 2; nothing usable exits 1', () => {
  const d = fixtureDir();
  assert.equal(node(CC, [], { cwd: d }).code, 2);
  assert.equal(node(CC, ['--records', 'missing.json'], { cwd: d }).code, 2);
  assert.equal(node(CC, ['--trace', 'nofile'], { cwd: d }).code, 2);
  assert.equal(node(CC, ['--trace', 'C=rec/c1.json', '--event', 'fire:x'], { cwd: d }).code, 2);
  assert.equal(node(CC, ['--trace', 'C=rec/c1.json', '--code', 'x:1'], { cwd: d }).code, 2);
  assert.equal(node(CC, ['--records', 'rec/records.json', '--event'], { cwd: d }).code, 2);
  const v = node(CC, ['--trace', 'C/freeze=rec/c1.json', '--event', 'fire:nodes/2.TEST.js:100'], { cwd: d });
  assert.equal(v.code, 1, v.stdout + v.stderr);
  assert.match(v.stderr, /no usable load/);
});
