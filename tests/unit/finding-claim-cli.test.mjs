// tools/finding.mjs CLI, platform-claim status (research/architecture/claims-audit.md §4): post --claim/--ref
// (exit 1 without a ref for confirmed/refuted), the limitation kind's OBSERVED default and NOTE, the `claim`
// subcommand, list tags and --claim, show's claim line and refs, and `wait` printing CLAIM lines.
// Runs the CLI against its own $FW_STATE_DIR (no temp repo needed: the board lives in the state dir).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tempDir, node, nodeAsync, tool, sleep } from '../helpers.mjs';

const REF = 'https://chromedevtools.github.io/devtools-protocol/tot/LayerTree/#event-layerPainted';

function board() {
  const env = { FW_STATE_DIR: tempDir('fw-findclaim-') };
  const cli = (...a) => node(tool('finding.mjs'), a, { env });
  const cliAsync = (...a) => nodeAsync(tool('finding.mjs'), a, { env });
  return { env, cli, cliAsync };
}
const ids = (r) => r.stdout.trim().split('\n').map((x) => x.slice(0, 5));

test('post: --claim/--ref, confirmed or refuted without --ref exits 1, limitation defaults to OBSERVED with a NOTE', () => {
  const { cli } = board();
  const base = ['post', '--by', 'fix-a', '--topics', 'large-area-blur'];
  for (const s of ['confirmed', 'refuted']) {
    const x = cli(...base, '--kind', 'pitfall', '--title', `Claim ${s} without ref`, '--claim', s);
    assert.equal(x.code, 1, x.out);
    assert.match(x.stderr, /a confirmed\/refuted claim needs --ref/);
  }
  assert.equal(cli(...base, '--kind', 'pitfall', '--title', 'Bad claim word', '--claim', 'probably').code, 1);
  assert.equal(cli('list').stdout.trim(), 'no findings', 'nothing posted on an error');

  const l = cli(...base, '--kind', 'limitation', '--title', 'layerPainted never fires on Chrome 154');
  assert.equal(l.code, 0, l.out);
  assert.match(l.stdout, /^POSTED F-001: layerPainted never fires on Chrome 154$/m);
  assert.match(l.stdout, /^NOTE: posted as OBSERVED; add --claim\/--ref after verification$/m);

  const c = cli(...base, '--kind', 'pitfall', '--title', 'Safari keyframes read the base value', '--claim', 'confirmed', '--ref', REF, '--ref', 'out/probe.json');
  assert.equal(c.code, 0, c.out);
  assert.doesNotMatch(c.stdout, /NOTE:/);
  assert.deepEqual(JSON.parse(cli('show', '2', '--json').stdout).refs, [REF, 'out/probe.json'], 'repeatable --ref');
  const t = cli(...base, '--kind', 'technique', '--title', 'Write custom properties only on change');
  assert.equal(t.code, 0, t.out);
  assert.doesNotMatch(t.stdout, /NOTE:/, 'other kinds: --claim optional, no note');
});

test('claim subcommand, list tags and --claim filter, show line; an old record shows unknown', () => {
  const { cli, env } = board();
  cli('post', '--by', 'fix-a', '--kind', 'limitation', '--topics', 'large-area-blur', '--title', 'layerPainted never fires on Chrome 154');
  cli('post', '--by', 'fix-b', '--kind', 'technique', '--topics', 'commission', '--title', 'Write custom properties only on change');
  // a record from before the claim field
  const f2 = join(env.FW_STATE_DIR, 'findings', 'F-002.json');
  const old = JSON.parse(readFileSync(f2, 'utf8'));
  delete old.claim; delete old.refs;
  writeFileSync(f2, JSON.stringify(old));

  const noRef = cli('claim', '1', '--by', 'ver-a', '--status', 'refuted');
  assert.equal(noRef.code, 1, noRef.out);
  assert.match(noRef.stderr, /needs --ref/);
  assert.equal(cli('claim', '1', '--by', 'ver-a').code, 1, 'no --status');
  assert.equal(cli('claim', '1', '--by', 'ver-a', '--status', 'maybe').code, 1);
  assert.equal(cli('claim', '--by', 'ver-a', '--status', 'observed').code, 1, 'no id');

  const u = cli('claim', '1', '--by', 'ver-a', '--status', 'unresolved', '--ref', 'out/check.json', '--note', 'docs silent');
  assert.equal(u.code, 0, u.out);
  assert.match(u.stdout, /^CLAIM F-001 observed -> unresolved by ver-a$/m);
  assert.doesNotMatch(u.stdout, /correction/);
  const r = cli('claim', 'F-001', '--by', 'ver-layerpainted', '--status', 'refuted', '--ref', REF);
  assert.equal(r.code, 0, r.out);
  assert.match(r.stdout, /^CLAIM F-001 unresolved -> refuted by ver-layerpainted$/m);
  assert.match(r.stdout, /post the correction as a new finding .*F-001/);

  const lines = cli('list').stdout.trim().split('\n');
  assert.match(lines[0], /^F-001 {2}limitation {3}\[REFUTED\] layerPainted never fires/);
  assert.match(lines[1], /^F-002 {2}technique {4}Write custom properties/, 'no tag without a claim');
  assert.deepEqual(ids(cli('list', '--claim', 'refuted')), ['F-001']);
  assert.equal(cli('list', '--claim', 'observed').stdout.trim(), 'no findings', 'an old record is not observed');
  assert.equal(cli('list', '--claim', 'nonsense').code, 1);
  cli('resolve', '1', '--by', 'lead', '--folded', 'P3');
  assert.match(cli('list').stdout, /^F-001 {2}limitation {3}\[folded P3\] \[REFUTED\] layerPainted/m);

  const sh = cli('show', '1').stdout;
  assert.match(sh, /^ {2}claim: REFUTED$/m);
  assert.match(sh, new RegExp(`^ {2}refs:\\n {4}out/check\\.json\\n {4}${REF.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}$`, 'm'));
  assert.match(cli('show', '2').stdout, /^ {2}claim: unknown \(none recorded\)$/m);
  assert.match(cli('digest').stdout, /^\| T\d+ \| \*\*Write custom properties only on change\.\*\* \|/m, 'an old record carries no tag in the digest');
});

test('wait prints CLAIM F-nnn a -> b by <agent> for a claim change on a watched topic', async () => {
  const { cli, cliAsync } = board();
  cli('post', '--by', 'fix-a', '--kind', 'limitation', '--topics', 'large-area-blur', '--title', 'layerPainted never fires on Chrome 154');
  const waiting = cliAsync('wait', '--as', 'fix-a', '--topic', 'large-area-blur', '--timeout', '30', '--poll', '0.1');
  await sleep(600);
  cli('claim', '1', '--by', 'ver-layerpainted', '--status', 'refuted', '--ref', REF);
  const w = await waiting;
  assert.equal(w.code, 0, w.out);
  assert.match(w.stdout, /^CLAIM F-001 observed -> refuted by ver-layerpainted$/m);
  assert.doesNotMatch(w.stdout, /^NEW /m);
  assert.match(w.stdout, /finding\.mjs show F-001/);
  assert.match(w.stdout, /--since \d{4}-\d\d-\d\dT/, 'next wait from the time of the last change, not an id');
});
