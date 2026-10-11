// medium-dump.js as the browser runs it: the whole file in a context with a window, a document and copy().
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseHTML } from '../lib/html.mjs';
import { extractArticleFile } from '../lib/article.mjs';
import { readDump, checkTransfer, parseDump, DUMP_JS } from '../lib/medium.mjs';
import { compareModels } from '../lib/compare.mjs';
import { editorHtml } from './helpers/fake-medium.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const MINI = join(HERE, 'fixtures', 'article-mini.html');

function runInFakeBrowser(html, { withCopy = true, path = '/p/abc/edit' } = {}) {
  const copied = [], logged = [];
  const document = parseHTML(html);
  const window = { document };
  const ctx = vm.createContext({ window, document, location: { host: 'medium.com', pathname: path }, URL, TextEncoder,
    console: { log: (s) => logged.push(String(s)) }, ...(withCopy ? { copy: (t) => copied.push(t) } : {}) });
  window.window = window;
  vm.runInContext(readFileSync(DUMP_JS, 'utf8'), ctx);
  return { copied, logged, stored: window.__fwMediumDump };
}

test('in the browser: dumps, adds a transfer hash node agrees with, copies to the clipboard', () => {
  const src = extractArticleFile(MINI);
  const { copied, logged, stored } = runInFakeBrowser(editorHtml(src));
  assert.equal(copied.length, 1);
  assert.equal(copied[0], stored);
  assert.match(logged[0], /^medium-dump: \d+ blocks \(graf mode, root div\.postArticle-content\.js-postField.*Copied/);
  const d = parseDump(stored);
  assert.equal(d.page, 'editor');
  assert.equal(d.host, 'medium.com');
  const { transfer, ...rest } = d;
  assert.equal(transfer.sha256, createHash('sha256').update(JSON.stringify(rest), 'utf8').digest('hex'), 'in-page SHA-256 = node:crypto');
  assert.equal(checkTransfer(d).state, 'OK');
  assert.deepEqual(compareModels(src, readDump(stored)).issues, []);
});

test('in the browser without copy(): prints the JSON instead', () => {
  const { copied, logged } = runInFakeBrowser(editorHtml(extractArticleFile(MINI)), { withCopy: false, path: '/@someone/story-123' });
  assert.equal(copied.length, 0);
  assert.equal(logged.length, 2);
  assert.equal(parseDump(logged[1]).page, 'published');
});

test('reads only the story body: no account name, menu or responses', () => {
  const html = editorHtml(extractArticleFile(MINI));
  assert.match(html, /Draft in Someone/);
  const { stored } = runInFakeBrowser(html);
  assert.doesNotMatch(stored, /Draft in Someone|Responses|Publish/);
});

test('loaded in Node (no window) it only defines fwMediumDump', () => {
  const ctx = vm.createContext({ URL, console: { log: () => assert.fail('must not log') } });
  vm.runInContext(readFileSync(DUMP_JS, 'utf8'), ctx);
  assert.equal(typeof ctx.fwMediumDump, 'function');
});
