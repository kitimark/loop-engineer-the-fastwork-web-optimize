#!/usr/bin/env node
// Phone heat-state gate (iphone-runner; lead, user T-039 #19-#22: condition B = real Serious, not induced).
// One read: the device thermal state from Xcode's 'Thermal State' instrument (xcrun xctrace record, 10 s, all
// processes; installs nothing), whether Xcode induced it, the battery temperature, and (unless --no-timer) Safari's
// timer grid: a setTimeout(0) chain for 5 s on a page through the inspector (median gap; ~30 ms at Serious/LPM,
// a few ms otherwise; WebKit Page::updateDOMTimerAlignmentInterval, F-180/F-181).
//
//   node research/phone-thermal-gate/thermal-gate.mjs --owner <you> [--label <text>] [--expect serious|fair]
//        [--url http://lan:<port>/ | --no-timer] [--max-c 44]
//
// Prints one line:  GATE <label> state <S> induced <Yes|No> batt <C> C timer <median> ms (grid30 <share>) -> PASS|FAIL <why>
// Exit: 0 PASS; 2 FAIL too cool (expect serious: state Nominal/Fair); 3 FAIL ceiling (Critical, or batt >= --max-c);
//       4 FAIL induced by Xcode; 5 FAIL too hot for --expect fair (Serious); 6 FAIL timer grid disagrees with the state
//       (LPM on, or a page that never got visible); 1 error (no read).
// --expect serious (default, condition B): PASS = Serious, not induced, batt < max-c.
// --expect fair (condition A, the no-worse checks): PASS = Nominal or Fair, not induced.
// The timer part navigates Safari (needs the iphone lease); it opens --url (default: none, so pass the plain baseline
// page's twin, e.g. http://lan:5441/) and does not park afterwards. Each read appends to out/thermal-gate/gates.jsonl
// in the calling checkout (gitignored). The device id is read from the WDA runner config and never printed.
import { spawnSync } from 'node:child_process';
import { appendFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { readConfig } from '../../tools/lib/wda-runner.mjs';
import { batteryInfo } from '../../tools/lib/iphone-run.mjs';
import { openTab, runAsync } from '../../tools/lib/wip.mjs';

const a = process.argv.slice(2);
const opt = (k, d = null) => { const i = a.indexOf(`--${k}`); return i >= 0 ? a[i + 1] : d; };
const owner = opt('owner'), label = opt('label', 'gate'), expect = opt('expect', 'serious'), maxC = Number(opt('max-c', 44));
const noTimer = a.includes('--no-timer'), url = opt('url');
if (!owner || !['serious', 'fair'].includes(expect) || (!noTimer && !url)) {
  console.error('usage: thermal-gate.mjs --owner <you> [--label x] [--expect serious|fair] (--url http://lan:<port>/ | --no-timer) [--max-c 44]');
  process.exit(1);
}
const OUT = join(process.cwd(), 'out', 'thermal-gate'); mkdirSync(OUT, { recursive: true });
const { udid } = readConfig(); if (!udid) { console.log('GATE error: no device in the WDA runner config'); process.exit(1); }
const red = (s) => String(s || '').split(udid).join('<DEVICE>').replace(/\b(?:10|172|192)\.\d+\.\d+\.\d+\b/g, '<LAN>');
const xc = (args, timeout = 90000) => { const r = spawnSync('xcrun', ['xctrace', ...args], { encoding: 'utf8', timeout, maxBuffer: 64 << 20 }); return { code: r.status, out: red(r.stdout), err: red(r.stderr) }; };
const batt = () => { const r = batteryInfo(); return r.error ? null : (r.temperatureC ?? (r.Temperature != null ? r.Temperature / 100 : null)); };

// 1. thermal state
const at = new Date().toISOString();
const T0 = batt();
const TR = join(OUT, `gate-${Date.now()}.trace`);
const rec = xc(['record', '--instrument', 'Thermal State', '--device', udid, '--all-processes', '--time-limit', '10s', '--output', TR, '--no-prompt']);
let state = null, induced = null, rows = 0, err = null;
if (rec.code !== 0) err = `xctrace record exit ${rec.code}`;
else {
  const ex = xc(['export', '--input', TR, '--xpath', '/trace-toc/run[@number="1"]/data/table[@schema="device-thermal-state-intervals"]']);
  if (ex.code !== 0) err = `xctrace export exit ${ex.code}`;
  else {
    // columns: start, duration, end, thermal-state, track-label, is-induced, narrative
    const rs = ex.out.split('<row').slice(1).map((r) => [...r.matchAll(/fmt="([^"]*)"/g)].map((m) => m[1]));
    rows = rs.length;
    const last = rs[rs.length - 1] || [];
    state = last.find((v) => /^(Nominal|Fair|Serious|Critical)$/.test(v)) || null;
    induced = last.find((v) => /^(Yes|No)$/.test(v)) || null;
    if (rs.some((f) => f.find((v) => /^(Nominal|Fair|Serious|Critical)$/.test(v)) !== state)) err = `state changed during the read (${rs.length} rows)`;
  }
}
rmSync(TR, { recursive: true, force: true });

// 2. timer grid
let timer = null;
if (!noTimer && !err) {
  const o = spawnSync('node', ['tools/iphone.mjs', 'open', url, '--owner', owner], { encoding: 'utf8' });
  if (o.status !== 0) err = `iphone.mjs open exit ${o.status}`;
  else {
    await new Promise((r) => setTimeout(r, 4000));
    const port = new URL(url).port;
    const c = await openTab(`:${port}`);
    try {
      const v = await runAsync(c, `new Promise((res) => { const gaps = []; let last = performance.now(); const t0 = last;
        const tick = () => { const n = performance.now(); gaps.push(n - last); last = n; if (n - t0 < 5000) setTimeout(tick, 0); else res({ vis: document.visibilityState, gaps }); };
        setTimeout(tick, 0); })`, { pollMs: 1500, timeoutMs: 30000, key: '__fwGateRes' });
      const g = v.gaps.slice(12).sort((x, y) => x - y);
      const on30 = g.filter((x) => { const k = Math.round(x / 30); return k >= 1 && Math.abs(x - 30 * k) <= 3; }).length;
      timer = { n: g.length, median: Math.round(g[g.length >> 1] * 10) / 10, grid30: +(on30 / g.length).toFixed(2), visible: v.vis };
    } catch (e) { err = `timer probe: ${String(e.message || e).slice(0, 120)}`; } finally { c.close(); }
  }
}
const T1 = batt();

// 3. verdict
let code = 0, why = '';
if (err || !state) { code = 1; why = err || 'no thermal state row'; }
else if (state === 'Critical' || (T1 ?? T0) >= maxC) { code = 3; why = `ceiling (${state === 'Critical' ? 'Critical' : `batt >= ${maxC} C`})`; }
else if (induced === 'Yes') { code = 4; why = 'induced by Xcode'; }
else if (expect === 'serious' && state !== 'Serious') { code = 2; why = `too cool (${state})`; }
else if (expect === 'fair' && state === 'Serious') { code = 5; why = 'too hot for a Fair check (Serious)'; }
else if (timer && ((state === 'Serious') !== (timer.median >= 25))) { code = 6; why = `timer grid ${timer.median} ms disagrees with ${state} (LPM? page hidden?)`; }
const line = `GATE ${label} state ${state} induced ${induced} batt ${T0}${T1 !== T0 ? `->${T1}` : ''} C timer ${timer ? `${timer.median} ms (grid30 ${timer.grid30})` : 'skipped'} -> ${code === 0 ? 'PASS' : `FAIL ${why}`}`;
appendFileSync(join(OUT, 'gates.jsonl'), JSON.stringify({ at, label, owner, expect, state, induced, rows, battC: T0, battEndC: T1, timer, code, why: why || null }) + '\n');
console.log(line);
process.exit(code);
