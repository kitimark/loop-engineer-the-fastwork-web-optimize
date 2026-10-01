// `node tools/iphone.mjs gesture <script.json> --owner <o>`: play a compiled gesture script on the iPhone.
// Strokes go to WebDriverAgent (tools/lib/wda.mjs, real OS-level touches); everything else goes over the
// WebKit Inspector Protocol (tools/lib/wip.mjs): the recorder (tools/lib/gesture-rec.mjs), marks, `until`
// polls and the pull-to-refresh check, reloads, and optionally the morph logger. NEW MEASUREMENT CODE (a new
// stimulus, research/architecture/finger-simulation.md): gesture numbers compare only with gesture numbers of
// the same script hash, never with `iphone.mjs scroll` or finger runs.
//
// Safety, before and during a run: the iphone lease (checked before every op, and its TTL must cover the
// run), Safari must be the app in front at the start (WDA activeAppInfo) and the page visible and portrait
// before every stroke (document.visibilityState, innerWidth), Safari must not show the certificate warning,
// every down stroke waits for a still page (two scrollY samples) above its pull-to-refresh guard (an up stroke
// within 150 px of the end waits too, and is sent flagged stillOk: false if the page never rests), WDA is never
// asked for /source or elements, and SIGINT/SIGTERM stop between strokes (a stroke in flight finishes: WDA
// plays it as one unit).
import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { openTab, safariTab, sleep } from './wip.mjs';
import { compileScript, condText, COMPILER_VERSION } from './gesture.mjs';
import { RECORDER_JS, READ_JS, STATE_JS, markJs, summarizeRun } from './gesture-rec.mjs';
import { status as wdaStatus, createSession, SAFARI } from './wda.mjs';
import { status as lockStatus } from './lock.mjs';
import { REPO } from './paths.mjs';
import { iphoneTarget, mirrorInfo, CERT_WARNING_TITLE, lanSafeText } from './iphone-url.mjs';
import { redact } from './redact.mjs';
import { readConfig, WDA_REF } from './wda-runner.mjs';

/** The files whose code shapes a gesture run's stimulus and numbers (review-gesture 6: recorded per run). */
export const TOOL_FILES = ['tools/iphone.mjs', 'tools/lib/gesture.mjs', 'tools/lib/gesture-run.mjs', 'tools/lib/gesture-rec.mjs', 'tools/lib/wda.mjs', 'tools/lib/wda-runner.mjs', 'tools/lib/wip.mjs'];

/**
 * Which tool version produced a run: the git HEAD of the checkout, whether those files differ from it, and
 * a sha256 (16 hex) of each file as it ran plus of the injected recorder, so two gesture results compare
 * only when these match (like the script hash for the stimulus).
 */
export function toolVersion(root = REPO, { morphLog } = {}) {
  const git = (...a) => { const r = spawnSync('git', ['-C', root, ...a], { encoding: 'utf8', timeout: 10000 }); return r.status === 0 ? r.stdout.trim() : null; };
  const h = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16);
  const files = {};
  for (const f of TOOL_FILES) { try { files[f] = h(readFileSync(join(root, f))); } catch { files[f] = null; } }
  const st = git('status', '--porcelain', '--', ...TOOL_FILES);
  const v = { gitHead: git('rev-parse', 'HEAD'), dirty: st === null ? null : st.length > 0, files, recorder: h(RECORDER_JS), compiler: COMPILER_VERSION };
  if (morphLog) { const f = resolve(morphLog); let sha = null; try { sha = h(readFileSync(f)); } catch {} v.morphLog = { file: f.startsWith(root + '/') ? f.slice(root.length + 1) : f, sha }; } // the --morph-log script shapes res.morph (review-gesture-2)
  return v;
}

/** The page over WIP. `match`: tab matcher for openTab (a host string after the first connect). `appId`: Safari's
 *  app on the proxy's list ("PID:<pid>" from WDA's activeAppInfo), so no other app's web view is picked (I-037). */
