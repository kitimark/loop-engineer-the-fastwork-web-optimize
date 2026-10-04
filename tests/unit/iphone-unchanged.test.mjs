// The finger-simulation tools (iphone.mjs gesture/wda, NEW measurement code) must not change the existing
// iPhone measurements: `scroll` (the calibrated scripted scroll, its in-page PROBE and summary) and `record`
// (the finger-test frame logger) stay byte-identical, and so do the lease guard and `open`/`status`. This pins
// the source of those blocks as they were before gesture/wda existed (2226d51). If one of them is changed on
// purpose, that is a measurement-code change: call it out (CLAUDE.md, Hard rule 6) and update the pin.
// The intended changes since 2226d51, none of which changes what is measured (CHANGES below):
//   - scroll and record write their file through lanSafeRecord (no LAN address on disk, Hard rule 12);
//   - scroll takes Safari's tab with safariTab(list), not list[0] (I-037: another app's about:blank web view can be
//     listed first; several candidates now fail instead of picking the first);
//   - status lists each target's appId (which app a web view belongs to, I-037);
//   - scroll and record call measureGuard(owner) right after the lease check (I-056: WAIT beside someone else's normal
//     chrome-measure hold, and beside a shared group with --require-quiet, like `run` and `gesture`); it refuses before
//     Safari is touched; its Mac state (shared jobs, load1) goes into the record as res.mac with the state at the end;
//   - scroll and record check the lease with leaseAndMark() (I-060): requireLease() plus one write of the run marker
//     (meta.run: what runs, for the progress page) on the lease record, before Safari is touched; the marker is cleared
//     after the run, outside the block. Nothing in the timed part changes.
//   - open resolves a `lan` placeholder host (https://lan:<port>/) to the Mac's LAN address before anything else, and
//     scroll compares Safari's tab with the lease URL resolved the same way (I-073: the address changes on a Wi-Fi
//     reconnect); a real address passes through unchanged, so what is opened and measured stays the same.
//   - open first checks whether Safari is parked (I-077: only blank views listed after a park, I-047) and then loads the
//     URL in the parked tab or restarts Safari (openParked, outside the block); with a web page listed it goes on
//     exactly as before. open measures nothing.
//   - requireLease refuses while another owner's console step is on the phone (I-123 d: lib/phone-step.mjs runnerRefusal,
//     --ignore-step), after the lease check and before anything touches Safari; it measures nothing (RUNNER_GUARD).
// The 2226d51 pins still hold for the blocks with those lines put back, so everything else in them stays pinned.
// One intended MEASUREMENT-CODE change (incident I-141, 2026-10-04): `record` runs through lib/iphone-record.mjs
// (recordRun), which polls the logger every --poll s (default 5 s, 0.2 Hz; 0 = none) and saves as it goes, then does the
// old final read; a failed read gets a diag and one reconnect. The in-page logger (RECORD_JS), the final read
// (RECORD_STOP_JS) and the summary (recordSummary) stay the 2226d51 ones, byte for byte: pinned below (RECORD_PINS) and
// equal to tools/lib/sim-scroll.mjs's copies. So the record block is pinned as it is now, no longer against 2226d51.
// I-186 (2026-10-05, measurement-adjacent, nothing timed changes): scroll and record check the phone's thermal profile
// (`--profile serious|fair`) right after measureGuard, before Safari is touched (profileGate: one ~25 s xctrace read per
// hold, cached; a misfit refuses with exit 8), put it into the record (res.meta.profile) and list the saved file for the
// hold's end read (prof.saved). PROFILE below; scroll still matches 2226d51 and record its I-141 pin without these lines.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { TOOLS } from '../helpers.mjs';

/** The lines from the one that starts with `head` to the first line that is exactly `close` (inclusive). */
function block(src, head, close) {
  const lines = src.split('\n');
  const i = lines.findIndex((l) => l.startsWith(head));
  assert.ok(i >= 0, `block not found: ${head}`);
  const j = lines.findIndex((l, k) => k > i && l === close);
  assert.ok(j > i, `end of block not found: ${head}`);
  return lines.slice(i, j + 1).join('\n');
}
const sha = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16);

