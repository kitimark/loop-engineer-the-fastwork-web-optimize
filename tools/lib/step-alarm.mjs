// Stuck-step alarm (incident I-123 (c), user T-078): the idle alarm's twin for console steps. C-037 (2026-10-04) sat on
// "Getting page 1 ready" for 10 min after the user's Start over while its runner was blocked in another wait, and no
// tool said so. tools/idle.mjs runs this in every pass (`check` and the lead's `watch`): an ACTIVE step whose current
// part waits on its runner (lib/phone-step.mjs stuckSteps: a gated part not ready yet, or a recorded part the user
// started without the runner's "recording") with no change on the step for more than --step-min minutes (default 2).
//
// One stuck period = one episode (keyed by step, epoch, part, attempt and the last change). Its first sighting prints
//   STUCK C-037: part 1 (attempt 2) waits on fix-nav-morph for 10 min (gated, waiting: …; nothing since the user's Start over at 06:17Z)
// and, with --by lead, posts one console thread assigned to the steward only (I-175; only the lead starts
// threads; the steward nudges the runner by message). When the step moves on (an ack, the user's Start, an
// answer, a skip …) the episode ends (ENDED line) and the lead's next pass closes its thread. Names, ids and minutes
// only: no step title, URL or instructions (Hard rule 12). Read-only on the steps and the locks.
//   <git-common-dir>/fastwork-mirror/idle/step-alarm.json   ($FW_STATE_DIR/idle/ in tests), under the "step-alarm" guard.
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { sharedStateDir } from './paths.mjs';
import { withGuard } from './lock.mjs';
import { readJson, writeJson, iso } from './store.mjs';
import { stuckSteps, STUCK_STEP_MIN } from './phone-step.mjs';
import { createThread, setStatus } from './console-threads.mjs';
import { alarmSteward, stewardTo, stewardLine } from './thread-routing.mjs';

export const SCHEMA = 'fw-step-alarm/1';
export { STUCK_STEP_MIN };
const GUARD = 'step-alarm';
const CLAIM_TTL_MS = 120000; // a post claim older than this belongs to a poster that died
export const stateFile = () => join(sharedStateDir(), 'idle', 'step-alarm.json');
export const readState = () => {
  const s = readJson(stateFile());
  return s && s.schema === SCHEMA && s.episodes && typeof s.episodes === 'object' ? s : { schema: SCHEMA, episodes: {}, toClose: [] };
};

const hhmm = (t) => `${iso(t).slice(11, 16)}Z`;

/** The stdout line for one stuck step. */
export const stuckLine = (x) => `STUCK ${x.id}: part ${x.part}${x.attempt > 1 ? ` (attempt ${x.attempt})` : ''} waits on ${x.by} for ${x.minutes} min (${x.why}; nothing since ${x.after} at ${hhmm(x.since)})`;

/**
 * The thread's assignees: the steward on duty only (I-175, user T-155 #5: workers, the step's runner included, are
 * never assignees of an automated thread; the steward nudges them by message). `st`: thread-routing stewardState.
 */
export const stuckAddressees = (x, st = null) => stewardTo(st);

/** The console thread for one stuck step: {title, text}. Ids, names and minutes only (Hard rule 12). */
export function stuckThread(x, { steward = null, min = STUCK_STEP_MIN } = {}) {
  const title = `${x.id} part ${x.part} waits on ${x.by} for ${x.minutes} min`;
  // I-140 (T-116, C-045): the user read this thread and asked "what's the problem?": the first line is for them, in
  // plain words with what they can do; the runner's line names the exact ack, with the part's CURRENT attempt (C-045's
  // runner kept acking the attempt from before its own redo, and every ack was refused as STALE-ATTEMPT).
  const L = [
    `For you: you did nothing wrong. ${/^gated/.test(x.why) ? `The Start button of ${x.id} part ${x.part} stays grey until ${x.by} gets the phone ready` : `${x.id} part ${x.part} says "don't swipe yet" until ${x.by} starts its recording`}, and ${x.by} has not reacted for ${x.minutes} min; it has been told. If you don't want to wait, press "Skip / not now" on the step; it can be brought back later.`,
    `Step ${x.id} (by ${x.by}), part ${x.part}${x.attempt > 1 ? `, attempt ${x.attempt}` : ''}: ${x.why}. Nothing has changed on it since ${x.after} at ${hhmm(x.since)} (${x.minutes} min; the limit is ${min} min), so the user is looking at a step that waits on its runner.`,
    // I-175: facts for the steward, not a line addressed to the runner (workers are nudged by message)
    `What unblocks it: ${x.by} acks the part with its current attempt (node tools/console.mjs ack ${x.id} --by ${x.by} --part ${x.part} --attempt ${x.attempt} --state loading|ready|recording --message "<what it does, ETA>"), or cancels the step. The ack's exit code counts: a STALE-ATTEMPT refusal changes nothing (I-140). A wait armed after the user's Start over is re-armed with --epoch (header of tools/console.mjs, I-123).`,
    stewardLine(steward, [x.by]),
  ];
  L.push('One message per stuck period; this thread closes by itself when the step moves on (tools/idle.mjs, I-123).');
  return { title, text: L.join('\n') };
}

