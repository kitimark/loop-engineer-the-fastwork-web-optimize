// tools/lib/lan.mjs (incident I-073; user T-026): the Mac's LAN address resolved at run time, the `lan` placeholder of
// phone URLs, and the one rule serve.mjs shares. Fake interfaces only (made-up addresses), never the host's.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { lanInterfaces, isPhoneLan, lanCandidates, lanChoice, lanAddress, resolveLanUrl, tryResolveLanUrl, isLanPlaceholder, LAN_PLACEHOLDERS } from '../../tools/lib/lan.mjs';
import { LAN_HOST, lanSafeUrl } from '../../tools/lib/iphone-url.mjs';
import { tool } from '../helpers.mjs';

const v4 = (address, internal = false) => ({ address, family: 'IPv4', internal, netmask: '255.255.255.0', mac: '00:00:00:00:00:00', cidr: `${address}/24` });
const v6 = (address) => ({ address, family: 'IPv6', internal: false, netmask: 'ffff:ffff:ffff:ffff::', mac: '00:00:00:00:00:00', scopeid: 0, cidr: `${address}/64` });
const NONE = { env: {} };

test('lanInterfaces: every non-internal IPv4 with its interface, in the OS order (what serve.mjs uses for cert SANs and probe hosts)', () => {
  const ifaces = { lo0: [v4('127.0.0.1', true), v6('::1')], en0: [v6('fe80::1'), v4('192.168.1.20')], utun3: [v4('10.8.0.2')], bridge0: [] };
  assert.deepEqual(lanInterfaces(ifaces), [{ name: 'en0', address: '192.168.1.20' }, { name: 'utun3', address: '10.8.0.2' }]);
  assert.deepEqual(lanInterfaces({}), []);
  assert.deepEqual(lanInterfaces(null), []);
});

test('isPhoneLan: private ranges on a non-tunnel interface only (the rule of serve.mjs\'s LAN: lines)', () => {
  for (const a of ['10.0.0.5', '172.16.0.1', '172.31.255.254', '192.168.1.20']) assert.ok(isPhoneLan({ name: 'en0', address: a }), a);
  for (const a of ['172.15.0.1', '172.32.0.1', '169.254.3.4', '100.64.0.1', '8.8.8.8', '11.0.0.1']) assert.ok(!isPhoneLan({ name: 'en0', address: a }), a);
  for (const n of ['utun0', 'tun1', 'tap0', 'ppp0', 'wg0']) assert.ok(!isPhoneLan({ name: n, address: '10.0.0.5' }), n);
  for (const n of ['en0', 'en7', 'bridge100', 'eth0']) assert.ok(isPhoneLan({ name: n, address: '10.0.0.5' }), n);
});

test('lanCandidates / lanChoice: en0 first, then natural interface order, then address; deterministic for any OS order', () => {
  const ifaces = { en10: [v4('192.168.1.40')], utun2: [v4('10.8.0.2')], en2: [v4('192.168.1.30'), v4('10.0.0.9')], en0: [v4('192.168.1.20')], anpi0: [v4('169.254.1.1')], awdl0: [v6('fe80::2')] };
  const want = [['en0', '192.168.1.20'], ['en2', '10.0.0.9'], ['en2', '192.168.1.30'], ['en10', '192.168.1.40']];
  assert.deepEqual(lanCandidates(ifaces).map((a) => [a.name, a.address]), want);
  const reversed = Object.fromEntries(Object.entries(ifaces).reverse().map(([k, l]) => [k, [...l].reverse()]));
  assert.deepEqual(lanCandidates(reversed).map((a) => [a.name, a.address]), want, 'same answer whatever order the OS lists them in');
  const c = lanChoice({ ifaces, ...NONE });
  assert.equal(c.address, '192.168.1.20');
  assert.equal(c.name, 'en0');
  assert.equal(c.source, 'interface');
  assert.equal(c.candidates.length, 4);
  // no en0 (e.g. Wi-Fi on en1, Ethernet on en5): the lowest-numbered interface; the address breaks ties numerically
  assert.equal(lanAddress({ ifaces: { en5: [v4('10.0.0.5')], en1: [v4('192.168.1.200'), v4('192.168.1.9')] }, ...NONE }), '192.168.1.9');
  assert.equal(lanAddress({ ifaces: { en1: [v4('10.0.0.10'), v4('10.0.0.9')] }, ...NONE }), '10.0.0.9');
});

