// `node tools/iphone.mjs gesture <script.json> --owner <o>`: play a compiled gesture script on the iPhone.
// Strokes go to WebDriverAgent (tools/lib/wda.mjs, real OS-level touches); everything else goes over the
// WebKit Inspector Protocol (tools/lib/wip.mjs): the recorder (tools/lib/gesture-rec.mjs), marks, `until`
// polls and the pull-to-refresh check, reloads, and optionally an in-page logger (--inject, on this same
// connection) or the morph logger (--morph-log, a separate process with its own connection: I-038), and optionally a
// WebKit Timeline recording on this same connection (--timeline, I-079: timelineRecorder). NEW MEASUREMENT CODE (a new
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
import { resolve, dirname, join, basename } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { openTab, safariTab, sleep, TIMELINE_START, timelineSyncJs, findTimeStamp } from './wip.mjs';
import { compileScript, condText, COMPILER_VERSION } from './gesture.mjs';
import { RECORDER_JS, READ_JS, STATE_JS, markJs, summarizeRun, countOnlySummary, countOnlyRun } from './gesture-rec.mjs';
import { status as wdaStatus, createSession, SAFARI, SESSION_SETTINGS } from './wda.mjs';
import { status as lockStatus, phoneGuard, phoneMacRecord, parseHeld, staleReason } from './lock.mjs';
import { REPO } from './paths.mjs';
import { iphoneTarget, mirrorInfo, CERT_WARNING_TITLE, lanSafeText } from './iphone-url.mjs';
import { tryResolveLanUrl } from './lan.mjs';
import { redact } from './redact.mjs';
import { readConfig, WDA_REF } from './wda-runner.mjs';

/** The files whose code shapes a gesture run's stimulus and numbers (review-gesture 6: recorded per run). */
export const TOOL_FILES = ['tools/iphone.mjs', 'tools/lib/gesture.mjs', 'tools/lib/gesture-run.mjs', 'tools/lib/gesture-rec.mjs', 'tools/lib/wda.mjs', 'tools/lib/wda-runner.mjs', 'tools/lib/wip.mjs'];

/**
 * Which tool version produced a run: the git HEAD of the checkout, whether those files differ from it, and
 * a sha256 (16 hex) of each file as it ran plus of the injected recorder, so two gesture results compare
 * only when these match (like the script hash for the stimulus).
 */
export function toolVersion(root = REPO, { morphLog, inject, toolFiles = TOOL_FILES } = {}) {
  const git = (...a) => { const r = spawnSync('git', ['-C', root, ...a], { encoding: 'utf8', timeout: 10000 }); return r.status === 0 ? r.stdout.trim() : null; };
  const h = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16);
  const files = {};
  for (const f of toolFiles) { try { files[f] = h(readFileSync(join(root, f))); } catch { files[f] = null; } }
  const st = git('status', '--porcelain', '--', ...toolFiles);
  const v = { gitHead: git('rev-parse', 'HEAD'), dirty: st === null ? null : st.length > 0, files, recorder: h(RECORDER_JS), compiler: COMPILER_VERSION };
  if (morphLog) { const f = resolve(morphLog); let sha = null; try { sha = h(readFileSync(f)); } catch {} v.morphLog = { file: f.startsWith(root + '/') ? f.slice(root.length + 1) : f, sha }; } // the --morph-log script shapes res.morph (review-gesture-2)
  if (inject) { const f = resolve(inject); let sha = null; try { sha = h(readFileSync(f)); } catch {} v.inject = { file: f.startsWith(root + '/') ? f.slice(root.length + 1) : f, sha }; } // the --inject module runs in the page
  return v;
}

/** The page over WIP. `appId`: Safari's app on the proxy's list ("PID:<pid>" from WDA's activeAppInfo), so no other
 *  app's web view is picked (I-037). `match`: the first connect's tab matcher (openTab; default any page); after it,
 *  reconnects match the tab by its host.
 *
 *  Survives another inspector connection to the tab (incident I-038): ios_webkit_debug_proxy keeps one client per
 *  page, so morph-log's install / read process took the tab, and the run's next command got a close (ws code 1001)
 *  instead of an answer (wip.mjs connect, CONFIRMED in the proxy's source); every later call used to time out on the
 *  dead socket. Now a call on a connection the proxy closed first reconnects to the tab (taking it back), and a call
 *  answered by the close is retried once on the new connection when it is idempotent (state, install, read, href,
 *  reload's request; mark too: the proxy does not forward a command it answers with a close, and at worst a mark is
 *  recorded twice). `evaluate` (--inject's expressions, unknown code) reconnects first but is never retried. The
 *  in-page recorder lives in the document, so a reconnect loses nothing. Every reconnect is listed in
 *  `page.reconnects` [{at, code, during}] (saved as run.reconnects). `port`: the proxy's tab port (default
 *  wip.mjs's, the phone's; the Simulator session's for sim.mjs gesture).
 *  `page.onConnection` (null unless set before connect()): awaited with every new connection to the tab (the first
 *  connect, each reload's, each I-038 reconnect), before it is used: --timeline (I-079) re-sends its Timeline start on it. */
