// I-269: tools/release/rules.mjs, the public release's scrub rules (memory/public-release.md). Made-up values only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, chmodSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
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
    // allowBinary (pre-push review): a binary is exempted only pinned to its bytes
    [{ allowBinary: {} }, /allowBinary must be an array/],
    [{ allowBinary: [{ path: 'x.bin', reason: 'r' }] }, /allowBinary\[0\] needs a path, a sha256 or blob id and a reason/],
    [{ allowBinary: [{ path: 'x.bin', sha256: 'abc', reason: 'r' }] }, /allowBinary\[0\] needs/],
    [{ allowBinary: [{ path: 'x.bin', blob: 'a'.repeat(40) }] }, /allowBinary\[0\] needs/],
    // fail-closed (review of 10cd1810): an empty file, or one with neither a <user> literal nor a LAN prefix
    [{}, /no literals/],
    [{ literals: [], lanPrefixes: ['10.1.2'] }, /no literals/],
    [{ literals: [{ value: 'abcdx', token: '<x>' }] }, /neither a "<user>" literal nor a LAN prefix/],
  ]) {
    let msg = '';
    try { R.loadKnown(knownFile(k)); } catch (e) { msg = e.message; }
    assert.match(msg, re);
    for (const l of k.literals || []) assert.ok(!msg.includes(l.value), 'an error never prints a value');
  }
});

test('I-269 buildRules: literals longest first, the generic /Users/<home> and LAN rules, none can match bare hex', () => {
  const rs = rules();
  assert.deepEqual(rs.map((r) => r.kind), ['literal', 'literal', 'literal', 'literal', 'regex', 'regex', 'regex', 'regex', 'regex', 'regex', 'regex']);
  assert.deepEqual(rs.slice(4).map((r) => r.id), ['users-home', 'lan0', 'lan0-dash', 'lan0-pct', 'link-artifact', 'link-claude', 'link-medium-draft']);
  assert.deepEqual(rs.slice(0, 4).map((r) => r.match.length), [22, 15, 12, 6]);
  for (const r of rs) {
    assert.match(r.id, /^[a-z0-9-]+$/);
    for (const l of KNOWN.literals) assert.ok(!r.id.includes(l.value), 'ids carry no value');
    assert.ok(!r.id.includes('10-77') && !r.id.includes('77'), 'a LAN rule id names no octet');
  }
  const users = rs.find((r) => r.id === 'users-home');
  assert.equal(users.token, '/Users/<user>');
  assert.equal(rs.filter((r) => r.id.startsWith('lan')).length, 3, '192.168.0 is the replacement net itself: no rule');
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
  // the same LAN address as a host name and URL-encoded
  assert.equal(R.scrubText('http://10-77-3-42.nip.io/ and http%3A%2F%2F10%2E77%2e3%2E9%3A5200 not 110-77-3-4\n', rs).text,
    'http://192-168-0-42.nip.io/ and http%3A%2F%2F192%2E168%2E0%2E9%3A5200 not 110-77-3-4\n');
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
  assert.equal(lines.length, 11);
  assert.equal(lines[0], 'literal:zq.person@mail.invalid==><email>');
  assert.ok(lines.every((l) => /^(literal|regex):/.test(l) && l.split('==>').length === 2));
  assert.match(lines[5], /^regex:\\b10\\\.77\\\.3\\\.\(\\d\{1,3\}\)\\b==>192\.168\.0\.\\1$/);
  assert.equal(R.globToRegExp('tests/**').test('tests/a/b.mjs'), true);
  assert.equal(R.globToRegExp('tests/*.mjs').test('tests/a/b.mjs'), false);
  assert.equal(R.globToRegExp('tests/').test('tests/a/b.mjs'), true);
});

// samples are built at run time, so this file holds no secret shape itself (the release's check scans it too)
const fake = (...parts) => parts.join('');
const X = (n, c = 'Q7') => c.repeat(Math.ceil(n / c.length)).slice(0, n);

