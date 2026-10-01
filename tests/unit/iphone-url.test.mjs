// tools/lib/iphone-url.mjs (incident I-003): which URL iOS Safari can open for a mirror, and whether
// it really landed there rather than on its certificate warning page. Pure functions, no phone.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { twinUrl, iphoneTarget, landedProblem, mirrorInfo, lanSafeUrl, lanSafeRecord, lanSafeText, LAN_HOST } from '../../tools/lib/iphone-url.mjs';
import * as run from '../../tools/lib/iphone-run.mjs';

const SELF = { vendors: 'local', https: true, selfSigned: true, httpTwin: 61000 };

test('twinUrl keeps host, path and query, switches protocol and port', () => {
  assert.equal(twinUrl('https://192.168.0.55:5906/sub/?x=1#h', 61000), 'http://192.168.0.55:61000/sub/?x=1#h');
});

test('iphoneTarget: self-signed https mirror -> its http twin; everything else unchanged', () => {
  const t = iphoneTarget('https://192.168.0.55:5906/', SELF);
  assert.equal(t.url, 'http://192.168.0.55:61000/');
  assert.match(t.note, /self-signed certificate.*plain-http twin http:\/\/192\.168\.68\.55:61000\//);
  for (const [url, info] of [
    ['http://192.168.0.55:5906/', { ...SELF, https: false, selfSigned: false, httpTwin: null }], // plain http
    ['https://192.168.0.55:5906/', { ...SELF, selfSigned: false }], // --cert/--key (mkcert): the phone may trust it
    ['https://fastwork.com/', null], // not a mirror
  ]) assert.deepEqual(iphoneTarget(url, info), { url, note: null }, url);
  assert.deepEqual(iphoneTarget('https://192.168.0.55:5906/', SELF, { keepHttps: true }), { url: 'https://192.168.0.55:5906/', note: null });
});

test('iphoneTarget: self-signed https mirror without a twin is refused with the http advice', () => {
  assert.throws(() => iphoneTarget('https://192.168.0.55:5906/', { ...SELF, httpTwin: null }), /refusing.*certificate warning.*without --https/s);
});

test('landedProblem: the mirror page passes; the warning page, a wrong origin or a failed mirror check fail', () => {
  const target = 'https://192.168.0.55:5906/';
  assert.equal(landedProblem({ href: target, title: 'Fastwork', mirror: 200 }, target, SELF), null);
  assert.equal(landedProblem({ href: 'https://fastwork.com/', title: 'Fastwork', mirror: 0 }, 'https://fastwork.com/', null), null); // not a mirror: only the title counts
  for (const landed of [
    { href: target, title: 'This Connection Is Not Private', mirror: 0 },
    { href: target, title: '', mirror: 0 }, // same URL, mirror check fails (untrusted cert)
    { href: 'http://192.168.0.55:5000/', title: 'old page', mirror: 200 }, // Safari stayed on the previous page
  ]) {
    const p = landedProblem(landed, target, SELF);
    assert.match(p, /^Safari did not load https:\/\/192\.168\.68\.55:5906\//, JSON.stringify(landed));
    assert.match(p, /certificate warning.*http:\/\/192\.168\.68\.55:61000\//);
  }
  assert.match(landedProblem({ href: 'https://x.test/', title: 'This Connection Is Not Private', mirror: 0 }, 'https://x.test/', null), /without --https/);
  assert.match(landedProblem({ href: 'http://192.168.0.55:5906/', title: '', mirror: 0 }, 'http://192.168.0.55:5906/', { vendors: 'block' }), /reachable from the iPhone/);
});

test('mirrorInfo: unreachable or non-http URLs give null, not a throw', async () => {
  assert.equal(await mirrorInfo('http://127.0.0.1:9/'), null);
  assert.equal(await mirrorInfo('about:blank'), null);
});

test('lanSafeRecord: a scroll / record result keeps everything but a LAN host in its href; iphone-run re-exports lanSafeUrl', () => {
  assert.equal(run.lanSafeUrl, lanSafeUrl);
  assert.equal(run.LAN_HOST, LAN_HOST);
  const res = { href: 'http://192.168.0.55:61000/?x=1', frames: [[0, null, 0, 775]], vw: 430 };
  const safe = lanSafeRecord(res);
  assert.deepEqual(safe, { href: 'http://lan-host:61000/?x=1', frames: res.frames, vw: 430 });
  assert.equal(res.href, 'http://192.168.0.55:61000/?x=1', 'the input is not mutated');
  assert.deepEqual(lanSafeRecord({ href: 'https://localhost:5300/' }), { href: 'https://localhost:5300/' });
  assert.deepEqual(lanSafeRecord({ frames: [] }), { frames: [] });
  assert.equal(lanSafeRecord(null), null);
});

test('tools/iphone.mjs: scroll and record write their result files through lanSafeRecord (no LAN address on disk)', () => {
  const src = readFileSync(new URL('../../tools/iphone.mjs', import.meta.url), 'utf8');
  const writes = src.match(/writeFileSync\([^\n]*/g) || [];
  assert.equal(writes.length, 2, 'scroll and record are the only writers in iphone.mjs (run writes through iphone-run finish)');
  for (const w of writes) assert.match(w, /^writeFileSync\(out, JSON\.stringify\(lanSafeRecord\(res\)\)\)/, w);
});

test('lanSafeText (review-t1a N1): every LAN url and bare LAN host in free text becomes lan-host; the rest stays', () => {
  const cases = [
    ['no tab matching "192.168.77.12:5492"; targets: http://192.168.77.12:5492/ [PID:613], about:blank [PID:1304]',
      'no tab matching "lan-host:5492"; targets: http://lan-host:5492/ [PID:613], about:blank [PID:1304]'],
    ['(http://172.16.0.9:61000/sub/?x=1).', '(http://lan-host:61000/sub/?x=1).'], // trailing punctuation is not part of the url
    ['"url":"http://10.1.2.3:5441/","t":"x"', '"url":"http://lan-host:5441/","t":"x"'],
    ['https://example.com/?u=http://192.168.1.2/&v=/10.0.0.1/', 'https://example.com/?u=http://lan-host/&v=/lan-host/'],
    ['at 100.64.1.1. user@192.168.1.4 ::ffff:169.254.3.4 phone.local:5492', 'at lan-host. user@lan-host ::ffff:lan-host lan-host:5492'],
    ['ws://localhost:9222/devtools/page/1 http://127.0.0.1:5300/ 203.0.113.5:80 http://203.0.113.5/x', null], // loopback, public: kept
    ['version 1.2.3.4.5, 192.168.1 and 300.1.1.1 stay', null], // not an IPv4 literal / not private
  ];
  for (const [i, o] of cases) assert.equal(lanSafeText(i), o ?? i, i);
  for (const v of ['', null, undefined, 42]) assert.equal(lanSafeText(v), v);
});
