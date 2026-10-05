// Console steps that use the iPhone, seen from the phone lease (incident I-123, user T-078).
//
// 2026-10-04: the user pressed "Start over" on C-037 (a swipe pair) at 06:17:59Z. Its runner missed the restart, its
// iphone lease ran out at 06:27:44Z in the middle of the step, and the lock handed the phone to the next waiter, which
// navigated Safari and posted its own step while the user had just pressed Start on C-037's new attempt. This module
// holds the rules that keep a user step and the phone lease together. Read-only on the console store (it imports no
// lock code, so tools/lib/lock.mjs can use it without an import cycle).
//
// A phone step: kind swipe-pair, or a step with a recorded part (`--record`: the runner records the phone while the
// user swipes), or one posted with `--phone` (the user handles the phone without a recording).
// A phone step is ON the phone (onPhone) while it is open (pending or active) and has begun: the user pressed Start
// (status active, which a Start over keeps), or the runner prepared a part (a part past "waiting": loading, ready, ...).
//
// (a) Lease grace (stepGrace): an iphone lease that runs out while its owner has a step on the phone is not stale for
//     up to LEASE_STEP_GRACE_SEC more (the hard bound): the lock does not hand the phone over in the middle of the
//     user's step. The grace ends as soon as the step ends (answered, skipped, cancelled); the owner renews as usual.
// (d) Runner guard (runnerRefusal): iphone.mjs refuses to touch the phone while another owner's step is on it.
// (f) Post guard (postRefusal): `console.mjs post` of a phone step needs the poster's iphone lease and no other open
//     phone step (the lead is exempt).
// I-125: the idle alarm (lib/idle.mjs) counts a held lease whose owner has a step the user is on (userOnPhone) as a
//     user wait, not as idle (ownerPhoneStep, the same rule as (a)).
// (c) Stuck steps (stuckSteps): an active step whose current part waits on its runner (a gated part not ready yet, or
//     a recorded part started without the runner's "recording") with no change for more than N minutes.
import { join } from 'node:path';
import { sharedStateDir } from './paths.mjs';
import { readAll, iso } from './store.mjs';

/** How long past its expiry a lease stays with its owner while the owner's step is on the phone (the hard bound). */
export const LEASE_STEP_GRACE_SEC = 600;
/** Minutes without a change before a step that waits on its runner counts as stuck (the idle alarm's default). */
export const STUCK_STEP_MIN = 2;
const OPEN = new Set(['pending', 'active']);
const ms = (s) => { const t = Date.parse(s); return Number.isFinite(t) ? t : null; };

/** Every console step (read-only; the store is tools/lib/console.mjs's). */
export const readSteps = () => readAll(join(sharedStateDir(), 'console'), 'C');

export const isPhoneStep = (s) => !!s && (s.kind === 'swipe-pair' || s.phone === true || (s.parts || []).some((p) => p.record));
export const isOpen = (s) => !!s && OPEN.has(s.status);
/** Open, a phone step, and begun (the user pressed Start, or the runner prepared a part). */
export const onPhone = (s) => isOpen(s) && isPhoneStep(s) && (s.status === 'active' || (s.parts || []).some((p) => p.state && p.state !== 'waiting'));

/** The user is on it, not only its runner preparing it: the user pressed Start (active), or a part is ready for Start. */
export const userOnPhone = (s) => onPhone(s) && (s.status === 'active' || (s.parts || []).some((p) => p.state === 'ready'));

/**
 * The step `owner` has on the phone, or null: the one rule behind the lease grace (a) and the idle alarm's user-wait
 * exemption (I-125). `user`: only a step the user is on (userOnPhone), not one its runner is still preparing.
 */
export function ownerPhoneStep(owner, { steps = readSteps(), user = false } = {}) {
  if (!owner) return null;
  return steps.find((x) => x.by === owner && (user ? userOnPhone(x) : onPhone(x))) || null;
}

/** "C-037 by fix-nav-morph (active, part 1/2 ready)". */
export function stepText(s) {
  const n = (s.parts || []).length, p = n && s.cur < n ? s.parts[s.cur] : null;
  return `${s.id} by ${s.by} (${s.status}${p ? `, part ${s.cur + 1}/${n} ${p.state}` : n ? ', at the answer' : ''})`;
}

/**
 * (a) The grace of holder `h`: {step, expiredAt, until} while `h` is an iphone lease that ran out less than
 * LEASE_STEP_GRACE_SEC ago and its owner has a step on the phone; else null (also for a live lease and a short one).
 */
export function stepGrace(h, now = Date.now(), steps) {
  if (!h || h.resource !== 'iphone' || h.kind !== 'lease' || h.short || !h.owner) return null;
  const exp = ms(h.expiresAt);
  if (exp === null || !(now > exp) || now > exp + LEASE_STEP_GRACE_SEC * 1000) return null;
  const s = ownerPhoneStep(h.owner, { steps: steps ?? readSteps() });
  return s ? { step: s.id, expiredAt: h.expiresAt, until: iso(exp + LEASE_STEP_GRACE_SEC * 1000) } : null;
}

