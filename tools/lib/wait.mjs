// Blocking waits for agents (user request 2026-10-01, ts-wait): one command that polls a condition
// with backoff and exits by itself, instead of `sleep N; status` or `until …; do sleep …; done` loops.
// CLIs: tools/wait.mjs (files, URLs, mirror servers, processes, git refs, a time) and `lock.mjs wait`
// (lock states). Both print one final line and exit 0 met, 3 timeout, 4 never (the condition can't
// be met any more, e.g. the watched process exited without the line), 1 usage.
//
// A condition is a function returning {met, state, never?, detail?}: `state` is a short description of
// what it sees now (logged to stderr when it changes, the last one is in the TIMEOUT line), `detail`
// the result printed on MET (e.g. the matching line), `never` the reason it can't be met any more.
// Waits read only (files, status, HTTP GET, `git` plumbing): they never take or refresh a lock or a
// queue place (to wait for your own turn use `lock.mjs acquire --wait` or `lock.mjs run`).
import { openSync, readSync, closeSync, fstatSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import http from 'node:http';
import https from 'node:https';

export const EXIT = Object.freeze({ met: 0, usage: 1, timeout: 3, never: 4 });

/** Poll intervals (ms): first, cap, growth. At most 1 check per second (a local file or status read). */
export const BACKOFF = Object.freeze({ minMs: 1000, maxMs: 10000, factor: 1.5 });

const sleepMs = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Poll `check` until it is met, can never be met, or `timeoutSec` passes (wall clock: a Mac that slept
 * through the deadline times out at the next check). `holdSec`: the condition must stay met that long
 * (re-checked at the minimum interval while it holds). `onChange(state, sec)` sees each new state.
 * Returns {result: 'met'|'timeout'|'never', state, detail, never, waitedSec, checks}.
 */
export async function pollUntil(check, { timeoutSec = 3600, holdSec = 0, minMs = BACKOFF.minMs, maxMs = BACKOFF.maxMs, factor = BACKOFF.factor, onChange, now = Date.now, sleep = sleepMs } = {}) {
  if (!(timeoutSec >= 0)) throw new Error(`--timeout must be a number of seconds >= 0 (got ${timeoutSec})`);
  if (!(holdSec >= 0)) throw new Error(`--for must be a number of seconds >= 0 (got ${holdSec})`);
  const t0 = now(), deadline = t0 + timeoutSec * 1000;
  let pause = minMs, last = null, metSince = null, checks = 0, r;
  const waited = () => Math.round((now() - t0) / 1000);
  for (;;) {
    checks++;
    try { r = await check(); } catch (e) { r = { met: false, state: `check failed: ${e.message || e}` }; }
    if (r.state !== last) { last = r.state; if (onChange) onChange(r.state, waited()); }
    if (r.never) return { result: 'never', state: r.state, never: r.never, waitedSec: waited(), checks };
    if (r.met) {
      metSince ??= now();
      if (now() - metSince >= holdSec * 1000) return { result: 'met', state: r.state, detail: r.detail, waitedSec: waited(), checks };
      pause = minMs; // holding: re-check at the floor, so a short break is seen
    } else { if (metSince !== null) pause = minMs; metSince = null; }
    const left = deadline - now();
    if (left <= 0) return { result: 'timeout', state: r.state, waitedSec: waited(), checks };
    const holdLeft = metSince !== null ? metSince + holdSec * 1000 - now() : Infinity;
    await sleep(Math.max(1, Math.min(pause, left, holdLeft)));
    if (metSince === null) pause = Math.min(maxMs, Math.round(pause * factor));
  }
}

/** Parse a duration "90", "90s", "10m", "2h" into seconds (NaN if not one). */
export function parseSec(v) {
  const m = String(v ?? '').trim().match(/^(\d+(?:\.\d+)?)\s*(s|m|h)?$/);
  if (!m) return NaN;
  return Number(m[1]) * ({ s: 1, m: 60, h: 3600 }[m[2] || 's']);
}

/** The process runs (a zombie, exited but not yet reaped by its parent, counts as exited). */
export function pidAlive(pid) {
  if (!(pid > 0)) return false;
  try { process.kill(pid, 0); } catch (e) { if (e.code !== 'EPERM') return false; }
  let stat;
  try { stat = execFileSync('ps', ['-o', 'stat=', '-p', String(pid)], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch (e) { stat = e.status === 1 ? '' : null; } // ps exits 1: no such process
  return stat === null ? true : stat !== '' && !stat.startsWith('Z');
}

// ---- conditions -------------------------------------------------------------------------------------

/**
 * A file exists (non-empty), or one of its lines matches `match` (a RegExp). Reads only what was appended
 * since the last check (a truncated or replaced file is read again from the start). `pid`: the process
 * writing it; once it is gone (and a last read found nothing) the wait ends with `never`.
 */
export function fileCondition(path, { match, pid } = {}) {
  let offset = 0, partial = '', ino = null, sig = null;
  // the last bytes read: if they changed, the file was rewritten in place (truncated, then written again)
  const tailSig = (fd, end) => { const n = Math.min(64, end); const b = Buffer.alloc(n); readSync(fd, b, 0, n, end - n); return b.toString('latin1'); };
  const scan = () => {
    let fd;
    try { fd = openSync(path, 'r'); } catch (e) { if (e.code === 'ENOENT') return { exists: false }; throw e; }
    try {
      const st = fstatSync(fd);
      if (st.ino !== ino || st.size < offset || (offset && tailSig(fd, offset) !== sig)) { ino = st.ino; offset = 0; partial = ''; }
      if (!match) return { exists: true, size: st.size };
      while (offset < st.size) {
        const buf = Buffer.alloc(Math.min(1 << 20, st.size - offset));
        const n = readSync(fd, buf, 0, buf.length, offset);
        if (n <= 0) break;
        offset += n;
        sig = tailSig(fd, offset);
        const lines = (partial + buf.toString('utf8', 0, n)).split('\n');
        partial = lines.pop();
        for (const l of lines) if (match.test(l)) return { exists: true, line: l };
      }
      // a last line without its newline counts too (a writer that is done may not end it)
      if (partial && match.test(partial)) { const l = partial; partial = ''; return { exists: true, line: l }; }
      return { exists: true, size: st.size };
    } finally { closeSync(fd); }
  };
  return () => {
    const alive = pid ? pidAlive(pid) : true; // sampled before the read: a line written just before exit still counts
    const s = scan();
    if (match ? s.line !== undefined : s.exists && s.size > 0) return { met: true, state: match ? 'matched' : `exists (${s.size} bytes)`, detail: match ? s.line : `${path} (${s.size} bytes)` };
    const state = !s.exists ? 'no such file yet' : match ? `no line matches ${match} yet (${s.size} bytes)` : 'empty';
    if (!alive) return { met: false, state, never: `process ${pid} exited and ${s.exists ? (match ? 'no line matched' : 'the file is empty') : 'the file never appeared'}` };
    return { met: false, state };
  };
}

/** One HTTP(S) GET: {status} or {error}. Self-signed certificates are accepted (the mirror's --https). */
export function httpGet(url, timeoutMs = 3000) {
  return new Promise((res) => {
    const u = new URL(url);
    const mod = u.protocol === 'https:' ? https : http;
    const req = mod.get(u, { rejectUnauthorized: false, timeout: timeoutMs, headers: { 'user-agent': 'fw-wait' } }, (r) => { r.resume(); res({ status: r.statusCode }); });
    req.on('timeout', () => { req.destroy(new Error(`no answer in ${timeoutMs} ms`)); });
    req.on('error', (e) => res({ error: e.code || e.message }));
  });
}

/** `url` answers with `status` (a number), or with any status < 500 when none is given. */
export function urlCondition(url, { status } = {}) {
  new URL(url); // throws on a bad URL before the first poll
  return async () => {
    const r = await httpGet(url);
    if (r.error) return { met: false, state: `no answer (${r.error})` };
    const ok = status ? r.status === status : r.status < 500;
    return { met: ok, state: `HTTP ${r.status}`, detail: `${url} HTTP ${r.status}` };
  };
}

/**
 * A mirror server (tools/serve.mjs --state <file>, which `fix.mjs serve <topic>` writes to
 * out/serve-<topic>.json) is listening: the state file names a live pid and its URL answers.
 * The state file is written atomically before MIRROR_URL is printed (I-014) and removed when the server
 * exits, so a stale one has a dead pid. `pid`: the server process; once it is gone the wait ends (never).
 */
export function serveCondition(stateFile, { pid } = {}) {
  return async () => {
    let s = null;
    try { s = JSON.parse(readFileSync(stateFile, 'utf8')); } catch {}
    const gone = pid && !pidAlive(pid);
    if (!s || !s.url) return gone ? { met: false, state: 'no state file', never: `process ${pid} exited before writing ${stateFile}` } : { met: false, state: 'no state file yet' };
    if (!pidAlive(s.pid)) return gone ? { met: false, state: 'stale state file', never: `process ${pid} exited; ${stateFile} names a dead pid ${s.pid}` } : { met: false, state: `stale state file (pid ${s.pid} is gone)` };
    const r = await httpGet(s.url);
    if (r.error) return { met: false, state: `pid ${s.pid} up, ${s.url} not answering (${r.error})` };
    const twin = s.httpTwin ? ` twin=http://localhost:${s.httpTwin}/` : '';
    return { met: true, state: `HTTP ${r.status}`, detail: `MIRROR_URL=${s.url}${twin} pid=${s.pid}${s.overlays?.length ? ` overlay=${s.overlays.join(',')}` : ''}` };
  };
}

/** Every pid in `pids` has exited. */
export function pidsCondition(pids) {
  return () => {
    const live = pids.filter(pidAlive);
    return live.length ? { met: false, state: `running: ${live.join(', ')}` } : { met: true, state: 'all exited', detail: `pid ${pids.join(', ')} exited` };
  };
}

/** The wall clock reached `atMs`. */
export function timeCondition(atMs) {
  return () => (Date.now() >= atMs ? { met: true, state: 'reached', detail: new Date(atMs).toISOString() } : { met: false, state: `until ${new Date(atMs).toISOString()}` });
}

const gitOut = (cwd, args) => { try { return execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return null; } };

/**
 * A git ref (default main) gets what you are waiting for: `contains` (a commit is an ancestor of it),
 * `path` (exists in its tree), `grep` (a RegExp matching a commit subject among its last `depth` commits),
 * or, with none of these, simply moves away from the sha it had when the wait started (`from`).
 */
export function gitCondition({ cwd = process.cwd(), ref = 'main', contains, path, grep, from, depth = 500 } = {}) {
  const start = from ?? gitOut(cwd, ['rev-parse', '--verify', '-q', `${ref}^{commit}`]);
  return () => {
    const head = gitOut(cwd, ['rev-parse', '--verify', '-q', `${ref}^{commit}`]);
    if (!head) return { met: false, state: `${ref} not found` };
    const at = `${ref} at ${head.slice(0, 7)}`;
    if (contains) {
      try { execFileSync('git', ['-C', cwd, 'merge-base', '--is-ancestor', contains, head], { stdio: 'ignore' }); return { met: true, state: at, detail: `${ref} (${head.slice(0, 7)}) contains ${contains}` }; } catch { return { met: false, state: at }; }
    }
    if (path) {
      const ok = gitOut(cwd, ['cat-file', '-t', `${head}:${path.replace(/^\.?\//, '')}`]);
      return ok ? { met: true, state: at, detail: `${ref} (${head.slice(0, 7)}) has ${path}` } : { met: false, state: at };
    }
    if (grep) {
      const log = gitOut(cwd, ['log', '-n', String(depth), '--format=%h %s', head]) || '';
      const hit = log.split('\n').find((l) => grep.test(l.slice(l.indexOf(' ') + 1)));
      return hit ? { met: true, state: at, detail: `${ref}: ${hit}` } : { met: false, state: at };
    }
    if (!start) return { met: true, state: at, detail: `${ref} appeared at ${head.slice(0, 7)}` };
    return head !== start ? { met: true, state: at, detail: `${ref} moved ${start.slice(0, 7)} -> ${head.slice(0, 7)}: ${gitOut(cwd, ['log', '-1', '--format=%s', head])}` } : { met: false, state: at };
  };
}

// ---- phone cooling (wait.mjs phone-temp; ts-phone-cool, user T-009) ---------------------------------

/**
 * `wait.mjs phone-temp` defaults: one battery read per minute (floor 30 s: protocol §5.5 keeps phone polling
 * gentle), at most 10 min of cooling, and the wait gives up after 3 failed reads in a row.
 */
export const PHONE_TEMP = Object.freeze({ everySec: 60, minEverySec: 30, timeoutSec: 600, maxFailedReads: 3, fallbackC: 38, autoMarginC: 0.5, morphCapC: 39.5 });

/** A temperature as text: 38 -> "38.0", 37.4 -> "37.4", 38.59 -> "38.59" (the battery reports 1/100 degC). */
export const fmtC = (x) => Number(x).toFixed(2).replace(/(\.\d)0$/, '$1');

/**
 * `--below <degC>`: a number in (0, 60), or 'auto' (resolved by autoBelowC: the last passing sentinel's battery
 * temperature today minus 0.5 degC, 38 when there is none).
 */
export function parseBelowC(v) {
  if (String(v ?? '').trim() === 'auto') return 'auto';
  const n = /^\s*\d+(\.\d+)?\s*$/.test(String(v ?? '')) ? Number(v) : NaN;
  if (!(n > 0 && n < 60)) throw new Error(`--below must be a battery temperature in °C between 0 and 60 (e.g. --below 38) or auto, got ${v}`);
  return n;
}

/** A run record's battery temperature (degC): `iphone.mjs run` keeps {start, end} (the end read, right after the run,
 *  counts; else the start), an older hand-annotated record one flat batteryInfo read. null when there is none. */
export function recordTempC(battery) {
  for (const b of [battery?.end, battery, battery?.start]) if (b && typeof b.temperatureC === 'number' && Number.isFinite(b.temperatureC)) return b.temperatureC;
  return null;
}

/**
 * The last passing heat sentinel today (incident I-047): the run records (*.json, one level) in `dirs` written since
 * local midnight whose meta.sentinel.pass is true (`iphone.mjs run`, protocol v2 §5.2) and whose meta.date is today,
 * newest by meta.date, with a battery temperature. Unreadable files and other JSON are skipped. Read-only.
 * -> {last: {file, at, temperatureC} | null, scanned (records read), dirs (the ones that exist)}
 */
export function lastPassingSentinel(dirs, { now = new Date() } = {}) {
  const midnight = new Date(now);
  midnight.setHours(0, 0, 0, 0);
  const from = midnight.getTime();
  const found = [], seen = [];
  let scanned = 0;
  for (const d of dirs) {
    let names;
    try { names = readdirSync(d); } catch { continue; }
    seen.push(d);
    for (const n of names) {
      if (!n.endsWith('.json')) continue;
      const p = join(d, n);
      let st, j;
      try { st = statSync(p); } catch { continue; }
      if (!st.isFile() || st.mtimeMs < from) continue;
      try { j = JSON.parse(readFileSync(p, 'utf8')); } catch { continue; }
      scanned++;
      const m = j && typeof j === 'object' ? j.meta : null;
      if (!m || !m.sentinel || m.sentinel.pass !== true) continue;
      const at = Number.isFinite(Date.parse(m.date)) ? Date.parse(m.date) : st.mtimeMs;
      if (at < from || at > now.getTime() + 60000) continue;
      const t = recordTempC(m.battery);
      if (t !== null) found.push({ file: p, at, temperatureC: t });
    }
  }
  found.sort((a, b) => b.at - a.at);
  return { last: found[0] ?? null, scanned, dirs: seen };
}

/**
 * `--below auto`: {belowC, source (lastPassingSentinel's last, or null: the 38 degC fallback), capped, scanned, dirs}.
 * `driver` 'M' (the next block's driver, `--driver M`): at most 39.5 degC (`capped` true when that cut it): M
 * sentinels failed at 41.5 degC while S/W passed up to 42.5 (iphone-runner, OBSERVED, small n; fixes/iphone-wave2).
 */
export function autoBelowC(dirs, { driver = null, ...opts } = {}) {
  const r = lastPassingSentinel(dirs, opts);
  const auto = r.last ? Math.round((r.last.temperatureC - PHONE_TEMP.autoMarginC) * 100) / 100 : PHONE_TEMP.fallbackC;
  const capped = driver === 'M' && auto > PHONE_TEMP.morphCapC;
  return { belowC: capped ? PHONE_TEMP.morphCapC : auto, source: r.last, capped, scanned: r.scanned, dirs: r.dirs };
}

/**
 * The phone's battery temperature is at or below `belowC`. `read()` is one battery read in batteryInfo's shape
 * (tools/lib/iphone-run.mjs: {temperatureC, ...} or {error}; only BATTERY_KEYS, never ids or serials). Each read
 * is its own state ("read N: X °C > Y °C"), so the wait logs one line per read. A check sooner than `minGapMs`
 * after the last read reuses it (pollUntil cuts its last pause to the deadline). No first reading, or
 * `maxFailed` failed reads in a row: never (the CLI prints UNAVAILABLE, exit 1).
 */
export function phoneTempCondition(belowC, { read, now = Date.now, minGapMs = PHONE_TEMP.minEverySec * 1000, maxFailed = PHONE_TEMP.maxFailedReads } = {}) {
  let n = 0, okReads = 0, failed = 0, lastAt = null, last = null;
  const limit = fmtC(belowC);
  return () => {
    if (last && now() - lastAt < minGapMs) return last;
    lastAt = now();
    n++;
    let b;
    try { b = read(); } catch (e) { b = { error: e.message || String(e) }; }
    const t = b && !b.error && typeof b.temperatureC === 'number' && Number.isFinite(b.temperatureC) ? b.temperatureC : null;
    if (t === null) {
      failed++;
      const why = b?.error || 'no Temperature in the battery reading';
      if (!okReads) last = { met: false, state: `read ${n}: failed (${why})`, never: `battery temperature unavailable (${why})` };
      else if (failed >= maxFailed) last = { met: false, state: `read ${n}: failed (${why})`, never: `battery temperature unavailable (${why}; ${failed} failed reads in a row)` };
      else last = { met: false, state: `read ${n}: failed (${why})` };
      return last;
    }
    okReads++;
    failed = 0;
    const met = t <= belowC;
    last = { met, state: `read ${n}: ${fmtC(t)} °C ${met ? '<=' : '>'} ${limit} °C`, detail: `phone at ${fmtC(t)} °C <= ${limit} °C` };
    return last;
  };
}

// ---- lock states (lock.mjs wait) --------------------------------------------------------------------

/**
 * Parse a `lock.mjs wait --until` condition. `owner` (--owner) fills in held-by / released-by / position.
 *   free                    no live holder (the next waiter may take it at once: to get it yourself, acquire --wait)
 *   idle                    no live holder and nobody queued
 *   held-by[:<owner>]       <owner> holds it (mine = held-by --owner <you>)
 *   released-by[:<owner>]   <owner> neither holds it nor waits for it (its hold or queued run is over)
 *   position<=N             --owner holds it or is #N or better in the queue (as status shows it)
 */
export function parseLockCondition(spec, owner) {
  const s = String(spec || '').trim();
  let m;
  if (s === 'free' || s === 'idle') return { kind: s };
  if (s === 'mine') { if (!owner) throw new Error('--until mine needs --owner <you>'); return { kind: 'held-by', owner }; }
  if ((m = s.match(/^(held-by|released-by)(?:[:=](.+))?$/))) {
    const o = m[2] || owner;
    if (!o) throw new Error(`--until ${m[1]} needs an owner: --until ${m[1]}:<owner> or --owner <owner>`);
    return { kind: m[1], owner: o };
  }
  if ((m = s.match(/^position\s*<=\s*(\d+)$/))) {
    if (!owner) throw new Error('--until position<=N needs --owner <you>');
    return { kind: 'position', owner, n: Number(m[1]) };
  }
  throw new Error(`unknown --until "${spec}": use free, idle, mine, held-by:<owner>, released-by:<owner> or position<=N (with --owner)`);
}

/** The readers of a shared group holder (ts-lock-share), or [] for an exclusive holder. */
const groupReaders = (h) => (h && h.shared === true && Array.isArray(h.readers) ? h.readers : []);
/** `o` holds the lock: the exclusive holder, or a reader of the shared group. */
const holds = (h, o) => !!h && (h.shared === true ? groupReaders(h).some((x) => x.owner === o) : h.owner === o);

/** One line for a lock status snapshot ({holder, stale, queue}). */
export function lockState(st) {
  const h = st.holder && !st.stale ? st.holder : null;
  const q = st.queue.map((w, i) => `${i + 1}. ${w.owner}${w.shared ? ' (shared)' : w.short ? ' (short)' : ''}`).join(', ');
  const rs = groupReaders(h);
  const who = !h ? 'free' : h.shared === true ? `shared by ${rs.length} reader${rs.length === 1 ? '' : 's'}: ${rs.map((x) => x.owner).join(', ') || '(none)'}` : `held by "${h.owner}"${h.short ? ' (short)' : ''}`;
  return `${who}${q ? `; queue: ${q}` : ''}`;
}

/** Evaluate a parsed lock condition on a status snapshot: {met, state, detail}. A shared group's readers each hold it. */
export function lockConditionMet(cond, st) {
  const h = st.holder && !st.stale ? st.holder : null;
  const state = lockState(st);
  const pos = (o) => (holds(h, o) ? 0 : st.queue.findIndex((w) => w.owner === o) + 1 || null);
  let met;
  if (cond.kind === 'free') met = !h;
  else if (cond.kind === 'idle') met = !h && !st.queue.length;
  else if (cond.kind === 'held-by') met = holds(h, cond.owner);
  else if (cond.kind === 'released-by') met = pos(cond.owner) === null;
  else if (cond.kind === 'position') { const p = pos(cond.owner); met = p !== null && p <= cond.n; }
  else throw new Error(`unknown lock condition ${cond.kind}`);
  return { met, state, detail: state };
}

/**
 * I-165: the --for that applies to `cond`. A hold of your own (mine, or held-by:<--owner>) does not end by itself, so
 * waiting for it to stay met only idles the device: such a wait ends as soon as it is met. Returns {holdSec, note}.
 */
export function lockHoldSec(cond, holdSec, owner) {
  if (holdSec > 0 && cond?.kind === 'held-by' && owner && cond.owner === owner) {
    return { holdSec: 0, note: `NOTE --for ${holdSec} is ignored with --until mine (held-by:${owner}): a hold of your own does not end by itself, so this wait ends as soon as it is yours (I-165). For a quiet window use --until idle --for N.` };
  }
  return { holdSec, note: null };
}

/** The --until spec as text, for the result line. */
export function lockConditionText(c) {
  return c.kind === 'position' ? `"${c.owner}" at position <= ${c.n}` : c.owner ? `${c.kind} "${c.owner}"` : c.kind;
}
