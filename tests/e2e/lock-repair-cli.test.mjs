// tools/lock.mjs doctor / repair (incident I-012): exit codes, output, dry run by default, --apply needs
// --by/--reason and writes locks/audit.log, --force-holder prints the holder and never removes a live
// iphone lease.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tempDir, node, tool } from '../helpers.mjs';

const LOCK = tool('lock.mjs');
let state, env;
beforeEach(() => { state = tempDir('fw-lockrepcli-'); env = { FW_STATE_DIR: state }; mkdirSync(join(state, 'locks'), { recursive: true }); });
const lock = (...a) => node(LOCK, a, { env });
const lf = (f) => join(state, 'locks', f);
const bytes = () => Object.fromEntries(readdirSync(lf('')).sort().map((n) => [n, readFileSync(lf(n), 'latin1')]));

test('doctor: exit 0 when clean, 1 with each problem and its fix; --json', () => {
  assert.equal(lock('acquire', 'chrome-measure', '--owner', 'ab').code, 0);
  const ok = lock('doctor');
  assert.equal(ok.code, 0, ok.out);
  assert.match(ok.stdout, /^OK chrome-measure: held by "ab"$/m);
  assert.match(ok.stdout, /^OK iphone: no live holder$/m);

  // I-011: an old client took the lock without writing last-grant.json
  const h = JSON.parse(readFileSync(lf('chrome-measure.json'), 'utf8'));
  writeFileSync(lf('chrome-measure.last-grant.json'), JSON.stringify({ owner: 'ts-x', short: true, at: new Date(Date.parse(h.acquiredAt) - 60000).toISOString() }));
  const bad = lock('doctor', 'chrome-measure');
  assert.equal(bad.code, 1, bad.out);
  assert.match(bad.stdout, /^PROBLEMS chrome-measure: 1 \(held by "ab"\)/m);
  assert.match(bad.stdout, /\[last-grant-mismatch\] chrome-measure\.last-grant\.json: records "ts-x" \(short/);
  assert.match(bad.stdout, /fix: rewrite it from the holder/);
  const j = JSON.parse(lock('doctor', 'chrome-measure', '--json').stdout);
  assert.equal(j[0].problems[0].code, 'last-grant-mismatch');
  assert.equal(j[0].problems[0].after.owner, 'ab');
});

test('repair: dry run by default (nothing changes), --apply needs --by/--reason, then fixes and audits', () => {
  assert.equal(lock('acquire', 'chrome-measure', '--owner', 'ab').code, 0);
  writeFileSync(lf('chrome-measure.last-grant.json'), JSON.stringify({ owner: 'ts-x', short: true, at: '2026-01-01T00:00:00.000Z' }));
  const before = bytes();
  const dry = lock('repair', 'chrome-measure', '--by', 'lead', '--reason', 'I-011');
  assert.equal(dry.code, 0, dry.out);
  assert.match(dry.stdout, /^REPAIR chrome-measure \(dry run, nothing changed\): 1 change\(s\)/);
  assert.match(dry.stdout, /before: \{"owner":"ts-x","short":true/);
  assert.match(dry.stdout, /after: {2}\{"owner":"ab","short":false/);
  assert.deepEqual(bytes(), before, 'dry run leaves every byte as it was');

  const noWho = lock('repair', 'chrome-measure', '--apply');
  assert.equal(noWho.code, 1);
  assert.match(noWho.stderr, /needs --by <who> and --reason/);
  assert.deepEqual(bytes(), before);

  const ap = lock('repair', 'chrome-measure', '--by', 'lead', '--reason', 'I-011 stale short', '--apply');
  assert.equal(ap.code, 0, ap.out);
  assert.match(ap.stdout, /^REPAIRED chrome-measure: 1 change\(s\) by "lead", logged to .*audit\.log/);
  assert.equal(JSON.parse(readFileSync(lf('chrome-measure.last-grant.json'), 'utf8')).owner, 'ab');
  const audit = readFileSync(lf('audit.log'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert.equal(audit.length, 1);
  assert.equal(audit[0].by, 'lead');
  assert.equal(audit[0].reason, 'I-011 stale short');
  assert.equal(lock('doctor').code, 0);
  assert.match(lock('repair', 'chrome-measure', '--by', 'lead', '--reason', 'x', '--apply').stdout, /REPAIRED chrome-measure: 0 change\(s\)/);
});

test('repair --force-holder prints the holder; refuses the live iphone lease; removes another live holder', () => {
  assert.equal(lock('acquire', 'iphone', '--owner', 'phone-topic').code, 0);
  const before = bytes();
  const r = lock('repair', 'iphone', '--by', 'lead', '--reason', 'x', '--apply', '--force-holder');
  assert.equal(r.code, 1, r.out);
  assert.match(r.stdout, /^holder: \{.*"owner":"phone-topic"/);
  assert.match(r.stderr, /refusing to touch the iphone lease of a live holder/);
  assert.deepEqual(bytes(), before);
  const plain = lock('repair', 'iphone', '--by', 'lead', '--reason', 'x', '--apply');
  assert.equal(plain.code, 0);
  assert.equal(existsSync(lf('iphone.json')), true, 'without --force-holder a live holder is not a problem to fix');

  assert.equal(lock('acquire', 'chrome-measure', '--owner', 'hung').code, 0);
  const f = lock('repair', 'chrome-measure', '--by', 'lead', '--reason', 'hung A/B', '--apply', '--force-holder');
  assert.equal(f.code, 0, f.out);
  assert.match(f.stdout, /^holder: \{.*"owner":"hung"/);
  assert.match(f.stdout, /\[holder-live-forced\]/);
  assert.equal(existsSync(lf('chrome-measure.json')), false);
  assert.match(lock('status', 'chrome-measure').stdout, /free/);
});
