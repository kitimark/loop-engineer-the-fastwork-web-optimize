// `iphone.mjs record` (the finger-test frame logger) as a run that saves as it goes (incident I-141, user T-118).
//
// C-045 part 3 and C-046 (2026-10-04 12:44Z / 12:58Z): a 45 s finger recording installed the rAF logger, slept, and then
// read every frame in ONE Runtime.evaluate at the end. That read timed out (15 s, wip.mjs connect's default) and the
// whole recording was lost: nothing was saved, nothing said why. Both times the user had pressed Done 21-31 s into the
// recording, so the read came 15-23 s after their last touch, with the page at its end. Cause UNRESOLVED (OBSERVED, our
// data only): the phone auto-locking or Safari leaving the page (a link, another app) would both leave the page
// unreachable; this module records what the next failure looks like (the diag below) instead of guessing.
//
// MEASUREMENT CODE (call it out; tests/unit/iphone-unchanged.test.mjs pins it):
//   - the in-page logger (RECORD_JS), the final read (RECORD_STOP_JS) and the summary (recordSummary) are the phone's
//     from 2226d51, byte for byte, and tools/lib/sim-scroll.mjs keeps identical copies;
//   - NEW: while the run lasts, every --poll s (default 5 s = 0.2 Hz, protocol v2 §5.5 allows ~1 Hz at most; minimum 1;
//     0 = no polls, the old single final read) one Runtime.evaluate (RECORD_POLL_JS) copies the frames logged since the
//     last poll (a JSON.stringify of that slice in the page: a few hundred frames, well under 1 ms) and the record file is
//     rewritten atomically as `partial: true` ("in progress"), so a run that dies keeps everything up to the last poll;
//   - the final read is unchanged and authoritative: on success the file holds exactly what the old code saved, plus
//     `stream` ({pollSec, polls, lastPollSec}) and `targetEvents` when the inspector reported a target change;
//   - a failed read (a poll or the final one) records a diag entry: phase, time into the run, the error (LAN-safe),
//     whether the proxy closed the socket, the inspector's Target created/destroyed events, the proxy's tab list (url
//     LAN-safe, appId; titles only for tabs on the recording's host, never the user's other tabs: Hard rule 12); then
//     ONE reconnect per run to the tab on the recording's host, which reads location.href, visibilityState, readyState
//     and whether the logger is still there (DIAG_JS). Logger there (same document): the run goes on on the new
//     connection (`recovered: true`). Not there, or no reconnect: the file is written `partial: true` with the reason
//     and the frames streamed so far, and record prints `PARTIAL saved <file>: <reason>` and exits 6.
import { lanSafeUrl, lanSafeText } from './iphone-url.mjs';

export const RECORD_JS = `(() => { const r = window.__fr = {frames: [], href: location.href, vw: innerWidth, vh0: innerHeight}; let last = performance.now();
      const loop = (t) => { r.frames.push([Math.round(t * 10) / 10, Math.round((t - last) * 10) / 10, Math.round(scrollY), innerHeight]); last = t; if (!r.stop) requestAnimationFrame(loop); };
      requestAnimationFrame(loop); return 'ok'; })()`;
export const RECORD_STOP_JS = '(() => { window.__fr.stop = true; return JSON.stringify(window.__fr); })()';
function recordSummary(res) {
  const moving = res.frames.filter((f, i) => i > 0 && f[2] !== res.frames[i - 1][2]).map((f) => f[1]);
  const all = res.frames.map((f) => f[1]);
  const sum = (f) => ({ frames: f.length, gt20: f.filter((x) => x > 20).length, gt34: f.filter((x) => x > 34).length, gt50: f.filter((x) => x > 50).length, gt100: f.filter((x) => x > 100).length, max: Math.max(0, ...f) });
  return { all: sum(all), whileScrollYChanges: sum(moving), innerHeightChanges: new Set(res.frames.map((f) => f[3])).size - 1 };
}
export { recordSummary };

