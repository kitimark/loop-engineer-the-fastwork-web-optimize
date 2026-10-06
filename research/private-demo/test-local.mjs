#!/usr/bin/env node
// test-local.mjs: prove the private demo's lock on this machine, without deploying (localhost only).
//
//   node research/private-demo/test-local.mjs [--dir out/private-demo]
//
// Uses a throwaway random test password that exists only in this process's memory (never printed, never written),
// hashes it with hash-password.mjs (its --stdin mode, as a child process, and its exported function), runs
// <dir>/middleware.ts in local-server.mjs, and checks with HTTP requests to 127.0.0.1:
//   - every path (/, a JS chunk, a CSS file, images, a font, version.json, a missing path, dropped files) is 401
//     without credentials, with a wrong password and with malformed headers; 503 when the env vars are missing;
//   - with the test password every path is served, byte-identical to <dir>/public;
//   - X-Robots-Tag: noindex, nofollow on every response (401, 503, 200, 404);
//   - hash-password.mjs refuses a password on the command line and a short password.
// Exit 0 when every check passes, 1 otherwise.
import { createHash, randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { startServer, freePort } from './local-server.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) { console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\nimport ')[0]); process.exit(0); }
const DIR = resolve(args.includes('--dir') ? args[args.indexOf('--dir') + 1] : join(HERE, '..', '..', 'out', 'private-demo'));
const PUB = join(DIR, 'public');
const hp = await import(pathToFileURL(join(DIR, 'hash-password.mjs')).href);