export function wipPage({ appId = null } = {}) {
  const o = appId ? { appId } : {};
  let c = null, host = null;
  const page = {
    async connect() {
      c = await openTab(() => true, o);
      host = new URL(await c.evaluate('location.href')).host;
      return page;
    },
    async state() {
      const macBefore = Date.now();
      const [y, maxY, ih, pageT, vis, iw] = await c.evaluate(STATE_JS);
      return { y, maxY, ih, pageT, vis, iw, macBefore, macAfter: Date.now() };
    },
    install: () => c.evaluate(RECORDER_JS),
    mark: (name) => c.evaluate(markJs(name)),
    async read() { const v = await c.evaluate(READ_JS); return v ? JSON.parse(v) : null; },
    href: () => c.evaluate('location.href'),
    /** location.reload() from the top (Safari restores the scroll position otherwise), reconnect to the new document. */
    async reload() {
      await c.evaluate(`window.__fwgOld = 1; scrollTo(0, 0); setTimeout(() => location.reload(), 400); 'ok'`);
      c.close();
      await sleep(1200);
      for (let i = 0; ; i++) {
        c = await openTab(host, o);
        if ((await c.evaluate('window.__fwgOld === undefined && document.readyState !== "loading"'))) break;
        c.close();
        if (i > 60) throw new Error('reload: the new document never became ready');
        await sleep(150);
      }
    },
    close: () => c?.close(),
  };
  return page;
}

class Abort extends Error {}
const holds = (cond, s) => (cond.kind === 'atEnd' ? s.y >= s.maxY - 2 : cond.kind === 'atTop' ? s.y <= 0 : cond.kind === 'yGte' ? s.y >= cond.y : false);

/**
 * Execute a compiled program. `wda`: a session from wda.mjs createSession (actions()); `page`: wipPage();
 * `check()`: throws to abort (lease lost, signal); `morph`: optional {install(seg), read(seg)}.
 * Resolves with {strokes, segments, untils, reloads, loops, morph, errors, aborted}; never loses the
 * recorded data: on an error it still reads the recorder and returns what it has (aborted = the reason).
 *
 * Before EVERY stroke (review-gesture 3, 5): the page must be visible (document.visibilityState, so Safari
 * is still the app in front and this tab the shown one: a notification, the app switcher or another app
 * makes it hidden) and in portrait (innerWidth = the script's screen width); otherwise the run stops with
 * nothing sent. Before a DOWN stroke the page must also be still: two scrollY samples `stillGapMs` apart
 * that differ by < 1 px (waiting up to `stillTimeoutMs` for momentum to end), both >= the stroke's pull guard
 * (a page still coasting toward the top would otherwise pass a one-sample check and reach 0 mid-stroke).
 */
