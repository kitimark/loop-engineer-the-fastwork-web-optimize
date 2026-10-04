// I-152 (PR-020 N10): `--help` on every tool prints its usage, exits 0 at once and has no side effects: no server
// (before N10 `serve.mjs --help` started one and the shell hung), no lock, no phone, no file in the state dir or cwd.
// The phone and proxy ports point at port 1 and the mirror home at an empty dir, so a tool that ignored --help would
// fail or hang here instead of touching anything real.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { TOOLS, tool, tempDir, nodeAsync } from '../helpers.mjs';

const H = await import('../../tools/lib/help.mjs');

const OWN_HELP = new Set(['scope.mjs']); // their own usage line, from before N10

function sandbox() {
  const d = tempDir('fw-help-e2e-');
  const state = join(d, 'state'), home = join(d, 'home'), cwd = join(d, 'cwd');
  for (const p of [state, home, cwd]) mkdirSync(p);
  const env = { FW_STATE_DIR: state, FW_MIRROR_HOME: home, FW_IPHONE_PORT: '1', FW_IPHONE_DEVICE_PORT: '1', FW_AGENT: 'help-test' };
  return { state, cwd, env, untouched: () => readdirSync(state).length === 0 && readdirSync(cwd).length === 0 };
}

async function help(file, args) {
  const sb = sandbox();
  const t0 = Date.now();
  const r = await nodeAsync(tool(file), args, { cwd: sb.cwd, env: sb.env, timeout: 20000 });
  return { ...r, ms: Date.now() - t0, untouched: sb.untouched() };
}

const firstLine = (file) => H.headerUsage(tool(file)).split('\n')[0];

test('N10: every tool: --help prints the header, exits 0, writes nothing', async () => {
  const tools = readdirSync(TOOLS).filter((f) => f.endsWith('.mjs'));
  const results = await Promise.all(tools.map(async (f) => [f, await help(f, ['--help'])]));
  const bad = [];
  for (const [f, r] of results) {
    const okText = OWN_HELP.has(f) ? /usage/i.test(r.out) : r.stdout.startsWith(firstLine(f));
    if (r.code !== 0 || r.signal || !okText || !r.untouched) bad.push(`${f}: code ${r.code} signal ${r.signal} text ${okText} untouched ${r.untouched} ${r.out.slice(0, 160).replace(/\n/g, ' | ')}`);
  }
  assert.deepEqual(bad, []);
});

test('N10: --help after a subcommand that would act (serve, scroll, acquire, post, set, open, -h) still only prints help', async () => {
  const cases = [
    ['serve.mjs', ['--port', 'auto', '--https', '--help']],
    ['iphone.mjs', ['scroll', '--owner', 'help-test', '--help']],
    ['iphone.mjs', ['open', 'http://localhost:1/', '--owner', 'help-test', '--help']],
    ['lock.mjs', ['acquire', 'chrome-measure', '--owner', 'help-test', '--help']],
    ['console.mjs', ['post', '--by', 'help-test', '--title', 'x', '--help']],
    ['status.mjs', ['set', 'help-row', '--by', 'help-test', '--state', 'testing', '--note', 'x', '--help']],
    ['incident.mjs', ['open', '--by', 'help-test', '--title', 'x', '--help']],
    ['finding.mjs', ['post', '--by', 'help-test', '--kind', 'pitfall', '--title', 'x', '--help']],
    ['wait.mjs', ['pid', String(process.pid), '--help']],
    ['fix.mjs', ['new', 'help-topic', '-h']],
  ];
  const results = await Promise.all(cases.map(async ([f, a]) => [f, a, await help(f, a)]));
  const bad = [];
  for (const [f, a, r] of results) {
    if (r.code !== 0 || !r.stdout.startsWith(firstLine(f)) || !r.untouched) bad.push(`${f} ${a.join(' ')}: code ${r.code} signal ${r.signal} untouched ${r.untouched} ${r.out.slice(0, 160).replace(/\n/g, ' | ')}`);
  }
  assert.deepEqual(bad, []);
});

test('N10: a subcommand with its own help keeps it (console thread|proposal, iphone run), still without side effects', async () => {
  const thread = await help('console.mjs', ['thread', '--help']);
  assert.equal(thread.code, 0, thread.out);
  assert.match(thread.stdout, /thread reply <id>/);
  assert.ok(thread.untouched);
  const proposal = await help('console.mjs', ['proposal', '--help']);
  assert.equal(proposal.code, 0, proposal.out);
  assert.match(proposal.stdout, /proposal-cli/);
  assert.ok(proposal.untouched);
  const run = await help('iphone.mjs', ['run', '--help']);
  assert.equal(run.code, 0, run.out);
  assert.match(run.stdout, /--driver/);
  assert.ok(run.untouched);
});

test('N10: the whole header reaches a pipe (no cut-off at exit; console.mjs has the longest)', async () => {
  const r = await help('console.mjs', ['--help']);
  assert.equal(r.code, 0);
  assert.equal(r.stdout, H.headerUsage(tool('console.mjs')));
});
