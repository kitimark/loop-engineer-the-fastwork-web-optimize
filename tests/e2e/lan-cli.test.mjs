// tools/lan.mjs and the `lan` placeholder in lock.mjs acquire iphone --url (incident I-073; user T-026). Fake
// interfaces through FW_LAN_IFACES / FW_LAN_ADDRESS (made-up addresses), a temp lock dir: never the host's address,
// never the real iphone lease.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tempDir, node, tool } from '../helpers.mjs';

const LAN = tool('lan.mjs'), LOCK = tool('lock.mjs');
const v4 = (address, internal = false) => ({ address, family: 'IPv4', internal });
const IFACES = JSON.stringify({ lo0: [v4('127.0.0.1', true)], utun3: [v4('10.8.0.2')], en5: [v4('10.0.0.5')], en0: [v4('192.168.1.20')] });
const lan = (args, env = { FW_LAN_IFACES: IFACES }) => node(LAN, args, { env });

test('lan.mjs prints the address (en0 first), the http URL form, a resolved URL, and JSON', () => {
  let r = lan([]);
  assert.equal(r.code, 0, r.out);
  assert.equal(r.stdout, '192.168.1.20\n');
  r = lan(['--url', '--port', '61000']);
  assert.equal(r.stdout, 'http://192.168.1.20:61000/\n');
  r = lan(['--url', '--port=5231']);
  assert.equal(r.stdout, 'http://192.168.1.20:5231/\n');
  r = lan(['--resolve', 'http://lan:5231/sub/?x=1']);
  assert.equal(r.stdout, 'http://192.168.1.20:5231/sub/?x=1\n');
  assert.equal(lan(['--resolve', 'http://127.0.0.1:5231/']).stdout, 'http://127.0.0.1:5231/\n', 'not a placeholder: unchanged');
  r = lan(['--json', '--port', '7']);
  assert.equal(r.code, 0, r.out);
  assert.deepEqual(JSON.parse(r.stdout), { address: '192.168.1.20', interface: 'en0', source: 'interface', url: 'http://192.168.1.20:7/',
    candidates: [{ name: 'en0', address: '192.168.1.20' }, { name: 'en5', address: '10.0.0.5' }] });
  r = lan([], { FW_LAN_ADDRESS: '10.0.0.5', FW_LAN_IFACES: IFACES });
  assert.equal(r.stdout, '10.0.0.5\n', 'FW_LAN_ADDRESS pins it');
});

test('lan.mjs: no LAN address is exit 3 with a clear message; usage errors are exit 2', () => {
  let r = lan([], { FW_LAN_IFACES: JSON.stringify({ lo0: [v4('127.0.0.1', true)], utun3: [v4('10.8.0.2')] }) });
  assert.equal(r.code, 3, r.out);
  assert.match(r.stderr, /^NO LAN ADDRESS: no LAN address: .*other interfaces up: utun3.*Wi-Fi/);
  assert.equal(r.stdout, '');
  for (const args of [['--url'], ['--port', 'x'], ['--port', '70000'], ['--bogus'], ['--resolve']]) {
    r = lan(args);
    assert.equal(r.code, 2, `${args.join(' ')}: ${r.out}`);
  }
  r = lan(['--help']);
  assert.equal(r.code, 0);
});

test('lock.mjs acquire iphone --url http://lan:<port>/: kept as given in the lease (resolved by the phone tools at run time); refused when it cannot resolve now', () => {
  const state = tempDir('fw-lan-lock-');
  const lock = (args, extra) => node(LOCK, args, { env: { FW_STATE_DIR: state, ...extra } });
  let r = lock(['acquire', 'iphone', '--owner', 'me', '--url', 'http://lan:5231/'], { FW_LAN_IFACES: '{}' });
  assert.equal(r.code, 1, r.out);
  assert.match(r.stderr, /no LAN address/);
  assert.doesNotMatch(lock(['status', 'iphone']).stdout, /"me"/, 'nothing acquired');
  r = lock(['acquire', 'iphone', '--owner', 'me', '--url', 'http://lan:5231/'], { FW_LAN_IFACES: IFACES });
  assert.equal(r.code, 0, r.out);
  assert.deepEqual(JSON.parse(readFileSync(join(state, 'locks', 'iphone.json'), 'utf8')).meta, { url: 'http://lan:5231/' });
  // renew never re-checks it (a lease is never lost to a Wi-Fi blip); a real address is accepted as before
  assert.equal(lock(['renew', 'iphone', '--owner', 'me', '--url', 'http://lan:5231/'], { FW_LAN_IFACES: '{}' }).code, 0);
  assert.equal(lock(['release', 'iphone', '--owner', 'me']).code, 0);
  assert.equal(lock(['acquire', 'iphone', '--owner', 'me', '--url', 'http://192.168.1.20:5231/'], { FW_LAN_IFACES: '{}' }).code, 0);
});
