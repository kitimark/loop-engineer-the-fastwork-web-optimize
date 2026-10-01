// Incident I-037: ios_webkit_debug_proxy's /json lists every inspectable web view on the phone, so another app's
// background about:blank WKWebView (PID:1304) appeared next to Safari's tab (PID:613), and the iPhone tools'
// openTab(() => true) / list[0] could land on it (Runtime.evaluate then times out). pickTab never picks a blank
// view, narrows by the expected url / host and by Safari's appId, and refuses to pick one of several.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pickTab, safariTab, isBlankUrl } from '../../tools/lib/wip.mjs';
import { TOOLS } from '../helpers.mjs';

// iphone-runner's list from the failing state (2026-10-01 15:00Z), LAN host replaced by a TEST-NET address
const SAFARI = { devtoolsFrontendUrl: '/devtools/devtools.html?ws=localhost:9222/devtools/page/1', faviconUrl: '', thumbnailUrl: '/thumb/http://192.0.2.7:5492/', title: 'Fastwork · Show the world what you can do', url: 'http://192.0.2.7:5492/', webSocketDebuggerUrl: 'ws://localhost:9222/devtools/page/1', appId: 'PID:613' };
const BLANK = { devtoolsFrontendUrl: '/devtools/devtools.html?ws=localhost:9222/devtools/page/2', faviconUrl: '', thumbnailUrl: '/thumb/about:blank', title: '', url: 'about:blank', webSocketDebuggerUrl: 'ws://localhost:9222/devtools/page/2', appId: 'PID:1304' };
const ANY = () => true;
const noEnv = { appId: null };

test('I-037: the two-target list picks Safari\'s tab in either order, by any page, by host and by appId; never the blank view', () => {
  for (const list of [[SAFARI, BLANK], [BLANK, SAFARI]]) {
    assert.equal(pickTab(list, ANY, noEnv), SAFARI);
    assert.equal(pickTab(list, '192.0.2.7:5492', noEnv), SAFARI);
    assert.equal(pickTab(list, ANY, { appId: 'PID:613' }), SAFARI);
    assert.equal(safariTab(list, noEnv), SAFARI);
  }
  assert.throws(() => pickTab([BLANK], ANY, noEnv), /no tab matching any page \(blank web views are never picked, I-037\); targets: about:blank \[PID:1304\]\. Safari shows no page: open any http page in Safari first/);
  assert.throws(() => pickTab([SAFARI, BLANK], 'about:blank', noEnv), /no tab matching "about:blank"/, 'not even when asked for by url');
  assert.throws(() => pickTab([SAFARI, BLANK], ANY, { appId: 'PID:1304' }), /no tab matching any page in app PID:1304 \(FW_IPHONE_APPID\)/);
});

test('I-037: several candidates fail (AMBIGUOUS) and name them; appId or preferAppId narrows them to one', () => {
  const other = { ...SAFARI, url: 'http://192.0.2.7:5492/sub/', title: 'other app page', webSocketDebuggerUrl: 'ws://localhost:9222/devtools/page/3', appId: 'PID:900' };
  const list = [other, BLANK, SAFARI];
  let err;
  assert.throws(() => pickTab(list, ANY, noEnv), (e) => { err = e; return true; });
  assert.equal(err.ambiguous, true);
  assert.match(err.message, /^AMBIGUOUS: 2 tabs match any page: /);
  assert.ok(err.message.includes('http://192.0.2.7:5492/sub/ [PID:900]') && err.message.includes('[PID:613]'), err.message);
  assert.ok(!err.message.includes('other app page'), 'any page: no titles (review-t1a N1)');
  assert.match(err.message, /set FW_IPHONE_APPID=<appId>/);
  assert.throws(() => pickTab(list, '192.0.2.7:5492', noEnv), /^Error: AMBIGUOUS: 2 tabs match "192\.0\.2\.7:5492"/, 'a host matches both');
  assert.throws(() => safariTab(list, noEnv), /^Error: AMBIGUOUS/, 'safariTab does not turn it into "unlock the iPhone"');
  assert.equal(pickTab(list, ANY, { appId: 'PID:613' }), SAFARI);
  assert.equal(pickTab(list, ANY, { appId: null, preferAppId: 'PID:613' }), SAFARI, 'a reconnect stays with the app of the first connect');
  assert.throws(() => pickTab(list, ANY, { appId: null, preferAppId: 'PID:77' }), /AMBIGUOUS/, 'a preferred app that is not listed narrows nothing');
  const twoSafari = [SAFARI, { ...SAFARI, url: 'https://example.org/', webSocketDebuggerUrl: 'ws://localhost:9222/devtools/page/4' }];
  assert.throws(() => pickTab(twoSafari, ANY, { appId: 'PID:613' }), /AMBIGUOUS: 2 tabs match any page in app PID:613/, 'two Safari tabs: no guess');
  assert.equal(pickTab(twoSafari, 'example.org', { appId: 'PID:613' }).url, 'https://example.org/');
});

