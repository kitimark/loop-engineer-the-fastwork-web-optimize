// Tier A verdicts (tools/bench.mjs mech), pure functions: per check and repeat, then across repeats;
// parity diffs of the settled-step snapshots; experiment rows (expected pass/fail per check).
//
// Per repeat:  baseline expectation fails on the baseline side -> VACUOUS (the probe no longer sees the
//              mechanism; with --on <o>: ALREADY-REMOVED, i.e. <o> removed it already), else the patched
//              expectation decides PASS or FAIL. A probe error (bad selector, missing accessor) -> ERROR.
// Repeats:     all the same -> that verdict; they disagree, or a session stalled at the quiescence cap
//              on too many steps -> FLAKY (a bug in the check; never retried until green).
// BASELINE-CHANGED replaces FAIL/VACUOUS when the mirror changed since the patch was made (design Q7).
import { meets, parseExpectation } from './bench-spec.mjs';

export const EXIT = { PASS: 0, 'ALREADY-REMOVED': 0, FAIL: 1, VACUOUS: 1, ERROR: 1, MISMATCH: 1, FLAKY: 3, 'BASELINE-CHANGED': 3 };

/** Verdict of one check in one repeat. */
export function checkRepeat(check, b, p, { on = null } = {}) {
  if (b == null || p == null || !Number.isFinite(b) || !Number.isFinite(p)) return 'ERROR';
  if (!meets(parseExpectation(check.baseline, { allowBaseline: false }), b)) return on ? 'ALREADY-REMOVED' : 'VACUOUS';
  return meets(parseExpectation(check.patched), p, b) ? 'PASS' : 'FAIL';
}

/** Combine per-repeat verdicts. `stalled`: a session hit the quiescence cap on too many steps. */
export function combineRepeats(verdicts, { stalled = false } = {}) {
  if (verdicts.includes('ERROR')) return 'ERROR';
  if (stalled) return 'FLAKY';
  return verdicts.every((v) => v === verdicts[0]) ? verdicts[0] : 'FLAKY';
}

/** A session is stalled when more than max(2, 25 %) of its steps hit the quiescence cap. */
export const isStalled = (capped, steps) => capped > Math.max(2, Math.ceil(0.25 * steps));

/** Mark failures as BASELINE-CHANGED when the patch no longer matches the mirror it was made on. */
export const baselineChanged = (verdict, drift) => (drift && ['FAIL', 'VACUOUS', 'ERROR'].includes(verdict) ? 'BASELINE-CHANGED' : verdict);

function sameValue(a, b, tol) {
  if (JSON.stringify(a) === JSON.stringify(b)) return true;
  if (tol == null || typeof a !== 'string' || typeof b !== 'string') return false;
  const x = parseFloat(a), y = parseFloat(b);
  return Number.isFinite(x) && Number.isFinite(y) && Math.abs(x - y) <= tol && a.replace(/^[\d.eE+-]+/, '') === b.replace(/^[\d.eE+-]+/, '');
}

/** Snapshot keys of one parity entry, with tolerances. */
export function parityKeys(entry) {
  const keys = [];
  for (const sel of entry.classes || []) keys.push({ key: 'class ' + sel });
  for (const [sel, prop, tol] of entry.props || []) keys.push({ key: `prop ${sel} ${prop}`, tol: tol ?? 0 });
  for (const [sel, attr] of entry.attrs || []) keys.push({ key: `attr ${sel} ${attr}` });
  return keys;
}

/**
 * Diff the baseline and patched snapshots ([{y, snap}] per settled step) for one parity entry.
 * Returns up to `max` diffs [{step, y, key, baseline, patched}] plus the total count.
 */
export function parityDiff(entry, base, patched, { max = 20 } = {}) {
  const diffs = [];
  let total = 0;
  if (base.length !== patched.length) { total++; diffs.push({ step: null, key: 'steps', baseline: base.length, patched: patched.length }); }
  const n = Math.min(base.length, patched.length);
  for (let i = 0; i < n; i++) for (const { key, tol } of parityKeys(entry)) {
    const a = base[i].snap?.[key], b = patched[i].snap?.[key];
    if (sameValue(a, b, tol)) continue;
    total++;
    if (diffs.length < max) diffs.push({ step: i, y: base[i].y, key, baseline: a, patched: b });
  }
  return { total, diffs };
}

/** Verdict of a parity entry over repeats: diff totals per repeat. */
export function parityVerdict(totals, { stalled = false } = {}) {
  if (stalled) return 'FLAKY';
  const v = totals.map((t) => (t === 0 ? 'PASS' : 'FAIL'));
  return v.every((x) => x === v[0]) ? v[0] : 'FLAKY';
}

/**
 * An experiment row: `expect.mech` ("pass"|"fail" for every check, or {checkId: "pass"|"fail"}) and
 * `expect.parity` against the observed verdicts. VACUOUS, ERROR, FLAKY and BASELINE-CHANGED pass
 * through (the row can't be judged); otherwise PASS when every expectation matched, else MISMATCH.
 */
export function experimentVerdict(expect, checks, parity) {
  const rows = [];
  const want = typeof expect.mech === 'string' ? Object.fromEntries(checks.map((c) => [c.id, expect.mech])) : (expect.mech || {});
  for (const c of checks) {
    if (!(c.id in want)) continue;
    rows.push({ id: c.id, expected: want[c.id], observed: c.verdict });
  }
  if (expect.parity) {
    const vs = parity.map((p) => p.verdict);
    const observed = vs.find((v) => ['FLAKY', 'ERROR'].includes(v)) || (vs.includes('FAIL') ? 'FAIL' : 'PASS');
    rows.push({ id: 'parity', expected: expect.parity, observed });
  }
  for (const r of rows) {
    if (['VACUOUS', 'ERROR', 'FLAKY', 'BASELINE-CHANGED', 'ALREADY-REMOVED'].includes(r.observed)) r.match = r.observed;
    else r.match = (r.expected === 'pass') === (r.observed === 'PASS') ? 'as expected' : 'MISMATCH';
  }
  const bad = rows.find((r) => r.match !== 'as expected');
  const verdict = !rows.length ? 'PASS' : !bad ? 'PASS' : rows.find((r) => ['VACUOUS', 'ERROR'].includes(r.match))?.match || rows.find((r) => r.match === 'MISMATCH')?.match || bad.match;
  return { verdict, rows };
}

/** Worst verdict -> exit code (0 pass, 1 fail, 3 inconclusive). */
export function exitCode(verdicts) {
  let code = 0;
  for (const v of verdicts) { const c = EXIT[v] ?? 1; if (c === 1) return 1; if (c === 3) code = 3; }
  return code;
}