export async function runProgram(prog, { wda, page, check = () => {}, morph = null, pollMs = 100, settleMs = 300, stillGapMs = 100, stillTimeoutMs = 5000, endZonePx = 150, log = (s) => console.error(s) }) {
  const screenW = prog.screen?.[0] ?? 430;
  const res = { strokes: [], segments: [], untils: [], reloads: [], loops: [], morph: [], errors: [], aborted: null };
  let seg = null;
  const sync = async () => { const s = await page.state(); if (seg) seg.sync.push([s.macBefore, s.pageT, s.macAfter]); return s; };
  const openSeg = async () => {
    await page.install();
    seg = { index: res.segments.length, sync: [], startWall: new Date().toISOString() };
    if (morph) { try { await morph.install(seg.index); } catch (e) { res.errors.push(`morph-log install: ${e.message}`); } }
    return sync();
  };
  const closeSeg = async () => {
    if (!seg) return;
    const s = seg; seg = null;
    try { await page.state().then((x) => s.sync.push([x.macBefore, x.pageT, x.macAfter])); } catch {}
    let buf = null;
    try { buf = await page.read(); } catch (e) { res.errors.push(`recorder read: ${e.message}`); }
    res.segments.push({ ...(buf || { frames: [], touches: [], marks: [] }), sync: s.sync, startWall: s.startWall });
    if (morph) { try { const m = await morph.read(s.index); if (m) res.morph.push(m); } catch (e) { res.errors.push(`morph-log read: ${e.message}`); } }
  };
  async function waitCond(cond, timeoutMs) {
    const t0 = Date.now();
    let s = await sync(), lastY = s.y, stableSince = Date.now();
    for (;;) {
      if (cond.kind === 'settled' ? Date.now() - stableSince >= settleMs : holds(cond, s)) return { ok: true, ms: Date.now() - t0, y: s.y };
      if (Date.now() - t0 >= timeoutMs) return { ok: false, ms: Date.now() - t0, y: s.y };
      check();
      await sleep(pollMs);
      s = await page.state();
      if (Math.abs(s.y - lastY) >= 1) { lastY = s.y; stableSince = Date.now(); }
    }
  }
  /** page.state() that also stops the run when the page is hidden or not portrait. */
  const shown = async (op) => {
    const s = await page.state();
    if (s.vis !== 'visible') throw new Abort(`the page is not visible (document.visibilityState "${s.vis}": Safari is no longer in front, or another tab is): stopped before ${op.id}, nothing was sent`);
    if (s.iw !== screenW) throw new Abort(`the page is ${s.iw} px wide, the script is for ${screenW} (portrait): rotated? stopped before ${op.id}, nothing was sent`);
    return s;
  };
  /** Two samples stillGapMs apart within 1 px, waiting up to stillTimeoutMs. */
  async function stillPair(op) {
    const t0 = Date.now();
    let a = await shown(op);
    for (;;) {
      await sleep(stillGapMs);
      const b = await shown(op);
      if (Math.abs(b.y - a.y) < 1) return { ok: true, ys: [a.y, b.y], waitedMs: Date.now() - t0 };
      if (Date.now() - t0 >= stillTimeoutMs) return { ok: false, ys: [a.y, b.y], waitedMs: Date.now() - t0 };
      check();
      a = b;
    }
  }
  async function runOps(ops, loop) {
    for (const op of ops) {
      check();
      if (op.op === 'stroke') {
        let guardY = null, stillWaitMs = null, stillOk = null;
        if (op.minScrollY !== null) {
          const p = await stillPair(op);
          guardY = p.ys; stillWaitMs = p.waitedMs;
          const lo = Math.min(...p.ys);
          const why = !p.ok ? `the page did not come to rest in ${stillTimeoutMs} ms (scrollY ${p.ys[0]} -> ${p.ys[1]})`
            : lo < op.minScrollY ? `needs scrollY >= ${op.minScrollY}, the page is at ${lo}` : null;
          if (why) {
            const msg = `pull-to-refresh guard: ${op.id} (down ${op.kin.px} px) ${why}`;
            if (loop) { log(`${msg}: ending the loop`); return 'break'; } // inside a runtime loop: nothing sent, the loop ends
            throw new Error(`${msg}; nothing was sent`);
          }
          stillOk = true;
        } else {
          // an up stroke in the end zone (the pin metric's zone) starts on a still page too, so the previous lift's
          // rubber band returning under the new finger is not counted as a touching reversal (review-gesture-2).
          // A page that never rests there (the pin itself) still gets the push, flagged stillOk: false.
          const s0 = await shown(op);
          if (s0.y >= s0.maxY - endZonePx) {
            const p = await stillPair(op);
            guardY = p.ys; stillWaitMs = p.waitedMs; stillOk = p.ok;
            if (!p.ok) log(`warning: ${op.id} (up, at the end) sent on a page still moving after ${stillTimeoutMs} ms (scrollY ${p.ys[0]} -> ${p.ys[1]}): stillOk false, its touching reversals may include the previous lift's rubber band`);
          }
        }
        const t = await wda.actions(op.actions);
        res.strokes.push({ id: op.id, seg: seg ? seg.index : null, kin: op.kin, sentAt: t.sentAt, returnedAt: t.returnedAt, httpMs: t.ms, guardY, stillWaitMs, stillOk });
      } else if (op.op === 'pause') {
        const end = Date.now() + op.ms;
        while (Date.now() < end) { check(); await sleep(Math.min(250, end - Date.now())); }
      } else if (op.op === 'until') {
        const r = await waitCond(op.cond, op.timeoutMs);
        res.untils.push({ cond: condText(op.cond), seg: seg?.index ?? null, ...r });
        if (!r.ok && !op.optional) throw new Error(`until ${condText(op.cond)} not reached in ${op.timeoutMs} ms (scrollY ${r.y})`);
      } else if (op.op === 'mark') {
        await page.mark(op.name);
      } else if (op.op === 'reload') {
        await closeSeg();
        await page.reload();
        const s = await openSeg();
        res.reloads.push({ seg: seg.index, readyPageMs: s.pageT, scrollAfterMs: op.scrollAfterMs });
        if (op.scrollAfterMs) await sleep(op.scrollAfterMs);
      } else if (op.op === 'loop') {
        let passes = 0, why = 'max';
        for (; passes < op.max; passes++) {
          if (holds(op.until, await sync())) { why = condText(op.until); break; }
          if ((await runOps(op.body, op)) === 'break') { why = 'pull guard'; passes++; break; }
        }
        res.loops.push({ until: condText(op.until), passes, ended: why });
      }
    }
    return null;
  }
  try {
    if (prog.ops[0]?.op !== 'reload') await openSeg();
    await runOps(prog.ops, null);
  } catch (e) {
    res.aborted = e instanceof Abort ? e.message : `error: ${e.message}`;
  } finally {
    await closeSeg();
  }
  return res;
}

