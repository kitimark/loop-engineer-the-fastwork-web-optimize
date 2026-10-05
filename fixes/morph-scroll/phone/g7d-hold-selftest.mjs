// Self-test of g7d-hold.sh's item rules (ops D4/D5 for P-124) in a stub checkout: no phone, no lock, no server.
//   node fixes/morph-scroll/phone/g7d-hold-selftest.mjs
// Stubs: tools/{serve,wait,lock,lan,iphone}.mjs, research/phone-thermal-gate/thermal-gate.mjs, and curl/shasum on PATH
// (served JS hash per arm). iphone.mjs gesture obeys STUB_<label with - as _>=exit1|nofile (first call only, so a re-run
// can pass) or STUB_..._ALWAYS=exit1|nofile (every call).
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, chmodSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
let fails = 0;
const check = (name, ok) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}`); if (!ok) fails++; };
function stub() {
  const T = mkdtempSync(join(tmpdir(), 'g7d-'));
  const w = (p, s, x) => { mkdirSync(dirname(join(T, p)), { recursive: true }); writeFileSync(join(T, p), s); if (x) chmodSync(join(T, p), 0o755); };
  w('fixes/morph-scroll/phone/g7d-hold.sh', readFileSync(join(here, 'g7d-hold.sh')));
  w('tools/serve.mjs', `const a=process.argv,s=a[a.indexOf('--state')+1],n=s.match(/serve-(\\w)\\.json/)[1];process.getBuiltinModule('fs').writeFileSync(s,JSON.stringify({port:{B:1001,C:1002,V:1003}[n]}));setTimeout(()=>{},60000);`);
  w('tools/wait.mjs', '');
  w('tools/lock.mjs', '');
  w('tools/lan.mjs', `const a=process.argv;console.log('http://lan:'+a[a.indexOf('--port')+1]+'/')`);
  w('research/phone-thermal-gate/thermal-gate.mjs', '');
  w('tools/iphone.mjs', `const fs=process.getBuiltinModule('fs'),a=process.argv;if(a[2]!=='gesture')process.exit(0);
const l=a[a.indexOf('--label')+1].replace(/-/g,'_'),o=a[a.indexOf('--out')+1],seen=o+'.seen';
const once=process.env['STUB_'+l],always=process.env['STUB_'+l+'_ALWAYS'];
const first=!fs.existsSync(process.env.STUB_DIR+'/'+l+'.called');fs.writeFileSync(process.env.STUB_DIR+'/'+l+'.called','1');
const mode=always||(first?once:undefined);
if(mode==='exit1')process.exit(1);if(mode!=='nofile')fs.writeFileSync(o,'{"run":{}}');`);
  w('bin/curl', '#!/bin/sh\nfor a; do u=$a; done; echo "$u"\n', true);
  w('bin/shasum', '#!/bin/sh\nread u; case $u in *1002*) echo "428961bda278aaaa  -";; *1003*) echo "29c0d537e0c9aaaa  -";; *) echo "000000000000  -";; esac\n', true);
  w('out/morph-scroll/g7d/.keep', '');
  return T;
}
function run(T, env, ...args) {
  const r = spawnSync('sh', ['fixes/morph-scroll/phone/g7d-hold.sh', ...args], { cwd: T, encoding: 'utf8', env: { ...process.env, PATH: `${join(T, 'bin')}:${process.env.PATH}`, STUB_DIR: T, ...env }, timeout: 60000 });
  return { out: r.stdout + r.stderr, status: r.status };
}
{ const T = stub(); const r = run(T, {}, 'H9', 'foC', 'foV');
  check('clean hold: VALID, exit 0', r.status === 0 && /HOLD H9 VALID/.test(r.out) && /ITEM foC OK/.test(r.out) && /ITEM foV OK/.test(r.out)); }
{ const T = stub(); writeFileSync(join(T, 'out/morph-scroll/g7d/H8-foV.json'), '{"stale":1}');
  const r = run(T, { STUB_ms7d_H8_foV_ALWAYS: 'nofile' }, 'H8', 'foC', 'foV');
  check('stale record is moved aside', /MOVED H8-foV\.json aside/.test(r.out) && readdirSync(join(T, 'out/morph-scroll/g7d')).some((f) => f.startsWith('H8-foV.json.prev-H8-')));
  check('exit 0 without a record is VOID, never scored stale', /ITEM foV VOID exit 0, no run file/.test(r.out) && !existsSync(join(T, 'out/morph-scroll/g7d/H8-foV.json')));
  check('void twice: INSUFFICIENT, HOLD VOID exit 6, no VALID', r.status === 6 && /HOLD H8 VOID counted item\(s\) failed: foV/.test(r.out) && !/VALID/.test(r.out)); }
{ const T = stub(); const r = run(T, { STUB_ms7d_H7_nlC: 'exit1' }, 'H7', 'nlC', 'nlV');
  check('gesture exit 1 is VOID', /ITEM nlC VOID exit 1/.test(r.out));
  check('one re-run at the hold end, after the other items', r.out.indexOf('RERUN nlC') > r.out.indexOf('ITEM nlV OK') && /ITEM nlC OK H7-nlC-rerun\.json/.test(r.out));
  check('re-run passed: VALID names the re-run', r.status === 0 && /HOLD H7 VALID .* \(re-run: nlC\)/.test(r.out)); }
{ const T = stub(); const r = run(T, {}, 'H6', 'foC', 'xxV');
  check('unknown item stops before any run', r.status === 4 && /HOLD H6 VOID unknown item xxV/.test(r.out) && !/RUN /.test(r.out)); }
console.log(fails ? `FAILED ${fails}` : 'ALL OK');
process.exit(fails ? 1 : 0);