test('I-269 secret shapes: each kind found as secret-<kind> with its line, near misses and bare hex not; allow kept', () => {
  const rs = R.withSecrets(rules());
  assert.equal(rs.allow.length, 2, 'the known allow list rides along');
  R.assertNoHexRule(rs);
  const samples = {
    'secret-github': [fake('gh', 'p_', X(36)), fake('gh', 'o_', X(36)), fake('github', '_pat_', X(40, 'a_1'))],
    'secret-sk': [fake('s', 'k-', X(32)), fake('s', 'k-ant-', X(30, 'a-1'))],
    'secret-aws': [fake('AK', 'IA', X(16, 'Z9')), fake('AS', 'IA', X(16, 'Z9'))],
    'secret-bearer': [fake('Authorization: Bea', 'rer ', X(24, 'a.B-'))],
    'secret-pem': [fake('-----BEGIN ', 'PRIVATE KEY-----'), fake('-----BEGIN RSA ', 'PRIVATE KEY-----'), fake('-----BEGIN OPENSSH ', 'PRIVATE KEY-----')],
    'secret-kv': [fake('api_ke', 'y=', X(24, 'aZ+/'), '=='), fake('TOK', 'EN=', X(30)), fake('client_sec', 'ret=', X(40)), fake('api_key', ': ', X(30)), fake('{"tok', 'en": "', X(28), '"}'), fake("SECRET", "='", X(26), "'"),
      fake('api_ke', 'y=', X(32, 'aB3x')), fake('apiK', 'ey: ', X(32, 'aB3x')), fake('x-tok', 'en=', X(30))],
  };
  for (const [id, list] of Object.entries(samples)) {
    for (const s of list) assert.deepEqual(R.scanText(`ok\nx ${s} y\n`, rs), [{ id, line: 2 }], `${id} finds its sample`);
  }
  const near = [fake('gh', 'p_', X(10)), fake('s', 'k-', X(12)), fake('desk-', X(30)), fake('AK', 'IA', X(10, 'Z9')), 'Bearer of bad news',
    '-----BEGIN PUBLIC KEY-----', '-----BEGIN CERTIFICATE-----', fake('ke', 'y=', X(20)), 'token=short', 'see 0123456789abcdef0123456789abcdef01234567',
    // inside a word, or a pure-hex value (a cited commit SHA) is no secret (review of 72930aa2)
    fake('"monk', 'ey": "', X(24, 'aB3'), '"'), fake('cache ke', 'y: ', '0123456789abcdef0123456789abcdef01234567'),
    fake('"tok', 'en": "', 'ABCDEF0123456789abcdef0123456789', '"'), fake('donkey', '=', X(30))];
  assert.deepEqual(R.scanText(near.join('\n'), rs), [], 'near misses and SHAs are not secrets');
  // secrets are found, not replaced: buildRules (the rewrite's rules) carries none of them
  assert.ok(!rules().some((r) => r.id.startsWith('secret-')));
  // an allow entry (path glob + full-match pattern) skips a known-safe fixture, only there
  const known = { ...KNOWN, allow: [...KNOWN.allow, { path: 'tests/fixtures/**', pattern: fake('gh', 'p_', '(?:Q7)+') }] };
  const ra = R.withSecrets(R.buildRules(known, { home: HOME }));
  const tok = fake('gh', 'p_', X(36));
  assert.deepEqual(R.scanText(tok, ra, { path: 'tests/fixtures/a.mjs' }), []);
  assert.deepEqual(R.scanText(tok, ra, { path: 'tools/a.mjs' }), [{ id: 'secret-github', line: 1 }]);
});

