#!/usr/bin/env node
// PR-018 rev 7: capture the user's own finger gesture (fast short swipes at the end of the page) on the iPhone, with
// touches, not only frames: `iphone.mjs record` logs frames only, so this installs tools/lib/gesture-rec.mjs's
// RECORDER_JS (passive touch listeners + the rAF frame log) on the open Safari tab and copies it every 2 s.
// Run only while YOU hold the iphone lease (checked), after `iphone.mjs open http://lan:<port>/`.
//   node fixes/morph-scroll/finger-capture.mjs --owner <you> --port <server port> --out <file.json> [--seconds 60]
//        [--stop-file <path>] [--to-closed] [--label x]
// --to-closed: first jump to the closed rest (p = 0: one large viewport above the page end), so the user starts there.
// Stops at --seconds or when --stop-file exists. The record keeps no LAN address (href is path-only) and the Mac load.
import { execFileSync } from 'node:child_process';
import { existsSync, writeFileSync, renameSync } from 'node:fs';
import { loadavg } from 'node:os';
import { openTab, sleep } from '../../tools/lib/wip.mjs';
import { RECORDER_JS } from '../../tools/lib/gesture-rec.mjs';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const owner = opt('owner'), port = opt('port'), out = opt('out'), secs = Number(opt('seconds', 60)), stopFile = opt('stop-file');
if (!owner || !port || !out) { console.error('usage: --owner <you> --port <server port> --out <file> [--seconds 60] [--stop-file p] [--to-closed]'); process.exit(1); }
const st = execFileSync('node', ['tools/lock.mjs', 'status'], { encoding: 'utf8' });
if (!new RegExp(`^iphone\\s+held by "${owner}"`, 'm').test(st)) { console.error(`WAIT: the iphone lease is not held by ${owner}`); process.exit(1); }

const c = await openTab((u) => { try { return new URL(u).port === String(port); } catch { return false; } });
if (args.includes('--to-closed')) {
  await c.evaluate(`(() => { const lvh = innerHeight; window.scrollTo(0, document.documentElement.scrollHeight - innerHeight - lvh); return scrollY; })()`);
  await sleep(800);
}
console.log('installed:', await c.evaluate(RECORDER_JS));
const rec = { label: opt('label', null), port: Number(port), href: null, vw: null, vh0: null, frames: [], touches: [], startedAt: new Date().toISOString(), mac: { load1Start: +loadavg()[0].toFixed(2) } };
const save = () => { const tmp = `${out}.tmp`; writeFileSync(tmp, JSON.stringify(rec)); renameSync(tmp, out); };
const POLL = (nf, nt) => `(() => { const r = window.__fwg; if (!r) return null; let h = ''; try { const u = new URL(r.href); h = u.pathname + u.search; } catch (e) {} return JSON.stringify({h, vw: r.vw, vh0: r.vh0, docH: document.documentElement.scrollHeight, f: r.frames.slice(${nf}), t: r.touches.slice(${nt})}); })()`;
const t0 = Date.now();
let fails = 0;
for (;;) {
  const end = Date.now() - t0 >= secs * 1000 || (stopFile && existsSync(stopFile));
  try {
    const s = await c.evaluate(POLL(rec.frames.length, rec.touches.length), 'page', 8000);
    if (s == null) { console.error('logger gone (page reloaded?)'); break; }
    const p = JSON.parse(s);
    rec.href = p.h; rec.vw = p.vw; rec.vh0 = p.vh0; rec.docH = p.docH;
    rec.frames.push(...p.f); rec.touches.push(...p.t);
    save(); fails = 0;
  } catch (e) { if (++fails >= 3) { console.error('read failed 3x:', e.message); break; } }
  if (end) break;
  await sleep(2000);
}
try { await c.evaluate('window.__fwg && (window.__fwg.stop = true)'); } catch {}
c.close();
rec.endedAt = new Date().toISOString(); rec.mac.load1End = +loadavg()[0].toFixed(2);
save();
console.log(`saved ${out}: ${rec.frames.length} frames, ${rec.touches.filter((x) => x[1] === 's').length} touches`);
