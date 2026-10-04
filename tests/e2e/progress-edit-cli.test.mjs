// `console.mjs progress set|best` end to end (ts-threads, the lead after the T-104 team measurement): edits of a temp
// PROGRESS.json in the compact hand layout. Checked before writing (an invalid result is refused, the file stays
// byte-identical), a one-line diff for a one-value edit, updatedAt/updatedBy stamped, --dry-run writes nothing,
// `best` moves the flag and the build block together (the T-103 rule). No server, port, lock or real file.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tempDir, node, tool } from '../helpers.mjs';

const CON = tool('console.mjs');
const res = '[{"what": "frames over 50 ms", "before": "4", "after": "1", "tag": "OBSERVED", "driver": "scripted scroll"}]';
const FILE = `{
 "schema": "fw-progress/1",
 "updatedAt": "2026-10-04T10:00:00Z",
 "updatedBy": "mgmt-ops-10",
 "goal": "Smooth.",
 "complaints": [
  { "area": "hero", "text": "laggy" }
 ],
 "changes": [
  { "at": "2026-10-04T09:00:00Z", "text": "one" }
 ],
 "items": [
  {
   "id": "cdwc",
   "title": "Countdown fix",
   "area": "end",
   "state": "landed",
   "stage": "L",
   "inBuild": true
  },
  {
   "id": "morph",
   "title": "Morph on the GPU",
   "area": "end",
   "state": "testing",
   "stage": "V",
   "next": "P-092",
   "owner": "fix-morph-gpu",
   "inBuild": false
  }
 ],
 "upcoming": [],
 "versions": [
  {"id": "v0", "name": "Original page", "since": "2026-10-01T00:00:00Z", "improvement": "The page.", "tryIt": {"none": "x"}},
  {"id": "v1", "best": true, "name": "Stack 6", "since": "2026-10-02T08:00:00Z", "improvement": "Countdown.", "fixes": ["cdwc"], "result": ${res}, "cost": "none", "tryIt": {"none": "x"}},
  {"id": "v2", "landed": false, "name": "GPU preview", "since": "2026-10-03T08:00:00Z", "improvement": "GPU.", "fixes": ["morph"], "result": ${res}, "cost": "none", "tryIt": {"none": "x"}}
 ],
 "build": {
  "name": "Stack 6",
  "since": "2026-10-02T08:00:00Z",
  "summary": "The countdown fix.",
  "fixes": ["cdwc"],
  "combined": [
  ]
 }
}
`;
function setup() {
  const dir = tempDir('fw-progress-edit-');
  const f = join(dir, 'PROGRESS.json');
  writeFileSync(f, FILE);
  return { dir, f, env: { FW_PROGRESS_FILE: f, FW_AGENT: '', FW_STATE_DIR: dir } };
}
const changed = (a, b) => { const x = a.split('\n'), y = b.split('\n'); return y.filter((l, i) => l !== x[i]); };

test('the fixture passes --check', () => {
  const { env } = setup();
  const r = node(CON, ['progress', '--check'], { env });
  assert.equal(r.code, 0, r.out);
});

test('progress set: one value -> that line (and the stamp) change, every other byte stays; --check passes after', () => {
  const { f, env } = setup();
  const r = node(CON, ['progress', 'set', 'items[id=morph].next', 'P-093 then land', '--by', 'mgmt-ops-10'], { env });
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /^PROGRESS SET .*PROGRESS\.json: valid \(--check OK\), written\n {2}items\[id=morph\]\.next: "P-092" -> "P-093 then land"\n/);
  const after = readFileSync(f, 'utf8');
  const lines = changed(FILE, after);
  assert.equal(lines.length, 2, lines.join('\n'));
  assert.match(lines[0], /^ "updatedAt": "\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ",$/);
  assert.equal(lines[1], '   "next": "P-093 then land",');
  assert.equal(after.split('\n').length, FILE.split('\n').length);
  assert.equal(node(CON, ['progress', '--check'], { env }).code, 0);
});