test('I-269 link rules: claude.ai artifact and Medium draft links to placeholders; published Medium posts and bare hex stay', () => {
  const rs = rules();
  const text = [
    // samples built at run time: this file holds no private-link shape itself (the release scrubs it too)
    `see https://claude.ai/artifact/${fake('0a1b2c3d-4e5f-6789', '-abcd-ef0123456789')} and http://claude.ai/code/artifact/${fake('Ab_9-xY8z', 'W7vU6tS5rQ')}`,
    `draft https://medium.com/p/${fake('1a2b3c', '4d5e6f')}/edit, also medium.com/p/${fake('abcdef', '012345')}.`,
    'post https://medium.com/@someone/how-we-made-it-smooth-1a2b3c4d5e6f stays',
    'sha 1a2b3c4d5e6f 0123456789abcdef0123456789abcdef01234567 stays',
  ].join('\n');
  const { text: out, hits } = R.scrubText(text, rs);
  assert.equal(out, [
    'see https://claude.ai/artifact/<private-artifact> and https://claude.ai/artifact/<private-artifact>',
    'draft https://medium.com/p/<draft>, also medium.com/p/<draft>.',
    'post https://medium.com/@someone/how-we-made-it-smooth-1a2b3c4d5e6f stays',
    'sha 1a2b3c4d5e6f 0123456789abcdef0123456789abcdef01234567 stays',
  ].join('\n'));
  assert.deepEqual(Object.fromEntries(hits.map((h) => [h.id, h.count])), { 'link-artifact': 2, 'link-medium-draft': 2 });
  assert.deepEqual(R.scanText(text, rs).map((h) => h.id + ':' + h.line), ['link-artifact:1', 'link-medium-draft:2']);
  assert.deepEqual(R.scanText(out, rs), [], 'the placeholders do not match again');
  assert.equal(R.scrubText(out, rs).text, out, 'idempotent');
  // made-up ids the repo's own tests use stay, so the released tests pass: short ones and the RFC 4122 example UUID
  const fixtures = 'https://claude.ai/artifact/abcdef12 https://claude.ai/code/artifact/AbC_de-12345 '
    + 'https://claude.ai/code/artifact/123E4567-E89B-12D3-A456-426614174000 https://claude.ai/artifact/123e4567-e89b-12d3-a456-42661417400';
  assert.equal(R.scrubText(fixtures, rs).text, fixtures);
  // the same regexes in Python's bytes re (filter-repo): checked end to end in tests/e2e/release-rewrite.test.mjs
});

test('I-270 link-artifact: a claude.ai artifact link without a scheme is scrubbed too, to the https token; not inside a longer host', () => {
  const rs = rules();
  const id = fake('Ab1Cd2Ef3', 'Gh4Ij5Kl6Mn7');
  const text = `plan claude.ai/artifact/${id}, (claude.ai/code/artifact/${id})\n"claude.ai/artifact/${id}" and <claude.ai/artifact/${id}>\n`
    + `kept: myclaude.ai/artifact/${id} x.claude.ai/artifact/${id} claude.ai/artifact/123e4567-e89b-12d3-a456-426614174000\n`;
  const T = 'https://claude.ai/artifact/<private-artifact>';
  const { text: out, hits } = R.scrubText(text, rs);
  assert.equal(out, `plan ${T}, (${T})\n"${T}" and <${T}>\n`
    + `kept: myclaude.ai/artifact/${id} x.claude.ai/artifact/${id} claude.ai/artifact/123e4567-e89b-12d3-a456-426614174000\n`);
  assert.deepEqual(hits, [{ id: 'link-artifact', count: 4 }]);
  assert.deepEqual(R.scanText(text, rs).map((h) => `${h.id}:${h.line}`), ['link-artifact:1', 'link-artifact:2']);
  assert.equal(R.scrubText(out, rs).text, out, 'idempotent');
  assert.equal(R.scrubText(`see https://claude.ai/artifact/${id}`, rs).text, `see ${T}`, 'with a scheme as before');
});

test('I-270 claude.ai links: www. and any letter case in the host; chat, project and share links get their own token; test ids stay', () => {
  const rs = rules();
  const id = fake('Ab1Cd2Ef3', 'Gh4Ij5Kl6Mn7'), uuid = fake('0a1b2c3d-4e5f-6789', '-abcd-ef0123456789');
  const A = 'https://claude.ai/artifact/<private-artifact>', L = 'https://claude.ai/<private-link>';
  const text = `www.claude.ai/artifact/${id} https://WWW.Claude.AI/code/artifact/${id} CLAUDE.AI/artifact/${id}\n`
    + `chat https://claude.ai/chat/${uuid} project claude.ai/project/${uuid} share www.claude.ai/share/${id}\n`
    + `kept: x.www.claude.ai/chat/${uuid} myclaude.ai/share/${id} claude.ai/chat/123e4567-e89b-12d3-a456-426614174000 claude.ai/chat/short1 claude.ai/new\n`;
  const { text: out, hits } = R.scrubText(text, rs);
  assert.equal(out, `${A} ${A} ${A}\nchat ${L} project ${L} share ${L}\n`
    + `kept: x.www.claude.ai/chat/${uuid} myclaude.ai/share/${id} claude.ai/chat/123e4567-e89b-12d3-a456-426614174000 claude.ai/chat/short1 claude.ai/new\n`);
  assert.deepEqual(hits, [{ id: 'link-artifact', count: 3 }, { id: 'link-claude', count: 3 }]);
  assert.deepEqual(R.scanText(text, rs).map((h) => `${h.id}:${h.line}`), ['link-artifact:1', 'link-claude:2']);
  assert.equal(R.scrubText(out, rs).text, out, 'idempotent');
});