/**
 * Under the guard: record the stuck steps `list` (stuckSteps). Returns {items: [{x, news, post, thread}], ended:
 * [{key, id, thread}]}: news on an episode's first sighting; post when `claim` (the lead's pass) claimed its thread.
 * Episodes not stuck any more end; their threads wait in toClose for the lead's pass. `keep`: keys of steps that
 * still wait on their runner, only under this pass's limit (a check with a larger --step-min ends no episode).
 */
export async function recordStuck(list, { now = Date.now(), claim = false, pid = process.pid, keep = [] } = {}) {
  return withGuard(GUARD, () => {
    mkdirSync(join(sharedStateDir(), 'idle'), { recursive: true });
    const s = readState();
    const items = [], ended = [], keys = new Set([...list.map((x) => x.key), ...keep]);
    for (const [key, ep] of Object.entries(s.episodes)) {
      if (keys.has(key)) continue;
      ended.push({ key, id: ep.id, thread: ep.thread || null });
      if (ep.thread && !(s.toClose ||= []).some((c) => c.thread === ep.thread)) s.toClose.push({ thread: ep.thread, id: ep.id, note: `${ep.id} moved on`, at: iso(now) });
      delete s.episodes[key];
    }
    for (const x of list) {
      let ep = s.episodes[x.key], news = false, post = false;
      if (!ep) { ep = s.episodes[x.key] = { id: x.id, by: x.by, since: iso(x.since), alarmedAt: iso(now) }; news = true; }
      const claimLive = ep.claim && now - (Date.parse(ep.claim.at) || 0) < CLAIM_TTL_MS && ep.claim.pid !== pid;
      if (claim && !ep.thread && !claimLive) { ep.claim = { pid, at: iso(now) }; post = true; }
      items.push({ x, news, post, thread: ep.thread || null });
    }
    s.updatedAt = iso(now);
    writeJson(stateFile(), s);
    return { items, ended };
  });
}

/** Under the guard: the thread post for episode `key` succeeded (thread id) or failed (the claim is dropped). */
export async function settleStuck(key, { thread = null, error = null, now = Date.now() } = {}) {
  return withGuard(GUARD, () => {
    const s = readState();
    const ep = s.episodes[key];
    if (!ep) return null;
    delete ep.claim;
    if (thread) Object.assign(ep, { thread, postedAt: iso(now) });
    if (error) ep.lastError = String(error).slice(0, 300);
    writeJson(stateFile(), s);
    return ep;
  });
}

/** Under the guard: take (and clear) the threads of ended episodes (the lead's pass closes them). */
export async function takeStuckToClose() {
  return withGuard(GUARD, () => {
    const s = readState();
    const list = s.toClose || [];
    if (!list.length) return [];
    s.toClose = [];
    writeJson(stateFile(), s);
    return list;
  });
}

/**
 * One pass (tools/idle.mjs): find, record, print, and as the lead post / close threads. `quietOk`: print only news
 * (watch); `check` prints every stuck step. Returns {alarm: some step is stuck, stuck: [...]}.
 */
export async function stepPass({ by, log, quietOk = false, now = Date.now(), min = STUCK_STEP_MIN } = {}) {
  const waiting = stuckSteps({ now, min: 0 });
  const list = waiting.filter((x) => now - x.since > min * 60000);
  const lead = by === 'lead';
  const { items, ended } = await recordStuck(list, { now, claim: lead, keep: waiting.map((x) => x.key) });
  for (const e of ended) log(`ENDED ${e.id}: the step moved on${e.thread ? `; thread ${e.thread}` : ''}`);
  for (const it of items) {
    if (it.news || !quietOk) log(`${stuckLine(it.x)}${it.thread ? ` [posted in ${it.thread}]` : ''}`);
    if (!it.post) {
      if (it.news && !lead) log(`NOT POSTED ${it.x.id}: posting needs --by lead (only the lead starts threads); the lead's watch posts it`);
      continue;
    }
    const steward = await alarmSteward(); // I-175
    const { title, text } = stuckThread(it.x, { steward, min });
    const to = stuckAddressees(it.x, steward);
    try {
      const r = await createThread({ by, title, text, ...(to.length ? { to: to.join(',') } : {}) });
      await settleStuck(it.x.key, { thread: r.thread.id, now });
      log(`POSTED ${r.thread.id} ${it.x.id}: ${title}${to.length ? ` (to ${to.join(', ')})` : ''}`);
    } catch (e) {
      await settleStuck(it.x.key, { error: e.message, now });
      log(`NOT POSTED ${it.x.id}: ${e.message}`);
    }
  }
  if (lead) {
    for (const c of await takeStuckToClose()) {
      try { await setStatus(c.thread, { status: 'closed', by, note: c.note }); log(`CLOSED ${c.thread} (${c.note})`); } catch (e) { log(`NOT CLOSED ${c.thread}: ${e.message}`); }
    }
  }
  return { alarm: list.length > 0, stuck: list };
}