test('progress set: several pairs, JSON values, a new first change row, --string, --delete, --file (and - for stdin)', () => {
  const { dir, f, env } = setup();
  let r = node(CON, ['progress', 'set', 'changes[^]', '{"at": "2026-10-04T11:00:00Z", "text": "two"}', 'build.fixes', '["cdwc"]', 'goal', 'Smooth, always.', '--by', 'ops'], { env });
  assert.equal(r.code, 0, r.out);
  let p = JSON.parse(readFileSync(f, 'utf8'));
  assert.deepEqual(p.changes.map((c) => c.text), ['two', 'one']);
  assert.equal(p.goal, 'Smooth, always.');
  assert.equal(p.updatedBy, 'ops');
  assert.match(readFileSync(f, 'utf8'), /"changes": \[\n {2}\{ "at": "2026-10-04T11:00:00Z", "text": "two" \},\n {2}\{ "at": "2026-10-04T09:00:00Z"/, 'the row in the layout of its neighbours');
  r = node(CON, ['progress', 'set', 'items[0].title', '42', '--string', '--by', 'ops'], { env });
  assert.equal(r.code, 0, r.out);
  assert.equal(JSON.parse(readFileSync(f, 'utf8')).items[0].title, '42');
  r = node(CON, ['progress', 'set', '--delete', 'build.summary', '--by', 'ops'], { env });
  assert.equal(r.code, 0, r.out);
  assert.equal(JSON.parse(readFileSync(f, 'utf8')).build.summary, undefined);
  // a new first change row and the oldest one out, in one checked call (the list keeps at most 30)
  r = node(CON, ['progress', 'set', 'changes[^]', '{"at": "2026-10-04T11:30:00Z", "text": "three"}', '--delete', 'changes[2]', '--delete=items[0].inBuild', '--by', 'ops'], { env });
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /changes\[\^\]: added [^\n]*\n {2}changes\[2\]: deleted \(was \{"at":"2026-10-04T09:00:00Z","text":"one"\}\)\n {2}items\[0\]\.inBuild: deleted \(was true\)/);
  p = JSON.parse(readFileSync(f, 'utf8'));
  assert.deepEqual(p.changes.map((c) => c.text), ['three', 'two']);
  assert.equal(p.items[0].inBuild, undefined);
  const vf = join(dir, 'row.json');
  writeFileSync(vf, '{ "title": "Morph check", "when": "after P-093", "item": "morph" }\n');
  r = node(CON, ['progress', 'set', 'upcoming[+]', '--file', vf, '--by', 'ops'], { env });
  assert.equal(r.code, 0, r.out);
  p = JSON.parse(readFileSync(f, 'utf8'));
  assert.deepEqual(p.upcoming, [{ title: 'Morph check', when: 'after P-093', item: 'morph' }]);
  r = node(CON, ['progress', 'set', 'goal', '--file', '-', '--by', 'ops'], { env, input: 'Plain words from stdin.\n' });
  assert.equal(r.code, 0, r.out);
  assert.equal(JSON.parse(readFileSync(f, 'utf8')).goal, 'Plain words from stdin.');
});

test('progress set: a result that fails --check is refused, nothing written; old problems are marked; bad paths and usage say why', () => {
  const { f, env } = setup();
  let r = node(CON, ['progress', 'set', 'build.since', '2026-10-01T09:00:00Z', '--by', 'ops'], { env });
  assert.equal(r.code, 1, r.out);
  assert.match(r.stdout, /^PROGRESS REFUSED .*PROGRESS\.json: the result would not pass --check; nothing written/);
  assert.match(r.stdout, /build\.since: 2026-10-01T09:00:00Z, but the version with "best": true \(versions\[1\], "v1"\) is since 2026-10-02T08:00:00Z/);
  assert.equal(readFileSync(f, 'utf8'), FILE, 'byte-identical');
  // a file that is already invalid: the problems it had are marked, so the editor sees what is new
  writeFileSync(f, FILE.replace('"state": "landed"', '"state": "nope"'));
  r = node(CON, ['progress', 'set', 'goal', 'x', '--by', 'ops'], { env });
  assert.equal(r.code, 1, r.out);
  assert.match(r.stdout, /items\[0\]\.state: must be one of [^\n]*\(already in the file before this change\)/);
  writeFileSync(f, FILE);
  for (const [args, re] of [
    [['progress', 'set', 'nope.x', '1', '--by', 'ops'], /nope: no such key/],
    [['progress', 'set', 'goal', '--by', 'ops'], /usage: .*progress set <json-path> <value>/],
    [['progress', 'set', '--by', 'ops'], /usage: .*nothing to set/],
    [['progress', 'set', '--delete', '--by', 'ops'], /usage: /],
    [['progress', 'set', 'goal', 'x'], /--by <agent>/],
    [['progress', 'set', 'a', '--file', '/nonexistent/x.json', '--by', 'ops'], /ENOENT|no such file/],
    [['progress', 'frob'], /unknown progress command "frob"/],
  ]) {
    r = node(CON, args, { env });
    assert.equal(r.code, 1, `${args.join(' ')}: ${r.out}`);
    assert.match(r.out, re, args.join(' '));
  }
  assert.equal(readFileSync(f, 'utf8'), FILE);
});

test('progress set --dry-run and best --dry-run: checked and shown, nothing written', () => {
  const { f, env } = setup();
  let r = node(CON, ['progress', 'set', 'goal', 'x', '--by', 'ops', '--dry-run'], { env });
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /^PROGRESS DRY-RUN .*: valid \(--check OK\), nothing written\n {2}goal: "Smooth\." -> "x"/);
  r = node(CON, ['progress', 'best', 'v0', '--by', 'ops', '--dry-run'], { env });
  assert.equal(r.code, 0, r.out);
  assert.equal(readFileSync(f, 'utf8'), FILE);
});