let fails = 0, passes = 0;
const results = [];
function check(name, ok, detail = '') { ok ? passes++ : fails++; results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`); }
const basic = (user, pw) => 'Basic ' + Buffer.from(`${user}:${pw}`, 'utf8').toString('base64');

// --- the throwaway test password (memory only) ---
let PW = randomBytes(18).toString('base64url');

// hash-password.mjs CLI: --stdin pipe gives a salt + hash that the middleware accepts
const cli = spawnSync(process.execPath, [join(DIR, 'hash-password.mjs'), '--stdin'], { input: PW + '\n', encoding: 'utf8' });
const salt = cli.stdout.match(/^DEMO_PASS_SALT=([0-9a-f]{32})$/m)?.[1];
const hash = cli.stdout.match(/^DEMO_PASS_SHA256=([0-9a-f]{64})$/m)?.[1];
check('hash-password.mjs --stdin prints DEMO_PASS_SALT and DEMO_PASS_SHA256', cli.status === 0 && !!salt && !!hash, `exit ${cli.status}`);
check('hash-password.mjs output does not contain the password', !cli.stdout.includes(PW) && !cli.stderr.includes(PW));
check('hash-password.mjs hash = SHA-256(salt + "\\n" + password)', hash === createHash('sha256').update(salt + '\n' + PW).digest('hex'));
const argvRun = spawnSync(process.execPath, [join(DIR, 'hash-password.mjs'), 'some-password-on-argv'], { encoding: 'utf8' });
check('hash-password.mjs refuses a password on the command line', argvRun.status === 2 && !argvRun.stdout);
const shortRun = spawnSync(process.execPath, [join(DIR, 'hash-password.mjs'), '--stdin'], { input: 'short\n', encoding: 'utf8' });
check('hash-password.mjs refuses a password under 12 characters', shortRun.status === 1 && !shortRun.stdout);
const noTty = spawnSync(process.execPath, [join(DIR, 'hash-password.mjs')], { input: '', encoding: 'utf8' });
check('hash-password.mjs without a terminal and without --stdin refuses', noTty.status === 2 && !noTty.stdout);
const twice = spawnSync(process.execPath, [join(DIR, 'hash-password.mjs'), '--stdin'], { input: PW + '\n', encoding: 'utf8' });
check('hash-password.mjs makes a fresh salt each run', !twice.stdout.includes(salt));

// --- paths to probe ---
const files = [];
(function walk(d) { for (const e of readdirSync(d, { withFileTypes: true })) { const f = join(d, e.name); e.isDirectory() ? walk(f) : files.push('/' + relative(PUB, f).split('\\').join('/')); } })(PUB);
const pick = (re) => files.find((f) => re.test(f));
const served = ['/', '/index.html', '/_app/immutable/nodes/2.DyWL8TcE.js', '/_app/immutable/assets/2.gBuqKVzi.css',
  pick(/^\/_app\/immutable\/chunks\/.*\.js$/), pick(/\.png$/), pick(/\.jpg$/), pick(/\.svg$/), pick(/\.avif$/), pick(/\.woff2$/),
  '/_app/version.json', '/site.webmanifest', '/favicon.ico'].filter(Boolean);
const absent = ['/robots.txt', '/analytics.js', '/__vendor/www.googletagmanager.com/gtm.js', '/does-not-exist', '/.env'];
const all = [...served, ...absent];
const fileFor = (p) => join(PUB, p === '/' ? 'index.html' : p.slice(1));

const port = await freePort();
const env = { DEMO_PASS_SALT: salt, DEMO_PASS_SHA256: hash };
const s = await startServer({ dir: DIR, env, port });
const get = (p, headers = {}) => fetch(s.url + p, { headers, redirect: 'manual' });
const robots = (r) => /noindex/.test(r.headers.get('x-robots-tag') || '') && /nofollow/.test(r.headers.get('x-robots-tag') || '');

check('middleware matcher covers every probed path', all.every((p) => s.matchers.some((re) => re.test(p))));

const table = [];
for (const p of all) {
  const row = { path: p };
  const r0 = await get(p); await r0.arrayBuffer();
  row.none = r0.status;
  check(`no credentials -> 401 + WWW-Authenticate + noindex: ${p}`, r0.status === 401 && /^Basic realm=/.test(r0.headers.get('www-authenticate') || '') && robots(r0), `${r0.status}`);
  const wrong = [
    ['wrong password', basic('reviewer', PW + 'x')],
    ['empty password', basic('reviewer', '')],
    ['password in the username slot', basic(PW, '')],
    ['upper-cased password', basic('reviewer', PW.toUpperCase())],
    ['no colon', 'Basic ' + Buffer.from(PW).toString('base64')],
    ['Bearer scheme', 'Bearer ' + PW],
    ['malformed base64', 'Basic %%%' + PW],
    ['the hash itself as password', basic('reviewer', hash)],
  ];
  let wrongOk = true;
  for (const [, h] of wrong) { const r = await get(p, { authorization: h }); await r.arrayBuffer(); if (r.status !== 401 || !robots(r)) wrongOk = false; }
  row.wrong = wrongOk ? '401 x8' : 'FAIL';
  check(`8 kinds of wrong credentials -> 401: ${p}`, wrongOk);
  const r1 = await get(p, { authorization: basic('anyone', PW) });
  const body = Buffer.from(await r1.arrayBuffer());
  row.right = r1.status;
  row.noindex = robots(r1) ? 'yes' : 'NO';
  if (served.includes(p)) {
    const same = createHash('sha256').update(body).digest('hex') === createHash('sha256').update(readFileSync(fileFor(p))).digest('hex');
    row.bytes = same ? 'identical' : 'DIFFER';
    check(`test password -> 200, byte-identical, noindex: ${p}`, r1.status === 200 && same && robots(r1), `${r1.status}`);
  } else {
    row.bytes = '-';
    check(`test password -> 404 (not in the demo), noindex: ${p}`, r1.status === 404 && robots(r1), `${r1.status}`);
  }
  table.push(row);
}
const csp = (await get('/', { authorization: basic('x', PW) })).headers.get('content-security-policy') || '';
check('authorized page carries the CSP with connect-src \'self\' and no third-party host', /connect-src 'self'/.test(csp) && !/https?:/.test(csp));
await s.close();

// env missing or malformed -> 503 for everything (fail closed), even with the right password
for (const [label, e] of [['no env vars', { DEMO_PASS_SALT: undefined, DEMO_PASS_SHA256: undefined }], ['hash not 64 hex', { DEMO_PASS_SALT: salt, DEMO_PASS_SHA256: 'abc' }], ['salt missing', { DEMO_PASS_SALT: undefined, DEMO_PASS_SHA256: hash }]]) {
  const s2 = await startServer({ dir: DIR, env: e, port: await freePort() });
  let ok = true;
  for (const p of ['/', '/_app/immutable/nodes/2.DyWL8TcE.js']) { const r = await fetch(s2.url + p, { headers: { authorization: basic('x', PW) } }); const b = await r.text(); if (r.status !== 503 || !robots(r) || b.length > 64) ok = false; }
  check(`fails closed with ${label}: 503, no content`, ok);
  await s2.close();
}
// a different salt with the same hash -> refused
const s3 = await startServer({ dir: DIR, env: { DEMO_PASS_SALT: hp.newSalt(), DEMO_PASS_SHA256: hash }, port: await freePort() });
const r3 = await fetch(s3.url + '/', { headers: { authorization: basic('x', PW) } }); await r3.arrayBuffer();
check('right password but another salt -> 401', r3.status === 401);
await s3.close();

PW = null; // the throwaway password is gone with this process; nothing was written
console.log('path | no credentials | wrong credentials | test password | noindex | body');
for (const r of table) console.log(`${r.path} | ${r.none} | ${r.wrong} | ${r.right} | ${r.noindex} | ${r.bytes}`);
console.log('');
for (const r of results) if (r.startsWith('FAIL')) console.log(r);
console.log(`${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
