// I-152 (PR-020 N10): `--help` on every tool prints its usage and exits before anything runs (tools/lib/help.mjs).
// Pure parts here; tests/e2e/help.test.mjs runs every tool with --help and checks it had no side effects.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { TOOLS, tempDir } from '../helpers.mjs';

const H = await import('../../tools/lib/help.mjs');

// tools whose own code handled --help before N10 (checked end to end in tests/e2e/help.test.mjs)
const OWN_HELP = new Set(['scope.mjs']);
const STANDALONE = new Set(['mirror.mjs', 'prettify.mjs']);

test('N10: wantsHelp: --help or -h before any `--`; a command after `--` keeps its own --help', () => {
  assert.equal(H.wantsHelp(['--help']), true);
  assert.equal(H.wantsHelp(['serve', '--port', 'auto', '-h']), true);
  assert.equal(H.wantsHelp(['run', 'chrome-measure', '--owner', 'x', '--', 'node', 'x.mjs', '--help']), false);
  assert.equal(H.wantsHelp(['--helpful', 'h', '-help']), false);
  assert.equal(H.wantsHelp([]), false);
});

test('N10: headerUsage: the leading // block without markers; shebang skipped; trailing blanks dropped', () => {
  const d = tempDir('fw-help-');
  const f = join(d, 't.mjs');
  writeFileSync(f, '#!/usr/bin/env node\n// tool t: does x\n//   node tools/t.mjs a|b\n//\nimport x from "y";\n// not usage\n');
  assert.equal(H.headerUsage(f), 'tool t: does x\n  node tools/t.mjs a|b\n');
  writeFileSync(f, 'import x from "y";\n');
  assert.match(H.headerUsage(f), /^see the header of /);
});

test('N10: exitOnHelp acts only for the main script, only on --help, and not when `unless` keeps a subcommand help', () => {
  const d = tempDir('fw-help-');
  const f = join(d, 't.mjs');
  writeFileSync(f, '// usage: t\n');
  const url = pathToFileURL(f).href;
  const calls = [];
  const opts = (argv, extra = {}) => ({ argv, argv1: f, write: (s) => calls.push(['write', s]), exit: (c) => calls.push(['exit', c]), ...extra });
  assert.equal(H.exitOnHelp(url, opts(['--help'])), true);
  assert.deepEqual(calls, [['write', 'usage: t\n'], ['exit', 0]]);
  calls.length = 0;
  assert.equal(H.exitOnHelp(url, opts(['--help'], { argv1: join(d, 'other.mjs') })), false, 'imported by another script');
  assert.equal(H.exitOnHelp(url, opts(['serve'])), false);
  assert.equal(H.exitOnHelp(url, opts(['run', '--help'], { unless: (a) => a[0] === 'run' })), false);
  assert.deepEqual(calls, []);
});

test('N10: every tool calls exitOnHelp(import.meta.url) before it reads its arguments (or has its own help)', () => {
  const tools = readdirSync(TOOLS).filter((f) => f.endsWith('.mjs'));
  assert.ok(tools.length >= 20);
  const missing = [];
  for (const f of tools) {
    if (OWN_HELP.has(f)) continue;
    const src = readFileSync(join(TOOLS, f), 'utf8');
    // mirror.mjs and prettify.mjs run standalone (their tests copy them alone, without tools/lib): an inline copy
    const at = STANDALONE.has(f) ? src.indexOf('I-152 N10 inline help') : src.indexOf('exitOnHelp(import.meta.url');
    const args = src.indexOf('process.argv');
    if (at < 0 || (args >= 0 && args < at)) missing.push(f);
  }
  assert.deepEqual(missing, [], 'tools without the --help guard ahead of their argument parsing');
});