test('I-270 the regex rules in Python\'s bytes re (filter-repo --replace-text) replace exactly what the JS rules do', (t) => {
  const rs = rules();
  const id = fake('Ab1Cd2Ef3', 'Gh4Ij5Kl6Mn7');
  const text = `plan claude.ai/artifact/${id} and https://claude.ai/code/artifact/${id}; myclaude.ai/artifact/${id} x.claude.ai/artifact/${id}\n`
    + `WWW.Claude.AI/artifact/${id} claude.ai/chat/${id} www.claude.ai/share/${id} x.www.claude.ai/project/${id} claude.ai/chat/123e4567-e89b-12d3-a456-426614174000\n`
    + `claude.ai/artifact/123e4567-e89b-12d3-a456-426614174000 draft medium.com/p/${fake('1a2b3c', '4d5e6f')}/edit\n`
    + 'at /Users/zzother/x and 10.77.3.42, 10-77-3-9, 10%2E77%2E3%2E8\n';
  const expr = R.filterRepoExpressions(rs).trimEnd().split('\n').filter((l) => l.startsWith('regex:')).map((l) => l.slice(6).split('==>'));
  // filter-repo: re.compile(regex bytes), then sub(replacement bytes) in the file's order
  const py = spawnSync('python3', ['-I', '-c', 'import json,re,sys\nd=json.load(sys.stdin)\nb=d["text"].encode()\n'
    + 'for m, r in d["expr"]:\n  b=re.compile(m.encode()).sub(r.encode(), b)\nsys.stdout.write(b.decode())'],
  { input: JSON.stringify({ text, expr }), encoding: 'utf8' });
  if (py.error) return t.skip('no python3');
  assert.equal(py.status, 0, py.stderr);
  const js = rs.filter((r) => r.kind === 'regex').reduce((s, r) => s.replace(new RegExp(r.match, 'g'), r.token), text);
  assert.equal(py.stdout, js);
  assert.match(py.stdout, /^plan https:\/\/claude\.ai\/artifact\/<private-artifact> and https:\/\/claude\.ai\/artifact\/<private-artifact>; myclaude/);
  assert.match(py.stdout, /\nhttps:\/\/claude\.ai\/artifact\/<private-artifact> https:\/\/claude\.ai\/<private-link> https:\/\/claude\.ai\/<private-link> x\.www\.claude\.ai\/project\/\S+ claude\.ai\/chat\/123e4567-/);
});

