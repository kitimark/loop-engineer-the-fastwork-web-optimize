// Phone thermal test profile (incident I-186; user T-162 #3/#5, 2026-10-04): every phone run (iphone.mjs run | scroll |
// record | gesture) runs under a named profile, checked against the phone's thermal state at the START and END of its hold.
//   serious (default): Xcode's Device Conditions > Thermal State "Serious" (Is Induced = Yes), no heat pre-warm
//                      (gate profile xcode-serious of research/phone-thermal-gate, --accept-induced)
//   fair:              Nominal or Fair, not induced (gate profile real-fair, --expect fair)
// There is no "none" profile. The ceiling (Critical, or battery >= 44 C) holds in every profile.
//
// One read (readThermal, ~25 s on the phone): `xcrun xctrace record --instrument 'Thermal State' --device <udid>
// --all-processes --time-limit 10s` into a temp trace, `xctrace export` of its 'device-thermal-state-intervals' table
// (parseThermalTable: id/ref resolved, columns by mnemonic, the state from the "Current" track and induced from any
// "Induced" row, as research/phone-thermal-gate's parseThermalRows after 023caa54), plus one battery read
// (idevicediagnostics AppleSmartBattery).
// It installs nothing and does not touch Safari. Test seams: $FW_XCTRACE (stands in for `xcrun xctrace`),
// $FW_THERMAL_BATTERY (for idevicediagnostics; else $FW_IDEVICEDIAGNOSTICS), $FW_THERMAL_UDID (else the WDA runner
// config's udid). The device id is passed to xctrace only, never printed or stored.
//
// The verdict (gateVerdict) is a port of research/phone-thermal-gate/verdict.mjs (8e4eacbb), same codes:
//   0 PASS; 1 no read; 2 too cool; 3 ceiling (Critical or battery >= maxC); 4 induced by Xcode (fair); 5 Serious during
//   a Fair check; 6 timer grid disagrees (never here: the tools read no timer); 7 xcode-serious wanted, Serious is real heat.
//
// The hold: the caller's own `lock.mjs run chrome-measure` hold when the run is inside one ($FW_LOCK_HELD names its
// token), else the iphone lease. Per hold and profile one ledger, <state>/phone-profile/<resource>-<token>-<profile>.json:
// the start read (made by the hold's first run, or by `iphone.mjs profile`; only a passing read is kept, so N runs in
// one hold read once), the run files, and the end read. closeHold() makes the end read after the hold's last run
// (`lock.mjs run` calls it when its command ends; `iphone.mjs profile --end` by hand) and stamps every run file of the
// hold: meta.profile.end, meta.profile.drift and meta.profileDrift (true when the end read does not fit the profile; the
// data are kept). A start read that does not fit refuses the run (EXIT_PROFILE) and, when the tester can fix it in Xcode,
// posts ONE console action step for the tester (de-duplicated per owner + profile while it is open).
import { execFile } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { sharedStateDir } from './paths.mjs';
import { withGuard, parseHeld, status as lockStatus } from './lock.mjs';
import { writeJson, readJson } from './store.mjs';

/** iphone.mjs exit code: the phone's thermal state does not fit the run's profile at the hold's start (or at its end
 *  for `iphone.mjs profile --end`). Distinct from 1 (error / WAIT), 2 (refused in a shared slot), 3 (wda check), 6 (PARTIAL). */
export const EXIT_PROFILE = 8;
export const MAX_C = 44;
export const DEFAULT_PROFILE = 'serious';
export const XCODE_PATH = 'Xcode > Window > Devices and Simulators > the phone > Device Conditions > Thermal State';
export const PROFILES = Object.freeze({
  serious: Object.freeze({ name: 'serious', gate: 'xcode-serious', expect: 'serious', acceptInduced: true, want: 'Serious, induced by Xcode' }),
  fair: Object.freeze({ name: 'fair', gate: 'real-fair', expect: 'fair', acceptInduced: false, want: 'Nominal or Fair, not induced' }),
});
const STATES = /^(Nominal|Fair|Serious|Critical)$/;