test('I-050: host (FW_TAB_HOST by default) keeps only the tabs on that host; two on it stay AMBIGUOUS; none on it names the host', () => {
  const stale = { ...SAFARI, url: 'http://localhost:64250/', title: 'restored', webSocketDebuggerUrl: 'ws://localhost:9232/devtools/page/5' };
  const mine = { ...SAFARI, url: 'http://localhost:5367/', webSocketDebuggerUrl: 'ws://localhost:9232/devtools/page/1' };
  assert.throws(() => pickTab([stale, mine], ANY, noEnv), /AMBIGUOUS: 2 tabs match any page/, 'unscoped: the I-037 refusal');
  assert.equal(pickTab([stale, mine], ANY, { ...noEnv, host: 'localhost:5367' }), mine);
  assert.equal(pickTab([stale, BLANK, mine], (u) => u.startsWith('http'), { ...noEnv, host: 'localhost:5367' }), mine, 'a url matcher and the host together');
  assert.throws(() => pickTab([stale, mine], ANY, { ...noEnv, host: 'localhost:5368' }), /no tab matching any page on localhost:5368 \(FW_TAB_HOST: this Simulator session's sim\.mjs open, I-050\)/);
  assert.throws(() => pickTab([stale, mine], ANY, { ...noEnv, host: 'localhost' }), /no tab matching/, 'host:port, never a prefix');
  const twin = { ...mine, url: 'http://localhost:5367/sub/', webSocketDebuggerUrl: 'ws://localhost:9232/devtools/page/6' };
  assert.throws(() => pickTab([stale, mine, twin], ANY, { ...noEnv, host: 'localhost:5367' }), /AMBIGUOUS: 2 tabs match any page on localhost:5367/, 'two pages on the session\'s own host: still refused');
  const old = process.env.FW_TAB_HOST;
  try {
    process.env.FW_TAB_HOST = 'localhost:5367';
    assert.equal(pickTab([stale, mine], ANY, noEnv), mine);
    assert.equal(safariTab([stale, mine], noEnv), mine);
    delete process.env.FW_TAB_HOST;
    assert.throws(() => safariTab([stale, mine], noEnv), /AMBIGUOUS/);
  } finally { if (old === undefined) delete process.env.FW_TAB_HOST; else process.env.FW_TAB_HOST = old; }
});

test('I-037: FW_IPHONE_APPID is the default appId; entries without a websocket and blank urls are never candidates', () => {
  const old = process.env.FW_IPHONE_APPID;
  try {
    process.env.FW_IPHONE_APPID = 'PID:1304';
    assert.throws(() => pickTab([SAFARI, BLANK]), /in app PID:1304 \(FW_IPHONE_APPID\)/);
    process.env.FW_IPHONE_APPID = 'PID:613';
    assert.equal(pickTab([SAFARI, BLANK]), SAFARI);
  } finally { if (old === undefined) delete process.env.FW_IPHONE_APPID; else process.env.FW_IPHONE_APPID = old; }
  const noWs = { ...SAFARI, webSocketDebuggerUrl: undefined };
  assert.throws(() => safariTab([noWs], noEnv), /^Error: no Safari tab \(unlock the iPhone, bring Safari to the front\): no tab matching any page/);
  assert.throws(() => safariTab([], noEnv), /targets: \(none\)/);
  for (const u of ['about:blank', '', null, undefined, 'about:blank#x', 'about:blank?y']) assert.equal(isBlankUrl(u), true, String(u));
  for (const u of ['http://192.0.2.7/', 'about:blankish', 'https://x/about:blank']) assert.equal(isBlankUrl(u), false, u);
});

test('I-037: no iPhone tool picks the first listed target or connects to any target without pickTab', () => {
  const read = (f) => readFileSync(join(TOOLS, f), 'utf8');
  const wip = read('lib/wip.mjs');
  const open = wip.slice(wip.indexOf('export async function openTab'), wip.indexOf('// Navigate the tab'));
  assert.match(open, /const p = pickTab\(pages, match, \{ appId, preferAppId: lastAppId \}\);/);
  assert.doesNotMatch(open, /pages\.find\(/);
  for (const f of ['iphone.mjs', 'lib/iphone-run.mjs', 'lib/gesture-run.mjs', 'lib/sim-scroll.mjs']) {
    const src = read(f);
    assert.doesNotMatch(src, /\b(list|tabs|pages)\[0\]/, `${f}: no list[0] tab pick`);
    assert.match(src, f === 'lib/sim-scroll.mjs' ? /tab = pickTab\(list\);/ : /const tab = safariTab\((list|tabs)\);/, `${f}: the tab-list check goes through pickTab`);
  }
  const g = read('lib/gesture-run.mjs');
  assert.match(g, /wipPage\(\{ appId: front\.pid \? `PID:\$\{front\.pid\}` : null, port \}\)/, 'gesture: Safari\'s pid from WDA picks its tab (on the target\'s proxy port: phone or Simulator)');
  // the first connect: any page by default (I-038 added the `match` option), narrowed by Safari's appId
  assert.match(g, /export function wipPage\(\{ appId = null, port = null, match = \(\) => true, /);
  assert.match(g, /c = await openTab\(match, o\);/);
  assert.match(g, /c = await openTab\(host, o\);/);
});

test('review-t1a N1: pickTab\'s messages carry no LAN address and no title of a tab that is not a candidate', () => {
  const lan = { ...SAFARI, url: 'http://192.168.77.12:5492/', thumbnailUrl: '/thumb/http://192.168.77.12:5492/' };
  const dup = { ...lan, url: 'http://192.168.77.12:5492/copy/', title: 'second copy', webSocketDebuggerUrl: 'ws://localhost:9222/devtools/page/3' };
  const priv = { ...SAFARI, url: 'http://192.168.0.9:8080/private/inbox', title: 'Private Inbox', webSocketDebuggerUrl: 'ws://localhost:9222/devtools/page/4' };
  const msg = (fn) => { try { fn(); } catch (e) { return e.message; } assert.fail('no throw'); };
  const ambiguous = msg(() => pickTab([lan, dup, priv, BLANK], '192.168.77.12:5492', noEnv));
  assert.equal(ambiguous, 'AMBIGUOUS: 2 tabs match "lan-host:5492": http://lan-host:5492/ "Fastwork · Show the world what you can do" [PID:613], '
    + 'http://lan-host:5492/copy/ "second copy" [PID:613] (all targets: http://lan-host:5492/ [PID:613], http://lan-host:5492/copy/ [PID:613], '
    + 'http://lan-host:8080/private/inbox [PID:613], about:blank [PID:1304]). Not picking one (I-037): close the other Safari tabs or the other app, '
    + 'or set FW_IPHONE_APPID=<appId> to Safari\'s');
  const none = msg(() => pickTab([priv, BLANK], '192.168.77.12:5492', noEnv));
  assert.equal(none, 'no tab matching "lan-host:5492" (blank web views are never picked, I-037); targets: http://lan-host:8080/private/inbox [PID:613], about:blank [PID:1304]');
  const local = msg(() => pickTab([lan], 'phone.local:5492', noEnv));
  assert.equal(local, 'no tab matching "lan-host:5492" (blank web views are never picked, I-037); targets: http://lan-host:5492/ [PID:613]', 'no candidate: no title at all');
  // safariTab / openTab(() => true) (any page): every Safari tab is a candidate, so no titles at all (terminal output
  // ends up in agent transcripts); url and appId still say which tabs to close
  const any = msg(() => safariTab([lan, priv], noEnv));
  assert.match(any, /^AMBIGUOUS: 2 tabs match any page: http:\/\/lan-host:5492\/ \[PID:613\], http:\/\/lan-host:8080\/private\/inbox \[PID:613\] \(all targets/);
  const fn = msg(() => pickTab([lan, priv], (u) => u.startsWith('http'), noEnv));
  assert.match(fn, /^AMBIGUOUS: 2 tabs match the matcher: http:\/\/lan-host:5492\/ \[PID:613\], http:\/\/lan-host:8080\/private\/inbox \[PID:613\] \(all targets/);
  for (const m of [ambiguous, none, any, fn, local]) assert.doesNotMatch(m, /192\.168\.|phone\.local/, m);
  for (const m of [none, any, fn, local]) assert.doesNotMatch(m, /"Fastwork|"Private Inbox"|"second copy"/, m);
  assert.doesNotMatch(ambiguous, /Private Inbox/, 'the private tab is listed, not a candidate: no title');
});