export function wipPage({ appId = null, port = null, match = () => true, log = (s) => console.error(s) } = {}) {
  const o = { ...(appId ? { appId } : {}), ...(port ? { port } : {}) };
  let c = null, host = null;
  const reconnects = [];
  const hooked = async (conn) => { if (page.onConnection) await page.onConnection(conn); };
  const live = async (during) => { // the proxy closed it (not we): reconnect to the same tab
    if (!c || !c.closed || c.closed.self) return c;
    const was = c.closed;
    log(`inspector connection closed by the proxy (code ${was.code}) before ${during}: reconnecting (I-038)`);
    c = await openTab(host, o);
    reconnects.push({ at: new Date().toISOString(), code: was.code, during });
    await hooked(c);
    return c;
  };
  const call = async (expr, during, { retry = true } = {}) => {
    await live(during);
    try { return await c.evaluate(expr); } catch (e) {
      if (!retry || !e?.closed || c.closed?.self) throw e;
      await live(during);
      return c.evaluate(expr);
    }
  };
  const page = {
    reconnects,
    onConnection: null,
    async connect() {
      c = await openTab(match, o);
      host = new URL(await c.evaluate('location.href')).host;
      await hooked(c);
      return page;
    },
    async state() {
      const macBefore = Date.now();
      const [y, maxY, ih, pageT, vis, iw] = await call(STATE_JS, 'state');
      return { y, maxY, ih, pageT, vis, iw, macBefore, macAfter: Date.now() };
    },
    install: () => call(RECORDER_JS, 'install'),
    evaluate: (expr) => call(expr, 'inject', { retry: false }), // --inject's expressions, on this connection (I-038)
    mark: (name) => call(markJs(name), 'mark'),
    async read() { const v = await call(READ_JS, 'read'); return v ? JSON.parse(v) : null; },
    href: () => call('location.href', 'href'),
    /** location.reload() from the top (Safari restores the scroll position otherwise), reconnect to the new document. */
    async reload() {
      await call(`window.__fwgOld = 1; scrollTo(0, 0); setTimeout(() => location.reload(), 400); 'ok'`, 'reload');
      c.close();
      await sleep(1200);
      for (let i = 0; ; i++) {
        c = await openTab(host, o);
        if ((await c.evaluate('window.__fwgOld === undefined && document.readyState !== "loading"'))) break;
        c.close();
        if (i > 60) throw new Error('reload: the new document never became ready');
        await sleep(150);
      }
      await hooked(c);
    },
    close: () => c?.close(),
  };
  return page;
}

class Abort extends Error {}
const repoRel = (f) => (f.startsWith(REPO + '/') ? f.slice(REPO.length + 1) : f);
const holds = (cond, s) => (cond.kind === 'atEnd' ? s.y >= s.maxY - 2 : cond.kind === 'atTop' ? s.y <= 0 : cond.kind === 'yGte' ? s.y >= cond.y : false);