test('lanChoice: no candidate is a clear error naming the interfaces that are up (never their addresses)', () => {
  assert.throws(() => lanChoice({ ifaces: {}, ...NONE }), /^Error: no LAN address: .*no network interface up.*Wi-Fi/);
  assert.throws(() => lanChoice({ ifaces: { lo0: [v4('127.0.0.1', true)], utun4: [v4('10.8.0.2')], en0: [v4('169.254.7.7')] }, ...NONE }), (e) => {
    assert.match(e.message, /other interfaces up: utun4, en0/);
    assert.doesNotMatch(e.message, /10\.8\.0\.2|169\.254/);
    return true;
  });
});

test('FW_LAN_ADDRESS pins the address (validated); FW_LAN_IFACES stands in for the interfaces', () => {
  assert.deepEqual(lanChoice({ ifaces: {}, env: { FW_LAN_ADDRESS: '10.0.0.5' } }), { address: '10.0.0.5', name: null, source: 'env', candidates: [] });
  for (const bad of ['lan', '10.0.0', '300.1.1.1', 'http://10.0.0.5/']) assert.throws(() => lanChoice({ env: { FW_LAN_ADDRESS: bad } }), /FW_LAN_ADDRESS must be an IPv4 address/, bad);
  assert.equal(lanChoice({ env: { FW_LAN_ADDRESS: '' , FW_LAN_IFACES: JSON.stringify({ en0: [v4('192.168.1.20')] }) } }).address, '192.168.1.20');
  assert.throws(() => lanChoice({ env: { FW_LAN_IFACES: '{' } }), /FW_LAN_IFACES is not JSON/);
  assert.throws(() => lanChoice({ env: { FW_LAN_IFACES: '{}' } }), /no LAN address/);
});

test('resolveLanUrl: a `lan` / `lan-host` host becomes the address (scheme, port, path, query, hash kept); anything else unchanged', () => {
  const address = '192.168.1.20';
  assert.deepEqual(LAN_PLACEHOLDERS, ['lan', LAN_HOST]);
  assert.equal(resolveLanUrl('http://lan:5231/', { address }), 'http://192.168.1.20:5231/');
  assert.equal(resolveLanUrl('https://LAN:5231/sub/?x=1#h', { address }), 'https://192.168.1.20:5231/sub/?x=1#h');
  assert.equal(resolveLanUrl('http://lan-host:61000/', { address }), 'http://192.168.1.20:61000/');
  assert.equal(resolveLanUrl('http://lan/', { address }), 'http://192.168.1.20/');
  for (const u of ['http://127.0.0.1:5231/', 'http://localhost:5231/', 'http://10.0.0.5:5231/', 'http://lan.example:1/', 'http://planet:1/', 'not a url', '', null, undefined])
    assert.equal(resolveLanUrl(u, { address }), u, String(u));
  assert.equal(resolveLanUrl('http://lan:1/', { ifaces: { en0: [v4('10.0.0.5')] }, env: {} }), 'http://10.0.0.5:1/');
  assert.throws(() => resolveLanUrl('http://lan:1/', { ifaces: {}, env: {} }), /no LAN address/);
  assert.equal(tryResolveLanUrl('http://lan:1/', { ifaces: {}, env: {} }), 'http://lan:1/', 'try: unchanged on failure (warnings only)');
  assert.equal(tryResolveLanUrl('http://lan:1/', { address }), 'http://192.168.1.20:1/');
  assert.ok(isLanPlaceholder('LAN-HOST') && isLanPlaceholder('lan') && !isLanPlaceholder('lan.local') && !isLanPlaceholder(undefined));
  // the redacted form records keep is itself a placeholder: a URL copied from a committed record resolves again
  assert.equal(resolveLanUrl(lanSafeUrl('http://192.168.1.20:5231/p'), { address: '10.0.0.5' }), 'http://10.0.0.5:5231/p');
});

test('serve.mjs computes its LAN addresses through lib/lan.mjs (one rule), with no copy of the filter left', () => {
  const src = readFileSync(tool('serve.mjs'), 'utf8');
  assert.match(src, /import \{ lanInterfaces, isPhoneLan \} from '\.\/lib\/lan\.mjs';/);
  assert.match(src, /const lan = all\.filter\(isPhoneLan\);/);
  assert.doesNotMatch(src, /networkInterfaces|utun\|tun/, 'no second copy of the interface rule');
});

