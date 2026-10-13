// I-269: tools/release/rules.mjs, the public release's scrub rules (memory/public-release.md). Made-up values only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, chmodSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tempDir } from '../helpers.mjs';

const R = await import('../../tools/release/rules.mjs');

const KNOWN = {
  literals: [
    { value: 'zqhome', token: '<user>' },
    { value: "Zed's iPhone 99", token: '<device-name>' },
    { value: 'zq.person@mail.invalid', token: '<email>' },
    { value: 'zq-tunnel-77', token: '<subdomain>' },
  ],
  lanPrefixes: ['10.77.3', '192.168.0'],
  allow: [{ path: 'tests/fixtures/**', pattern: '192\\.168\\.0\\.\\d+' }, { path: 'docs/lan.md', pattern: '10\\.77\\.3\\.250' }],
};
const HOME = '/Users/zzother';
const rules = () => R.buildRules(KNOWN, { home: HOME });

function knownFile(obj, mode = 0o600) {
  const d = tempDir('fw-known-');
  const f = join(d, 'known.json');
  writeFileSync(f, typeof obj === 'string' ? obj : JSON.stringify(obj));
  chmodSync(f, mode);
  return f;
}

test('I-269 loadKnown: reads a private file outside any repo; refuses others-readable, in-repo, bad JSON, without printing values', () => {
  assert.deepEqual(R.loadKnown(knownFile(KNOWN)).literals.length, 4);
  assert.throws(() => R.loadKnown(knownFile(KNOWN, 0o644)), /readable by others \(mode 644\)/);
  const d = tempDir('fw-known-repo-');
  mkdirSync(join(d, '.git'));
  const f = join(d, 'known.json');
  writeFileSync(f, JSON.stringify(KNOWN), { mode: 0o600 });
  assert.throws(() => R.loadKnown(f), /inside a git repo/);
  assert.throws(() => R.loadKnown(knownFile('{"literals": [')), /not valid JSON/);
  assert.throws(() => R.loadKnown(join(d, 'missing.json')), /not found/);
  for (const [k, re] of [
    [{ literals: [{ value: 'abc', token: '<x>' }] }, /literals\[0\] is shorter than 4/],
    [{ literals: [{ value: 'deadbeef12', token: '<x>' }] }, /literals\[0\] is bare hex/],
    [{ literals: [{ value: 'a\nbcde', token: '<x>' }] }, /line break/],
    [{ literals: [{ value: 'zqhome', token: 'see zqhome' }] }, /token that contains literals\[0\]/],
    [{ literals: [{ value: 'zqhome', token: '<a>' }, { value: 'zqhome', token: '<b>' }] }, /repeats literals\[0\]/],
    [{ lanPrefixes: ['10.300.1'] }, /lanPrefixes\[0\]/],
    [{ allow: [{ path: 'x', pattern: '(' }] }, /allow\[0\] pattern/],
  ]) {
    let msg = '';
    try { R.loadKnown(knownFile(k)); } catch (e) { msg = e.message; }
    assert.match(msg, re);
    for (const l of k.literals || []) assert.ok(!msg.includes(l.value), 'an error never prints a value');
  }
});

test('I-269 buildRules: literals longest first, the generic /Users/<home> and LAN rules, none can match bare hex', () => {
  const rs = rules();
  assert.deepEqual(rs.map((r) => r.kind), ['literal', 'literal', 'literal', 'literal', 'regex', 'regex']);
  assert.deepEqual(rs.slice(0, 4).map((r) => r.match.length), [22, 15, 12, 6]);
  for (const r of rs) {
    assert.match(r.id, /^[a-z0-9-]+$/);
    for (const l of KNOWN.literals) assert.ok(!r.id.includes(l.value), 'ids carry no value');
    assert.ok(!r.id.includes('10-77') && !r.id.includes('77'), 'a LAN rule id names no octet');
  }
  const users = rs.find((r) => r.id === 'users-home');
  assert.equal(users.token, '/Users/<user>');
  assert.equal(rs.filter((r) => r.id.startsWith('lan')).length, 1, '192.168.0 is the replacement net itself: no rule');
  // the trial's hazard: a rule that eats commit SHAs
  assert.throws(() => R.assertNoHexRule([{ kind: 'regex', match: '[0-9a-f]{8}', id: 'bad' }]), /can match bare hex/);
  assert.throws(() => R.assertNoHexRule([{ kind: 'literal', match: 'cafe1234', id: 'bad' }]), /bare hex/);
  const hex = '0123456789abcdef0123456789abcdef01234567 1234567 deadbee abcdefa';
  assert.deepEqual(R.scrubText(hex, rs), { text: hex, hits: [] });
  assert.deepEqual(R.scanText(hex, rs), []);
});

