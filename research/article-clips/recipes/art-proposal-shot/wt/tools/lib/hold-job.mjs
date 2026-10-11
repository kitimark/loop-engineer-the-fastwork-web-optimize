// What a lock holder is doing (incident I-060, user T-020: the progress page's "Right now" showed only who held a
// device, e.g. "iphone-runner since 08:35", not what job runs, for which fix, or how long it has left).
//
// A holder describes its job on the hold itself (tools/lock.mjs; stored by lib/lock.mjs describeHold as meta.job on
// the holder record, or on its reader record in a shared group):
//   node tools/lock.mjs acquire|run|renew <resource> --owner <you> --doing "<plain line>" [--for <topic/agent>] [--eta-min N]
//   node tools/lock.mjs doing <resource> --owner <you> --text "<plain line>" [--for X] [--eta-min N] | --clear   # mid-hold
// and a phone run marks itself (iphone.mjs scroll|record|run|gesture: meta.run {text, since, pid}, the text from
// --doing or phoneRunText() from its --label; cleared when the run ends, ignored once its pid is gone).
// The page (lib/progress.mjs deviceView) shows the job in plain words, for whom, since when and the time left; with no
// description it falls back to the holder's status-board row (tools/status.mjs), never to a bare name.
// Hard rule 12: the text is refused when it carries a URL, address, host name, e-mail, device id or home path
// (progress.mjs findPersonal, as the status board does), and sanitize()d again when shown.
import { findPersonal, sanitize } from './progress.mjs';

export const JOB_LIMITS = { text: 160, for: 60, etaMin: 24 * 60 };

const oneLine = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();

function plain(v, what, max) {
  const s = oneLine(v);
  if (s.length > max) throw new Error(`--${what} is too long (${s.length} > ${max} chars): one plain line`);
  const p = findPersonal(s);
  if (p) throw new Error(`--${what} contains a ${p.kind} ("${p.match.slice(0, 40)}"); nothing personal or network-identifying on the progress page (Hard rule 12)`);
  return s;
}

/**
 * {text, forWhom?, etaMin?} -> the stored job {text, for?, at, etaAt?}. Throws (with the flag name) on an empty or too
 * long text, personal data, or an estimate that is not 0..1440 minutes.
 */
export function parseJob({ text, forWhom, etaMin } = {}, now = Date.now()) {
  const t = plain(text, 'doing', JOB_LIMITS.text);
  if (!t) throw new Error('--doing needs a plain line: what the job is, for a non-specialist (e.g. "timing test for the blur change, run 3 of 9")');
  const job = { text: t };
  if (forWhom !== undefined && oneLine(forWhom)) job.for = plain(forWhom, 'for', JOB_LIMITS.for);
  job.at = new Date(now).toISOString();
  if (etaMin !== undefined && etaMin !== null && etaMin !== '') {
    const n = Number(etaMin);
    if (!(Number.isFinite(n) && n >= 0 && n <= JOB_LIMITS.etaMin)) throw new Error(`--eta-min must be minutes from now, 0..${JOB_LIMITS.etaMin} (got ${etaMin})`);
    job.etaAt = new Date(now + n * 60000).toISOString();
  }
  return job;
}

const RUN_WORDS = {
  scroll: 'scripted scroll run',
  record: 'finger recording',
  run: 'phone test run',
  gesture: 'robot-finger gesture run',
};

/**
 * The default description of a phone run from its own flags: 'scripted scroll run "patched"',
 * 'phone test run "a1-v3" (window driver; block A1, arm V, run 3)'. Scrubbed (a label never carries personal data
 * to the page). labels: iphone-run.mjs parseRunArgs().labels.
 */
export function phoneRunText(cmd, { label, driver, labels = {} } = {}) {
  const head = RUN_WORDS[cmd] || `phone ${cmd}`;
  const l = oneLine(label);
  const parts = [];
  if (driver) parts.push(`${driver} driver`);
  const pos = [labels.block ? `block ${labels.block}` : null, labels.arm ? `arm ${labels.arm}` : null, labels.run ? `run ${labels.run}` : null].filter(Boolean);
  if (labels.warmup) pos.push('warm-up');
  if (pos.length) parts.push(pos.join(', '));
  const tail = cmd === 'record' ? ' (a person scrolls the phone)' : parts.length ? ` (${parts.join('; ')})` : '';
  return sanitize(`${head}${l ? ` "${l}"` : ''}${tail}`, JOB_LIMITS.text);
}