test('the phone tools resolve the placeholder before use: iphone.mjs open, the lease URL checks, safari-restart, console URLs, lock acquire', () => {
  const src = (f) => readFileSync(tool(f), 'utf8');
  assert.match(src('iphone.mjs'), /const url = resolveLanUrl\(arg\);/);
  assert.match(src('iphone.mjs'), /let leaseUrl = tryResolveLanUrl\(holder\.meta\?\.url\);/);
  assert.match(src('lib/iphone-run.mjs'), /let leaseUrl = tryResolveLanUrl\(holder\?\.meta\?\.url\);/);
  assert.match(src('lib/gesture-run.mjs'), /let leaseUrl = tryResolveLanUrl\(pageUrl\);/);
  assert.match(src('lib/safari-restart.mjs'), /url = resolveLanUrl\(url\);/);
  assert.match(src('lib/console.mjs'), /return resolveLanUrl\(String\(u\)\);/);
  assert.match(src('lock.mjs'), /if \(cmd === 'acquire'\) resolveLanUrl\(meta\.url\);/);
});

/** Run `fn` with process.env.FW_LAN_ADDRESS / FW_LAN_IFACES set (restored after): the libraries read process.env. */
async function withLanEnv(vars, fn) {
  const keys = ['FW_LAN_ADDRESS', 'FW_LAN_IFACES'], old = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  for (const k of keys) { if (vars[k] === undefined) delete process.env[k]; else process.env[k] = vars[k]; }
  try { return await fn(); } finally { for (const k of keys) { if (old[k] === undefined) delete process.env[k]; else process.env[k] = old[k]; } }
}

test('console steps: a `lan` URL is stored resolved (the user\'s phone opens it); other URLs as given; no LAN address is an error at post time', async () => {
  const C = await import('../../tools/lib/console.mjs');
  await withLanEnv({ FW_LAN_ADDRESS: '10.0.0.5' }, () => {
    const s = C.buildStep({ by: 'a', kind: 'swipe-pair', title: 't', url: 'http://lan:5401/', url2: 'http://page-b.invalid:5402/' });
    assert.deepEqual(s.parts.map((p) => p.url), ['http://10.0.0.5:5401/', 'http://page-b.invalid:5402/']);
    const custom = C.buildStep({ by: 'a', kind: 'swipe-pair', title: 't', parts: [{ label: 'A', url: 'http://lan-host:1/a' }, { label: 'B', url: 'http://lan:2/b' }] });
    assert.deepEqual(custom.parts.map((p) => p.url), ['http://10.0.0.5:1/a', 'http://10.0.0.5:2/b']);
  });
  await withLanEnv({ FW_LAN_IFACES: '{}' }, () => {
    assert.throws(() => C.buildStep({ by: 'a', kind: 'action', title: 't', url: 'http://lan:5401/' }), /no LAN address/);
  });
});

test('safari-restart --url http://lan:<port>/: loads the resolved address (the phone never sees the placeholder)', async () => {
  const { safariRestart } = await import('../../tools/lib/safari-restart.mjs');
  const drv = { name: 'wda', async available() { return true; }, async restart() {}, async open() {} };
  const RESTORED = 'http://127.0.0.1:1/restored', navs = [], calls = [];
  const wait = async ({ target }) => { calls.push(target); return target ? { tab: { url: target }, landed: { href: target, title: 'Page', mirror: 0 } } : { tab: { url: RESTORED, webSocketDebuggerUrl: 'ws://x' }, landed: { href: RESTORED, title: 'Old', mirror: 0 } }; };
  const r = await withLanEnv({ FW_LAN_ADDRESS: '127.0.0.1' }, () => safariRestart({ drivers: [drv], url: 'http://lan:1/x', port: 1, wait, navigate: async (tab, u) => { navs.push(u); }, log: () => {} }));
  assert.deepEqual(navs, ['http://127.0.0.1:1/x']);
  assert.deepEqual(calls, [null, 'http://127.0.0.1:1/x']);
  assert.equal(r.href, 'http://127.0.0.1:1/x');
  await withLanEnv({ FW_LAN_IFACES: '{}' }, () => assert.rejects(safariRestart({ drivers: [drv], url: 'http://lan:1/x', port: 1, wait, log: () => {} }), /^Error: safari-restart: no LAN address/));
});
