// Notifications for the user console (ts-console-nav, user request 2026-10-02: "when you'd like to ask me do the
// task they should notify me on the console").
//
// - waitingView(): the badge / notification model (`GET /api/waiting`, the `waiting` events of `GET /api/events`):
//   the open steps (pending or active) with id, sanitized title, status, yourTurn and updatedAt. Titles go through
//   progress.mjs sanitize() (no URL, address, host, e-mail, id or home path), never instructions or URLs.
// - userTurn(step): can the user act on it now (Start, Done, swipe, pick)? false while an agent prepares a gated part
//   or starts a recorder. Reminders fire only on the user's turn.
// - diffSteps(): the new-step / reminder rule, pure. The page runs the same rule (tools/lib/console-nav.js
//   ConsoleNotify.diffSteps; tests/unit/console-notify.test.mjs runs one table of cases against both).
// - Optional macOS notifications from the server (`console.mjs serve --notify`, off by default, local only):
//   osascript through execFile with an argv array (no shell); the title and body travel as `on run argv` arguments,
//   so the AppleScript source is constant and no text is ever spliced into it.
//   $FW_CONSOLE_NOTIFY_LOG (tests): append the argv as a JSON line to that file instead of running osascript.
import { execFile } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { list, phase } from './console.mjs';
import { sanitize } from './progress.mjs';
import { threadNotificationText } from './console-threads.mjs';
import { iso } from './store.mjs';

export const DEFAULT_REMIND_MIN = 3;
export const OSASCRIPT = '/usr/bin/osascript';
/** The constant AppleScript: title = item 1, body = item 2 of the arguments. */
export const SCRIPT = ['on run argv', 'display notification (item 2 of argv) with title (item 1 of argv)', 'end run'];

/** True when the user can act on the step now (not while an agent loads a gated part or starts its recorder). */
export function userTurn(s) {
  const ph = phase(s);
  if (ph !== 'pending' && ph !== 'part' && ph !== 'answer') return false;
  if (ph === 'answer' || !s.parts.length) return true;
  const p = s.parts[ph === 'pending' ? 0 : s.cur];
  if (!p) return true;
  if (p.state === 'waiting' || p.state === 'loading') return !p.gate;
  if (p.state === 'started') return !p.record;
  return p.state === 'ready' || p.state === 'recording';
}

/** One line of plain text: control characters and line breaks become spaces. */
export const oneLine = (s) => String(s ?? '').replace(/[\u0000-\u001f\u007f\u2028\u2029]/g, ' ').replace(/\s+/g, ' ').trim();
const safeId = (id) => (/^C-\d{1,6}$/.test(id) ? id : 'C-?');

/** What the badge and the notifications get: ids, sanitized titles, status, turn, times. Nothing else. */
export function waitingView(steps = list({ pending: true }), { remindMin = DEFAULT_REMIND_MIN } = {}) {
  const w = steps.map((s) => ({
    id: safeId(s.id), title: oneLine(sanitize(s.title, 160)), status: s.status, yourTurn: userTurn(s),
    updatedAt: s.updatedAt, queuedAt: s.queuedAt,
  }));
  return { now: iso(), count: w.length, yourTurn: w.filter((x) => x.yourTurn).length, remindMin, steps: w };
}

/**
 * The notification rule. state = {seeded, open: {id: {r}}} (r: reminded), steps = waitingView().steps.
 * - The first call seeds silently (steps already overdue count as reminded: you are looking at them).
 * - A step id that was not open before -> {kind: 'new'} (a reopened step is new again).
 * - Once per step, on the user's turn, when it was seen before and is idle (no change) for >= remindMs -> 'remind'.
 * Returns {state, events: [{kind, step}]}; never mutates its inputs.
 */
export function diffSteps(state, steps, nowMs, remindMs) {
  const seeded = !!(state && state.seeded);
  const prevOpen = (state && state.open) || {};
  const open = {}, events = [];
  for (const s of steps) {
    const prev = prevOpen[s.id];
    const idle = nowMs - Date.parse(s.updatedAt);
    const due = remindMs > 0 && s.yourTurn && idle >= remindMs;
    if (!seeded) { open[s.id] = { r: !!due }; continue; }
    if (!prev) { open[s.id] = { r: false }; events.push({ kind: 'new', step: s }); continue; }
    open[s.id] = { r: !!prev.r };
    if (due && !prev.r) { open[s.id].r = true; events.push({ kind: 'remind', step: s }); }
  }
  return { state: { seeded: true, open }, events };
}

/** Notification title and body for an event: the step id and its sanitized title only. */
export function notificationText(step, kind = 'new') {
  return {
    title: kind === 'remind' ? 'Console: still waiting for you' : 'Console: new step',
    body: `${safeId(step.id)}: ${oneLine(sanitize(step.title, 120)) || '(no title)'}`,
  };
}

/** The osascript argv: constant -e lines, then title and body as plain arguments (body starts with "C-", never "-"). */
export function osascriptArgv({ title, body }) {
  return [...SCRIPT.flatMap((l) => ['-e', l]), oneLine(title), oneLine(body)];
}

/**
 * A notifier for `serve --notify`: notify(step, kind) builds the argv and runs osascript (execFile, no shell).
 * kind 'new' | 'remind' (a step), 'reply' | 'thread' (a thread, console-threads.mjs: id and sanitized title only).
 * exec/platform/log are injectable for tests. Returns the argv (null where macOS notifications don't exist).
 */
export function createNotifier({ exec = execFile, platform = process.platform, log = process.env.FW_CONSOLE_NOTIFY_LOG, onError } = {}) {
  return (step, kind = 'new') => {
    const argv = osascriptArgv(kind === 'reply' || kind === 'thread' ? threadNotificationText(step, kind) : notificationText(step, kind));
    if (log) { appendFileSync(log, JSON.stringify({ cmd: OSASCRIPT, argv }) + '\n'); return argv; }
    if (platform !== 'darwin') return null;
    exec(OSASCRIPT, argv, { timeout: 10000, windowsHide: true }, (e) => { if (e && onError) onError(e); });
    return argv;
  };
}

/** The server's tick for --notify: feed it waitingView() steps; it calls notify(step, kind) for each event. */
export function stepWatcher({ notify, remindMin = DEFAULT_REMIND_MIN }) {
  let state = null;
  return (steps, nowMs = Date.now()) => {
    const r = diffSteps(state, steps, nowMs, remindMin * 60000);
    state = r.state;
    for (const e of r.events) notify(e.step, e.kind);
    return r.events;
  };
}
