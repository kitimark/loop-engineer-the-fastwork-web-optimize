// Run tools/cpu_bench.js on iPhone Safari through ios_webkit_debug_proxy.
// Quiet runs: tab navigated to about:blank, rewritten to a standards-mode blank doc; then one run on https://fastwork.com/ (after 8s settle).
// Usage: node iphone_bench.mjs [quietRuns=5] [out=../data/iphone/bench.json]
import fs from 'node:fs';
import crypto from 'node:crypto';
import {openTab, navigate, runAsync, sleep} from './iphone_wip.mjs';

const here = new URL('.', import.meta.url).pathname;
const RUNS = Number(process.argv[2] || 5);
const OUT = process.argv[3] || here + '../data/iphone/bench.json';
const BENCH = fs.readFileSync(here + 'cpu_bench.js', 'utf8');
const BENCH_SHA = crypto.createHash('sha256').update(BENCH).digest('hex').slice(0, 16); // detects bench edits (VERSION string is not always bumped)
const median = a => { const s = [...a].sort((x, y) => x - y), n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; };

let c = await openTab(u => u.includes('fastwork.com') || u === 'about:blank');
const runBench = async () => runAsync(c, `(window.__CPU_BENCH_OPTS = {reps: 5, warmup: 1}, ${BENCH.trim()})`, {pollMs: 2000, timeoutMs: 300000});

c = await navigate(c, 'about:blank');
// Same standards-mode blank document the Chrome side uses (data:text/html,<!doctype html>...); iOS Safari
// blocks top-level data: navigation, so write it into about:blank instead (about:blank alone is quirks mode).
const mode = await c.evaluate(`document.open(); document.write('<!doctype html><meta charset=utf-8><title>bench</title><body></body>'); document.close(); document.compatMode`);
console.log('blank page compatMode', mode);
await sleep(3000);
const quiet = [];
for (let i = 0; i < RUNS; i++) {
  const r = await runBench();
  console.log(`quiet ${i + 1}: total=${r.total_ms} geomean=${r.geomean_ms}`, Object.entries(r.results).map(([k, v]) => `${k}=${v.median_ms}`).join(' '));
  quiet.push(r);
  await sleep(2000);
}
c = await navigate(c, 'https://fastwork.com/', 'fastwork.com');
await sleep(8000);
const onPage = await runBench();
console.log(`fastwork: total=${onPage.total_ms} geomean=${onPage.geomean_ms}`, Object.entries(onPage.results).map(([k, v]) => `${k}=${v.median_ms}`).join(' '));

const names = Object.keys(quiet[0].results);
const summary = {
  quiet_median_of_run_medians: Object.fromEntries(names.map(n => [n, median(quiet.map(q => q.results[n].median_ms))])),
  quiet_total_ms_median: median(quiet.map(q => q.total_ms)),
  quiet_geomean_ms_median: median(quiet.map(q => q.geomean_ms)),
  on_fastwork: Object.fromEntries(names.map(n => [n, onPage.results[n].median_ms])),
  on_fastwork_total_ms: onPage.total_ms, on_fastwork_geomean_ms: onPage.geomean_ms,
};
fs.writeFileSync(OUT, JSON.stringify({device: 'iPhone 15 Pro Max, iOS 26.6.1 Safari', date: new Date().toISOString(), bench_sha256_16: BENCH_SHA, summary, quietPage: {url: 'about:blank', compatMode: mode}, quiet, onPage}, null, 1));
console.log(JSON.stringify(summary, null, 1));
c.close();
process.exit(0);