/**
 * Execute a compiled program. `wda`: a session from wda.mjs createSession (actions()); `page`: wipPage();
 * `check()`: throws to abort (lease lost, signal); `morph`: optional {install(seg), read(seg)}; `inject`: optional
 * loadInject() result, evaluated through page.evaluate on the run's own connection (its reads land in res.inject,
 * which exists only then, and with morph: true also in res.morph); `timeline`: optional timelineRecorder() (--timeline,
 * I-079), begun after each segment's installs and finished before its recorder read (res.timeline exists only then).
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
export async function runProgram(prog, { wda, page, check = () => {}, morph = null, inject = null, timeline = null, idleAfterReloadMs = 0, pollMs = 100, settleMs = 300, stillGapMs = 100, stillTimeoutMs = 5000, endZonePx = 150, log = (s) => console.error(s) }) {
  const screenW = prog.screen?.[0] ?? 430;
  const res = { strokes: [], segments: [], untils: [], reloads: [], loops: [], morph: [], errors: [], aborted: null };
  if (inject) res.inject = [];
  if (timeline) res.timeline = []; // --timeline (I-079): timelineRecorder(); one entry per segment
  if (idleAfterReloadMs > 0) res.idleAfterReloadMs = idleAfterReloadMs; // I-203: only when asked (records unchanged otherwise)
  let seg = null;
  const sync = async () => { const s = await page.state(); if (seg) seg.sync.push([s.macBefore, s.pageT, s.macAfter]); return s; };
  const openSeg = async () => {
    await page.install();
    seg = { index: res.segments.length, sync: [], startWall: new Date().toISOString() };
    if (morph) { try { await morph.install(seg.index); } catch (e) { res.errors.push(`morph-log install: ${e.message}`); } }
    if (inject) { try { await page.evaluate(inject.install(seg.index)); } catch (e) { res.errors.push(`inject install: ${e.message || JSON.stringify(e)}`); } }
    if (timeline) { try { await timeline.begin(seg.index); } catch (e) { res.errors.push(`timeline start: ${e.message || JSON.stringify(e)}`); } }
    return sync();
  };
  const closeSeg = async () => {
    if (!seg) return;
    const s = seg; seg = null;
    try { await page.state().then((x) => s.sync.push([x.macBefore, x.pageT, x.macAfter])); } catch {}
    if (timeline) { // before the recorder read, so the reads are not recorded
      try {
        const t = await timeline.finish();
        if (t) { res.timeline.push(t); for (const e of t.errors) res.errors.push(`timeline seg ${t.seg}: ${e}`); }
      } catch (e) { res.errors.push(`timeline stop: ${e.message || JSON.stringify(e)}`); }
    }
    let buf = null;
    try { buf = await page.read(); } catch (e) { res.errors.push(`recorder read: ${e.message}`); }
    res.segments.push({ ...(buf || { frames: [], touches: [], marks: [] }), sync: s.sync, startWall: s.startWall });
    if (morph) { try { const m = await morph.read(s.index); if (m) res.morph.push(m); } catch (e) { res.errors.push(`morph-log read: ${e.message}`); } }
    if (inject) {
      try {
        let v = await page.evaluate(inject.read(s.index));
        if (typeof v === 'string') { try { v = JSON.parse(v); } catch {} }
        res.inject.push({ seg: s.index, name: inject.name, value: v ?? null });
        if (inject.morph && v && Array.isArray(v.frames)) res.morph.push({ seg: s.index, frames: v.frames, summary: v.summary ?? null });
      } catch (e) { res.errors.push(`inject read: ${e.message || JSON.stringify(e)}`); }
    }
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
        // I-203 --idle-after-reload: after the script's first reload is ready (readyPageMs) and its scrollAfterMs, before
        // the next step; not an op, so not in the program hash; polls check() like a pause
        if (idleAfterReloadMs > 0 && op === prog.ops[0]) {
          res.reloads.at(-1).idleAfterMs = idleAfterReloadMs;
          const end = Date.now() + idleAfterReloadMs;
          while (Date.now() < end) { check(); await sleep(Math.min(250, end - Date.now())); }
        }
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

/**
 * `--inject <logger.mjs>` (I-038): an in-page logger evaluated on the gesture tool's OWN inspector connection, so no
 * second connection opens and closes next to it (with --morph-log's separate process, the run's connection stopped
 * answering after the hook's connection closed: 0 strokes, 3 of 3 on the phone; OBSERVED, cause unknown).
 * The module exports `install` and `read`, each an expression string or a function ({seg, label}) returning one;
 * optional `name` (default: the file name) and `morph: true`. install runs right after each recorder install (every
 * page load), read right after each segment's recorder read; read's value (a JSON string is parsed) is stored as
 * run.inject[] {seg, name, value}, and with morph: true its {frames, summary} also feed run.morph / summary.morph
 * (frames in morph-log's format [t, dt, scrollY, --morph, classes]).
 */
export async function loadInject(file, { label = 'run' } = {}) {
  const f = resolve(file);
  if (!existsSync(f)) throw new Error(`--inject ${file}: no such file`);
  const m = await import(pathToFileURL(f).href);
  const expr = (k) => {
    const v = m[k];
    if (typeof v === 'string') return () => v;
    if (typeof v === 'function') {
      return (seg) => {
        const e = v({ seg, label });
        if (typeof e !== 'string') throw new Error(`--inject ${file}: ${k}() must return an expression string`);
        return e;
      };
    }
    throw new Error(`--inject ${file}: export ${k} (an expression string, or a function ({seg, label}) returning one)`);
  };
  return { file: f, name: typeof m.name === 'string' ? m.name : basename(f).replace(/\.m?js$/, ''), morph: m.morph === true, install: expr('install'), read: expr('read') };
}

/**
 * `--timeline <out.json>` (incident I-079): a WebKit Timeline recording on the run's OWN inspector connection (one
 * client per page, I-038), for attribution: which records (style, layout, paint, composite, script) fall in which frame.
 * Per segment (page load): begin() sends wip.mjs TIMELINE_START (Page.disable, Page.enable, Timeline.enable,
 * setInstruments [Timeline], Timeline.start depth 1; F-047) on the current connection, then a sync mark; every new
 * connection while a segment is open (an I-038 reconnect) gets the sequence again (wipPage onConnection): a new
 * stopwatch, a new time base, a new "epoch" with its own sync mark. A reload closes the segment first, and the next
 * segment's begin() arms the reloaded page's connection. finish() takes an end mark, sends Timeline.stop, waits for
 * Timeline.recordingStopped (stopWaitMs) plus drainMs, and writes the segment's file: segment 0 at `file`, segment i
 * at <file without .json>-seg<i>.json, in the format of the existing readers (iphone-runner's ssan.mjs, srwin-sim.mjs,
 * pacing-v3-load.mjs): {syncT, syncTL, recs} with Timeline ms = page ms + (syncTL * 1000 - syncT) = page ms + offsetMs,
 * the page clock being the gesture recorder's (performance.now(); its frames and run.segments[].sync). Also: kind
 * 'gesture-timeline', seg, offsetMs, end {syncT, syncTL, offsetMs} (the end mark, on the last epoch's base: a drift
 * check), stopped, protocol, startWall, errors, and only after a reconnect `epochs` [{syncT, syncTL, offsetMs, recs,
 * errors}] for epochs 1.. (their records stay on their own base, NOT in the top-level recs: a reader that knows only
 * {syncT, syncTL, recs} sees epoch 0 alone, correctly aligned). The file goes through lanSafeText (stack urls carry
 * the mirror's LAN host; Hard rule 12). finish() returns {seg, file, records, syncT, syncTL, offsetMs, end, epochs,
 * stopped, errors} for run.timeline.
 */
