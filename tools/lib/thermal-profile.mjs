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
// "Induced" row, as research/phone-thermal-gate's parseThermalRows after 023caa54; I-201: plus `condition`, the Induced
// row's own level, kept in the read and the ledger's start/end records), plus one battery read
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
// posts ONE console action step for the tester (de-duplicated per owner + profile while it is open, and for 30 min after
// the user answered one unless the condition read changed, I-201). A Critical phone under Xcode's Serious condition (the
// condition right, the phone itself above it) refuses with reason phone-above-condition: with a cool battery (< 38 C)
// the step asks to stop the condition, wait ~2 min and start Serious again (fix restart-condition, OBSERVED remedy), else
// no step, wait to cool (I-201; refusalText lists the reason codes; the exit code stays 8, the gate codes
// research/phone-thermal-gate's).
// I-225 (user T-228 #15): in tool mode (startGate condition 'tool': `iphone.mjs profile --condition tool`, or
// $FW_PHONE_CONDITION=tool) the condition is ours (tools/thermal.mjs, I-199): a misfit posts no step; a serious one adds
// the line `REARM … node tools/iphone.mjs rearm --owner <o>` (the probed re-arm, lib/thermal-rearm.mjs), a fair one
// `CLEAR … node tools/thermal.mjs clear` (toolHint). I-233: a read under a condition carries `holder` (holderName:
// 'thermal.mjs' while our live set holds that level, else 'Xcode'); the words name it (stateWords, refusalText); in tool
// mode a passing Serious read whose holder is not thermal.mjs refuses (reason condition-not-ours, gate code 0).
import { execFile } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { sharedStateDir } from './paths.mjs';
import { withGuard, parseHeld, status as lockStatus } from './lock.mjs';
import { writeJson, readJson } from './store.mjs';
import { liveHolder } from './thermal-holder.mjs';

/** iphone.mjs exit code: the phone's thermal state does not fit the run's profile at the hold's start (or at its end
 *  for `iphone.mjs profile --end`). Distinct from 1 (error / WAIT), 2 (refused in a shared slot), 3 (wda check), 6 (PARTIAL). */
export const EXIT_PROFILE = 8;
export const MAX_C = 44;
/** I-201: below this battery temperature a Critical phone under Xcode's Serious condition gets the restart-condition step. */
export const COOL_C = 38;
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

/**
 * I-225 (user T-228 #15, lead 10-07): who sets the condition for this hold: 'xcode' (default: the tester in Xcode's Device
 * Conditions, so a fixable misfit posts the tester's console step) or 'tool' (tools/thermal.mjs, I-199: no user step; a
 * serious misfit points to `iphone.mjs rearm`, a fair one to `thermal.mjs clear`). Never both in one block: thermal.mjs set
 * replaces Xcode's condition and its clear leaves none (I-199 stage 3). --condition on `iphone.mjs profile`, else
 * $FW_PHONE_CONDITION (every gate of the process: run, scroll, record, gesture), else xcode. Throws on anything else.
 */
export function parseCondition(v, env = process.env) {
  const x = v ?? env.FW_PHONE_CONDITION ?? 'xcode';
  if (x === 'xcode' || x === 'tool') return x;
  throw new Error(`--condition must be xcode (default: the tester's Xcode, a console step) or tool (thermal.mjs, I-199: no step, iphone.mjs rearm); got ${x === true || x === '' ? 'nothing' : `"${x}"`} (I-225)`);
}
const REARM_REASONS = new Set(['phone-above-condition', 'condition-critical', 'condition-wrong', 'condition-missing', 'condition-not-ours']);
/** I-225: the tool-mode line after a refusal (what the agent runs itself, no user step), or null. Pure. */
export function toolHint(profile, t, owner) {
  if (profile === 'serious' && REARM_REASONS.has(t.reason)) return `REARM the thermal tool fixes it (no user step): node tools/iphone.mjs rearm --owner ${owner} (inside your phone hold: thermal.mjs clear, plain reads once a minute until Nominal/Fair, set serious, settle 120 s, the profile read; I-225)`;
  if (profile === 'fair' && t.fix === 'stop-condition') return `CLEAR the thermal tool fixes it (no user step): node tools/thermal.mjs clear --owner ${owner} (inside your phone hold; I-199)`;
  return null;
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
 * track}], state, induced, condition, changed, error}. `condition` (I-201) is the Xcode condition's own level: the state of
 * the last "Induced" row (null without one); `state` stays the phone's own (Current) level, which may be above it (06:14Z
 * 2026-10-05: Current Critical, Induced Serious). xctrace writes a repeated value once (id="n" fmt="…") and then as ref="n":
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
  // I-201: the condition's own level, from the last Induced-track row (unlabelled: the last induced row), never folded
  // into `state`: the lead's read of 2026-10-05 06:14Z had Current Critical under an Induced (Xcode) Serious
  const ind = rows.filter((r) => (labelled ? r.track === 'Induced' : r.induced === 'Yes') && r.state);
  const condition = ind.length ? ind[ind.length - 1].state : null;
  const out = (state, changed = false, error = null) => ({ schema, rows, state, induced, condition, changed, error });
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
export async function readThermal({ env = process.env, udid, timeLimitSec = 10, exec = execAsync, now = Date.now, holder = () => liveHolder() } = {}) {
  const t0 = now();
  const at = new Date(t0).toISOString();
  const done = (x) => ({ at, ms: now() - t0, state: null, induced: null, condition: null, battC: null, rows: 0, error: null, holder: null, ...x });
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
        out = { state: t.state, induced: t.induced, condition: t.condition, rows: t.rows.length, ...(t.error ? { error: t.error } : {}) };
      }
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
  out.battC = await readBatteryC({ env, exec });
  if (out.induced === 'Yes') out.holder = holderName(holder(), out.condition);
  return done(out);
}

