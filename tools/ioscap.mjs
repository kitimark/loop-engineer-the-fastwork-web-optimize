#!/usr/bin/env node
// The iPhone screen recorder (incident I-062, user T-019 #21): the ONLY route by which agents record the real
// iPhone's screen on the Mac. It records the phone's screen, never a camera: the app (tools/ioscap/, built into
// out/ioscap/ioscap.app) discovers external muxed devices only and opens exactly one, the iOS screen
// (model id "iOS Device", manufacturer "Apple Inc."), with no fallback (tools/ioscap/Selection.swift).
//
//   node tools/ioscap.mjs status                 app built? its signature type; recordings so far (no device access)
//   node tools/ioscap.mjs selftest               build + run the Foundation-only self-test (fake devices; no capture
//                                                framework is even linked); inside a chrome-measure hold (shared is fine):
//     node tools/lock.mjs run chrome-measure --owner <you> --shared --weight 1 --max-seconds 300 -- node tools/ioscap.mjs selftest
//   node tools/ioscap.mjs build [--adhoc]        compile + sign the app; Swift is CPU work: inside your own normal hold:
//     node tools/lock.mjs run chrome-measure --owner <you> --no-timing --max-seconds 600 -- node tools/ioscap.mjs build
//   node tools/ioscap.mjs record --owner <o> [--seconds 20] [--label l] [--out out/iphone-screen/<name>.mov]
//                                [--first-run] [--codec h264|hevc] [--require-quiet] [--allow-during-measure]
//
// record: refuses without the iphone lease (same owner model as iphone.mjs), inside a --shared (functional) hold,
// and beside someone else's normal chrome-measure hold (phoneGuard, I-056). --seconds is capped at 600. Output only
// in <checkout>/out/iphone-screen/ (gitignored): <name>.mov, .frames.json (PTS + per-frame hash, numbers only),
// .result.json (the app's exit), .log, .json (this summary). It prints paths and numbers only; nobody views frames.
// The macOS Camera permission belongs to ioscap.app (started through LaunchServices, `open -n -W`, not as a
// child of the terminal). If it was never asked, the app ends at once without opening anything, unless
// --first-run: that run, the lead's with the user watching after a console step, shows the macOS prompt.
// Signing: the keychain's "Apple Development" identity (stable: the permission survives rebuilds), else ad hoc
// (each build is a new app to the permission system: it asks again).
// Test doubles: $FW_IOSCAP_ROOT (checkout whose out/ is used), $FW_IOSCAP_OPEN, $FW_SWIFTC, $FW_CODESIGN, $FW_SECURITY.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync, renameSync, copyFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { status as lockStatus, timedInSlotRefusal, phoneGuard, phoneMacRecord } from './lib/lock.mjs';
import { redact } from './lib/redact.mjs';
import {
  SCHEMA, SRC, root, outDir, buildDir, appPath, appExe, selftestExe, slug, parseSeconds, outPath, sidecars,
  recordTimeoutSec, openArgs, swiftcArgs, pickIdentity, signatureType, summarizeFrames, summaryLine, holdKind,
} from './lib/ioscap.mjs';

const argv = process.argv.slice(2);
const VALUED = ['--owner', '--seconds', '--label', '--out', '--codec'];
const opt = (n, d) => { const i = argv.findIndex((a) => a === `--${n}` || a.startsWith(`--${n}=`)); if (i < 0) return d; const a = argv[i]; return a.includes('=') ? a.split('=').slice(1).join('=') : (argv[i + 1] === undefined || argv[i + 1].startsWith('--') ? true : argv[i + 1]); };
const flag = (n) => argv.includes(`--${n}`);
const [cmd] = argv.filter((a, i) => !a.startsWith('--') && !(i > 0 && VALUED.includes(argv[i - 1])));
const exe = (env, name) => process.env[env] || name;
const say = (s) => console.log(redact(String(s)));
class Usage extends Error {}
class Refused extends Error { constructor(m, code = 1) { super(m); this.code = code; } }

const USAGE = 'usage: node tools/ioscap.mjs status | selftest | build [--adhoc] | record --owner <o> [--seconds 20 (max 600)] [--label l] [--out out/iphone-screen/<name>.mov] [--first-run] [--codec h264|hevc] [--require-quiet] [--allow-during-measure]';
const buildCmd = (o = '<you>') => `node tools/lock.mjs run chrome-measure --owner ${o} --no-timing --max-seconds 600 -- node tools/ioscap.mjs build`;
const selftestCmd = (o = '<you>') => `node tools/lock.mjs run chrome-measure --owner ${o} --shared --weight 1 --max-seconds 300 -- node tools/ioscap.mjs selftest`;

function requireLease() {
  const owner = opt('owner', process.env.FW_LOCK_OWNER);
  if (!owner || owner === true) throw new Usage('--owner <topic> is required');
  const s = lockStatus('iphone');
  if (!s.holder || s.stale || s.holder.owner !== owner) {
    throw new Refused(`you ("${owner}") don't hold the iphone lease${s.holder ? ` (holder: "${s.holder.owner}"${s.stale ? ', stale' : ''})` : ''}. Run: node tools/lock.mjs acquire iphone --owner ${owner}`);
  }
  return owner;
}