export function timelineRecorder({ file, stopWaitMs = 3000, drainMs = 500, log = (s) => console.error(s) }) {
  let conn = null, active = null;
  const errText = (e) => e?.message || JSON.stringify(e);
  const segFile = (i) => (i === 0 ? file : file.replace(/(\.json)?$/i, `-seg${i}.json`));
  const off = (t, tl) => (typeof t === 'number' && typeof tl === 'number' ? tl * 1000 - t : null);
  async function arm(c) {
    const k = active.epochs.length;
    const ep = { recs: [], syncName: `fwtl-s${active.seg}-e${k}`, syncT: null, errors: [], live: true, stopped: false, conn: c };
    active.epochs.push(ep);
    c.on((m) => {
      if (!ep.live) return;
      if (m.method === 'Timeline.eventRecorded' && m.params?.record) ep.recs.push(m.params.record);
      else if (m.method === 'Timeline.recordingStopped') ep.stopped = true;
    });
    for (const [method, params] of TIMELINE_START) { try { await c.send(method, params); } catch (e) { ep.errors.push(`${method}: ${errText(e)}`); } }
    try { ep.syncT = await c.evaluate(timelineSyncJs(ep.syncName)); } catch (e) { ep.errors.push(`sync mark: ${errText(e)}`); }
  }
  const rec = {
    file, segFile,
    async onConnection(c) {
      conn = c;
      if (!active) return;
      log(`timeline: a new inspector connection in segment ${active.seg}: Timeline start re-sent on it (epoch ${active.epochs.length}, a new time base)`);
      await arm(c);
    },
    async begin(seg) {
      active = { seg, epochs: [], startWall: new Date().toISOString() };
      if (conn) await arm(conn);
    },
    async finish() {
      const a = active;
      if (!a) return null;
      active = null;
      const errors = [];
      const last = a.epochs.at(-1);
      let end = null;
      if (last) {
        const c = last.conn, endName = `fwtl-s${a.seg}-end`;
        let endT = null;
        try { endT = await c.evaluate(timelineSyncJs(endName)); } catch (e) { errors.push(`end mark: ${errText(e)}`); }
        try { await c.send('Timeline.stop'); } catch (e) { errors.push(`Timeline.stop: ${errText(e)}`); }
        const t0 = Date.now();
        while (!last.stopped && !c.closed && Date.now() - t0 < stopWaitMs) await sleep(50);
        await sleep(drainMs);
        const tl = endT === null ? null : findTimeStamp(last.recs, endName);
        end = { syncT: endT, syncTL: tl, offsetMs: off(endT, tl) };
        if (endT !== null && tl === null) errors.push('the end mark\'s TimeStamp record was not recorded');
      } else errors.push('no inspector connection to record on');
      for (const ep of a.epochs) ep.live = false;
      const epochs = a.epochs.map((ep, k) => {
        const syncTL = ep.syncT === null ? null : findTimeStamp(ep.recs, ep.syncName);
        const e = [...ep.errors];
        if (!ep.recs.length) e.push('no Timeline records');
        else if (syncTL === null) e.push('the sync mark\'s TimeStamp record was not recorded: these records can\'t be aligned to the page clock');
        return { syncT: ep.syncT, syncTL, offsetMs: off(ep.syncT, syncTL), recs: ep.recs, errors: k ? e.map((x) => `epoch ${k}: ${x}`) : e };
      });
      const e0 = epochs[0] || { syncT: null, syncTL: null, offsetMs: null, recs: [], errors: [] };
      const allErrors = [...epochs.flatMap((e) => e.errors), ...errors];
      const doc = {
        kind: 'gesture-timeline', version: 1, seg: a.seg, syncT: e0.syncT, syncTL: e0.syncTL, offsetMs: e0.offsetMs, recs: e0.recs, end,
        stopped: last ? last.stopped : false, protocol: TIMELINE_START, startWall: a.startWall,
        clock: 'syncT: page performance.now() ms (the gesture recorder\'s clock); syncTL: Timeline seconds (stopwatch from Page.enable); Timeline ms = page ms + offsetMs',
        errors: allErrors,
        ...(epochs.length > 1 ? { epochs: epochs.slice(1).map(({ errors: _, ...e }) => e) } : {}),
      };
      const f = segFile(a.seg);
      try { mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, lanSafeText(JSON.stringify(doc))); } catch (e) { allErrors.push(`write ${f}: ${e.message}`); }
      if (epochs.length > 1) log(`timeline: segment ${a.seg} has ${epochs.length} epochs (reconnects): ${f}'s top-level recs are epoch 0's, the rest are in its epochs[]`);
      return { seg: a.seg, file: f, records: e0.recs.length, syncT: e0.syncT, syncTL: e0.syncTL, offsetMs: e0.offsetMs, end, epochs: epochs.length, stopped: doc.stopped, errors: allErrors };
    },
  };
  return rec;
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