/** `--morph-log <path to morph-log.mjs>`: install after each recorder install, read before each segment ends. */
function morphHook(script, { owner, label, outBase }) {
  const run = (args) => {
    const r = spawnSync(process.execPath, [script, ...args, '--owner', owner], { encoding: 'utf8', timeout: 60000 });
    if (r.status !== 0) throw new Error(`${script} ${args[0]} exited ${r.status ?? r.signal}: ${(r.stderr || r.stdout || '').trim().slice(0, 300)}`);
    return r.stdout;
  };
  return {
    install: () => run(['install']),
    read: (i) => {
      const out = `${outBase}-morph-seg${i}.json`;
      run(['read', '--label', `${label}-seg${i}`, '--out', out]);
      const j = JSON.parse(readFileSync(out, 'utf8'));
      return { seg: i, file: out, frames: j.frames, summary: j.summary };
    },
  };
}

/** argv -> {k: v} for every `--param k=v` (repeatable) plus --variant. */
export function cliParams(argv) {
  const p = {};
  argv.forEach((a, i) => {
    const v = a === '--param' ? argv[i + 1] : a.startsWith('--param=') ? a.slice(8) : null;
    if (v != null) { const m = v.match(/^([^=]+)=(.*)$/); if (!m) throw new Error(`--param wants k=v (got ${v})`); p[m[1]] = m[2]; }
  });
  const vi = argv.findIndex((a) => a === '--variant' || a.startsWith('--variant='));
  if (vi >= 0) p.variant = argv[vi].includes('=') ? argv[vi].split('=').slice(1).join('=') : argv[vi + 1];
  return p;
}

/**
 * The command. What it prints and the free-text strings it saves (errors, abort reason, foreground app) go
 * through redact() with wda-runner's config ids (Hard rule 12; review-gesture 2): e.g. the WDA runner's own
 * bundle id fw.wda.<team>.WebDriverAgentRunner when it is in front instead of Safari. The saved strings also go
 * through lanSafeText: a reconnect error names the mirror's host:port and the listed tabs' urls, and gesture
 * records are committed under research/ (Hard rule 12; review-t1a N1). The console keeps the real URL.
 */
export async function gestureCmd({ log = console.log, ...args }) {
  const scrub = (s) => redact(String(s), readConfig());
  try {
    return await gestureCmdInner({ ...args, log: (s) => log(scrub(s)), scrub });
  } catch (e) {
    throw new Error(scrub(e?.message ?? e));
  }
}

