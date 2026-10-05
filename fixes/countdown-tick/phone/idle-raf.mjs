#!/usr/bin/env node
// countdown-tick P-130 idle sentinel (the lead's ruling on N5, 2026-10-05): replaces the protocol v2 S-run control
// sentinel for this idle block. Opens the control page C at the top, lets it settle, then counts rAF callbacks for 5 s
// in the page and reads the result back ONCE (one runAsync poll after 6 s; no polling faster than ~1 Hz, protocol §5.5).
// PASS when the idle rate is >= 58 fps and the page was visible. Runs inside the part's hold (needs the iphone hold,
// like thermal-gate.mjs's timer part); hold.sh calls it right after the start gate and voids the part on a FAIL.
//   node fixes/countdown-tick/phone/idle-raf.mjs --owner <runner> --url http://lan:<port>/ [--label <text>] [--min 58]
//   node fixes/countdown-tick/phone/idle-raf.mjs --selftest
// Prints one line: IDLERAF <label> fps <F> frames <N> maxGap <ms> visible <state> -> PASS | FAIL <why>
// Exit: 0 PASS; 5 FAIL (fps < min, or not visible); 1 error (no read). Appends the record to
// out/countdown-tick/p130/runs/idle-raf.jsonl. Prints no address (Hard rule 12).
import { spawnSync } from 'node:child_process';
import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

export const SETTLE_MS = 3000, WINDOW_MS = 5000;
// The in-page measurement: wait SETTLE_MS, then stamp every rAF for WINDOW_MS. Returns the stamps (ms, page clock).
export const PAGE_JS = `new Promise((res) => setTimeout(() => { const ts = []; const f = (t) => { ts.push(t);
  if (t - ts[0] < ${WINDOW_MS}) requestAnimationFrame(f); else res({ vis: document.visibilityState, ts }); };
  requestAnimationFrame(f); }, ${SETTLE_MS}))`;

export function rafVerdict({ vis, ts }, min = 58) {
  if (!Array.isArray(ts) || ts.length < 2) return { code: 1, why: 'no frames', fps: null, frames: ts?.length ?? 0, maxGap: null, vis };
  const span = ts[ts.length - 1] - ts[0];
  const fps = Math.round(((ts.length - 1) / span) * 1000 * 10) / 10;
  let maxGap = 0; for (let i = 1; i < ts.length; i++) maxGap = Math.max(maxGap, ts[i] - ts[i - 1]);
  maxGap = Math.round(maxGap * 10) / 10;
  if (vis !== 'visible') return { code: 5, why: `page ${vis}`, fps, frames: ts.length, maxGap, vis };
  if (!(fps >= min)) return { code: 5, why: `idle rAF ${fps} fps < ${min}`, fps, frames: ts.length, maxGap, vis };
  return { code: 0, why: null, fps, frames: ts.length, maxGap, vis };
}

function selftest() {
  const even = (hz, s = 5) => Array.from({ length: Math.round(hz * s) + 1 }, (_, i) => i * (1000 / hz));
  const drop = even(60).filter((_, i) => i % 10 !== 5); // 10 % of frames missing -> ~54 fps
  const cases = [
    ['60 Hz visible -> PASS', rafVerdict({ vis: 'visible', ts: even(60) }), (v) => v.code === 0 && v.fps === 60],
    ['80 Hz (ProMotion) -> PASS', rafVerdict({ vis: 'visible', ts: even(80) }), (v) => v.code === 0],
    ['58.0 fps boundary -> PASS', rafVerdict({ vis: 'visible', ts: even(58) }), (v) => v.code === 0 && v.fps === 58],
    ['57.9 fps -> FAIL 5', rafVerdict({ vis: 'visible', ts: even(57.9, 10) }), (v) => v.code === 5 && /57.9 fps < 58/.test(v.why)],
    ['10 % dropped frames -> FAIL 5, maxGap 33.3', rafVerdict({ vis: 'visible', ts: drop }), (v) => v.code === 5 && v.maxGap === 33.3],
    ['hidden page -> FAIL 5', rafVerdict({ vis: 'hidden', ts: even(60) }), (v) => v.code === 5 && /hidden/.test(v.why)],
    ['no frames -> error 1', rafVerdict({ vis: 'visible', ts: [] }), (v) => v.code === 1],
    ['custom --min 50: 54 fps -> PASS', rafVerdict({ vis: 'visible', ts: drop }, 50), (v) => v.code === 0],
  ];
  let pass = 0; for (const [n, v, ok] of cases) { const g = ok(v); pass += g; console.log(`${g ? 'ok  ' : 'FAIL'} ${n}`); }
  console.log(`SELFTEST ${pass}/${cases.length}`); process.exit(pass === cases.length ? 0 : 1);
}

if (process.argv[2] === '--selftest') selftest();
else {
  const a = process.argv.slice(2);
  const opt = (k, d = null) => { const i = a.indexOf(`--${k}`); return i >= 0 ? a[i + 1] : d; };
  const owner = opt('owner'), url = opt('url'), label = opt('label', 'idle-raf'), min = Number(opt('min', 58));
  if (!owner || !url) { console.error('usage: idle-raf.mjs --owner <runner> --url http://lan:<port>/ [--label x] [--min 58] | --selftest'); process.exit(1); }
  const { openTab, runAsync } = await import('../../../tools/lib/wip.mjs');
  const OUT = join(process.cwd(), 'out', 'countdown-tick', 'p130', 'runs'); mkdirSync(OUT, { recursive: true });
  const at = new Date().toISOString();
  let v, err = null;
  const o = spawnSync('node', ['tools/iphone.mjs', 'open', url, '--owner', owner], { encoding: 'utf8' });
  if (o.status !== 0) err = `iphone.mjs open exit ${o.status}`;
  else {
    await new Promise((r) => setTimeout(r, 4000));
    const c = await openTab(`:${new URL(url).port}`);
    try {
      const res = await runAsync(c, PAGE_JS, { pollMs: SETTLE_MS + WINDOW_MS + 1000, timeoutMs: 30000, key: '__ctIdleRaf' });
      v = rafVerdict(res, min);
    } catch (e) { err = `rAF probe: ${String(e.message || e).slice(0, 120)}`; } finally { c.close(); }
  }
  if (err) v = { code: 1, why: err, fps: null, frames: 0, maxGap: null, vis: null };
  appendFileSync(join(OUT, 'idle-raf.jsonl'), JSON.stringify({ at, label, owner, min, ...v }) + '\n');
  console.log(`IDLERAF ${label} fps ${v.fps} frames ${v.frames} maxGap ${v.maxGap} visible ${v.vis} -> ${v.code === 0 ? 'PASS' : `FAIL ${v.why}`}`);
  process.exit(v.code);
}