/** The frames logged since frame `n0` (and the logger's header), or null when the page has no logger. */
export const RECORD_POLL_JS = (n0) => `(() => { const r = window.__fr; if (!r) return null; const n = r.frames.length; return JSON.stringify({n, href: r.href, vw: r.vw, vh0: r.vh0, f: r.frames.slice(${Number(n0) | 0}, n)}); })()`;
/** After a reconnect: where the tab is and whether this run's logger is still in it. */
export const DIAG_JS = `(() => { const r = window.__fr; return JSON.stringify({href: location.href, visibilityState: document.visibilityState, readyState: document.readyState, logger: !!r, frames: r ? r.frames.length : null, loggerHref: r ? r.href : null}); })()`;

export const POLL_SEC = 5;
export const EXIT_PARTIAL = 6;
export const IN_PROGRESS = 'in progress: the recorder stopped before its final read (a crash or a kill); frames up to the last poll';

/** --poll: seconds between polls; 0 = none (the old single final read); 1-60. */
export function parsePoll(v) {
  if (v === undefined || v === null || v === '') return POLL_SEC;
  const n = Number(v);
  if (n === 0) return 0;
  if (!Number.isFinite(n) || n < 1 || n > 60) throw new Error(`--poll must be 0 (no polls) or 1-60 seconds (protocol v2 §5.5: no faster than ~1 Hz), got ${v}`);
  return n;
}

const hostOf = (u) => { try { return new URL(u).host; } catch { return null; } };
const r1 = (x) => Math.round(x * 10) / 10;

/** The proxy's tab list for a diag entry: url (LAN-safe) and appId; a title only on the recording's own host. */
export function tabsForDiag(list, host) {
  if (!Array.isArray(list)) return list && list.error ? { error: lanSafeText(String(list.error)) } : null;
  return list.filter((t) => t && typeof t === 'object').map((t) => ({ url: lanSafeUrl(t.url) || null, appId: t.appId ?? null, ...(host && hostOf(t.url) === host && t.title ? { title: String(t.title).slice(0, 80) } : {}) }));
}

/**
 * Run one recording on connection `c` (the logger is installed by the caller with RECORD_JS). Every `pollSec` s copy the
 * new frames and `save(rec)` them as partial; at `seconds` the final read (RECORD_STOP_JS). Returns {rec, partial,
 * reason}. `rec` is the record the old code built (frames, href, vw, vh0) plus stream / targetEvents / diag /
 * recovered / partial / reason; the caller adds summary, meta and mac and writes it. Injected for tests: reconnect(host)
 * -> a connection (openTab), listTabs() -> the proxy's /json, sleep, now.
 */
