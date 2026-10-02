#!/usr/bin/env node
// Drive the ONE shared iPhone (iOS Safari over ios_webkit_debug_proxy, :9221 device list, :9222 tabs).
// The phone shows one page at a time, so every command that touches it requires the caller to hold
// the "iphone" lease (tools/lock.mjs); read-only `status` does not.
//
//   node tools/lock.mjs acquire iphone --owner <topic> --ttl 900 --url https://192.168.0.55:<port>/
//   node tools/iphone.mjs status                                  # device + open tab (no lease needed)
//   node tools/iphone.mjs open  https://192.168.0.55:<port>/ --owner <topic>   # navigate Safari (location.href)
//   node tools/iphone.mjs scroll --owner <topic> [--out out/iphone/<topic>-<label>.json] [--label patched]
//   node tools/iphone.mjs record --owner <topic> [--seconds 25] [--label finger-patched]   # human scrolls meanwhile
//        # in the background with output to a log; `node tools/wait.mjs file <log> --match '^RECORDING' --pid <pid>`
//        # exits the moment it records (tell the lead then), NEVER (exit 4) if record failed first
//   node tools/iphone.mjs park --owner <topic>                    # Safari to about:blank: after every block (I-047)
//   node tools/lock.mjs release iphone --owner <topic>
//
// Simulated finger (real OS-level touches through WebDriverAgent over USB, research/architecture/
// finger-simulation.md; NEW MEASUREMENT CODE, gesture numbers compare only with the same script hash):
//   node tools/iphone.mjs wda status | build --owner <topic> | start --owner <topic> | stop   # tools/lib/wda-runner.mjs
//   node tools/iphone.mjs gesture tools/gestures/finger-protocol-v1.json --owner <topic> [--label l]
//        [--variant asPerformed|slow] [--param k=v]... [--inject <logger.mjs> | --morph-log <morph-log.mjs>]
//        [--dry-run]   # tools/lib/gesture-run.mjs; --inject runs an in-page logger on the run's own connection (I-038)
//   node tools/iphone.mjs safari-restart --owner <topic> [--url U] [--via auto|wda|devicectl] [--timeout 30]
//        # quit + relaunch Safari (WDA apps endpoints, else devicectl --terminate-existing), open U if given, wait
//        # until the proxy lists a page that answers Runtime.evaluate; prints SAFARI_RESTARTED (tools/lib/safari-restart.mjs)
//
// `scroll` is the calibrated scripted scroll (research/cpu-throttle-calibration/tools/iphone_scroll.mjs):
// reload, settle 8 s, rAF frame logger, 3 s idle, scrollBy({top:250, behavior:'smooth'}) every 300 ms to
// the bottom, 3 s at the bottom. It does NOT exercise the touch-only paths (non-passive touchmove
// scroll-jack, toolbar-collapse resize); those need a human finger (ask the lead / user).
// Self-signed https (incident I-003): iOS Safari stops at its certificate warning for the mirror's
// self-signed cert on every new port, and nothing here can click through it. `serve.mjs --https` (and
// `fix.mjs serve`) therefore also serve a plain-http twin port; `open <https mirror URL>` switches to
// it (--keep-https opts out, for a phone that trusts the cert) and after navigating fails loudly if
// Safari is not on the mirror page (certificate warning), instead of leaving it there to be measured.
//
// Mac quiet (I-056): scroll, record, run and gesture (on the phone) refuse with WAIT (exit 1) while someone else's normal
// chrome-measure hold holds it; an exclusive short-lane job passes, and so does the runner's own hold (its owner, or the
// hold `lock.mjs run` exports in FW_LOCK_HELD), a --no-timing one included: the phone stamps its own frames, so a phone
// part that wants a quiet Mac runs inside `node tools/lock.mjs run chrome-measure --owner <o> --no-timing --max-seconds
// 600 -- sh -c '<part>'`, which waits its turn and keeps every other job off the Mac. Shared jobs (npm test, a Simulator
// session) do not stop a phone run (Mac-quiet is preferred, not required: the lead, 08:33Z; user T-017): it prints a NOTE
// and its record keeps the Mac state (`mac`: shared jobs, load1 at start and end); --require-quiet or
// FW_PHONE_REQUIRE_QUIET=1 makes it WAIT for them instead. --allow-during-measure: diagnostics only.
//
// Protocol v2 runs (T1a, research/architecture/measurement-protocol-v2.md §5.4-5.5; tools/lib/iphone-run.mjs):
//   node tools/iphone.mjs run --driver scroll|window|morph --probe std --owner <topic> [--label l] ...   (run --help)
// one reload + settle + driver run with the standard probe (per-frame log, uncapped mutation counts by type,
// crossing log, tool hashes) -> out/iphone/<owner>-run-<label>-<ts>.json (schema fw-iphone-run/1).
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { openTab, navigate, safariTab, sleep, parkSafari } from './lib/wip.mjs';
import { status as lockStatus, timedInSlotRefusal, phoneGuard, phoneMacRecord, describeHold } from './lib/lock.mjs';
import { keepAwakeFor } from './lib/awake.mjs';
import { parseJob, phoneRunText } from './lib/hold-job.mjs';
import { basename, extname } from 'node:path';
import { REPO } from './lib/paths.mjs';
import { mirrorInfo, iphoneTarget, LANDED_JS, landedProblem, CERT_WARNING_TITLE, lanSafeRecord } from './lib/iphone-url.mjs';

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.findIndex((a) => a === `--${n}` || a.startsWith(`--${n}=`)); if (i < 0) return d; const a = argv[i]; return a.includes('=') ? a.split('=').slice(1).join('=') : argv[i + 1]; };
const flag = (n) => argv.includes(`--${n}`);
const VALUED = ['--owner', '--out', '--label', '--seconds', '--variant', '--param', '--morph-log', '--inject', '--ref', '--team', '--udid', '--bundle-id', '--timeout', '--url', '--via', '--doing'];
const [cmd, arg] = argv.filter((a, i) => !a.startsWith('--') && !(i > 0 && VALUED.includes(argv[i - 1])));
const PORT = Number(process.env.FW_IPHONE_PORT || 9222);
const DEVICE_PORT = Number(process.env.FW_IPHONE_DEVICE_PORT || 9221);