async function gestureCmdInner({ argv, arg, opt, flag, requireLease, port = Number(process.env.FW_IPHONE_PORT || 9222), log, scrub }) {
  if (!arg) throw new Error('usage: node tools/iphone.mjs gesture <script.json> --owner <topic> [--label l] [--variant v] [--param k=v]... [--morph-log <morph-log.mjs>] [--out file] [--dry-run]');
  const file = resolve(arg);
  const script = JSON.parse(readFileSync(file, 'utf8'));
  const prog = compileScript(script, { params: cliParams(argv) });
  const head = `${prog.name} v${prog.version} hash ${prog.hash.slice(0, 12)} params ${JSON.stringify(prog.params)}: ${prog.strokes.length} strokes, ~${Math.round(prog.estMs / 1000)} s`;
  if (flag('dry-run')) {
    log(head);
    for (const s of prog.strokes) log(`  ${s.id} ${s.dir} ${s.px} px / ${s.ms} ms ${s.profile}${s.holdMs ? ` hold ${s.holdMs}` : ''}: x ${s.x} y ${s.y0}->${s.y1}, peak ${s.peakPxPerS} px/s${s.plateauPxPerS ? ` (plateau ${s.plateauPxPerS} px/s)` : ''}, lift-off ${s.liftoffPxPerS} px/s`);
    log(`GESTURE_HASH ${prog.hash}`);
    return 0;
  }
  const owner = requireLease();
  const lease = () => { const s = lockStatus('iphone'); return s.holder && !s.stale && s.holder.owner === owner ? s.holder : null; };
  const h0 = lease();
  const left = h0.expiresAt ? Date.parse(h0.expiresAt) - Date.now() : Infinity;
  if (left < prog.estMs * 1.5 + 30000) throw new Error(`your iphone lease ends in ${Math.round(left / 1000)} s, the run needs ~${Math.round(prog.estMs / 1000)} s: node tools/lock.mjs renew iphone --owner ${owner} --ttl 900`);

  // Safari's tab: there, not the certificate warning, the lease's page
  const list = await (await fetch(`http://localhost:${port}/json`, { signal: AbortSignal.timeout(4000) })).json();
  const tab = safariTab(list); // never a blank web view of another app, never the first of several (I-037)
  if (CERT_WARNING_TITLE.test(tab.title || '')) throw new Error(`Safari shows its certificate warning ("${tab.title}") on ${tab.url}, not the page; run: node tools/iphone.mjs open <url> --owner ${owner} (incident I-003)`);
  let leaseUrl = h0.meta?.url;
  if (leaseUrl && !tab.url.startsWith(leaseUrl)) { try { leaseUrl = iphoneTarget(leaseUrl, await mirrorInfo(leaseUrl)).url; } catch {} }
  if (leaseUrl && !tab.url.startsWith(leaseUrl)) console.error(`warning: Safari shows ${tab.url}, your lease says ${h0.meta.url} (run: node tools/iphone.mjs open ${h0.meta.url} --owner ${owner})`);

  // WDA: up, and Safari in front
  const st = await wdaStatus().catch((e) => { throw new Error(`${e.message}\nStart it: node tools/iphone.mjs wda start --owner ${owner}`); });
  if (!st?.ready) throw new Error('WDA answers /status but is not ready');
  const session = await createSession();
  let page = null;
  const label = opt('label', 'run');
  const ts = Date.now();
  const out = resolve(REPO, opt('out', join('out', 'iphone', `${owner}-gesture-${label}-${ts}.json`)));
  mkdirSync(dirname(out), { recursive: true });
  let res;
  const stop = { reason: null };
  const onSig = (sig) => { stop.reason = `stopped by ${sig}`; };
  process.on('SIGINT', onSig); process.on('SIGTERM', onSig);
  try {
    const front = await session.activeApp();
    if (front?.bundleId !== SAFARI) throw new Error(`refusing: ${scrub(front?.bundleId || 'an unknown app')} is in front, not Safari. Bring Safari to the front (node tools/iphone.mjs wda start --owner ${owner} activates it)`);
    page = await wipPage({ appId: front.pid ? `PID:${front.pid}` : null }).connect(); // the proxy names apps by pid (I-037)
    log(`GESTURE ${head} on ${await page.href()}`);
    const morphLog = opt('morph-log');
    if (morphLog && !existsSync(morphLog)) throw new Error(`--morph-log ${morphLog}: no such file`);
    res = await runProgram(prog, {
      wda: session, page,
      morph: morphLog ? morphHook(resolve(morphLog), { owner, label, outBase: out.replace(/\.json$/, '') }) : null,
      check: () => { if (stop.reason) throw new Abort(stop.reason); if (!lease()) throw new Abort('lost the iphone lease (expired or released): stopped between strokes'); },
    });
  } finally {
    process.off('SIGINT', onSig); process.off('SIGTERM', onSig);
    page?.close();
    await session.close();
  }
  const doc = {
    meta: { kind: 'gesture', owner, label, date: new Date(ts).toISOString(), device: 'iPhone 15 Pro Max, iOS 26.6.1 Safari', tool: toolVersion(REPO, { morphLog: opt('morph-log') }), wda: { ref: readConfig().ref || WDA_REF, build: st.build?.version ?? null, os: st.os?.version ?? null }, script: file.startsWith(REPO) ? file.slice(REPO.length + 1) : file },
    program: { name: prog.name, version: prog.version, compiler: prog.compiler, hash: prog.hash, params: prog.params, estMs: prog.estMs, strokes: prog.strokes },
    run: res,
  };
  const saved = (s) => lanSafeText(scrub(s)); // the record is committed under research/ (review-t1a N1)
  res.errors = res.errors.map(saved);
  if (res.aborted) res.aborted = saved(res.aborted);
  doc.summary = summarizeRun(res.segments, res.strokes, { morph: res.morph });
  writeFileSync(out, JSON.stringify(doc));
  log(JSON.stringify({ aborted: res.aborted, strokes: res.strokes.length, segments: res.segments.length, loops: res.loops, touchmove: doc.summary.touchmove, motion: doc.summary.motion, toolbar: doc.summary.toolbar, pin: (({ perMark, ...p }) => p)(doc.summary.pin), overscroll: doc.summary.overscroll, momentum: doc.summary.momentum, morph: doc.summary.morph, errors: res.errors }, null, 1));
  log(`saved ${out}`);
  if (res.aborted) throw new Error(`gesture run aborted: ${res.aborted} (partial data saved in ${out})`);
  return 0;
}