test('iphone.mjs: scroll, record, open, status, PROBE, summarize and requireLease are byte-identical to 2226d51', () => {
  const src = readFileSync(join(TOOLS, 'iphone.mjs'), 'utf8');
  const got = {
    requireLease: sha(block(src, 'function requireLease() {', '}')),
    tabs: sha(block(src, 'async function tabs() {', '}')),
    PROBE: sha(block(src, 'const PROBE = `', '})()`;')),
    summarize: sha(block(src, 'function summarize(res) {', '}')),
    status: sha(block(src, "  if (cmd === 'status') {", '  }')),
    open: sha(block(src, "  if (cmd === 'open') {", '  }')),
    scroll: sha(block(src, "  if (cmd === 'scroll') {", '  }')),
    record: sha(block(src, "  if (cmd === 'record') {", '  }')),
  };
  assert.deepEqual(got, PINS);
  const lease = block(src, 'function requireLease() {', '}');
  assert.equal(lease.split(RUNNER_GUARD).length, 2, 'requireLease has the I-123 runner guard, once');
  assert.equal(sha(lease.replace(RUNNER_GUARD, '')), PINS_BEFORE_I123.requireLease, 'requireLease: only the I-123 guard changed');
  for (const [k, changes] of Object.entries(CHANGES)) {
    let b = block(src, `  if (cmd === '${k}') {`, '  }');
    for (const [now, then] of changes) {
      assert.equal(b.split(now).length, 2, `${k} has this intended change, once: ${now.trim().slice(0, 60)}`);
      b = b.replace(now, then);
    }
    assert.equal(sha(b), PINS_83B7F7B[k], `${k}: only the intended lines changed since 2226d51`);
  }
  let rec = block(src, "  if (cmd === 'record') {", '  }');
  for (const [now, then] of PROFILE.record) {
    assert.equal(rec.split(now).length, 2, `record has the I-186 line, once: ${now.trim().slice(0, 60)}`);
    rec = rec.replace(now, then);
  }
  assert.equal(sha(rec), PINS_BEFORE_I186.record, 'record: only the I-186 profile lines changed since I-141');
});

const LAN_SAFE_WRITE = '    writeFileSync(out, JSON.stringify(lanSafeRecord(res))); // no LAN address in the file (Hard rule 12)';
const WRITE_83B7F7B = '    writeFileSync(out, JSON.stringify(res));';
const SAFARI_TAB = '    const tab = safariTab(list); // never a blank web view of another app, never the first of several (I-037)';
const TAB_83B7F7B = "    const tab = list[0];\n    if (!tab) throw new Error('no Safari tab (unlock the iPhone, bring Safari to the front)');";
const STATUS_APPID = '.map((t) => ({ url: t.url, title: t.title, appId: t.appId, error: t.error }))';
const STATUS_83B7F7B = '.map((t) => ({ url: t.url, title: t.title, error: t.error }))';
const GUARD = '\n    const mac = measureGuard(owner);'; // I-056
const MAC = '\n    res.mac = phoneMacRecord(mac); // I-056: shared jobs and load1 on the Mac at start and end';
/** [now, as in 2226d51] per block */
const MARK = ['    const owner = leaseAndMark();', '    const owner = requireLease();']; // I-060
const LEASE_URL = ['    let leaseUrl = tryResolveLanUrl(holder.meta?.url); // a `lan` placeholder lease URL (I-073)', '    let leaseUrl = holder.meta?.url;'];
const OPEN_LAN = ["    const url = resolveLanUrl(arg); // http://lan:<port>/ -> this Mac's LAN address now (I-073)\n    const info = await mirrorInfo(url);\n    const target = iphoneTarget(url, info, { keepHttps: flag('keep-https') });",
  "    const info = await mirrorInfo(arg);\n    const target = iphoneTarget(arg, info, { keepHttps: flag('keep-https') });"]; // I-073
const OPEN_PARKED = ['\n    if (await openParked(url, target, info)) return; // Safari parked (I-047): its parked tab, or a Safari restart (I-077)', '']; // I-077
const PROF_GATE = '\n    const prof = await profileGate(owner); // I-186: the thermal profile at the hold\'s start (one read per hold; refuses, exit 8)';
const PROF_META = (indent) => `\n${indent}res.meta.profile = prof.record(); // I-186: profile, the hold's start read (the end read stamps end/drift)`;
const PROF_SAVED = "\n    await prof.saved(out); // I-186: listed for the hold's end read";
const PROFILE = { scroll: [[PROF_GATE, ''], [PROF_META('    '), ''], [PROF_SAVED, '']], record: [[PROF_GATE, ''], [PROF_META('      '), ''], [PROF_SAVED, '']] };
const PINS_BEFORE_I186 = { record: '53258b1f26b31e01' }; // the I-141 pin
const CHANGES = {
  scroll: [...PROFILE.scroll, [LAN_SAFE_WRITE, WRITE_83B7F7B], [SAFARI_TAB, TAB_83B7F7B], [GUARD, ''], [MAC, ''], MARK, LEASE_URL],
  open: [OPEN_LAN, OPEN_PARKED],
  status: [[STATUS_APPID, STATUS_83B7F7B]],
};
const RUNNER_GUARD = "\n  // I-123: never touch the phone under another owner's console step that is on it (begun, not over); the Simulator is\n  // not the phone. --ignore-step C-NNN: a step its owner left behind, named on purpose.\n  const busy = process.env.FW_SIM_SESSION ? null : runnerRefusal({ owner, ignore: opt('ignore-step') });\n  if (busy) throw new Error(busy);";
const PINS_BEFORE_I123 = { requireLease: '138ba8339515624d' }; // = 2226d51
const PINS_83B7F7B = { scroll: '274b5a8facbe7f2f', status: '28dd691408056316', open: 'dabba5b174193021' }; // record: 'f8dea07e65914d49' until I-141
/** I-141: the 2226d51 logger and stop expressions (as the record block held them before I-141), now in lib/iphone-record.mjs. */
const RECORD_PINS = { RECORD_JS: '8d5ee37294abb430', RECORD_STOP_JS: 'b24a0eac1e12cfb5' };