/** The /appium/settings echo WDA returned for this run's session (I-042): the values of SESSION_SETTINGS' keys as WDA
 *  applied them, and how many settings it echoed (the rest are WDA defaults, not recorded). */
export function settingsEcho(echo) {
  const e = echo && typeof echo === 'object' ? echo : {};
  const o = {};
  for (const k of Object.keys(SESSION_SETTINGS)) o[k] = k in e ? e[k] : null;
  return { ...o, echoed: Object.keys(e).length };
}

/**
 * I-112 (fix-nav-morph, P-091): what to plan per phone G run. The program's own estimate (strokes, pauses) leaves out
 * the reload, until-waits, settles, the Timeline arm and the save: a ~44 s program took 125-135 s with --timeline
 * (OBSERVED in our setup). Plan max(150 s, 3x the estimate) per run; `gesture --dry-run` prints it (GESTURE_BUDGET_S),
 * the lease check uses it, and a run inside its own chrome-measure hold refuses to start without that much time left.
 */
export const G_RUN_MIN_BUDGET_MS = 150000;
export const runBudgetMs = (estMs, idleMs = 0) => Math.max(G_RUN_MIN_BUDGET_MS, Math.round(3 * (Number(estMs) || 0))) + (Number(idleMs) || 0); // I-203: + --idle-after-reload

/**
 * I-203 (P-129's L arm): `--idle-after-reload <ms>` (whole ms 0-60000, default 0 = no idle) from argv. An idle after the
 * script's own first reload (after readyPageMs, before the next step) that is not part of the program, so the script and
 * its hash stay the same. Refused (an Error with exitCode 2) when malformed or out of range, or when > 0 and the
 * program does not start with a reload.
 */
export function idleAfterReloadMs(argv, prog) {
  const i = argv.findIndex((a) => a === '--idle-after-reload' || a.startsWith('--idle-after-reload='));
  if (i < 0) return 0;
  const v = argv[i].includes('=') ? argv[i].split('=').slice(1).join('=') : argv[i + 1];
  const usage = (msg) => Object.assign(new Error(msg), { exitCode: 2 });
  if (typeof v !== 'string' || !/^\d+$/.test(v) || Number(v) > 60000) throw usage(`--idle-after-reload wants whole ms 0-60000 (got ${v === undefined ? 'nothing' : JSON.stringify(v)}), e.g. --idle-after-reload 20000 (I-203)`);
  const ms = Number(v);
  if (ms > 0 && prog.ops[0]?.op !== 'reload') throw usage(`--idle-after-reload needs a script whose first step is a reload (${prog.name}'s first step is ${prog.ops[0]?.op ?? 'nothing'}): it idles after that reload's page is ready (I-203)`);
  return ms;
}

/**
 * I-112: ms left in this process's own chrome-measure hold ($FW_LOCK_HELD names its token: a `lock.mjs run`), from a
 * lease's expiresAt or a run's declared --max-seconds (meta.expectSec) since acquiredAt; null when the process is not
 * in its own live hold or the hold declared no end.
 */
export function ownHoldLeftMs(s = lockStatus('chrome-measure'), held = process.env.FW_LOCK_HELD, now = Date.now()) {
  const h = s?.holder;
  if (!h || s.stale || staleReason(h, now)) return null;
  const mine = parseHeld(held)['chrome-measure'];
  if (!mine || mine !== h.token) return null;
  const ends = [h.expiresAt && Date.parse(h.expiresAt), h.meta?.expectSec > 0 && Date.parse(h.acquiredAt) + h.meta.expectSec * 1000].filter((x) => Number.isFinite(x));
  return ends.length ? Math.min(...ends) - now : null;
}

/**
 * Where a gesture run plays: the phone (default; the iphone lease and the phone measure guard guard it, I-056) or the Simulator (`sim.mjs gesture`: a
 * Simulator session in the caller's own chrome-measure hold guards it, strokes go to WDA-sim). A target is
 * {device, outDir, wdaBase, toolFiles, wdaHint, openHint(url), preflight(estMs, {budgetMs}) -> {pageUrl, pageSource},
 *  lost() -> reason | null (checked before every op), extra() -> more meta fields}.
 */