/** --profile value -> profile name; undefined -> the default (serious). Throws on anything else, "none" included. */
export function parseProfile(v) {
  if (v === undefined || v === null) return DEFAULT_PROFILE;
  if (PROFILES[v]) return v;
  throw new Error(`--profile must be serious (default: Xcode-induced Serious) or fair (Nominal or Fair, not induced); got ${v === true || v === '' ? 'nothing' : `"${v}"`}. There is no profile "none" (I-186)`);
}

/** Port of research/phone-thermal-gate/verdict.mjs gateVerdict (8e4eacbb), unchanged logic. Pure. */
export function gateVerdict({ err = null, state = null, induced = null, battC = null, maxC = MAX_C, expect = 'serious', acceptInduced = false, timer = null }) {
  const profile = expect === 'fair' ? 'real-fair' : acceptInduced ? 'xcode-serious' : 'real-serious';
  const out = (code, why = '') => ({ code, why, profile });
  if (err || !state) return out(1, err || 'no thermal state row');
  if (state === 'Critical' || (battC ?? 0) >= maxC) return out(3, `ceiling (${state === 'Critical' ? 'Critical' : `batt >= ${maxC} C`})`);
  if (acceptInduced && expect === 'serious') {
    if (state !== 'Serious') return out(2, `too cool (${state})`);
    if (induced !== 'Yes') return out(7, 'Serious is real heat, not the Xcode condition (profile real-serious, not xcode-serious)');
    return out(0);
  }
  if (induced === 'Yes') return out(4, 'induced by Xcode');
  if (expect === 'serious' && state !== 'Serious') return out(2, `too cool (${state})`);
  if (expect === 'fair' && state === 'Serious') return out(5, 'too hot for a Fair check (Serious)');
  if (timer && ((state === 'Serious') !== (timer.median >= 25))) return out(6, `timer grid ${timer.median} ms disagrees with ${state} (LPM? page hidden?)`);
  return out(0);
}

/** The verdict of one read for a profile name. */
export function profileVerdict(name, read, { maxC = MAX_C } = {}) {
  const p = PROFILES[parseProfile(name)];
  return gateVerdict({ err: read?.error ?? null, state: read?.state ?? null, induced: read?.induced ?? null, battC: read?.battC ?? null, maxC, expect: p.expect, acceptInduced: p.acceptInduced });
}