function runSync(bin, args, opts = {}) {
  const r = spawnSync(bin, args, { encoding: 'utf8', timeout: 300000, ...opts });
  return { code: r.status, out: `${r.stdout || ''}${r.stderr || ''}`, error: r.error };
}

function compileSelftest() {
  const out = selftestExe();
  mkdirSync(dirname(out), { recursive: true });
  const r = runSync(exe('FW_SWIFTC', 'swiftc'), swiftcArgs({ out, selftest: true }));
  if (r.error) throw new Error(`swiftc could not start (${r.error.code || r.error.message}): install the Xcode command line tools`);
  if (r.code !== 0) throw new Error(`swiftc (self-test) failed:\n${r.out.trim().split('\n').slice(-20).join('\n')}`);
  return out;
}

function cmdSelftest() {
  if (!holdKind()) throw new Refused(`refusing: compiling Swift is CPU work; run it inside a chrome-measure hold:\n  ${selftestCmd(process.env.FW_LOCK_OWNER)}`);
  const bin = compileSelftest();
  const r = runSync(bin, ['--selftest'], { timeout: 30000 });
  process.stdout.write(r.out);
  if (r.code !== 0) throw new Error(`self-test failed (exit ${r.code})`);
  return 0;
}

function cmdBuild() {
  const kind = holdKind();
  if (kind !== 'exclusive') throw new Refused(`refusing: ${kind ? `this is a ${kind} hold; ` : ''}building the app is Swift compile work: it runs only inside your own normal (--no-timing) chrome-measure hold:\n  ${buildCmd(process.env.FW_LOCK_OWNER)}`);
  // the rules first: a build whose selection self-test fails is never produced
  const st = runSync(compileSelftest(), ['--selftest'], { timeout: 30000 });
  if (st.code !== 0) throw new Error(`self-test failed, no build:\n${st.out}`);
  say(st.out.trim());
  const dir = buildDir();
  const tmp = join(dir, `ioscap.app.tmp-${process.pid}`);
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(join(tmp, 'Contents', 'MacOS'), { recursive: true });
  copyFileSync(join(SRC, 'Info.plist'), join(tmp, 'Contents', 'Info.plist'));
  const c = runSync(exe('FW_SWIFTC', 'swiftc'), swiftcArgs({ out: join(tmp, 'Contents', 'MacOS', 'ioscap') }));
  if (c.error) throw new Error(`swiftc could not start (${c.error.code || c.error.message}): install the Xcode command line tools`);
  if (c.code !== 0) { rmSync(tmp, { recursive: true, force: true }); throw new Error(`swiftc failed:\n${c.out.trim().split('\n').slice(-30).join('\n')}`); }
  // signing: a stable Apple Development identity if the keychain has one (found without any prompt), else ad hoc
  let id = null;
  if (!flag('adhoc')) {
    const f = runSync(exe('FW_SECURITY', 'security'), ['find-identity', '-v', '-p', 'codesigning'], { timeout: 20000 });
    id = f.code === 0 ? pickIdentity(f.out) : null;
  }
  const sign = (identity) => runSync(exe('FW_CODESIGN', 'codesign'), ['--force', '--options', 'runtime', '--timestamp=none',
    '--entitlements', join(SRC, 'ioscap.entitlements'), '-s', identity, tmp], { timeout: 60000 });
  let signedAs = id ? id.type : 'ad hoc';
  let s = sign(id ? id.hash : '-');
  if (id && s.code !== 0) {
    say(`NOTE: signing with the ${id.type} identity failed or waited for a keychain prompt (${redact(s.out.trim().split('\n').pop() || `exit ${s.code}`)}); signing ad hoc instead: the Camera permission is asked again after every build`);
    signedAs = 'ad hoc';
    s = sign('-');
  }
  if (s.code !== 0) { rmSync(tmp, { recursive: true, force: true }); throw new Error(`codesign failed: ${redact(s.out.trim())}`); }
  rmSync(appPath(), { recursive: true, force: true });
  renameSync(tmp, appPath());
  writeFileSync(join(dir, 'build.json'), JSON.stringify({ schema: 'fw-ioscap-build/1', builtAt: new Date().toISOString(), signedAs, identities: id?.count ?? 0 }, null, 1));
  say(`IOSCAP_BUILT ${appPath()}`);
  say(`signed: ${signedAs}${signedAs === 'ad hoc' ? ' (no Apple Development identity used: the Camera permission is asked again after each build)' : ' (stable: the Camera permission survives rebuilds)'}`);
  return 0;
}

