// The finger-simulation tools (iphone.mjs gesture/wda, NEW measurement code) must not change the existing
// iPhone measurements: `scroll` (the calibrated scripted scroll, its in-page PROBE and summary) and `record`
// (the finger-test frame logger) stay byte-identical, and so do the lease guard and `open`/`status`. This pins
// the source of those blocks as they were before gesture/wda existed (2226d51). If one of them is changed on
// purpose, that is a measurement-code change: call it out (CLAUDE.md, Hard rule 6) and update the pin.
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
});

const PINS = {
  requireLease: '138ba8339515624d', tabs: 'e1036825df1dad05', PROBE: '20046acb19de62ae', summarize: 'a27f9bffb6eb2a69',
  status: '28dd691408056316', open: 'dabba5b174193021', scroll: '274b5a8facbe7f2f', record: 'f8dea07e65914d49',
};