const PINS = {
  requireLease: 'c3fe5c3908d05b4b', tabs: 'e1036825df1dad05', PROBE: '20046acb19de62ae', summarize: 'a27f9bffb6eb2a69',
  status: '43e304a76f1bf0c9', open: '805f788db018f5f6', scroll: '88173866305dfab8', record: '93dc03f9721d7b09', // CHANGES (I-060: leaseAndMark; I-073: lan placeholder; I-077: open after a park; I-123: requireLease's runner guard; I-141: record through lib/iphone-record.mjs; I-186: the thermal profile gate)
};

// tools/lib/sim-scroll.mjs (`sim.mjs scroll` / `record`, research/simulator/README.md §7) measures the Simulator with
// COPIES of the phone's probe, summary and finger logger, so the Simulator's numbers are the phone's numbers: the copies
// must stay byte-identical to iphone.mjs (and so to the pins above). A change to one is a change to both.
test('sim-scroll.mjs: PROBE, summarize, the record logger and its summary are the phone\'s, byte for byte', async () => {
  const phone = readFileSync(join(TOOLS, 'iphone.mjs'), 'utf8');
  const sim = readFileSync(join(TOOLS, 'lib', 'sim-scroll.mjs'), 'utf8');
  for (const [head, close] of [['const PROBE = `', '})()`;'], ['function summarize(res) {', '}']]) {
    assert.equal(block(sim, head, close), block(phone, head, close), head);
  }
  assert.equal(sha(block(sim, 'const PROBE = `', '})()`;')), PINS.PROBE);
  assert.equal(sha(block(sim, 'function summarize(res) {', '}')), PINS.summarize);
  const rec = block(phone, "  if (cmd === 'record') {", '  }');
  const m = await import('../../tools/lib/sim-scroll.mjs');
  const R = await import('../../tools/lib/iphone-record.mjs'); // I-141: the phone's logger lives there now
  const lib = readFileSync(join(TOOLS, 'lib', 'iphone-record.mjs'), 'utf8');
  assert.equal(R.RECORD_JS, m.RECORD_JS, 'RECORD_JS is the phone\'s logger expression');
  assert.equal(R.RECORD_STOP_JS, m.RECORD_STOP_JS, 'RECORD_STOP_JS is the phone\'s stop expression');
  assert.deepEqual({ RECORD_JS: sha(R.RECORD_JS), RECORD_STOP_JS: sha(R.RECORD_STOP_JS) }, RECORD_PINS, 'the 2226d51 logger and stop read, unchanged');
  assert.ok(rec.includes('await c.evaluate(RECORD_JS);'), 'record installs the logger expression as it is');
  assert.ok(lib.includes('await c.evaluate(RECORD_STOP_JS, \'page\', readMs)'), 'the final read is the stop expression');
  assert.ok(rec.includes('res.summary = recordSummary(res);'), 'the summary is recordSummary');
  assert.equal(block(lib, 'function recordSummary(res) {', '}'), block(sim, 'function recordSummary(res) {', '}'), 'recordSummary is the Simulator\'s copy, byte for byte');
  // scrollCmd's sequence is the phone's scroll block's: reload from the top, 2.5 s, readyState, 8 s, probe, 1.5 s polls
  const simScroll = block(sim, 'export async function scrollCmd(', '}').split('\n').map((l) => l.trim());
  const phoneScroll = block(phone, "  if (cmd === 'scroll') {", '  }').split('\n').map((l) => l.trim());
  for (const l of phoneScroll.filter((x) => /^(await c\.evaluate|await sleep|for \(let i = 0; i < 60|while \(!res|if \(!res\)|if \(res\.err\)|res\.summary =|c\.close)/.test(x))) {
    assert.ok(simScroll.includes(l), `sim scrollCmd lacks the phone's line: ${l}`);
  }
  // and the copies compute what the phone's code computes, on a made-up frame list
  const res = { frames: [[0, 16.7, 0, 775], [16.7, 16.7, 0, 775], [60, 43.3, 10, 775], [120, 60, 30, 815], [130, 10, 30, 815]] };
  assert.deepEqual(m.recordSummary(res), { all: { frames: 5, gt20: 2, gt34: 2, gt50: 1, gt100: 0, max: 60 }, whileScrollYChanges: { frames: 2, gt20: 2, gt34: 2, gt50: 1, gt100: 0, max: 60 }, innerHeightChanges: 1 });
});
