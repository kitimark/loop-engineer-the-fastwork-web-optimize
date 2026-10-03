// Incident I-092 (user, 2026-10-03): the threads page's image lightbox (`.lightbox { display: flex }`, `hidden` in the
// markup) was always shown: an author `display` rule beats the browser's own `[hidden] { display: none }`, so the
// dark "Open in a new tab" overlay covered the page and swallowed every click. Every console page now carries one
// `[hidden] { display: none !important; }` rule, so `el.hidden = true` hides an element whatever its class sets.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { readFileSync, readdirSync } from 'node:fs';
import { TOOLS } from '../helpers.mjs';

const pages = readdirSync(join(TOOLS, 'lib')).filter((f) => f.endsWith('-page.html'));
const HIDDEN_RULE = /\[hidden\]\s*\{\s*display\s*:\s*none\s*!important\s*;?\s*\}/;

test('console pages: the page list is what the console serves (threads, console, proposals, progress, status)', () => {
  for (const p of ['threads-page.html', 'console-page.html', 'proposals-page.html', 'progress-page.html', 'status-page.html'])
    assert.ok(pages.includes(p), `${p} found`);
});

for (const p of pages) {
  test(`${p}: a [hidden] { display: none !important } rule, so a class display rule can't show a hidden element`, () => {
    const html = readFileSync(join(TOOLS, 'lib', p), 'utf8');
    const css = (html.match(/<style[^>]*>([\s\S]*?)<\/style>/g) || []).join('\n');
    assert.match(css, HIDDEN_RULE, `${p} has no [hidden] { display: none !important } rule in its <style>`);
  });
}

test('threads-page.html: the lightbox starts hidden and is the overlay the rule must cover (display: flex on .lightbox)', () => {
  const html = readFileSync(join(TOOLS, 'lib', 'threads-page.html'), 'utf8');
  assert.match(html, /<div class="lightbox" id="lightbox" hidden/);
  assert.match(html, /\.lightbox\s*\{[^}]*display:\s*flex/);
});
