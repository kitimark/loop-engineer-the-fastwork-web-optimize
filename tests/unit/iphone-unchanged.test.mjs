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
//     Safari is touched; its Mac state (shared jobs, load1) goes into the record as res.mac with the state at the end.
// The 2226d51 pins still hold for the blocks with those lines put back, so everything else in them stays pinned.
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
  for (const [k, changes] of Object.entries(CHANGES)) {
    let b = block(src, `  if (cmd === '${k}') {`, '  }');
    for (const [now, then] of changes) {
      assert.equal(b.split(now).length, 2, `${k} has this intended change, once: ${now.trim().slice(0, 60)}`);
      b = b.replace(now, then);
    }
    assert.equal(sha(b), PINS_83B7F7B[k], `${k}: only the intended lines changed since 2226d51`);
  }
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
const CHANGES = {
  scroll: [[LAN_SAFE_WRITE, WRITE_83B7F7B], [SAFARI_TAB, TAB_83B7F7B], [GUARD, ''], [MAC, '']],
  record: [[LAN_SAFE_WRITE, WRITE_83B7F7B], [GUARD, ''], [MAC, '']],
  status: [[STATUS_APPID, STATUS_83B7F7B]],
};
const PINS_83B7F7B = { scroll: '274b5a8facbe7f2f', record: 'f8dea07e65914d49', status: '28dd691408056316' };

const PINS = {
  requireLease: '138ba8339515624d', tabs: 'e1036825df1dad05', PROBE: '20046acb19de62ae', summarize: 'a27f9bffb6eb2a69',
  status: '43e304a76f1bf0c9', open: 'dabba5b174193021', scroll: '854a545b29b77379', record: '3ea598d23159d45b', // CHANGES
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
  assert.ok(rec.includes(`await c.evaluate(\`${m.RECORD_JS}\`);`), 'RECORD_JS is the phone\'s logger expression');
  assert.ok(rec.includes(`await c.evaluate('${m.RECORD_STOP_JS}')`), 'RECORD_STOP_JS is the phone\'s stop expression');
  const fn = block(sim, 'function recordSummary(res) {', '}').split('\n').map((l) => l.trim());
  const phoneLines = rec.split('\n').map((l) => l.trim());
  for (const l of fn.slice(1, 4)) assert.ok(phoneLines.includes(l), `record summary line: ${l}`);
  assert.ok(phoneLines.includes(fn[4].replace(/^return /, 'res.summary = ')), 'the summary object is the phone\'s');
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
