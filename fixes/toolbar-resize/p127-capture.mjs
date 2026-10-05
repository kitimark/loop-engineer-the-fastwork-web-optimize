#!/usr/bin/env node
// toolbar-resize P-127 capture (COUNT-ONLY; Simulator functional session in a shared slot). Runs the test page
// p127-page.html (served from this topic's overlay as /p127/index.html) arm by arm and captures each arm with its own
// WebKit Timeline recording on this script's own inspector connection, at that arm's call-stack depth. tools/ is not
// changed: the Timeline command list is wip.mjs TIMELINE_START with only maxCallStackDepth replaced (16 or 1).
//   node tools/lock.mjs run chrome-measure --shared --weight simulator --max-seconds 300 --owner fix-toolbar-resize -- \
//     sh -c 'node tools/fix.mjs serve toolbar-resize > out/toolbar-resize/serve127.log 2>&1 & S=$!; \
//       node tools/wait.mjs serve out/serve-toolbar-resize.json --pid $S --owner fix-toolbar-resize --timeout 60 && \
//       node tools/sim.mjs session --functional --owner fix-toolbar-resize -- node fixes/toolbar-resize/p127-capture.mjs; \
//       E=$?; kill $S; exit $E'
// Steps: 1. copy p127-page.html (as /p127/index.html) and p127-page.js (as /p127/p127.js) into the overlay, check both
// served bytes and sources (exit 26 on a mismatch); 2. sim.mjs open the page and wait until __p127 is an object (rev 3;
// STOP exit 28 after 10 s: rev 2's check took typeof's string 'undefined' as ready, and the mirror's CSP blocked the
// then-inline script); 3. DRY record (uncounted): arm raf-change-sel at depth 16, 5 rounds; it must show a bracketed record with >= 2 stack
// frames, else STOP exit 27 before any counted arm; 4. the counted arms in PLAN order, 30 rounds each, 100 ms apart.
// Output: out/toolbar-resize/sim127/ tl-<arm>.json ({arm, spec, depth, timelineStart, page, recs, errors}), runs.jsonl.
// Per arm: __p127.reset(), two rAFs, Timeline start (depth), __p127.run(spec, rounds, gap), Timeline.stop, drain.
// Fields kept: the records as WebKit sends them (the reader p127-read.mjs reads only the frozen field list).
import { readFileSync, writeFileSync, mkdirSync, appendFileSync, copyFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { openTab, sleep, runAsync, TIMELINE_START } from '../../tools/lib/wip.mjs';

const WT = new URL('../..', import.meta.url).pathname;
const D = join(WT, 'out/toolbar-resize/sim127'); mkdirSync(D, { recursive: true });
const PAGE = join(WT, 'fixes/toolbar-resize/p127-page.html'), PJS = join(WT, 'fixes/toolbar-resize/p127-page.js'), OV = join(WT, 'fixes/toolbar-resize/overlay/p127');
const sha = (b) => createHash('sha256').update(b).digest('hex').slice(0, 12);
export const ROUNDS = 30, GAP_MS = 100, DRY = { arm: 'dry-d16-raf-change-sel', spec: 'raf-change-sel', depth: 16, rounds: 5 };
const D16 = ['change-sel', 'same-sel', 'none', 'change-nosel', 'same-nosel'].flatMap((k) => ['io', 'raf', 'timer'].map((c) => `${c}-${k}`));
const D1 = ['io-change-sel', 'raf-change-sel', 'timer-change-sel', 'io-same-sel'];
export const PLAN = [...D16.map((spec) => ({ arm: `d16-${spec}`, spec, depth: 16 })), ...D1.map((spec) => ({ arm: `d1-${spec}`, spec, depth: 1 }))];
export const timelineStart = (depth) => TIMELINE_START.map(([m, p]) => (m === 'Timeline.start' ? [m, { ...p, maxCallStackDepth: depth }] : [m, p]));

const log = (o) => appendFileSync(join(D, 'runs.jsonl'), JSON.stringify({ at: new Date().toISOString(), ...o }) + '\n');
const errText = (e) => e?.message || JSON.stringify(e);

async function capture(c, { arm, spec, depth, rounds = ROUNDS }) {
  const ep = { recs: [], stopped: false, live: true, errors: [] };
  c.on((m) => {
    if (!ep.live) return;
    if (m.method === 'Timeline.eventRecorded' && m.params?.record) ep.recs.push(m.params.record);
    else if (m.method === 'Timeline.recordingStopped') ep.stopped = true;
  });
  await c.evaluate('__p127.reset()');
  await runAsync(c, 'new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(1))))', { pollMs: 200, timeoutMs: 5000, key: '__p127raf' });
  const cmds = timelineStart(depth);
  for (const [method, params] of cmds) { try { await c.send(method, params); } catch (e) { ep.errors.push(`${method}: ${errText(e)}`); } }
  let page = null;
  try { page = await runAsync(c, `__p127.run(${JSON.stringify(spec)}, ${rounds}, ${GAP_MS})`, { pollMs: 500, timeoutMs: 30000, key: '__p127res' }); } catch (e) { ep.errors.push(`run: ${errText(e)}`); }
  try { await c.send('Timeline.stop'); } catch (e) { ep.errors.push(`Timeline.stop: ${errText(e)}`); }
  const t0 = Date.now();
  while (!ep.stopped && !c.closed && Date.now() - t0 < 3000) await sleep(50);
  await sleep(500);
  ep.live = false;
  const out = { arm, spec, depth, rounds, gapMs: GAP_MS, timelineStart: cmds, page, errors: ep.errors, recs: ep.recs };
  writeFileSync(join(D, `tl-${arm}.json`), JSON.stringify(out));
  return out;
}

// stack depth of the records between each p127 bracket (the dry check), counted only
export function bracketDepths(recs) {
  const depths = [];
  const visit = (kids) => {
    let open = false;
    for (const r of kids || []) {
      const msg = r.type === 'TimeStamp' ? String(r.data?.message || '') : '';
      if (msg.startsWith('p127:')) open = true;
      else if (msg.startsWith('p127end:')) open = false;
      else if (open && (r.type === 'ScheduleStyleRecalculation' || r.type === 'InvalidateLayout')) depths.push(r.stackTrace?.callFrames?.length ?? 0);
      visit(r.children);
    }
  };
  visit(recs);
  return depths;
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  const t0 = Date.now(), budget = Number(process.env.SB_BUDGET_S || 200) * 1000;
  const st = JSON.parse(readFileSync(join(WT, 'out/serve-toolbar-resize.json'), 'utf8')), port = st.httpTwin;
  mkdirSync(OV, { recursive: true }); copyFileSync(PAGE, join(OV, 'index.html')); copyFileSync(PJS, join(OV, 'p127.js'));
  for (const [file, path] of [[PAGE, 'index.html'], [PJS, 'p127.js']]) {
    const want = sha(readFileSync(file));
    const res = await fetch(`http://localhost:${port}/p127/${path}`), got = sha(Buffer.from(await res.arrayBuffer())), src = res.headers.get('x-mirror-source');
    log({ step: 'served', path, want, got, source: src, port });
    if (got !== want || src !== 'overlay') { console.log(`STOP served bytes /p127/${path}: want ${want} got ${got} source ${src}`); process.exit(26); }
    console.log(`served bytes ok: /p127/${path} ${got} (overlay)`);
  }
  const url = `http://localhost:${port}/p127/`;
  const o = spawnSync('node', ['tools/sim.mjs', 'open', url], { cwd: WT, encoding: 'utf8' });
  console.log(`open ${o.status}: ${(o.stdout || o.stderr || '').trim().split('\n').slice(-1)[0]}`);
  process.env.FW_TAB_HOST = `localhost:${port}`;
  let c = await openTab((u) => u.includes('/p127/'));
  let ready = false;
  for (let i = 0; i < 40 && !ready; i++) { ready = (await c.evaluate("document.readyState === 'complete' && typeof window.__p127 === 'object'")) === true; if (!ready) await sleep(250); }
  log({ step: 'ready', ready });
  if (!ready) { console.log('STOP page not ready: window.__p127 is not an object after 10 s (script blocked or not loaded)'); c.close(); process.exit(28); }
  const dry = await capture(c, DRY), dd = bracketDepths(dry.recs);
  const hist = dd.reduce((m, d) => ((m[d] = (m[d] || 0) + 1), m), {});
  log({ step: 'dry', arm: DRY.arm, depthHist: hist, page: dry.page, errors: dry.errors });
  console.log(`DRY ${DRY.arm}: bracketed record stack lengths ${JSON.stringify(hist)} page ${JSON.stringify(dry.page)}`);
  if (!dd.some((d) => d >= 2)) { console.log('STOP dry: no bracketed record with >= 2 stack frames at depth 16'); process.exit(27); }
  for (const a of PLAN) {
    if (budget - (Date.now() - t0) < 12000) { console.log(`STOP budget before ${a.arm}`); log({ step: a.arm, stop: 'budget' }); break; }
    if (existsSync(join(D, `tl-${a.arm}.json`))) { console.log(`exists ${a.arm}`); continue; }
    const r = await capture(c, a);
    log({ step: a.arm, depth: a.depth, page: r.page, recs: r.recs.length, errors: r.errors });
    console.log(`ARM ${a.arm} depth ${a.depth}: page ${JSON.stringify(r.page)} recs ${r.recs.length}${r.errors.length ? ` errors ${r.errors.join('; ')}` : ''} t+${Math.round((Date.now() - t0) / 1000)} s`);
  }
  c.close();
}