export async function recordRun({ c, seconds, href = null, pollSec = POLL_SEC, readMs = 15000, save = async () => {}, reconnect = null, listTabs = async () => null, sleep, now = Date.now }) {
  const t0 = now(), deadline = t0 + seconds * 1000;
  const host = hostOf(href);
  const acc = { frames: [], href, vw: null, vh0: null };
  const stream = { pollSec, polls: 0, lastPollSec: null };
  const diag = [], targetEvents = [];
  let reconnected = false, recovered = false;
  const watch = (conn) => {
    try {
      conn.ws?.addEventListener?.('message', (ev) => {
        try {
          const m = JSON.parse(ev.data);
          if (m.method === 'Target.targetCreated' || m.method === 'Target.targetDestroyed') targetEvents.push({ afterSec: r1((now() - t0) / 1000), event: m.method.slice(7), targetId: m.params?.targetInfo?.targetId ?? m.params?.targetId ?? null });
        } catch {}
      });
    } catch {}
  };
  watch(c);
  const build = (extra = {}) => ({ ...acc, stream: { ...stream }, ...(targetEvents.length ? { targetEvents: [...targetEvents] } : {}), ...(diag.length ? { diag: [...diag] } : {}), ...(recovered ? { recovered: true } : {}), ...extra });

  /** A failed read: note what we can see, then the run's one reconnect. true = the logger is still there (go on). */
  async function onFail(phase, e) {
    const d = { phase, afterSec: r1((now() - t0) / 1000), error: lanSafeText(String(e?.message || e)).slice(0, 400), proxyClosed: c.closed && !c.closed.self ? { code: c.closed.code, reason: lanSafeText(c.closed.reason || '') } : null };
    let list = null;
    try { list = await listTabs(); } catch (x) { list = { error: x.message }; }
    d.tabs = tabsForDiag(list, host);
    diag.push(d);
    if (reconnected || !reconnect || !host) { d.reconnect = reconnected ? 'not tried: one reconnect per run, already used' : 'not tried: no host to reconnect to'; return false; }
    reconnected = true;
    try { c.close(); } catch {}
    try {
      const c2 = await reconnect(host);
      watch(c2);
      const info = JSON.parse(await c2.evaluate(DIAG_JS, 'page', readMs));
      const same = !!info.logger && info.loggerHref === acc.href && info.frames >= acc.frames.length;
      d.reconnect = { ok: true, href: lanSafeUrl(info.href), visibilityState: info.visibilityState, readyState: info.readyState, logger: info.logger, loggerFrames: info.frames, sameDocument: same };
      c = c2;
      if (same) recovered = true;
      return same;
    } catch (x) {
      d.reconnect = { ok: false, error: lanSafeText(String(x?.message || x)).slice(0, 400) };
      return false;
    }
  }
  const partialEnd = async (reason) => {
    const rec = build({ partial: true, reason });
    try { c.close(); } catch {}
    return { rec, partial: true, reason };
  };

  if (pollSec > 0) {
    for (;;) {
      const left = deadline - now();
      if (left <= pollSec * 1000) break; // the last stretch ends in the final read, not a poll
      await sleep(pollSec * 1000);
      try {
        const v = await c.evaluate(RECORD_POLL_JS(acc.frames.length), 'page', readMs);
        if (v === null || v === undefined) throw new Error('the page has no frame logger (window.__fr): it was reloaded or navigated');
        const p = JSON.parse(v);
        if (p.href !== acc.href && acc.href !== null) throw new Error(`the logger belongs to another page (${lanSafeUrl(p.href)})`);
        Object.assign(acc, { href: p.href, vw: p.vw, vh0: p.vh0 });
        acc.frames.push(...p.f);
        stream.polls++;
        stream.lastPollSec = r1((now() - t0) / 1000);
        await save(build({ partial: true, reason: IN_PROGRESS }));
      } catch (e) {
        if (!(await onFail('poll', e))) return partialEnd(`a poll ${r1((now() - t0) / 1000)} s into the run failed (${diag.at(-1).error})${diag.at(-1).reconnect?.ok ? `; after a reconnect the tab shows ${diag.at(-1).reconnect.href} (${diag.at(-1).reconnect.visibilityState}) without this run's logger` : ''}: frames up to the last poll`);
      }
    }
  }
  const left = deadline - now();
  if (left > 0) await sleep(left);
  for (;;) {
    try {
      const res = JSON.parse(await c.evaluate(RECORD_STOP_JS, 'page', readMs));
      try { c.close(); } catch {}
      return { rec: { ...res, stream: { ...stream }, ...(targetEvents.length ? { targetEvents } : {}), ...(diag.length ? { diag } : {}), ...(recovered ? { recovered: true } : {}) }, partial: false };
    } catch (e) {
      if (!(await onFail('final', e))) return partialEnd(`the final read failed (${diag.at(-1).error})${diag.at(-1).reconnect?.ok ? `; after a reconnect the tab shows ${diag.at(-1).reconnect.href} (${diag.at(-1).reconnect.visibilityState})${diag.at(-1).reconnect.logger ? '' : ' without this run\'s logger'}` : ''}: frames up to the last poll`);
    }
  }
}