/** I-233: who holds an induced condition: 'thermal.mjs' when our live `set` (lib/thermal-holder.mjs) holds a profile of the
 *  condition's level (ThermalSerious for Serious; a set of another level was replaced by someone), else 'Xcode' (another
 *  client: in our setup, Xcode's Device Conditions). Pure. */
export function holderName(h, condition) {
  if (!h) return 'Xcode';
  if (condition && h.profile && !String(h.profile).toLowerCase().includes(String(condition).toLowerCase())) return 'Xcode';
  return 'thermal.mjs';
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

const slim = (read, v) => ({ at: read.at, state: read.state, induced: read.induced, condition: read.condition ?? null, ...(read.holder ? { holder: read.holder } : {}), battC: read.battC, code: v.code, why: v.why || null, ...(read.error ? { error: read.error } : {}) });

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

/** The refusal of a start read that does not fit: Error with exitCode EXIT_PROFILE, `fix` (what the tester sets in Xcode,
 *  or null) and `reason` (refusalText's reason code; I-201). */
export class ProfileRefusal extends Error {
  constructor(message, { verdict, read, profile, fix, reason } = {}) { super(message); this.exitCode = EXIT_PROFILE; this.verdict = verdict; this.read = read; this.profile = profile; this.fix = fix; this.reason = reason ?? null; }
}

/** What the phone shows, in words: "Nominal", "Serious (induced by Xcode)", "Serious (real heat, not induced)", and
 *  (I-201) "Critical (Xcode condition Serious)" when the phone's own state is not the condition's level. */
export const stateWords = (r) => (r?.state ? `${r.state}${r.induced === 'Yes' ? (r.condition && r.condition !== r.state ? ` (${r.holder || 'Xcode'} condition ${r.condition})` : ` (induced by ${r.holder || 'Xcode'})`) : r.state === 'Serious' && r.induced === 'No' ? ' (real heat, not induced)' : ''}` : 'unknown');

/**
 * Plain-words refusal for a start read: {line, fix: 'set-serious' | 'stop-condition' | null, reason}. `fix` names the
 * tester's Xcode action (posted as a console step); null when nothing in Xcode fixes it. The exit code stays EXIT_PROFILE
 * (8) and the gate codes stay research/phone-thermal-gate's; `reason` tells the cases apart (I-201), also at the end of
 * the line as "(gate <gate> code <n>, reason <reason>, I-186)":
 *   no-read                no thermal read (code 1); no step
 *   condition-critical     the Xcode condition itself is Critical (or its level is unknown) and the phone Critical; step
 *   condition-wrong        a Critical phone under a condition of the wrong level for the profile (fair: any); step
 *   phone-above-condition  serious: the condition IS Serious, the phone itself is Critical above it (06:14Z read of
 *                          2026-10-05). Battery < COOL_C (38 C): stop the condition, wait until a re-read shows below
 *                          Critical (~2 min), start Serious again; step fix 'restart-condition' (once per 30 min,
 *                          postProfileStep). Battery warm or unread: wait for it to cool, no step.
 *                          OBSERVED in our setup, one episode, cause unknown (lead, 2026-10-05): under Serious with a
 *                          30 C battery the phone read Critical 04:56-06:44Z, also after a quick Stop/Start at 06:30Z;
 *                          after Stop it read Critical (06:44), Serious (06:45), Nominal (06:46) with no condition;
 *                          after Start Serious at 06:53 it read Serious twice. So "wait for it to drop" under the
 *                          condition did not end it; a Stop, a ~2 min wait and a new Start did.
 *   ceiling                Critical without a condition, or battery >= maxC; cool down, no step
 *   condition-missing      serious: no Xcode condition (too cool, code 2, or real-heat Serious, code 7); step
 *   condition-on           fair: an Xcode condition is on (code 4); step (stop it)
 *   too-hot                fair: real-heat Serious (code 5); cool down, no step
 *   condition-not-ours     serious, tool mode (I-233): the read passes (code 0) but the condition's holder is not our
 *                          thermal.mjs set (Xcode left on); take it over with rearm, no step
 *   other                  anything else (the gate's own why)
 * `condition` 'tool' (I-233): the head wants "Serious, induced by thermal.mjs" and the actions name the thermal tool (the
 * REARM / CLEAR line startGate adds), never Xcode's menus; the condition is named by its holder (read.holder) in both modes.
 * Pure.
 */
export function refusalText(profile, read, v, { maxC = MAX_C, condition = 'xcode' } = {}) {
  const p = PROFILES[profile];
  const tool = condition === 'tool'; // I-233: the thermal tool sets the condition: name it, no Xcode actions
  const H = read?.holder || 'Xcode'; // who holds the condition the phone reads (readThermal holderName)
  const batt = typeof read?.battC === 'number' ? `, battery ${read.battC} C` : '';
  const head = `REFUSED profile ${profile} (${tool && profile === 'serious' ? 'Serious, induced by thermal.mjs' : p.want}): phone is ${stateWords(read)}${batt}`;
  const setSerious = tool ? 'set ours with the thermal tool (the REARM line below)' : `set ${XCODE_PATH} > Serious > Start (leave it on), then run again`;
  const stop = tool ? 'end it with the thermal tool (the CLEAR line below)' : `stop it: ${XCODE_PATH} > Stop (leave it off), then run again`;
  const cool = 'let the phone cool: node tools/wait.mjs phone-temp --below auto, then run again';
  const cond = read?.condition ?? null;
  let fix = null, what, reason = 'other';
  if (v.code === 1) { reason = 'no-read'; what = `could not read the thermal state (${v.why}): is the phone on the cable, unlocked and trusted, and Xcode installed? Retry: node tools/iphone.mjs profile --owner <you> --profile ${profile}`; }
  else if (v.code === 3 && read?.induced === 'Yes' && read.state === 'Critical') {
    if (profile === 'serious' && cond === 'Serious') {
      reason = 'phone-above-condition';
      if (typeof read.battC === 'number' && read.battC < COOL_C) fix = 'restart-condition';
      what = tool ? `the phone itself reads Critical above the ${H} condition Serious; re-arm with the thermal tool (the REARM line below: clear, plain reads until Nominal/Fair, set serious, settle)`
        : `the phone itself reads Critical above the ${H} condition Serious; if the battery is cool (< ${COOL_C} °C), stop the ${H} condition, wait until a re-read shows below Critical (about 2 min), then start Serious again; otherwise wait for it to cool; re-read with node tools/iphone.mjs profile --owner <you>`;
    }
    else if ((cond ?? 'Critical') === 'Critical') { reason = 'condition-critical'; fix = profile === 'serious' ? 'set-serious' : 'stop-condition'; what = `the ${H} condition is Critical, above the ceiling; ${profile === 'serious' ? setSerious : stop}`; }
    else { reason = 'condition-wrong'; fix = profile === 'serious' ? 'set-serious' : 'stop-condition'; what = profile === 'serious' ? `the ${H} condition is ${cond}, not Serious, and the phone is Critical, above the ceiling; ${setSerious}` : `an ${H} condition (${cond}) is on and the phone is Critical, above the ceiling; ${stop}`; }
  }
  else if (v.code === 3) { reason = 'ceiling'; what = `at the ceiling (Critical or battery >= ${maxC} C); ${cool}`; }
  else if (profile === 'serious' && (v.code === 2 || v.code === 7)) { reason = 'condition-missing'; fix = 'set-serious'; what = tool ? `no condition on: ${setSerious}` : setSerious; }
  else if (v.code === 0 && tool && profile === 'serious') { reason = 'condition-not-ours'; what = `the Serious condition is held by ${H}, not by our thermal.mjs set: take it over with the thermal tool (the REARM line below)`; } // I-233
  else if (profile === 'fair' && v.code === 4) { reason = 'condition-on'; fix = 'stop-condition'; what = stop; }
  else if (profile === 'fair' && v.code === 5) { reason = 'too-hot'; what = `too hot for the fair profile; ${cool}`; }
  else what = v.why || `gate code ${v.code}`;
  return { line: `${head}; ${what} (gate ${p.gate} code ${v.code}, reason ${reason}, I-186)`, fix, reason };
}

/** The console action step for the tester's Xcode fix (I-186): {title, instructions, meta}. meta.phoneProfile.read is the
 *  condition read the step was posted for ({state, induced, condition}; I-201 de-duplication). */
export function stepFor({ owner, profile, fix, read = null }) {
  const meta = { phoneProfile: { owner, profile, fix, incident: 'I-186', read: { state: read?.state ?? null, induced: read?.induced ?? null, condition: read?.condition ?? null } } };
  if (fix === 'restart-condition') { // I-201: the phone reads Critical under the right Serious condition, battery cool
    const batt = typeof read?.battC === 'number' ? ` (${read.battC} C)` : '';
    return { title: `Xcode: stop, then restart the iPhone's Serious thermal condition (test profile ${profile})`, meta,
      instructions: `The iPhone reads Critical although Xcode's condition is Serious and the battery is cool${batt}. On the Mac, in Xcode choose Window > Devices and Simulators, click Devices and select the iPhone; under Device Conditions click Stop. Wait about 2 minutes (until the phone is below Critical), then set Condition to Thermal State and Profile to Serious, then click Start. Leave it on (keep the cable in). Then click Done here; ${owner} reads it again and runs.` };
  }
  if (fix === 'stop-condition') {
    return { title: `Xcode: stop the iPhone's thermal condition (test profile ${profile})`, meta,
      instructions: `On the Mac, in Xcode choose Window > Devices and Simulators, click Devices and select the iPhone; under Device Conditions click Stop. Leave it off. The ${profile} profile wants the phone at Nominal or Fair with no Xcode condition. Then click Done here; ${owner} runs again.` };
  }
  return { title: `Xcode: set the iPhone's Thermal State to Serious (test profile ${profile})`, meta,
    instructions: `On the Mac, in Xcode choose Window > Devices and Simulators, click Devices and select the iPhone; under Device Conditions set Condition to Thermal State and Profile to Serious, then click Start. Leave it on (keep the cable in: it ends when the phone disconnects from Xcode). The ${profile} profile wants the phone at Serious induced by Xcode. Then click Done here; ${owner} runs again.` };
}

/** An open (pending or active) step this owner already has for this profile, or null. Pure. */
export const openProfileStep = (steps, { owner, profile }) => steps.find((s) => (s.status === 'pending' || s.status === 'active') && s.meta?.phoneProfile?.owner === owner && s.meta.phoneProfile.profile === profile) || null;

/** I-201: after the tester answered a step, no new one for this long unless the condition read changed. */
export const STEP_QUIET_MS = 30 * 60000;

/**
 * I-201: the latest step of this owner and profile the user answered within STEP_QUIET_MS of `now` whose condition read
 * (meta.phoneProfile.read: induced, condition; the phone's own state does not count) equals `read`'s, or null. Pure.
 */
export function recentProfileStep(steps, { owner, profile, read, now = Date.now() }) {
  const same = (a) => (a?.induced ?? null) === (read?.induced ?? null) && (a?.condition ?? null) === (read?.condition ?? null);
  const hits = steps.filter((s) => s.status === 'answered' && s.meta?.phoneProfile?.owner === owner && s.meta.phoneProfile.profile === profile)
    .map((s) => ({ s, at: Date.parse(s.result?.at ?? s.updatedAt ?? '') }))
    .filter((x) => Number.isFinite(x.at) && now - x.at <= STEP_QUIET_MS)
    .sort((a, b) => b.at - a.at);
  return hits.length && same(hits[0].s.meta.phoneProfile.read) ? hits[0].s : null;
}

/**
 * Post the ONE console action step for the tester, de-duplicated: while an open step of this owner and profile exists,
 * return it ({step, posted: false}); when the user answered one within 30 min and the condition read is unchanged
 * (I-201), return that one ({step, posted: false, recent: true}); else post it ({step, posted: true}). An action step
 * without a recorded part is not a phone step (lib/phone-step.mjs isPhoneStep), so the I-123 one-phone-step rule does
 * not apply. Atomic under the console store's guard.
 */
export async function postProfileStep({ owner, profile, fix, read = null, now = Date.now() }) {
  const C = await import('./console.mjs');
  const st = stepFor({ owner, profile, fix, read });
  let existing = null, recent = false;
  try {
    const step = await C.post({ by: owner, kind: 'action', title: st.title, instructions: st.instructions, meta: st.meta }, {
      refuse: (_s, steps) => {
        existing = openProfileStep(steps, { owner, profile });
        if (existing) return `EXISTS ${existing.id}`;
        existing = recentProfileStep(steps, { owner, profile, read, now });
        recent = !!existing;
        return existing ? `ANSWERED ${existing.id}` : null;
      },
    });
    return { step, posted: true };
  } catch (e) {
    if (existing) return { step: existing, posted: false, ...(recent ? { recent: true } : {}) };
    throw e;
  }
}

/**
 * The hold's start read for `profile` (I-186). A passing read kept in the hold's ledger is reused (`cached`): one read per
 * hold, not per run. Otherwise one read now (`force` always reads); a pass is kept, a misfit throws ProfileRefusal after
 * posting the tester's step (`postStep`; null when no Xcode action fixes it). Returns {ledger, key, record(), saved(file),
 * cached, read, verdict}. `hold` null (no lease, no hold): reads, keeps nothing. `condition` 'tool' (I-225, parseCondition):
 * a misfit posts no step and adds toolHint's line (REARM / CLEAR) after the refusal line instead.
 */
export async function startGate({ profile = DEFAULT_PROFILE, owner, hold, read = () => readThermal(), force = false, log = console.log, postStep = postProfileStep, now = Date.now, condition = 'xcode' } = {}) {
  profile = parseProfile(profile);
  condition = parseCondition(condition);
  const key = hold ? ledgerKey(hold, profile) : null;
  const old = key ? readJson(ledgerFile(key)) : null;
  if (old && !force && old.start?.code === 0 && !old.end) return handle(old, { cached: true });
  const r = await read();
  const v = profileVerdict(profile, r);
  // I-233: in tool mode the Serious condition must be ours (P-158 03:07Z ran a tool-serious block on Xcode's condition)
  const notOurs = condition === 'tool' && profile === 'serious' && v.code === 0 && r.holder !== 'thermal.mjs';
  if (v.code !== 0 || notOurs) {
    const t = refusalText(profile, r, v, { condition });
    let msg = t.line;
    if (condition === 'tool') { const h = toolHint(profile, t, owner); if (h) msg += `\n${h}`; } // I-225: no Xcode step
    else if (t.fix && postStep) {
      try {
        const p = await postStep({ owner, profile, fix: t.fix, read: r, now: now() });
        if (p.recent) {
          const ago = Math.max(0, Math.round((now() - Date.parse(p.step.result?.at ?? p.step.updatedAt)) / 60000));
          msg += `\nSTEP ${p.step.id} answered ${ago} min ago and the condition read is unchanged (induced ${r.induced ?? 'unknown'}, condition ${r.condition ?? 'none'}): no new step for 30 min after an answer (I-201)`;
        } else msg += `\nSTEP ${p.step.id} ${p.posted ? 'posted' : 'already open'} on the user console for the tester: ${p.step.title}`;
      } catch (e) { msg += `\n(no console step: ${e.message})`; }
    }
    // a misfit read invalidates a kept start read of this hold (the next run reads again; its runs stay listed)
    if (old && !old.end) { try { await withGuard(GUARD, () => { const cur = readJson(ledgerFile(key)); if (cur && !cur.end) writeJson(ledgerFile(key), { ...cur, start: slim(r, v) }); }); } catch {} }
    throw new ProfileRefusal(msg, { verdict: v, read: r, profile, fix: t.fix, reason: t.reason });
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
      const sum = { profile: lg.profile, gate: lg.gate, start: { state: lg.start.state, induced: lg.start.induced, condition: lg.start.condition ?? null, battC: lg.start.battC }, end: { state: end.state ?? null, induced: end.induced ?? null, condition: end.condition ?? null, battC: end.battC ?? null, code: end.code, ...(end.error ? { error: end.error } : {}) }, drift, runs: lg.runs.length, stamped };
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