export function phoneTarget({ owner, allowDuringMeasure = false, requireQuiet = false, warmup = false, log = console.log, profileGate = null }) {
  const lease = () => { const s = lockStatus('iphone'); return s.holder && !s.stale && s.holder.owner === owner ? s.holder : null; };
  let mac = null, prof = null;
  const budget = (budgetMs) => {
    const h0 = lease();
    const left = h0.expiresAt ? Date.parse(h0.expiresAt) - Date.now() : Infinity;
    // I-112: the whole run (reload, untils, Timeline, save), not only the strokes
    if (left < budgetMs + 30000) throw new Error(`your iphone lease ends in ${Math.round(left / 1000)} s, the run needs ~${Math.round(budgetMs / 1000)} s: node tools/lock.mjs renew iphone --owner ${owner} --ttl 900`);
    const hold = ownHoldLeftMs();
    if (hold !== null && hold < budgetMs) throw new Error(`your chrome-measure hold ends in ${Math.max(0, Math.round(hold / 1000))} s, a gesture run needs up to ~${Math.round(budgetMs / 1000)} s (GESTURE_BUDGET_S, I-112): run it in a new hold`);
    return { pageUrl: h0.meta?.url ?? null, pageSource: 'your lease' };
  };
  return {
    device: 'iPhone 15 Pro Max, iOS 26.6.1 Safari', outDir: 'iphone', wdaBase: undefined, toolFiles: TOOL_FILES,
    wdaHint: `node tools/iphone.mjs wda start --owner ${owner}`, openHint: (u) => `node tools/iphone.mjs open ${u} --owner ${owner}`,
    preflight(estMs, { budgetMs = runBudgetMs(estMs) } = {}) {
      // I-056: the measure guard of iphone.mjs run (lib/lock.mjs phoneGuard): no G run beside someone else's normal
      // hold; the runner's own hold passes; shared jobs pass with a NOTE and the Mac state in meta.mac, unless
      // --require-quiet or FW_PHONE_REQUIRE_QUIET=1
      mac = phoneGuard({ owner, allow: allowDuringMeasure, requireQuiet, warmup, log });
      // I-186: the thermal profile (--profile serious|fair) at the hold's start (one read per hold), after the guard and
      // before the lease and hold budget checks (so they count its ~25 s), WDA and Safari; without a gate: synchronous
      if (profileGate) return profileGate(owner).then((p) => { prof = p; return budget(budgetMs); });
      return budget(budgetMs);
    },
    lost: () => (lease() ? null : 'lost the iphone lease (expired or released): stopped between strokes'),
    extra: () => ({ ...(mac ? { mac: phoneMacRecord(mac) } : {}), ...(prof ? { profile: prof.record(), profileDrift: null } : {}) }), // I-056: shared jobs and load1 on the Mac at start and end; I-186: the thermal profile (end / drift stamped by the hold's end read)
    saved: (file) => (prof ? prof.saved(file) : null), // I-186: listed for the hold's end read
  };
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
    throw Object.assign(new Error(scrub(e?.message ?? e)), e?.exitCode === 2 ? { exitCode: 2 } : {}); // I-203: a usage refusal keeps exit 2 (other codes unchanged: exit 1)
  }
}

