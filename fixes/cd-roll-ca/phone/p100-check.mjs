#!/usr/bin/env node
// P-100 page check (functional, Chrome, no timing; shared probe slot): each mode of p100.html does what the ticket says.
// Per mode, 3.5 s after load: animations on the cells (count, playState, keyframes per animation), how often a cell's
// inline transform changed (MutationObserver), console errors.
//   node fixes/cd-roll-ca/phone/p100-check.mjs --state <serve state.json>   (a server with --overlay out/cd-roll-ca/snap/P100)
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChrome, CDP, gotoAndSettle, sleep, tempProfileDir } from '../../../tools/lib/cdp.mjs';
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const a = process.argv.slice(2), opt = (k) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : null; };
const state = JSON.parse(readFileSync(join(root, opt('--state')), 'utf8'));
const base = state.url || `https://localhost:${state.port}/`;
const chrome = await launchChrome({ port: 0, profileDir: tempProfileDir(join(root, 'out', 'cd-roll-ca', 'chrome'), 'cd-roll-ca-p100'), headless: true, windowSize: '430,932', args: ['--ignore-certificate-errors'] });
const cdp = await CDP.connect(chrome.wsUrl);
let bad = 0;
for (const m of ['quiet', 'ca', 'paused', 'raf']) {
  const page = await cdp.newIsolatedPage();
  const errs = [];
  page.on((x) => { if (x.method === 'Runtime.exceptionThrown') errs.push(x.params.exceptionDetails?.text); if (x.method === 'Runtime.consoleAPICalled' && x.params.type === 'error') errs.push('console.error');
    if (x.method === 'Log.entryAdded' && x.params.entry.level === 'error' && !/\/favicon\.ico$/.test(x.params.entry.url || '')) errs.push(`log ${x.params.entry.source}: ${String(x.params.entry.text).slice(0, 120)}`); }); // rev 2: CSP blocks land in Log, not Runtime
  await page.send('Runtime.enable');
  await page.send('Log.enable');
  await gotoAndSettle(page, new URL(`p100.html?m=${m}`, base).href, { quietMs: 500, maxMs: 15000 });
  await page.send('Runtime.evaluate', { expression: `window.__mut = 0; new MutationObserver((l) => (window.__mut += l.length)).observe(document.getElementById('w'), { subtree: true, attributes: true, attributeFilter: ['style'] });` });
  let maxA = 0, kf = 0, states = new Set();
  for (let t = 0; t < 35; t++) {
    const r = (await page.send('Runtime.evaluate', { expression: `JSON.stringify(document.getElementById('w').getAnimations({ subtree: true }).map((x) => [x.playState, x.effect.getKeyframes().length]))`, returnByValue: true })).result.value;
    const L = JSON.parse(r); maxA = Math.max(maxA, L.length); L.forEach(([s, k]) => { states.add(s); kf = Math.max(kf, k); });
    await sleep(100);
  }
  const mut = (await page.send('Runtime.evaluate', { expression: 'window.__mut', returnByValue: true })).result.value;
  const ok = { quiet: maxA === 0 && mut === 0, ca: maxA > 0 && states.has('running'), paused: maxA > 0 && [...states].every((s) => s === 'paused'), raf: maxA === 0 && mut > 20 }[m] && !errs.length;
  if (!ok) bad++;
  console.log(`P100CHECK ${m}: animations max ${maxA}, states ${[...states].join('/') || '-'}, keyframes max ${kf}, style writes ${mut}, errors ${errs.length}${errs.length ? ' (' + errs.slice(0, 2).join(' | ') + ')' : ''} -> ${ok ? 'OK' : 'FAIL'}`);
  await page.close();
}
cdp.close(); await chrome.close();
process.exit(bad ? 1 : 0);