test('I-269 scrubAll: literals in any letter case (text and bytes), then the regexes; redactSecrets: markers no shape matches', () => {
  const rs = rules();
  const { text, hits } = R.scrubAll('ZQHOME and ZqHome at /Users/zqhome/x, ZED\'S IPHONE 99, 10.77.3.4\n', rs);
  assert.equal(text, '<user> and <user> at /Users/<user>/x, <device-name>, 192.168.0.4\n');
  assert.deepEqual(Object.fromEntries(hits.map((h) => [h.id, h.count])), { 'lit0-user': 3, 'lit1-device-name': 1, lan0: 1 });
  assert.deepEqual(R.scanText(text, rs), []);
  const b = R.scrubAll(Buffer.from('\0ZQHOME é'), rs, { literalsOnly: true });
  assert.ok(Buffer.isBuffer(b.text));
  assert.equal(b.text.toString('utf8'), '\0<user> é');
  const tok = fake('gh', 'p_', X(36)), pem = fake('-----BEGIN ', 'PRIVATE KEY-----');
  const rsa = (k) => fake('-----', k, ' RSA ', 'PRIVATE KEY-----');
  const kv = fake('api_tok', 'en=', X(30));
  const red = R.redactSecrets(`a ${tok} b\n${pem}\nMIIEbody\nmore\n${fake('-----END ', 'PRIVATE KEY-----')}\nafter ${kv}\n${rsa('BEGIN')}\nbody\n${rsa('END')}\n${pem}\nno end`);
  assert.equal(red.text, 'a [secret omitted: secret-github] b\n[secret omitted: secret-pem]\nafter api_token=[secret omitted: secret-kv]\n'
    + '[secret omitted: secret-pem]\n[secret omitted: secret-pem]', 'a PEM block goes whole (to its END line or the end), a key keeps its name');
  assert.deepEqual(red.hits, [{ id: 'secret-github', count: 1 }, { id: 'secret-pem', count: 3 }, { id: 'secret-kv', count: 1 }]);
  assert.deepEqual(R.scanText(red.text, R.withSecrets(rs)), [], 'the markers match no shape');
  const sha = '0123456789abcdef0123456789abcdef01234567', camel = fake('apiK', 'ey: "', X(32, 'aB3x'), '"');
  assert.equal(R.redactSecrets(`cache key: ${sha}\n${camel}`).text, `cache key: ${sha}\napiKey: "[secret omitted: secret-kv]"`,
    'a cited commit SHA stays, a camelCase key is redacted');
});

test('I-269 secret shapes: Python 3 compiles them and matches as JS does (scoped (?i:), lookbehind)', (t) => {
  const kv = R.SECRET_SHAPES.find((s) => s.id === 'secret-kv').match;
  const cases = [fake('"monk', 'ey": "', X(24, 'aB3'), '"'), fake('cache ke', 'y: ', '0123456789abcdef0123456789abcdef01234567'),
    fake('"tok', 'en": "', 'ABCDEF0123456789abcdef0123456789', '"'), fake('api_ke', 'y=', X(32, 'aB3x')),
    fake('apiK', 'ey: "', X(32, 'aB3x'), '"'), fake('x-tok', 'en=', X(30)), fake('donkey', '=', X(30))];
  const js = cases.map((c) => new RegExp(kv).test(c));
  assert.deepEqual(js, [false, false, false, true, true, true, false]);
  const py = spawnSync('python3', ['-I', '-c', 'import json,re,sys\nd=json.load(sys.stdin)\n'
    + 'print(json.dumps([[bool(re.search(m, c)) for c in d["cases"]] for m in d["shapes"]]))'],
  { input: JSON.stringify({ shapes: R.SECRET_SHAPES.map((s) => s.match), cases }), encoding: 'utf8' });
  if (py.error) return t.skip('no python3');
  assert.equal(py.status, 0, py.stderr);
  assert.deepEqual(JSON.parse(py.stdout), R.SECRET_SHAPES.map((s) => cases.map((c) => new RegExp(s.match).test(c))));
});

test('pre-push review: allowBinary entries are validated and kept on the rules (path glob + sha256 or blob id)', () => {
  const ab = [{ path: 'fixtures/*.bin', sha256: 'b'.repeat(64), reason: 'test binary' }, { path: 'x.bin', blob: 'c'.repeat(40), reason: 'r' }];
  const k = R.loadKnown(knownFile({ ...KNOWN, allowBinary: ab }));
  assert.deepEqual(k.allowBinary, ab);
  const rs = R.buildRules(k, { home: HOME });
  assert.equal(rs.allowBinary.length, 2);
  assert.ok(rs.allowBinary[0].path.test('fixtures/a.bin') && !rs.allowBinary[0].path.test('fixtures/x/a.bin'));
  assert.equal(rs.allowBinary[0].sha256, 'b'.repeat(64));
  assert.equal(R.withSecrets(rs).allowBinary, rs.allowBinary, 'withSecrets keeps them');
  assert.deepEqual(R.buildRules(KNOWN, { home: HOME }).allowBinary, []);
});