test('progress best: the flag and the build block move together; a page to try is refused; --progress names the file', () => {
  const { dir, f, env } = setup();
  // a page to try (landed: false) can't be the best build
  let r = node(CON, ['progress', 'best', 'v2', '--by', 'ops'], { env });
  assert.equal(r.code, 1, r.out);
  assert.match(r.stdout, /versions\[2\]: "best": true and "landed": false/);
  assert.equal(readFileSync(f, 'utf8'), FILE);
  // land v2, then make it the best build: one call each, from another directory's file via --progress
  const other = join(dir, 'other.json'); writeFileSync(other, FILE);
  const env2 = { ...env, FW_PROGRESS_FILE: join(dir, 'missing.json') };
  r = node(CON, ['progress', 'set', '--delete', 'versions[id=v2].landed', '--progress', other, '--by', 'ops'], { env: env2 });
  assert.equal(r.code, 0, r.out);
  r = node(CON, ['progress', 'best', 'v2', '--progress', other, '--by', 'ops', '--summary', 'The GPU build.'], { env: env2 });
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /^PROGRESS BEST .*other\.json: valid \(--check OK\), written\n/);
  for (const re of [/versions\[2\] "v2": "best": true \(was versions\[1\] "v1"\)/, /build\.since: 2026-10-02T08:00:00Z -> 2026-10-03T08:00:00Z/, /build\.name: "Stack 6" -> "GPU preview"/, /build\.fixes: \+morph/, /items\[1\] "morph"\.inBuild: false -> true/]) assert.match(r.stdout, re);
  const text = readFileSync(other, 'utf8'), p = JSON.parse(text);
  assert.match(text, /\{"id": "v1", "name": "Stack 6",/);
  assert.match(text, /\{"id": "v2", "best": true, "name": "GPU preview",/);
  assert.deepEqual(p.build, { name: 'GPU preview', since: '2026-10-03T08:00:00Z', summary: 'The GPU build.', fixes: ['cdwc', 'morph'], combined: [] });
  assert.equal(node(CON, ['progress', '--check', '--file', other], { env: env2 }).code, 0);
  assert.equal(readFileSync(f, 'utf8'), FILE, 'FW_PROGRESS_FILE untouched');
  r = node(CON, ['progress', 'best', 'v9', '--by', 'ops'], { env });
  assert.equal(r.code, 1);
  assert.match(r.out, /no version "v9" \(versions: v0, v1, v2\)/);
});