function cmdStatus() {
  say(`app:       ${existsSync(appExe()) ? appPath() : `not built (${buildCmd()})`}`);
  if (existsSync(appExe())) {
    const r = runSync(exe('FW_CODESIGN', 'codesign'), ['-dvv', appPath()], { timeout: 20000 });
    say(`signature: ${signatureType(r.out)}`);
  }
  say(`swiftc:    ${runSync(exe('FW_SWIFTC', 'swiftc'), ['--version'], { timeout: 20000 }).code === 0 ? 'available' : 'missing'}`);
  const recs = existsSync(outDir()) ? readdirSync(outDir()).filter((f) => f.endsWith('.mov')) : [];
  say(`recordings: ${recs.length} in ${outDir()}`);
  say('camera permission: only the app can read it (record prints it; never asked -> it ends without opening anything)');
  return 0;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function readJson(p) { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; } }
function killApp(pidFile, sig) {
  const pid = Number((() => { try { return readFileSync(pidFile, 'utf8'); } catch { return ''; } })().trim());
  if (pid > 1) { try { process.kill(pid, sig); return pid; } catch {} }
  return null;
}

async function cmdRecord() {
  const refusal = timedInSlotRefusal('ioscap.mjs record');
  if (refusal) throw new Refused(refusal, 2);
  const owner = requireLease();
  const sec = parseSeconds(opt('seconds'));
  if (sec.error) throw new Usage(sec.error);
  const codec = opt('codec', 'h264');
  if (codec !== 'h264' && codec !== 'hevc') throw new Usage('--codec must be h264 or hevc');
  const label = opt('label', 'screen');
  const o = outPath({ out: opt('out'), owner, label: label === true ? 'screen' : label });
  if (o.error) throw new Usage(o.error);
  if (!existsSync(appExe())) throw new Refused(`the recorder app is not built: ${buildCmd(owner)}`);
  const mac = phoneGuard({ owner, allow: flag('allow-during-measure'), requireQuiet: flag('require-quiet'), log: say });
  const firstRun = flag('first-run');
  const files = sidecars(o.mov);
  mkdirSync(outDir(), { recursive: true });
  for (const f of [o.mov, files.result, files.frames, files.pid, files.log]) rmSync(f, { force: true });
  if (firstRun) say('FIRST RUN: macOS may now show the Camera prompt for "ioscap"; the user answers it (it waits up to 150 s)');
  say(`recording the iPhone screen for ${sec.seconds} s (the app waits up to 15 s for the phone) -> ${o.mov}`);
  const limitSec = recordTimeoutSec(sec.seconds, firstRun);
  const child = spawn(exe('FW_IOSCAP_OPEN', 'open'), openArgs({ mov: o.mov, seconds: sec.seconds, firstRun, codec, log: files.log }), { stdio: 'ignore' });
  let timedOut = false, interrupted = null;
  const stopApp = () => { if (killApp(files.pid, 'SIGTERM')) setTimeout(() => killApp(files.pid, 'SIGKILL'), 10000).unref(); };
  const onSig = (s) => () => { interrupted ??= s; stopApp(); };
  const handlers = ['SIGINT', 'SIGTERM', 'SIGHUP'].map((s) => [s, onSig(s)]);
  for (const [s, h] of handlers) process.on(s, h);
  const timer = setTimeout(() => { timedOut = true; stopApp(); }, limitSec * 1000);
  const code = await new Promise((res) => { child.on('error', (e) => res({ error: e })); child.on('exit', (c) => res({ code: c })); });
  clearTimeout(timer);
  for (const [s, h] of handlers) process.off(s, h);
  if (code.error) throw new Error(`could not start the app (${code.error.code || code.error.message})`);
  for (let i = 0; i < 20 && !existsSync(files.result); i++) await sleep(100); // the app writes it just before it exits
  const result = readJson(files.result);
  if (!result) throw new Error(`the app ended without a result file${timedOut ? ` (stopped after ${limitSec} s)` : interrupted ? ` (interrupted by ${interrupted})` : ''}; see ${files.log}`);
  say(`app: exit ${result.exit}, camera permission ${result.cameraPermission ?? '?'}: ${redact(result.message || '')}`);
  const out = { schema: SCHEMA, owner, label, seconds: sec.seconds, firstRun, codec, date: new Date().toISOString(), result, files: { mov: o.mov, ...files } };
  if (result.exit === 0 || existsSync(files.frames)) {
    const side = readJson(files.frames);
    if (side) out.summary = summarizeFrames(side);
  }
  out.mac = phoneMacRecord(mac);
  writeFileSync(files.summary, JSON.stringify(out, null, 1));
  if (out.summary) say(summaryLine(out.summary));
  if (existsSync(o.mov)) say(`IOSCAP_MOV=${o.mov}`);
  if (existsSync(files.frames)) say(`IOSCAP_FRAMES=${files.frames}`);
  say(`IOSCAP_SUMMARY=${files.summary}`);
  if (result.exit !== 0) return result.exit === 3 ? 3 : 1;
  return 0;
}

async function main() {
  if (cmd === 'status') return cmdStatus();
  if (cmd === 'selftest') return cmdSelftest();
  if (cmd === 'build') return cmdBuild();
  if (cmd === 'record') return cmdRecord();
  throw new Usage(USAGE);
}

main().then((c) => process.exit(c ?? 0), (e) => {
  console.error(redact(e?.message ?? String(e)));
  process.exit(e instanceof Usage ? 2 : e instanceof Refused ? e.code : 1);
});
