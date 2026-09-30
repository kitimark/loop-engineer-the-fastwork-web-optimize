#!/usr/bin/env node
// devtools_calibrate.mjs — reproduces Chrome DevTools' "Calibrate CPU throttling" (Chrome 134+) headlessly over CDP,
// so the resulting low-tier / mid-tier rates can be recorded for this machine, and additionally samples the
// Lighthouse BenchmarkIndex at fixed throttle rates (to map any device's BenchmarkIndex, e.g. an iPhone's, to a rate).
//
// Algorithm mirrors devtools-frontend front_end/panels/mobile_throttling/CalibrationController.ts @ 1e16983d:
//   about:blank; BenchmarkIndex(250 ms) warm-up; score at rate 1 = actualScore; bisect (max 8 iters, |score-target|<10)
//   low target 264 in [1, actualScore/264*1.5]; mid target 1000 in [r-r/4, r+r/4] where r = low/(1000/264); rates truncated to 0.01.
//
// Usage: node devtools_calibrate.mjs [--runs 3] [--port 9335] [--rates 1,2,4,6,10,20] [--out data/chrome/devtools-calibration.json]
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf('--' + n); return i < 0 ? d : argv[i + 1]; };
const RUNS = Number(flag('runs', '3')), PORT = Number(flag('port', '9335'));
const RATES = String(flag('rates', '1,2,4,6,10,20')).split(',').map(Number);
const OUT = flag('out', 'devtools-calibration.json');
const HERE = path.dirname(new URL(import.meta.url).pathname);
const LHBI = fs.readFileSync(path.join(HERE, 'lh_benchmark_index.js'), 'utf8');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function connect(u) {
  const ws = new WebSocket(u); await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let id = 0; const pend = new Map();
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
  const send = (method, params = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({id: i, method, params})); })
    .then(m => { if (m.error) throw new Error(method + ': ' + m.error.message); return m.result; });
  return {ws, send, evaluate: async e => (await send('Runtime.evaluate', {expression: e, returnByValue: true, awaitPromise: true})).result.value};
}
async function launch() {
  try { await fetch(`http://127.0.0.1:${PORT}/json/version`, {signal: AbortSignal.timeout(500)}); throw new Error('port busy'); } catch (e) { if (e.message === 'port busy') throw e; }
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cpu-calib-profile-'));
  const proc = spawn(CHROME, [`--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check',
    '--disable-extensions', '--disable-background-networking', '--disable-component-update', '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--window-size=1500,1000', 'about:blank'], {stdio: 'ignore'});
  let t; for (let i = 0; i < 100 && !t; i++) { try { t = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json(); } catch { await sleep(200); } }
  const v = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json();
  const cdp = await connect(t.find(x => x.type === 'page').webSocketDebuggerUrl);
  const close = async () => {
    try { const b = await connect(v.webSocketDebuggerUrl); await Promise.race([b.send('Browser.close'), sleep(3000)]); } catch {}
    await Promise.race([new Promise(r => proc.once('exit', r)), sleep(5000)]); if (proc.exitCode === null) proc.kill('SIGKILL');
    await sleep(500); fs.rmSync(profile, {recursive: true, force: true});
  };
  return {cdp, close, version: v.Browser};
}
const truncate = n => Number(n.toFixed(2));

async function calibrateOnce() {
  const {cdp, close, version} = await launch();
  try {
    await cdp.send('Runtime.enable');
    // define computeBenchmarkIndex in the page (extract the function from lh_benchmark_index.js)
    const fnSrc = LHBI.slice(LHBI.indexOf('function computeBenchmarkIndex'), LHBI.lastIndexOf('const o = Object.assign'));
    await cdp.evaluate(`window.computeBenchmarkIndex = ${fnSrc.trim()}; window.runBenchmark = () => computeBenchmarkIndex(250); 1`);
    const cache = new Map(); const trail = [];
    const bench = () => cdp.evaluate('runBenchmark()');
    const run = async rate => {
      if (cache.has(rate)) return cache.get(rate);
      await cdp.send('Emulation.setCPUThrottlingRate', {rate});
      const s = await bench(); cache.set(rate, s); trail.push([rate, s]); return s;
    };
    await bench(); // warm-up
    const find = async (target, lo, hi) => {
      const lower = {rate: lo, score: await run(lo)}, upper = {rate: hi, score: await run(hi)};
      let rate = 0;
      for (let it = 0; it < 8; it++) {
        rate = truncate((upper.rate + lower.rate) / 2);
        const score = await run(rate);
        if (Math.abs(target - score) < 10) break;
        if (score < target) upper.rate = rate; else lower.rate = rate;
      }
      return truncate(rate);
    };
    const actualScore = await run(1);
    const low = await find(264, 1, actualScore / 264 * 1.5);
    const r = low / (1000 / 264);
    const mid = await find(1000, r - r / 4, r + r / 4);
    // fixed-rate BenchmarkIndex curve (median of 3)
    const curve = [];
    for (const rate of RATES) {
      await cdp.send('Emulation.setCPUThrottlingRate', {rate});
      const s = []; for (let i = 0; i < 3; i++) s.push(await bench());
      s.sort((a, b) => a - b); curve.push({rate, scores: s, median: s[1]});
    }
    return {chrome: version, actualScore, low, mid, trail, curve};
  } finally { await close(); }
}

const runs = [];
for (let i = 0; i < RUNS; i++) {
  const r = await calibrateOnce(); runs.push(r);
  console.log(`calibration ${i + 1}: host score ${r.actualScore}, low-tier ${r.low}x, mid-tier ${r.mid}x; curve ` + r.curve.map(c => `${c.rate}x=${c.median}`).join(' '));
}
fs.mkdirSync(path.dirname(path.resolve(OUT)), {recursive: true});
fs.writeFileSync(OUT, JSON.stringify({meta: {tool: 'devtools_calibrate.mjs', host: `${os.cpus()[0].model} x${os.cpus().length}`, date: new Date().toISOString(),
  source: 'devtools-frontend CalibrationController.ts @ 1e16983d27a40f1e449fe73503e6fdbb797c31d4', targets: {low: 264, mid: 1000}}, runs}, null, 1));
console.log('saved', OUT);
process.exit(0);