// ---- xctrace export parsing --------------------------------------------------------------------------------------
const unesc = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
function parseXml(s) {
  const root = { tag: '#root', attrs: {}, children: [], text: '' }, stack = [root];
  const re = /<\?[^>]*\?>|<!--[\s\S]*?-->|<!\[CDATA\[([\s\S]*?)\]\]>|<\/([\w:.-]+)\s*>|<([\w:.-]+)((?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)/g;
  let m;
  while ((m = re.exec(s))) {
    if (m[1] !== undefined) { if (stack.length > 1) stack[stack.length - 1].text += m[1]; continue; }
    if (m[2]) { if (stack.length > 1) stack.pop(); continue; }
    if (m[3]) {
      const attrs = Object.fromEntries([...m[4].matchAll(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)].map((x) => [x[1], unesc(x[2] ?? x[3])]));
      const el = { tag: m[3], attrs, children: [], text: '' };
      stack[stack.length - 1].children.push(el);
      if (!m[5]) stack.push(el);
      continue;
    }
    if (m[6] && stack.length > 1) stack[stack.length - 1].text += unesc(m[6]);
  }
  return root;
}
const walk = (el, f) => { f(el); for (const c of el.children) walk(c, f); };

/**
 * `xctrace export --xpath …/table[@schema="device-thermal-state-intervals"]` output -> {schema, rows: [{state, induced,
 * track}], state, induced, changed, error}. xctrace writes a repeated value once (id="n" fmt="…") and then as ref="n":
 * refs are resolved. Columns by schema mnemonic (thermal-state, track-label, is-induced); without a schema, by value.
 * Under Xcode's Device Conditions xctrace writes two rows per interval: track "Current" (the state the device reports,
 * is-induced No) and track "Induced" (is-induced Yes, its cells refs to the Current row's), captured on our phone
 * 2026-10-04 (research/phone-thermal-gate, 023caa54; tests/fixtures/thermal-induced-serious-2rows.xml). The rules are that
 * parser's: state = the Current-track rows' state (all rows when no row has a track label); changed compares those
 * only; induced = Yes when any row says Yes, No when rows say only No; an unresolvable state cell is an error, never a
 * guess. Pure.
 */
export function parseThermalTable(xml) {
  const root = parseXml(String(xml || ''));
  const byId = new Map();
  walk(root, (e) => { if (e.attrs.id !== undefined && e.attrs.ref === undefined) byId.set(e.attrs.id, e); });
  let schema = null, cols = [];
  const rows = [];
  walk(root, (e) => {
    if (e.tag === 'schema' && schema === null) {
      schema = e.attrs.name ?? '';
      cols = e.children.filter((c) => c.tag === 'col').map((c) => (c.children.find((x) => x.tag === 'mnemonic')?.text || '').trim());
    }
    if (e.tag !== 'row') return;
    // direct children only: the narrative cell nests its own thermal-state ref
    const cells = e.children.map((c) => (c.tag === 'sentinel' ? null : c.attrs.ref !== undefined ? byId.get(c.attrs.ref) ?? { unresolved: true } : c))
      .map((c) => (c ? (c.unresolved ? { unresolved: true } : { fmt: c.attrs.fmt ?? null, raw: c.text.trim() || null }) : null));
    const val = (c) => (c && !c.unresolved ? c.fmt ?? c.raw : null);
    const col = (name, test) => { const i = cols.indexOf(name); return i >= 0 ? cells[i] : cells.find((c) => test.test(val(c) ?? '')); };
    let state = val(col('thermal-state', STATES));
    if (!STATES.test(state ?? '')) state = null;
    const track = val(col('track-label', /^(Current|Induced)$/)) || null;
    let induced = val(col('is-induced', /^(Yes|No)$/));
    induced = /^(yes|true|1)$/i.test(induced ?? '') ? 'Yes' : /^(no|false|0)$/i.test(induced ?? '') ? 'No' : null;
    rows.push({ state, induced, track });
  });
  const labelled = rows.some((r) => r.track);
  const cur = labelled ? rows.filter((r) => r.track === 'Current') : rows;
  const flags = rows.map((r) => r.induced).filter(Boolean);
  const induced = flags.includes('Yes') ? 'Yes' : flags.length ? 'No' : null;
  const out = (state, changed = false, error = null) => ({ schema, rows, state, induced, changed, error });
  if (!rows.length) return out(null, false, 'no thermal state row in the trace');
  if (!cur.length) return out(null, false, `no Current-track row (${rows.length} rows)`);
  if (cur.some((r) => !r.state)) return out(null, false, `unresolvable thermal-state cell (${rows.length} rows)`);
  const changed = new Set(cur.map((r) => r.state)).size > 1;
  return out(cur[cur.length - 1].state, changed, changed ? `state changed during the read (${rows.length} rows)` : null);
}

// ---- the read -----------------------------------------------------------------------------------------------------
const execAsync = (cmd, args, { timeout }) => new Promise((res) => {
  execFile(cmd, args, { encoding: 'utf8', timeout, maxBuffer: 64 << 20 }, (error, stdout) => res({ code: error ? (typeof error.code === 'number' ? error.code : 1) : 0, error: error && typeof error.code !== 'number' ? (error.killed ? 'timeout' : error.code || 'failed') : null, stdout: stdout || '' }));
});
const nodeOr = (bin, args) => (/\.m?js$/.test(bin) ? [process.execPath, [bin, ...args]] : [bin, args]);

/**
 * One thermal read of the phone: {at, ms, state, induced, battC, rows, error}. Never throws; `error` names what failed
 * (exit codes only: xctrace's stderr may name the device). `exec` (tests) replaces the process runner.
 */
export async function readThermal({ env = process.env, udid, timeLimitSec = 10, exec = execAsync, now = Date.now } = {}) {
  const t0 = now();
  const at = new Date(t0).toISOString();
  const done = (x) => ({ at, ms: now() - t0, state: null, induced: null, battC: null, rows: 0, error: null, ...x });
  let id = udid ?? env.FW_THERMAL_UDID;
  if (!id) { try { id = (await import('./wda-runner.mjs')).readConfig().udid; } catch {} }
  if (!id) return done({ error: 'no device: the WDA runner config has no udid (node tools/iphone.mjs wda status)' });
  const xc = env.FW_XCTRACE ? (args) => nodeOr(env.FW_XCTRACE, args) : (args) => ['xcrun', ['xctrace', ...args]];
  const dir = mkdtempSync(join(tmpdir(), 'fw-thermal-'));
  const trace = join(dir, 'gate.trace');
  let out = {};
  try {
    const rec = await exec(...xc(['record', '--instrument', 'Thermal State', '--device', id, '--all-processes', '--time-limit', `${timeLimitSec}s`, '--output', trace, '--no-prompt']), { timeout: 90000 });
    if (rec.code !== 0 || rec.error) out = { error: `xctrace record ${rec.error ? `failed (${rec.error})` : `exit ${rec.code}`}` };
    else {
      const ex = await exec(...xc(['export', '--input', trace, '--xpath', '/trace-toc/run[@number="1"]/data/table[@schema="device-thermal-state-intervals"]']), { timeout: 60000 });
      if (ex.code !== 0 || ex.error) out = { error: `xctrace export ${ex.error ? `failed (${ex.error})` : `exit ${ex.code}`}` };
      else {
        const t = parseThermalTable(ex.stdout);
        out = { state: t.state, induced: t.induced, rows: t.rows.length, ...(t.error ? { error: t.error } : {}) };
      }
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
  out.battC = await readBatteryC({ env, exec });
  return done(out);
}

/** Battery temperature (C) from idevicediagnostics' AppleSmartBattery, or null. */
export async function readBatteryC({ env = process.env, exec = execAsync } = {}) {
  const bin = env.FW_THERMAL_BATTERY || env.FW_IDEVICEDIAGNOSTICS || 'idevicediagnostics';
  const r = await exec(...nodeOr(bin, ['ioregentry', 'AppleSmartBattery']), { timeout: 15000 });
  if (r.code !== 0 || r.error) return null;
  const { parseBattery } = await import('./iphone-run.mjs');
  const b = parseBattery(r.stdout);
  return typeof b.temperatureC === 'number' ? b.temperatureC : null;
}

// ---- the hold and its ledger --------------------------------------------------------------------------------------
export const ledgerDir = () => join(sharedStateDir(), 'phone-profile');
const GUARD = 'phone-profile';
const KEEP_DAYS = 14;
export const ledgerKey = (hold, profile) => `${hold.resource}-${hold.token}-${profile}`;
const ledgerFile = (key) => join(ledgerDir(), `${key}.json`);

/** The hold a phone run of this process belongs to: {resource, token, owner} or null. Its own `lock.mjs run
 *  chrome-measure` hold when $FW_LOCK_HELD names the live holder's token, else the live iphone lease. */
export function currentHold({ env = process.env, cm, ip } = {}) {
  const tok = parseHeld(env.FW_LOCK_HELD)['chrome-measure'];
  if (tok) {
    const s = cm ?? lockStatus('chrome-measure');
    if (s?.holder && !s.stale && s.holder.token === tok) return { resource: 'chrome-measure', token: tok, owner: s.holder.owner };
  }
  const s = ip ?? lockStatus('iphone');
  if (s?.holder && !s.stale && s.holder.token) return { resource: 'iphone', token: s.holder.token, owner: s.holder.owner };
  return null;
}

const slim = (read, v) => ({ at: read.at, state: read.state, induced: read.induced, battC: read.battC, code: v.code, why: v.why || null, ...(read.error ? { error: read.error } : {}) });

/** The run record's meta.profile for a ledger (or a hold-less read): {name, gate, hold, start, end, drift}. */
export function profileRecord(lg, { cached = false } = {}) {
  return { name: lg.profile, gate: PROFILES[lg.profile].gate, hold: lg.hold ? `${lg.hold.resource}:${lg.hold.token}` : null, start: { ...lg.start, cached }, end: lg.end ?? null, drift: lg.end ? lg.end.code !== 0 : null };
}

function prune(now) {
  let names = [];
  try { names = readdirSync(ledgerDir()); } catch { return; }
  for (const f of names) {
    if (!f.endsWith('.json')) continue;
    try { if (now - statSync(join(ledgerDir(), f)).mtimeMs > KEEP_DAYS * 86400000) rmSync(join(ledgerDir(), f), { force: true }); } catch {}
  }
}

/** The refusal of a start read that does not fit: Error with exitCode EXIT_PROFILE, `step` (what the tester sets, or null). */
export class ProfileRefusal extends Error {
  constructor(message, { verdict, read, profile, fix } = {}) { super(message); this.exitCode = EXIT_PROFILE; this.verdict = verdict; this.read = read; this.profile = profile; this.fix = fix; }
}

/** What the phone shows, in words: "Nominal", "Serious (induced by Xcode)", "Serious (real heat, not induced)". */
export const stateWords = (r) => (r?.state ? `${r.state}${r.induced === 'Yes' ? ' (induced by Xcode)' : r.state === 'Serious' && r.induced === 'No' ? ' (real heat, not induced)' : ''}` : 'unknown');

/**
 * Plain-words refusal for a start read: {line, fix: 'set-serious' | 'stop-condition' | null, hint}. `fix` names the
 * tester's Xcode action (posted as a console step); null when nothing in Xcode fixes it (no read, real heat for fair,
 * the battery ceiling). Pure.
 */
export function refusalText(profile, read, v, { maxC = MAX_C } = {}) {
  const p = PROFILES[profile];
  const batt = typeof read?.battC === 'number' ? `, battery ${read.battC} C` : '';
  const head = `REFUSED profile ${profile} (${p.want}): phone is ${stateWords(read)}${batt}`;
  const setSerious = `set ${XCODE_PATH} > Serious > Start (leave it on), then run again`;
  const stop = `stop it: ${XCODE_PATH} > Stop (leave it off), then run again`;
  const cool = 'let the phone cool: node tools/wait.mjs phone-temp --below auto, then run again';
  let fix = null, what;
  if (v.code === 1) what = `could not read the thermal state (${v.why}): is the phone on the cable, unlocked and trusted, and Xcode installed? Retry: node tools/iphone.mjs profile --owner <you> --profile ${profile}`;
  else if (v.code === 3 && read?.induced === 'Yes' && read.state === 'Critical') { fix = profile === 'serious' ? 'set-serious' : 'stop-condition'; what = `the Xcode condition is Critical, above the ceiling; ${profile === 'serious' ? setSerious : stop}`; }
  else if (v.code === 3) what = `at the ceiling (Critical or battery >= ${maxC} C); ${cool}`;
  else if (profile === 'serious' && (v.code === 2 || v.code === 7)) { fix = 'set-serious'; what = setSerious; }
  else if (profile === 'fair' && v.code === 4) { fix = 'stop-condition'; what = stop; }
  else if (profile === 'fair' && v.code === 5) what = `too hot for the fair profile; ${cool}`;
  else what = v.why || `gate code ${v.code}`;
  return { line: `${head}; ${what} (gate ${p.gate} code ${v.code}, I-186)`, fix };
}

/** The console action step for the tester's Xcode fix (I-186): {title, instructions, meta}. */
export function stepFor({ owner, profile, fix }) {
  const meta = { phoneProfile: { owner, profile, fix, incident: 'I-186' } };
  if (fix === 'stop-condition') {
    return { title: `Xcode: stop the iPhone's thermal condition (test profile ${profile})`, meta,
      instructions: `On the Mac, in Xcode choose Window > Devices and Simulators, click Devices and select the iPhone; under Device Conditions click Stop. Leave it off. The ${profile} profile wants the phone at Nominal or Fair with no Xcode condition. Then click Done here; ${owner} runs again.` };
  }
  return { title: `Xcode: set the iPhone's Thermal State to Serious (test profile ${profile})`, meta,
    instructions: `On the Mac, in Xcode choose Window > Devices and Simulators, click Devices and select the iPhone; under Device Conditions set Condition to Thermal State and Profile to Serious, then click Start. Leave it on (keep the cable in: it ends when the phone disconnects from Xcode). The ${profile} profile wants the phone at Serious induced by Xcode. Then click Done here; ${owner} runs again.` };
}

/** An open (pending or active) step this owner already has for this profile, or null. Pure. */
export const openProfileStep = (steps, { owner, profile }) => steps.find((s) => (s.status === 'pending' || s.status === 'active') && s.meta?.phoneProfile?.owner === owner && s.meta.phoneProfile.profile === profile) || null;

/**
 * Post the ONE console action step for the tester, de-duplicated: while an open step of this owner and profile exists,
 * return it ({step, posted: false}); else post it ({step, posted: true}). An action step without a recorded part is not a
 * phone step (lib/phone-step.mjs isPhoneStep), so the I-123 one-phone-step rule does not apply. Atomic under the
 * console store's guard.
 */
export async function postProfileStep({ owner, profile, fix }) {
  const C = await import('./console.mjs');
  const st = stepFor({ owner, profile, fix });
  let existing = null;
  try {
    const step = await C.post({ by: owner, kind: 'action', title: st.title, instructions: st.instructions, meta: st.meta }, {
      refuse: (_s, steps) => { existing = openProfileStep(steps, { owner, profile }); return existing ? `EXISTS ${existing.id}` : null; },
    });
    return { step, posted: true };
  } catch (e) {
    if (existing) return { step: existing, posted: false };
    throw e;
  }
}

/**
 * The hold's start read for `profile` (I-186). A passing read kept in the hold's ledger is reused (`cached`): one read per
 * hold, not per run. Otherwise one read now (`force` always reads); a pass is kept, a misfit throws ProfileRefusal after
 * posting the tester's step (`postStep`; null when no Xcode action fixes it). Returns {ledger, key, record(), saved(file),
 * cached, read, verdict}. `hold` null (no lease, no hold): reads, keeps nothing.
 */
export async function startGate({ profile = DEFAULT_PROFILE, owner, hold, read = () => readThermal(), force = false, log = console.log, postStep = postProfileStep, now = Date.now } = {}) {
  profile = parseProfile(profile);
  const key = hold ? ledgerKey(hold, profile) : null;
  const old = key ? readJson(ledgerFile(key)) : null;
  if (old && !force && old.start?.code === 0 && !old.end) return handle(old, { cached: true });
  const r = await read();
  const v = profileVerdict(profile, r);
  if (v.code !== 0) {
    const t = refusalText(profile, r, v);
    let msg = t.line;
    if (t.fix && postStep) {
      try {
        const p = await postStep({ owner, profile, fix: t.fix });
        msg += `\nSTEP ${p.step.id} ${p.posted ? 'posted' : 'already open'} on the user console for the tester: ${p.step.title}`;
      } catch (e) { msg += `\n(no console step: ${e.message})`; }
    }
    // a misfit read invalidates a kept start read of this hold (the next run reads again; its runs stay listed)
    if (old && !old.end) { try { await withGuard(GUARD, () => { const cur = readJson(ledgerFile(key)); if (cur && !cur.end) writeJson(ledgerFile(key), { ...cur, start: slim(r, v) }); }); } catch {} }
    throw new ProfileRefusal(msg, { verdict: v, read: r, profile, fix: t.fix });
  }
  const lg = { key, hold, owner, profile, gate: PROFILES[profile].gate, start: slim(r, v), end: null, runs: [], createdAt: new Date(now()).toISOString() };
  if (key) {
    await withGuard(GUARD, () => { mkdirSync(ledgerDir(), { recursive: true }); prune(now()); const cur = readJson(ledgerFile(key)); writeJson(ledgerFile(key), { ...lg, runs: cur?.runs && !cur.end ? cur.runs : [] }); });
  }
  log(`PROFILE ${profile} ok${key ? ' at the hold\'s start' : ''}: phone is ${stateWords(r)}${typeof r.battC === 'number' ? `, battery ${r.battC} C` : ''} (gate ${lg.gate}; read ${Math.round((r.ms ?? 0) / 1000)} s)`);
  return handle(lg, { cached: false, read: r, verdict: v });
}

function handle(lg, { cached, read = null, verdict = null }) {
  return {
    ledger: lg, key: lg.key, cached, read, verdict,
    record: () => profileRecord(lg, { cached }),
    saved: (file, extra = {}) => addRun(lg.key, file, extra),
  };
}

/** Register a written run record in its hold's ledger (the end read stamps it). Best effort, never throws. */
export async function addRun(key, file, extra = {}) {
  if (!key || !file) return;
  try {
    await withGuard(GUARD, () => {
      const lg = readJson(ledgerFile(key));
      if (!lg) return;
      if (!lg.runs.some((x) => x.file === file)) lg.runs.push({ file, at: new Date().toISOString(), ...extra });
      writeJson(ledgerFile(key), lg);
    });
  } catch {}
}

/** Stamp one run record with the hold's end read: meta.profile.end / drift and meta.profileDrift. Returns true when written. */
export function stampRecord(file, end, drift) {
  const j = readJson(file);
  if (!j || typeof j !== 'object') return false;
  j.meta = j.meta && typeof j.meta === 'object' ? j.meta : {};
  j.meta.profile = { ...(j.meta.profile || {}), end, drift };
  j.meta.profileDrift = drift;
  try { writeJson(file, j); return true; } catch { return false; }
}

/** Open ledgers of one hold (any profile): those with no end read yet. */
export function openLedgers({ resource, token }) {
  let names = [];
  try { names = readdirSync(ledgerDir()); } catch { return []; }
  const pre = `${resource}-${token}-`;
  return names.filter((f) => f.startsWith(pre) && f.endsWith('.json')).map((f) => readJson(join(ledgerDir(), f))).filter((lg) => lg && !lg.end);
}

/**
 * The hold's end read (I-186): for every open ledger of the hold with runs, one read (per profile), the verdict, and
 * every run file stamped (profileDrift true on a misfit; nothing deleted). A ledger without runs is closed unread.
 * Returns [{profile, gate, start, end, drift, runs, stamped}] (empty: no phone run in this hold). Never throws.
 */
export async function closeHold({ resource, token, read = () => readThermal(), log = console.log } = {}) {
  const out = [];
  if (!resource || !token) return out;
  for (const lg of openLedgers({ resource, token })) {
    try {
      let end = null;
      if (lg.runs.length) {
        const r = await read();
        end = slim(r, profileVerdict(lg.profile, r));
      } else end = { at: new Date().toISOString(), skipped: 'no run in this hold', code: 0 };
      const drift = lg.runs.length ? end.code !== 0 : false;
      let stamped = 0;
      for (const x of lg.runs) if (stampRecord(x.file, end, drift)) stamped++;
      await withGuard(GUARD, () => { const cur = readJson(ledgerFile(lg.key)) || lg; writeJson(ledgerFile(lg.key), { ...cur, end, drift, closedAt: new Date().toISOString() }); });
      const sum = { profile: lg.profile, gate: lg.gate, start: { state: lg.start.state, induced: lg.start.induced, battC: lg.start.battC }, end: { state: end.state ?? null, induced: end.induced ?? null, battC: end.battC ?? null, code: end.code, ...(end.error ? { error: end.error } : {}) }, drift, runs: lg.runs.length, stamped };
      if (!lg.runs.length) continue;
      out.push(sum);
      log(drift
        ? `PROFILE-DRIFT ${lg.profile}: at the hold's end the phone is ${stateWords(end)}${typeof end.battC === 'number' ? `, battery ${end.battC} C` : ''} (gate ${lg.gate} code ${end.code}${end.why ? `: ${end.why}` : ''}); ${stamped} of ${lg.runs.length} run records marked profileDrift: true (data kept, I-186)`
        : `PROFILE ${lg.profile} held to the hold's end: phone is ${stateWords(end)}${typeof end.battC === 'number' ? `, battery ${end.battC} C` : ''}; ${stamped} run records stamped (I-186)`);
    } catch (e) { log(`PROFILE end read failed for ${lg.key}: ${e.message} (records keep profile.end null)`); }
  }
  return out;
}

/** Test helper / diagnostics: a ledger by key. */
export const readLedger = (key) => readJson(ledgerFile(key));