test('I-269 scrubText: values to tokens, home paths, LAN /24 -> 192.168.0.N keeping the last octet; counts per rule', () => {
  const rs = rules();
  const text = "cd /Users/zqhome/src && ssh zq.person@mail.invalid\nZed's iPhone 99 at 10.77.3.42 and 10.77.3.7, not 110.77.3.4\n/Users/zzother/x /Users/zzotherx /Users/Shared\nzq-tunnel-77.workers.dev\n";
  const { text: out, hits } = R.scrubText(text, rs);
  assert.equal(out, 'cd /Users/<user>/src && ssh <email>\n<device-name> at 192.168.0.42 and 192.168.0.7, not 110.77.3.4\n/Users/<user>/x /Users/zzotherx /Users/Shared\n<subdomain>.workers.dev\n');
  const by = Object.fromEntries(hits.map((h) => [h.id, h.count]));
  assert.equal(by['lit0-user'], 1);
  assert.equal(by['users-home'], 1);
  assert.equal(by.lan0, 2);
  assert.deepEqual(R.scanText(out, rs), []);
  // bytes: the same, on a Buffer (utf8 values inside latin1 views), and literal-only for binaries
  const bin = Buffer.concat([Buffer.from([0, 1, 2]), Buffer.from("Zed's iPhone 99 é 10.77.3.1", 'utf8')]);
  const b = R.scrubText(bin, rs, { literalsOnly: true });
  assert.ok(Buffer.isBuffer(b.text));
  assert.equal(b.text.subarray(3).toString('utf8'), '<device-name> é 10.77.3.1');
});

test('I-269 scanText: rule ids and 1-based lines, never values; literals in any letter case; allow skips by path and pattern', () => {
  const rs = rules();
  const text = 'ok\nZQHOME was here\nat 10.77.3.250\nand 10.77.3.9\n';
  assert.deepEqual(R.scanText(text, rs, { path: 'a.md' }), [{ id: 'lit0-user', line: 2 }, { id: 'lan0', line: 3 }, { id: 'lan0', line: 4 }]);
  assert.deepEqual(R.scanText(text, rs, { path: 'docs/lan.md' }), [{ id: 'lit0-user', line: 2 }, { id: 'lan0', line: 4 }], 'only the allowed address is skipped');
  assert.deepEqual(R.scanText(Buffer.from('\0bin 10.77.3.9 zqHome'), rs, { literalsOnly: true }), [{ id: 'lit0-user', line: 1 }]);
  for (const h of R.scanText(text, rs)) assert.deepEqual(Object.keys(h).sort(), ['id', 'line']);
  assert.equal(R.safeText('/Users/ZqHome/x 10.77.3.9', rs), '/Users/<user>/x 192.168.0.9');
  assert.equal(R.tildify('/Users/zq/a', '/Users/zq'), '~/a');
});

test('I-269 filterRepoExpressions: literal and regex lines for filter-repo (Python \\1 groups)', () => {
  const lines = R.filterRepoExpressions(rules()).trimEnd().split('\n');
  assert.equal(lines.length, 6);
  assert.equal(lines[0], 'literal:zq.person@mail.invalid==><email>');
  assert.ok(lines.every((l) => /^(literal|regex):/.test(l) && l.split('==>').length === 2));
  assert.match(lines.at(-1), /^regex:\\b10\\\.77\\\.3\\\.\(\\d\{1,3\}\)\\b==>192\.168\.0\.\\1$/);
  assert.equal(R.globToRegExp('tests/**').test('tests/a/b.mjs'), true);
  assert.equal(R.globToRegExp('tests/*.mjs').test('tests/a/b.mjs'), false);
  assert.equal(R.globToRegExp('tests/').test('tests/a/b.mjs'), true);
});