function requireLease() {
  const owner = opt('owner', process.env.FW_LOCK_OWNER);
  const s = lockStatus('iphone');
  if (!owner) throw new Error('--owner <topic> is required');
  if (!s.holder || s.stale || s.holder.owner !== owner) {
    throw new Error(`you ("${owner}") don't hold the iphone lease${s.holder ? ` (holder: "${s.holder.owner}"${s.stale ? ', stale' : ''})` : ''}. Run: node tools/lock.mjs acquire iphone --owner ${owner}`);
  }
  return owner;
}

// I-060: a phone run (scroll|record|run|gesture) marks the lease with what it runs (meta.run {text, since, pid}; the
// progress page's "Right now"), from --doing "<plain line>" or its own flags (lib/hold-job.mjs phoneRunText), and
// clears it when it ends (a killed run leaves a marker whose pid is gone: the page ignores it). Best effort: a marker
// that cannot be written never stops a run.
let runMark = null;
function runText() {
  if (opt('doing') !== undefined) return parseJob({ text: opt('doing') }).text;
  if (cmd === 'run') {
    try { const o = parseRunArgsSync(argv.slice(argv.indexOf('run') + 1)); return phoneRunText('run', { label: o.label, driver: o.driver, labels: o.labels }); } catch { return phoneRunText('run', {}); }
  }
  const label = opt('label') ?? (cmd === 'gesture' && arg ? basename(arg, extname(arg)) : cmd === 'record' ? 'finger' : undefined);
  return phoneRunText(cmd, { label });
}
let parseRunArgsSync = () => ({});
function leaseAndMark() {
  const owner = requireLease();
  keepAwakeFor(`iphone.mjs ${cmd} (${owner})`); // I-070: a phone run is a measurement: caffeinate -i -s -w <this pid>
  if (!runMark) {
    const text = runText();
    runMark = { owner, done: describeHold('iphone', { owner, run: { text, since: new Date().toISOString(), pid: process.pid } }).catch(() => null) };
  }
  return owner;
}
async function clearMark() {
  if (!runMark) return;
  try { await runMark.done; await describeHold('iphone', { owner: runMark.owner, run: null }); } catch {}
}

