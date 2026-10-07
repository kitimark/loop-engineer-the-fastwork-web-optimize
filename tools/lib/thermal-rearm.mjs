// Probed re-arm of the phone's Serious thermal condition with our own tool (incident I-225; user T-228 #15: no manual
// Xcode steps; I-199 tools/thermal.mjs). Why: a Critical phone under the Serious condition ("phone-above-condition",
// I-201) stayed Critical after two blind stop+start re-arms (C-095, C-097); on 10-07 a stop, plain reads (Critical 0 min,
// Serious 1 min, Nominal 2 min at 34 C) and only then a new Serious start cleared it (C-098/C-099; OBSERVED, one episode,
// cause unknown: the real state lags after a real ceiling and outranks the induced condition). `iphone.mjs rearm` runs it:
//   0. one read (the serious profile); a phone that already fits is left alone (NOT-NEEDED, exit 0)
//   1. `thermal.mjs clear` (stops our running `set`, disables the active condition, Xcode's included)
//   2. the plain state (the fair profile's verdict: Nominal or Fair, induced No) at most once a minute, from the clear on,
//      for up to 10 min (--max-wait); no clear read: TIMEOUT, exit 13, nothing set
//   3. `thermal.mjs set serious` in the background, detached: it holds the condition after rearm exits (the block runner
//      ends it with `thermal.mjs clear`); a set replaces any other condition and ending it leaves none (I-199 stage 3)
//   4. settle 120 s (--settle; whatever a preflight settled before), then the profile read (startGate, force: it is the
//      hold's start read, so the hold's first run reads nothing more): CLEARED exit 0, STILL-CRITICAL exit 8 (Critical),
//      MISFIT exit 8 (any other misfit); the set stays running either way.
// Errors (a failed read at step 0, clear or set): ERROR, exit 1. No console step at any point.
import { spawn, execFile } from 'node:child_process';
import { mkdirSync, openSync, closeSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { sharedStateDir, REPO } from './paths.mjs';
import { readThermal, profileVerdict, refusalText, stateWords, startGate, ProfileRefusal, EXIT_PROFILE } from './thermal-profile.mjs';

export const EXIT_REARM_TIMEOUT = 13;
export const PROBE_EVERY_MS = 60000;
export const MAX_WAIT_MS = 10 * 60000;
export const SETTLE_MS = 120000;
const THERMAL = join(REPO, 'tools', 'thermal.mjs');
const SET_WAIT_MS = 150000; // thermal.mjs set's enable waits up to 120 s

const words = (r) => `${stateWords(r)}${typeof r?.battC === 'number' ? `, battery ${r.battC} C` : ''}`;
const sleepReal = (ms) => new Promise((res) => setTimeout(res, ms));

/** `thermal.mjs clear --owner <o>`: {line} (CLEARED / NONE, after STOPPED for our own running set), or throws. */
export function thermalClear({ owner, env = process.env } = {}) {
  return new Promise((res, rej) => {
    execFile(process.execPath, [THERMAL, 'clear', '--owner', owner], { cwd: REPO, env, encoding: 'utf8', timeout: 90000 }, (err, stdout, stderr) => {
      const out = `${stdout || ''}`.trim();
      if (err) return rej(new Error(`thermal.mjs clear exit ${typeof err.code === 'number' ? err.code : err.killed ? 'timeout' : err.code}: ${`${stderr || ''}`.trim().split('\n').pop() || out.split('\n').pop() || 'no output'}`));
      res({ line: out.split('\n').filter(Boolean).join('; ') });
    });
  });
}

/**
 * `thermal.mjs set serious --owner <o>` detached in the background, output to <state>/thermal/set-<owner>.log; resolves
 * once it prints SET (the device confirmed): {pid, log, line}. It keeps running after this process exits. Exits or no SET
 * within SET_WAIT_MS: throws (and stops it).
 */
export async function thermalSet({ owner, env = process.env, waitMs = SET_WAIT_MS } = {}) {
  const dir = join(sharedStateDir(), 'thermal');
  mkdirSync(dir, { recursive: true });
  const log = join(dir, `set-${String(owner).replace(/[^\w.-]/g, '_')}.log`);
  const fd = openSync(log, 'w');
  const child = spawn(process.execPath, [THERMAL, 'set', 'serious', '--owner', owner], { cwd: REPO, env, detached: true, stdio: ['ignore', fd, fd] });
  closeSync(fd);
  let exited = null;
  child.on('exit', (code, signal) => { exited = { code, signal }; });
  child.unref();
  const text = () => { try { return readFileSync(log, 'utf8'); } catch { return ''; } };
  for (const t0 = Date.now(); Date.now() - t0 < waitMs;) {
    const m = text().match(/^SET .*$/m);
    if (m) return { pid: child.pid, log, line: m[0] };
    if (exited) throw new Error(`thermal.mjs set exited ${exited.code ?? exited.signal} before SET: ${text().trim().split('\n').pop() || 'no output'}`);
    await sleepReal(100);
  }
  try { process.kill(child.pid, 'SIGTERM'); } catch {}
  throw new Error(`thermal.mjs set printed no SET within ${Math.round(waitMs / 1000)} s (stopped it): ${text().trim().split('\n').pop() || 'no output'}`);
}

/**
 * The re-arm sequence (header). Returns {outcome: not-needed|cleared|still-critical|misfit|timeout|error, code, reads,
 * set}. Seams: read, clear, set, sleep, now (tests: fake phone and clock). Never posts a console step.
 */
export async function rearm({ owner, hold = null, read = () => readThermal(), clear = () => thermalClear({ owner }), set = () => thermalSet({ owner }),
  sleep = sleepReal, now = Date.now, log = console.log, probeEveryMs = PROBE_EVERY_MS, maxWaitMs = MAX_WAIT_MS, settleMs = SETTLE_MS } = {}) {
  const reads = [];
  const done = (outcome, code, line, extra = {}) => { log(`${line} (exit ${code})`); return { outcome, code, reads, ...extra }; };
  // the profile read through the gate (no step, tool mode): it keeps a passing read as the hold's start read
  const gate = (r) => startGate({ profile: 'serious', owner, hold, force: true, read: async () => r, log, postStep: null, now, condition: 'tool' });

  const r0 = await read();
  reads.push(r0);
  const v0 = profileVerdict('serious', r0);
  if (v0.code === 1) return done('error', 1, `REARM ERROR: could not read the thermal state (${v0.why}); nothing cleared or set`);
  if (v0.code === 0) {
    await gate(r0);
    return done('not-needed', 0, `REARM NOT-NEEDED: phone is ${words(r0)} fits the serious profile; nothing cleared or set`);
  }
  const t = refusalText('serious', r0, v0);
  log(`REARM start: phone is ${words(r0)} (gate ${v0.profile} code ${v0.code}, reason ${t.reason}); clearing the condition, then reading the plain state once a minute for up to ${Math.round(maxWaitMs / 60000)} min (I-225)`);

  try { log(`REARM CLEAR ${(await clear()).line}`); } catch (e) { return done('error', 1, `REARM ERROR: thermal.mjs clear failed: ${e.message}; nothing set`); }

  const t0 = now();
  let last = null;
  for (let k = 0; ; k++) {
    const start = now();
    const r = await read();
    reads.push(r);
    last = r;
    const v = profileVerdict('fair', r);
    const n = Math.round((start - t0) / 60000);
    if (v.code === 0) { log(`REARM PROBE ${k + 1} (${n} min after the clear): phone is ${words(r)}: clear (Nominal or Fair, no condition)`); break; }
    const why = v.code === 4 ? 'a condition is still on after the clear: induced by Xcode' : v.why;
    log(`REARM PROBE ${k + 1} (${n} min after the clear): phone is ${words(r)}: not clear yet (${why})`);
    const next = t0 + (k + 1) * probeEveryMs;
    if (next - t0 > maxWaitMs) {
      return done('timeout', EXIT_REARM_TIMEOUT, `REARM TIMEOUT: the phone did not read Nominal or Fair with no condition within ${Math.round(maxWaitMs / 60000)} min of the clear (last: ${words(last)}); nothing set, no condition on; let it cool (node tools/wait.mjs phone-temp --below auto), then run rearm again`);
    }
    await sleep(Math.max(0, next - now()));
  }

  let s;
  try { s = await set(); } catch (e) { return done('error', 1, `REARM ERROR: thermal.mjs set serious failed: ${e.message}; no condition on`); }
  log(`REARM SET ${s.line} (thermal.mjs set pid ${s.pid}, log ${s.log}; it holds the condition until node tools/thermal.mjs clear --owner ${owner})`);
  log(`REARM SETTLE ${Math.round(settleMs / 1000)} s before the profile read`);
  await sleep(settleMs);

  const r = await read();
  reads.push(r);
  try {
    await gate(r);
    return done('cleared', 0, `REARM CLEARED: phone is ${words(r)}; the condition stays set by thermal.mjs (pid ${s.pid})`, { set: s });
  } catch (e) {
    if (!(e instanceof ProfileRefusal)) throw e;
    const line = e.message.split('\n')[0];
    const word = r.state === 'Critical' ? 'STILL-CRITICAL' : 'MISFIT';
    return done(word === 'STILL-CRITICAL' ? 'still-critical' : 'misfit', EXIT_PROFILE, `REARM ${word}: ${line}; the condition stays set by thermal.mjs (pid ${s.pid}; end it: node tools/thermal.mjs clear --owner ${owner})`, { set: s });
  }
}
