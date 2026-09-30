// tools/lib/iphone-url.mjs (incident I-003): which URL iOS Safari can open for a mirror, and whether
// it really landed there rather than on its certificate warning page. Pure functions, no phone.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { twinUrl, iphoneTarget, landedProblem, mirrorInfo } from '../../tools/lib/iphone-url.mjs';

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