/** I-056: scroll and record refuse (WAIT, exit 1) like `run` and `gesture` beside someone else's normal chrome-measure
 *  hold; the runner's own hold passes; shared jobs pass with a NOTE and the Mac state in the record (`mac`) unless
 *  --require-quiet or FW_PHONE_REQUIRE_QUIET=1 (lib/lock.mjs phoneGuard). --allow-during-measure: diagnostics. */
function measureGuard(owner) {
  return phoneGuard({ owner, allow: flag('allow-during-measure'), requireQuiet: flag('require-quiet') });
}

async function tabs() {
  return (await (await fetch(`http://localhost:${PORT}/json`, { signal: AbortSignal.timeout(4000) })).json());
}

const PROBE = `(async () => {
  const fp = window.__fp = {frames: []};
  let last = performance.now();
  const loop = t => { fp.frames.push([Math.round(t * 10) / 10, Math.round((t - last) * 10) / 10, Math.round(scrollY)]); last = t; requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const marks = {}; const vh0 = innerHeight;
  marks.idle = [performance.now()]; await sleep(3000); marks.idle.push(performance.now());
  marks.scroll = [performance.now()];
  const maxY = document.documentElement.scrollHeight - innerHeight;
  while (scrollY < maxY - 5 && performance.now() - marks.scroll[0] < 45000) { window.scrollBy({top: 250, behavior: 'smooth'}); await sleep(300); }
  marks.scroll.push(performance.now());
  marks.bottom = [performance.now()]; await sleep(3000); marks.bottom.push(performance.now());
  return {marks, maxY, finalY: Math.round(scrollY), docH: document.documentElement.scrollHeight, vw: innerWidth, vh0, vh: innerHeight, dpr: devicePixelRatio, ua: navigator.userAgent, href: location.href, frames: fp.frames};
})()`;

function summarize(res) {
  const out = {};
  for (const phase of ['idle', 'scroll', 'bottom']) {
    const [a, b] = res.marks[phase];
    const f = res.frames.filter(([t]) => t >= a && t <= b).map(([, dt]) => dt);
    const total = f.reduce((x, y) => x + y, 0);
    out[phase] = { frames: f.length, fps: Math.round((10 * f.length) / (total / 1000 || 1)) / 10, gt20: f.filter((x) => x > 20).length, gt34: f.filter((x) => x > 34).length, gt50: f.filter((x) => x > 50).length, gt100: f.filter((x) => x > 100).length, max: Math.max(0, ...f) };
  }
  return out;
}