/** "lease ran out at …; kept for its owner's step C-037 on the phone until … (I-123)". */
export const graceText = (g) => (g ? `lease ran out at ${g.expiredAt}; kept for its owner's step ${g.step} on the phone until ${g.until} (I-123)` : '');

/**
 * (d) Why `owner` may not touch the phone now: another owner's step is on the phone. `ignore`: a step id the caller
 * names on purpose (--ignore-step, e.g. a step its dead owner left behind). Returns the refusal text, or null.
 */
export function runnerRefusal({ owner, steps = readSteps(), ignore } = {}) {
  const ign = ignore ? String(ignore).trim().toUpperCase().replace(/^(?:C-?)?0*(\d{1,6})$/, (_, n) => `C-${n.padStart(3, '0')}`) : null;
  const s = steps.find((x) => x.by !== owner && x.id !== ign && onPhone(x));
  if (!s) return null;
  return `WAIT: the user's step ${stepText(s)} is on the iPhone: don't navigate the phone until it is answered, skipped or cancelled (incident I-123). Wait for it: node tools/console.mjs wait ${s.id} --until answered (exit 0 or 4 = it is over); ask ${s.by} or the lead if it looks abandoned. Only if it really is: --ignore-step ${s.id}`;
}

/**
 * (f) Why `by` may not post the phone step `step` now, or null. `lease`: the iphone lock status (holder, stale);
 * the lead is exempt. Every other poster needs the live iphone lease and no other open phone step (pending or active).
 */
export function postRefusal({ step, by, lease, steps = readSteps() } = {}) {
  if (!isPhoneStep(step) || by === 'lead') return null;
  const h = lease?.holder;
  if (!h || lease.stale || h.owner !== by) {
    return `a phone step (${step.kind === 'swipe-pair' ? 'swipe pair' : step.phone ? '--phone' : 'a recorded part'}) needs your iphone lease first: you ("${by}") don't hold it${h ? ` (holder: "${h.owner}"${lease.stale ? ', stale' : ''})` : ''}. Post and run the step inside your phone hold: node tools/lock.mjs run iphone --owner ${by} -- sh -c '<post, wait, record>' (incident I-123; agents hold the phone only while a command runs, I-168)`;
  }
  const other = steps.find((x) => isOpen(x) && isPhoneStep(x));
  if (other) return `another phone step is open: ${stepText(other)}. One phone step at a time (incident I-123): wait for it (node tools/console.mjs wait ${other.id} --until answered), or ask ${other.by} to cancel it`;
  return null;
}

/**
 * Why the current part of `s` waits on its runner, or null: a gated part not ready yet (the page says "getting ready"),
 * or a recorded part the user started that the runner has not acked "recording" (the page says "don't swipe yet").
 */
export function waitsOnRunner(s) {
  if (!s || s.status !== 'active' || !(s.cur < (s.parts || []).length)) return null;
  const p = s.parts[s.cur];
  if (p.gate && (p.state === 'waiting' || p.state === 'loading')) return `gated, ${p.state}: Start stays off until ${s.by} acks ready`;
  if (p.record && p.state === 'started') return `started, ${s.by} has not acked recording`;
  return null;
}

/**
 * (c) Active steps whose current part has waited on its runner for more than `min` minutes with no change on the step
 * (the newest history entry: a runner ack, a Start, a Start over, ...). Each: {id, by, part, label, attempt, why, since
 * (ms), minutes, key, after}. `key` names the episode (step, epoch, part, attempt, the change it waits after). I-128: the
 * change is named by its place in the history (h<n>), not only by its time: two changes in the same millisecond (a
 * runner's ack right after a Start over) are two episodes.
 */
export function stuckSteps({ steps = readSteps(), now = Date.now(), min = STUCK_STEP_MIN } = {}) {
  const out = [];
  for (const s of steps) {
    const why = waitsOnRunner(s);
    if (!why) continue;
    const last = (s.history || []).at(-1) || {};
    const since = ms(last.at) ?? ms(s.updatedAt);
    if (since === null || now - since <= min * 60000) continue;
    const p = s.parts[s.cur];
    const after = last.action === 'restart' ? `the user's Start over` : last.action === 'start' ? `the user's Start` : last.who === s.by ? `${s.by}'s last ${last.action}` : `${last.who}'s ${last.action}`;
    out.push({ id: s.id, by: s.by, part: s.cur + 1, label: p.label, attempt: p.attempt || 1, why, since, minutes: Math.floor((now - since) / 60000), after, key: `${s.id}/e${s.epoch || 0}/p${s.cur + 1}/a${p.attempt || 1}/h${(s.history || []).length}/${last.at || s.updatedAt}` });
  }
  return out;
}