async function gestureCmdInner({ argv, arg, opt, flag, requireLease, port = Number(process.env.FW_IPHONE_PORT || 9222), log, scrub, target = null, profileGate = null, countOnly,
  usage = 'node tools/iphone.mjs gesture <script.json> --owner <topic> [--label l] [--variant v] [--param k=v]... [--inject <logger.mjs> | --morph-log <morph-log.mjs>] [--timeline <out.json>] [--idle-after-reload <ms>] [--out file] [--dry-run]' }) {
  if (!arg) throw new Error(`usage: ${usage}`);
  // I-184: --count-only is the Simulator's (sim.mjs passes countOnly); it runs without a host gate, so nothing timed
  if (flag('count-only') && countOnly === undefined) throw new Error('--count-only is for node tools/sim.mjs gesture only (I-184): the phone stamps its own frames and runs in its own hold (I-056)');
  if (countOnly && ['timeline', 'morph-log'].some((k) => argv.some((a) => a === `--${k}` || a.startsWith(`--${k}=`)))) throw new Error(`--count-only refuses ${argv.some((a) => a.startsWith('--timeline')) ? '--timeline (a WebKit Timeline is timing)' : '--morph-log (its frames are timing)'}: a count-only run has no host gate, so it records no timing (I-184)`);
  const file = resolve(arg);
  const script = JSON.parse(readFileSync(file, 'utf8'));
  const prog = compileScript(script, { params: cliParams(argv) });
  if (opt('inject') && opt('morph-log')) throw new Error('--inject and --morph-log both feed run.morph: pass one (--inject runs on this connection, I-038)');
  const inject = opt('inject') ? await loadInject(opt('inject'), { label: opt('label', 'run') }) : null; // before WDA or the page are touched
  const tlFile = opt('timeline'); // I-079
  if (argv.some((a) => a === '--timeline' || a.startsWith('--timeline=')) && (!tlFile || tlFile.startsWith('--'))) throw new Error('--timeline wants a file: --timeline <out.json>');
  if (tlFile && opt('morph-log')) throw new Error('--timeline and --morph-log: pass one (morph-log\'s own inspector connection takes the tab and restarts the Timeline stopwatch, I-038; an in-page logger goes in --inject, on this connection)');
  const idleMs = idleAfterReloadMs(argv, prog); // I-203: before WDA or the page are touched
  const head = `${prog.name} v${prog.version} hash ${prog.hash.slice(0, 12)} params ${JSON.stringify(prog.params)}: ${prog.strokes.length} strokes, ~${Math.round(prog.estMs / 1000)} s${idleMs ? ` idle after reload ${idleMs} ms` : ''}`;
  const budgetMs = runBudgetMs(prog.estMs, idleMs); // I-112; I-203: the idle on top
  if (flag('dry-run')) {
    log(head);
    for (const s of prog.strokes) log(`  ${s.id} ${s.dir} ${s.px} px / ${s.ms} ms ${s.profile}${s.holdMs ? ` hold ${s.holdMs}` : ''}: x ${s.x} y ${s.y0}->${s.y1}, peak ${s.peakPxPerS} px/s${s.plateauPxPerS ? ` (plateau ${s.plateauPxPerS} px/s)` : ''}, lift-off ${s.liftoffPxPerS} px/s`);
    log(`GESTURE_HASH ${prog.hash}`);
    if (idleMs) log(`IDLE_AFTER_RELOAD_MS ${idleMs}  (after the script's first reload is ready, before its next step; not in the hash; I-203)`);
    log(`GESTURE_BUDGET_S ${Math.round(budgetMs / 1000)}  (plan per run on the phone: reload, waits, Timeline and save included; I-112)`);
    return 0;
  }
  const owner = requireLease();
  const tg = target || phoneTarget({ owner, allowDuringMeasure: flag('allow-during-measure'), requireQuiet: flag('require-quiet'), warmup: flag('warmup'), log, profileGate });
  const { pageUrl, pageSource } = await tg.preflight(prog.estMs, { budgetMs });

  // Safari's tab: there, not the certificate warning, the lease's page
  const list = await (await fetch(`http://localhost:${port}/json`, { signal: AbortSignal.timeout(4000) })).json();
  const tab = safariTab(list); // never a blank web view of another app, never the first of several (I-037)
  if (CERT_WARNING_TITLE.test(tab.title || '')) throw new Error(`Safari shows its certificate warning ("${tab.title}") on ${tab.url}, not the page; run: ${tg.openHint('<url>')} (incident I-003)`);
  let leaseUrl = tryResolveLanUrl(pageUrl); // a `lan` placeholder lease URL (I-073)
  if (leaseUrl && !tab.url.startsWith(leaseUrl)) { try { leaseUrl = iphoneTarget(leaseUrl, await mirrorInfo(leaseUrl)).url; } catch {} }
  if (leaseUrl && !tab.url.startsWith(leaseUrl)) console.error(`warning: Safari shows ${tab.url}, ${pageSource} says ${pageUrl} (run: ${tg.openHint(pageUrl)})`);

  // WDA: up, and Safari in front
  const wdaOpts = { base: tg.wdaBase };
  const st = await wdaStatus(wdaOpts).catch((e) => { throw new Error(`${e.message}\nStart it: ${tg.wdaHint}`); });
  if (!st?.ready) throw new Error('WDA answers /status but is not ready');
  const session = await createSession(wdaOpts);
  let page = null;
  const label = opt('label', 'run');
  const ts = Date.now();
  const out = resolve(REPO, opt('out', join('out', tg.outDir, `${owner}-gesture-${label}-${ts}.json`)));
  mkdirSync(dirname(out), { recursive: true });
  const timeline = tlFile ? timelineRecorder({ file: resolve(tlFile), log }) : null;
  let res;
  const stop = { reason: null };
  const onSig = (sig) => { stop.reason = `stopped by ${sig}`; };
  process.on('SIGINT', onSig); process.on('SIGTERM', onSig);
  try {
    const front = await session.activeApp();
    if (front?.bundleId !== SAFARI) throw new Error(`refusing: ${scrub(front?.bundleId || 'an unknown app')} is in front, not Safari. Bring Safari to the front (${tg.wdaHint} activates it)`);
    page = wipPage({ appId: front.pid ? `PID:${front.pid}` : null, port }); // the proxy names apps by pid (I-037)
    if (timeline) page.onConnection = timeline.onConnection; // I-079: on every connection, the first one included
    await page.connect();
    log(`GESTURE ${head} on ${await page.href()}`);
    if (timeline) log(`NOTE: --timeline records a WebKit Timeline on this run's inspector connection (meta.timeline): compare it only with Timeline-on runs (a Timeline block, protocol v2 §5.2) or use it as an attribution run; never mix it with Timeline-off counted runs (§5.5). Files: ${timeline.file} (segment 0), ${timeline.segFile(1)} ... after each reload`);
    const morphLog = opt('morph-log');
    if (morphLog && !existsSync(morphLog)) throw new Error(`--morph-log ${morphLog}: no such file`);
    if (morphLog) log('warning: --morph-log runs a separate process with its own inspector connection per segment, which takes the tab from this run\'s connection (the proxy allows one per page, I-038): the run reconnects (run.reconnects), but prefer --inject <logger.mjs>, which runs on this connection');
    res = await runProgram(prog, {
      wda: session, page,
      morph: morphLog ? morphHook(resolve(morphLog), { owner, label, outBase: out.replace(/\.json$/, '') }) : null,
      inject, timeline, idleAfterReloadMs: idleMs,
      check: () => { if (stop.reason) throw new Abort(stop.reason); const why = tg.lost(); if (why) throw new Abort(why); },
    });
  } finally {
    process.off('SIGINT', onSig); process.off('SIGTERM', onSig);
    if (res && page?.reconnects.length) res.reconnects = page.reconnects; // the proxy closed the run's connection (I-038)
    page?.close();
    await session.close();
  }
  const doc = {
    meta: { kind: 'gesture', owner, label, date: new Date(ts).toISOString(), device: tg.device, tool: toolVersion(REPO, { morphLog: opt('morph-log'), inject: opt('inject'), toolFiles: tg.toolFiles }),
      wda: { ref: readConfig().ref || WDA_REF, build: st.build?.version ?? null, os: st.os?.version ?? null, settings: settingsEcho(session.settings) }, script: file.startsWith(REPO) ? file.slice(REPO.length + 1) : file,
      ...(timeline ? { timeline: { file: repoRel(timeline.file), segFiles: '<file without .json>-seg<i>.json for segment i >= 1', protocol: TIMELINE_START, sync: 'performance.mark -> Timeline TimeStamp; Timeline ms = page ms + offsetMs' } } : {}), // I-079
      ...(await tg.extra()) },
    program: { name: prog.name, version: prog.version, compiler: prog.compiler, hash: prog.hash, params: prog.params, estMs: prog.estMs, strokes: prog.strokes },
    run: res,
  };
  const saved = (s) => lanSafeText(scrub(s)); // the record is committed under research/ (review-t1a N1)
  res.errors = res.errors.map(saved);
  if (res.aborted) res.aborted = saved(res.aborted);
  if (res.inject) res.inject = JSON.parse(lanSafeText(JSON.stringify(res.inject))); // a logger's values may carry the page's href
  if (res.timeline) res.timeline = res.timeline.map((t) => ({ ...t, file: repoRel(t.file), errors: t.errors.map(saved) })); // I-079
  doc.summary = summarizeRun(res.segments, res.strokes, { morph: res.morph });
  if (countOnly) {
    // I-184: counts only, in the record and on stdout (no frame log, no ms: never a timing number)
    doc.meta.countOnly = countOnly;
    doc.run = countOnlyRun(res);
    doc.summary = countOnlySummary(doc.summary);
    writeFileSync(out, JSON.stringify(doc));
    const c = doc.summary;
    log(`COUNT_ONLY ${JSON.stringify({ aborted: res.aborted, strokes: res.strokes.length, segments: res.segments.length, loops: res.loops, frames: c.segments.map((x) => x.frames), touchmove: c.touchmove, toolbar: c.toolbar, pin: (({ perMark, ...p }) => p)(c.pin), overscroll: c.overscroll, momentum: c.momentum, morph: c.morph, errors: res.errors })}`);
    log(`saved ${out}`);
    if (res.aborted) throw new Error(`gesture run aborted: ${res.aborted} (partial data saved in ${out})`);
    return 0;
  }
  writeFileSync(out, JSON.stringify(doc));
  await tg.saved?.(out); // I-186
  log(JSON.stringify({ aborted: res.aborted, ...(idleMs ? { idleAfterReloadMs: idleMs } : {}), strokes: res.strokes.length, segments: res.segments.length, loops: res.loops, touchmove: doc.summary.touchmove, motion: doc.summary.motion, toolbar: doc.summary.toolbar, pin: (({ perMark, ...p }) => p)(doc.summary.pin), overscroll: doc.summary.overscroll, momentum: doc.summary.momentum, morph: doc.summary.morph, errors: res.errors }, null, 1));
  for (const t of res.timeline || []) log(`timeline seg ${t.seg}: ${t.records} records, offset ${t.offsetMs === null ? 'UNKNOWN' : `${t.offsetMs.toFixed(3)} ms`}${t.epochs > 1 ? `, ${t.epochs} epochs` : ''}${t.errors.length ? `, ${t.errors.length} errors` : ''} -> ${t.file}`); // I-079
  log(`saved ${out}`);
  if (res.aborted) throw new Error(`gesture run aborted: ${res.aborted} (partial data saved in ${out})`);
  return 0;
}