async function main() {
  // review-lock-share N5: a timing command never runs inside a functional slot (FW_LOCK_SHARED from `lock.mjs run
  // --shared`, in either switch state) or a functional Simulator session (FW_SIM_FUNCTIONAL, also via FW_IPHONE_PORT)
  const refusal = ['scroll', 'record', 'run', 'gesture'].includes(cmd) && !flag('help') ? timedInSlotRefusal(`iphone.mjs ${cmd}`) : null;
  if (refusal) { console.error(refusal); process.exit(2); }
  if (['scroll', 'record', 'run', 'gesture'].includes(cmd) && !flag('help') && opt('doing') !== undefined) parseJob({ text: opt('doing') }); // I-060: a bad --doing fails before the phone is touched
  if (cmd === 'run') parseRunArgsSync = (await import('./lib/iphone-run.mjs')).parseRunArgs;
  if (cmd === 'status') {
    const dev = await fetch(`http://localhost:${DEVICE_PORT}/json`, { signal: AbortSignal.timeout(4000) }).then((r) => r.json()).catch((e) => ({ error: `proxy not reachable on :${DEVICE_PORT} (${e.cause?.code || e.message})` }));
    console.log('device:', JSON.stringify(dev));
    console.log('tabs:', JSON.stringify((await tabs().catch((e) => [{ error: `proxy not reachable on :${PORT} (${e.cause?.code || e.message})` }])).map((t) => ({ url: t.url, title: t.title, appId: t.appId, error: t.error }))));
    const s = lockStatus('iphone');
    console.log('lease:', s.holder ? `${s.holder.owner}${s.stale ? ' (stale: ' + s.stale + ')' : ''} until ${s.holder.expiresAt}` : 'free', s.queue.length ? `queue: ${s.queue.map((w) => w.owner).join(', ')}` : '');
    return;
  }
  if (cmd === 'open') {
    requireLease();
    if (!/^https?:\/\//.test(arg || '')) throw new Error('usage: node tools/iphone.mjs open <url> --owner <topic>');
    const info = await mirrorInfo(arg);
    const target = iphoneTarget(arg, info, { keepHttps: flag('keep-https') });
    if (target.note) console.log(target.note);
    const c = await openTab(() => true);
    let c2;
    try { c2 = await navigate(c, target.url, new URL(target.url).host); } catch (e) {
      if (target.url.startsWith('https:')) e.message += ` (Safari never listed ${target.url}; if it shows "This Connection Is Not Private", that is the certificate warning: open the http:// URL instead, incident I-003)`;
      throw e;
    }
    const landed = await c2.evaluate(LANDED_JS);
    c2.close();
    const problem = landedProblem(landed, target.url, info);
    if (problem) throw new Error(problem);
    console.log(`Safari now on ${landed.href}`);
    return;
  }
  if (cmd === 'scroll') {
    const owner = leaseAndMark();
    const mac = measureGuard(owner);
    const holder = lockStatus('iphone').holder;
    const list = await tabs();
    const tab = safariTab(list); // never a blank web view of another app, never the first of several (I-037)
    if (CERT_WARNING_TITLE.test(tab.title || '')) throw new Error(`Safari shows its certificate warning ("${tab.title}") on ${tab.url}, not the page; run: node tools/iphone.mjs open <url> --owner ${owner} (it opens a self-signed https mirror over its plain-http twin, incident I-003)`);
    let leaseUrl = holder.meta?.url;
    if (leaseUrl && !tab.url.startsWith(leaseUrl)) { try { leaseUrl = iphoneTarget(leaseUrl, await mirrorInfo(leaseUrl)).url; } catch {} } // https lease URL, Safari on its http twin
    if (leaseUrl && !tab.url.startsWith(leaseUrl)) console.error(`warning: Safari shows ${tab.url}, your lease says ${holder.meta.url} (run: node tools/iphone.mjs open ${holder.meta.url} --owner ${owner})`);
    let c = await openTab(() => true);
    const host = new URL(await c.evaluate('location.href')).host;
    await c.evaluate(`scrollTo(0, 0); setTimeout(() => location.reload(), 400); 'ok'`);
    c.close();
    await sleep(2500);
    c = await openTab(host);
    for (let i = 0; i < 60; i++) { if ((await c.evaluate('document.readyState')) === 'complete') break; await sleep(500); }
    await sleep(8000);
    await c.evaluate(`window.__iphRes = undefined; ${PROBE}.then(v => { window.__iphRes = JSON.stringify(v); }, e => { window.__iphRes = JSON.stringify({err: String(e)}); }); 'started'`);
    let res = null;
    const t0 = Date.now();
    while (!res && Date.now() - t0 < 90000) { await sleep(1500); const v = await c.evaluate('window.__iphRes || null'); if (v) res = JSON.parse(v); }
    c.close();
    if (!res) throw new Error('probe did not finish in 90 s');
    if (res.err) throw new Error(res.err);
    res.summary = summarize(res);
    res.meta = { device: 'iPhone 15 Pro Max, iOS 26.6.1 Safari', owner, label: opt('label', ''), date: new Date().toISOString() };
    res.mac = phoneMacRecord(mac); // I-056: shared jobs and load1 on the Mac at start and end
    const out = resolve(REPO, opt('out', join('out', 'iphone', `${owner}-${opt('label', 'run')}-${Date.now()}.json`)));
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, JSON.stringify(lanSafeRecord(res))); // no LAN address in the file (Hard rule 12)
    console.log(JSON.stringify(res.summary, null, 1));
    console.log(`saved ${out}`);
    return;
  }
  if (cmd === 'record') {
    // Finger test: log rAF frames + scrollY while a human scrolls (touch-only paths: non-passive
    // touchmove scroll-jack, toolbar-collapse resize). The lead asks the user to scroll; see CLAUDE.md.
    const owner = leaseAndMark();
    const mac = measureGuard(owner);
    const secs = Number(opt('seconds', 25));
    const c = await openTab(() => true);
    await c.evaluate(`(() => { const r = window.__fr = {frames: [], href: location.href, vw: innerWidth, vh0: innerHeight}; let last = performance.now();
      const loop = (t) => { r.frames.push([Math.round(t * 10) / 10, Math.round((t - last) * 10) / 10, Math.round(scrollY), innerHeight]); last = t; if (!r.stop) requestAnimationFrame(loop); };
      requestAnimationFrame(loop); return 'ok'; })()`);
    console.log(`RECORDING ${secs} s on ${await c.evaluate('location.href')} - the human should scroll now (top to bottom, then push past the end)`);
    await sleep(secs * 1000);
    const res = JSON.parse(await c.evaluate('(() => { window.__fr.stop = true; return JSON.stringify(window.__fr); })()'));
    c.close();
    const moving = res.frames.filter((f, i) => i > 0 && f[2] !== res.frames[i - 1][2]).map((f) => f[1]);
    const all = res.frames.map((f) => f[1]);
    const sum = (f) => ({ frames: f.length, gt20: f.filter((x) => x > 20).length, gt34: f.filter((x) => x > 34).length, gt50: f.filter((x) => x > 50).length, gt100: f.filter((x) => x > 100).length, max: Math.max(0, ...f) });
    res.summary = { all: sum(all), whileScrollYChanges: sum(moving), innerHeightChanges: new Set(res.frames.map((f) => f[3])).size - 1 };
    res.meta = { device: 'iPhone 15 Pro Max, iOS 26.6.1 Safari', owner, label: opt('label', 'finger'), seconds: secs, date: new Date().toISOString() };
    res.mac = phoneMacRecord(mac); // I-056: shared jobs and load1 on the Mac at start and end
    const out = resolve(REPO, opt('out', join('out', 'iphone', `${owner}-${opt('label', 'finger')}-${Date.now()}.json`)));
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, JSON.stringify(lanSafeRecord(res))); // no LAN address in the file (Hard rule 12)
    console.log(JSON.stringify(res.summary, null, 1));
    console.log(`saved ${out}`);
    return;
  }
  if (cmd === 'park') {
    // incident I-047: a test page left open between blocks keeps animating and heats the phone; park Safari on
    // about:blank (the lease holder's tab, pickTab rules, I-037). `iphone.mjs open <url>` brings a page back.
    requireLease();
    const r = await parkSafari({ port: PORT });
    console.log(r.already ? 'PARKED already: Safari shows no web page' : `PARKED Safari on about:blank (was ${r.from})`);
    return;
  }
  if (cmd === 'gesture') return (await import('./lib/gesture-run.mjs')).gestureCmd({ argv, arg, opt, flag, requireLease: leaseAndMark, port: PORT });
  if (cmd === 'wda') return (await import('./lib/wda-runner.mjs')).wdaCmd({ sub: arg, opt, requireLease });
  if (cmd === 'safari-restart') {
    requireLease();
    const { safariRestart, wdaDriver, devicectlDriver } = await import('./lib/safari-restart.mjs');
    const { readConfig } = await import('./lib/wda-runner.mjs');
    const { WDA_URL } = await import('./lib/wda.mjs');
    const known = readConfig();
    await safariRestart({ drivers: [wdaDriver({ base: WDA_URL() }), devicectlDriver({ udid: known.udid })], via: opt('via', 'auto'), url: opt('url', null), port: PORT,
      timeoutMs: 1000 * Number(opt('timeout', 30)), known, keepHttps: flag('keep-https') });
    return;
  }
  if (cmd === 'run') return (await import('./lib/iphone-run.mjs')).runCmd({ argv, requireLease: leaseAndMark, port: PORT });
  console.log('usage: node tools/iphone.mjs status | open <url> --owner <topic> [--keep-https] | scroll --owner <topic> [--label x] [--out file] [--require-quiet] [--allow-during-measure] | park --owner <topic> | record --owner <topic> [--seconds 25] [--require-quiet] [--allow-during-measure] | gesture <script.json> --owner <topic> [--dry-run] [--require-quiet] [--allow-during-measure] | wda status|build|start|stop | safari-restart --owner <topic> [--url U] [--via auto|wda|devicectl] [--timeout 30] | run --driver scroll|window|morph --probe std --owner <topic> (run --help)');
}
main().then(async () => { await clearMark(); process.exit(0); }, async (e) => { console.error(e.message || e); await clearMark(); process.exit(1); });
