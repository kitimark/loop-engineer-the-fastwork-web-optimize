// I-273: tools/release/export-chat.mjs end to end on made-up transcripts (tests/fixtures/chat-transcripts.mjs): output
// lines, exit codes, the default projects dir, the --out guard, and no value in what it prints.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, existsSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { tempDir, node, tool, REPO } from '../helpers.mjs';
import * as F from '../fixtures/chat-transcripts.mjs';

const CLI = tool('release/export-chat.mjs');

test('I-273 CLI: exports the fixture, prints counts only, exit 0', () => {
  const root = tempDir('fw-chat-cli-');
  const { dir, known } = F.makeProjects(root);
  const out = join(root, 'release');
  const r = node(CLI, ['--projects-dir', dir, '--out', out, '--known', known], { env: { FW_STATE_DIR: join(root, 'state') } });
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /^CHAT 2 sessions, 7 you \+ 3 lead messages, \d+ dropped, 0\.\d\d MB -> /m);
  assert.match(r.stdout, /^DROPPED .*tool-result 1/m);
  assert.match(r.stdout, /^NEEDS-HUMAN-READ \d+ messages/m);
  assert.match(r.stdout, /^SECRETS .*github-token 1/m);
  for (const v of Object.values(F.FAKE_SECRETS)) assert.ok(!r.out.includes(v.slice(-12)), 'no secret value printed');
  const tight = node(CLI, ['--projects-dir', dir, '--out', join(root, 'r-ut'), '--known', known, '--lead', 'user-turns'], { env: { FW_STATE_DIR: join(root, 'state') } });
  assert.equal(tight.code, 0, tight.out);
  assert.match(tight.stdout, /^CHAT 2 sessions, 7 you \+ 2 lead messages/m);
  assert.doesNotMatch(r.out, /SECRET-|Zorblatt|zq\.person|10\.77\.3\./i);
  assert.ok(!r.out.includes(homedir() + '/'), 'the output path is printed ~-shortened');
  const all = readdirSync(join(out, 'chat')).map((f) => readFileSync(join(out, 'chat', f), 'utf8')).join('\n');
  assert.doesNotMatch(all, /SECRET-|Zorblatt|zq\.person|10\.77\.3\./i);
  assert.ok(!all.includes(homedir()));
});

test('I-273 CLI: the default projects dir follows $FW_TRANSCRIPTS_DIR; none under a test state dir is exit 2', () => {
  const root = tempDir('fw-chat-cli-');
  const { dir, known } = F.makeProjects(root);
  const state = join(root, 'state');
  const ok = node(CLI, ['--out', join(root, 'r1'), '--known', known], { env: { FW_STATE_DIR: state, FW_TRANSCRIPTS_DIR: dir } });
  assert.equal(ok.code, 0, ok.out);
  const none = node(CLI, ['--out', join(root, 'r2'), '--known', known], { env: { FW_STATE_DIR: state } });
  assert.equal(none.code, 2);
  assert.match(none.stderr, /no transcripts directory/);
  assert.ok(!existsSync(join(root, 'r2')));
});

test('I-273 CLI: refuses an --out inside this repo, a readable known file, no --out, unknown flags and a bad --lead (exit 2)', () => {
  const root = tempDir('fw-chat-cli-');
  const { dir, known } = F.makeProjects(root);
  const env = { FW_STATE_DIR: join(root, 'state') };
  const inRepo = node(CLI, ['--projects-dir', dir, '--out', join(REPO, 'out', 'chat-export-test-never'), '--known', known], { env });
  assert.equal(inRepo.code, 2);
  assert.match(inRepo.stderr, /inside this repo/);
  assert.ok(!existsSync(join(REPO, 'out', 'chat-export-test-never')));
  chmodSync(known, 0o644);
  const open = node(CLI, ['--projects-dir', dir, '--out', join(root, 'r'), '--known', known], { env });
  assert.equal(open.code, 2);
  assert.match(open.stderr, /readable by others/);
  assert.doesNotMatch(open.out, /Zorblatt|zq\.person/i);
  assert.equal(node(CLI, ['--projects-dir', dir], { env }).code, 2);
  assert.equal(node(CLI, ['--out', join(root, 'r'), '--bogus'], { env }).code, 2);
  const badLead = node(CLI, ['--projects-dir', dir, '--out', join(root, 'r'), '--known', known, '--lead', 'some'], { env });
  assert.equal(badLead.code, 2);
  assert.match(badLead.stderr, /--lead is user-turns or all/);
});
