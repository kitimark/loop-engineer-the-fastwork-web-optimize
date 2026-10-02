#!/usr/bin/env node
// Phone heat study (T-029, ticket P-068 in research/phone-heat/README.md). One-off research tool; it changes nothing in
// tools/ and only CALLS tools/iphone.mjs. Pre-registered: the scorer below is the one the ticket names (its sha in the
// README); a change after data is a new ticket.
//
//   node research/phone-heat/heat.mjs keys                      # AppleSmartBattery key NAMES (no values), depth <= 2
//   node research/phone-heat/heat.mjs once [--label l]          # one battery sample to stdout (whitelisted keys)
//   node research/phone-heat/heat.mjs segment --session H1|H2 --seg <n> --arm F|A|B|X --url <u> --owner <o>
//        [--seconds 360] [--every 30] [--out out/phone-heat/samples.jsonl] [--dry-run]
//        # open <u>; battery every --every s from t=0 to t=--seconds; back-to-back `iphone.mjs run` W cycles
//        # (the ticket's routine) until t=--seconds; then park. Appends samples + one segment line to --out.
//   node research/phone-heat/heat.mjs score [--in out/phone-heat/samples.jsonl] [--out out/phone-heat/score.json]
//
// Hard rule 12: only whitelisted numeric/boolean battery keys are kept; `keys` prints names only; URLs go through
// lanSafeUrl. $FW_IDEVICEDIAGNOSTICS names the executable (tests / dry runs).
import { spawn } from 'node:child_process';
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

// ---- pre-registered constants (ticket P-068) ----
export const PRE = Object.freeze({
  windowS: [60, 360],   // slope window inside a segment (s): the first minute is the battery sensor's lag
  idlePhaseS: 180,      // segment = idle on the page [0, 180 s), then W scroll cycles [180, 360 s]
  idleWinS: [60, 180],  // descriptive per-phase slopes (5 samples each: too noisy to decide on)
  cycleWinS: [210, 360],
  minSamples: 9,        // of the 11 expected in the window; fewer = segment VOID
  k: 0.045,             // /min, Newton term (dSlope/dT): load fit -0.040, parked cooling fit 0.052 (README "Noise")
  tRefC: 37.0,          // corrected slopes are referred to this battery temperature
  moreC: 0.10,          // °C/min: "heats more" needs this in BOTH sessions (A vs B)
  sameC: 0.05,          // °C/min: "about the same" needs |delta| below this in BOTH sessions
  fixC: 0.05,           // °C/min: X vs B, "the fixes cool the phone" needs this in BOTH sessions
});
export const KEEP = ['Temperature', 'VirtualTemperature', 'IsCharging', 'ExternalConnected', 'FullyCharged', 'CurrentCapacity', 'Voltage', 'Amperage', 'InstantAmperage'];

// ---- a small XML plist reader (dict, array, key, integer, real, string, true, false, data, date) ----
export function parsePlist(xml) {
  const toks = xml.replace(/<\?xml[^>]*>|<!DOCTYPE[^>]*>/g, '').match(/<[^>]+>|[^<]+/g) || [];
  let i = 0;
  const skipWs = () => { while (i < toks.length && !toks[i].startsWith('<') && !toks[i].trim()) i++; };
  const text = (tag) => { let s = ''; while (i < toks.length && toks[i] !== `</${tag}>`) s += toks[i++]; i++; return s; };
  function value() {
    skipWs();
    const t = toks[i++];
    if (t === '<dict>') { const o = {}; for (;;) { skipWs(); if (toks[i] === '</dict>') { i++; return o; } if (toks[i] !== '<key>') throw new Error(`plist: expected <key>, got ${toks[i]}`); i++; const k = text('key'); o[k] = value(); } }
    if (t === '<dict/>') return {};
    if (t === '<array>') { const a = []; for (;;) { skipWs(); if (toks[i] === '</array>') { i++; return a; } a.push(value()); } }
    if (t === '<array/>') return [];
    if (t === '<true/>') return true;
    if (t === '<false/>') return false;
    const m = t && t.match(/^<(integer|real|string|data|date)>$/);
    if (m) { const s = text(m[1]); return m[1] === 'integer' || m[1] === 'real' ? Number(s) : m[1] === 'data' ? '<data>' : s; }
    if (t && /^<(string|data)\/>$/.test(t)) return '';
    if (t === '<plist version="1.0">' || (t && t.startsWith('<plist'))) return value();
    throw new Error(`plist: unexpected ${t}`);
  }
  return value();
}
/** The shallowest dict holding a numeric Temperature: the AppleSmartBattery entry (wrapped in IORegistry/Diagnostics). */
export function batteryDict(root) {
  const q = [root];
  while (q.length) { const d = q.shift(); if (d && typeof d === 'object' && !Array.isArray(d)) { if (typeof d.Temperature === 'number') return d; q.push(...Object.values(d)); } }
  return null;
}
export function keyNames(d, depth = 2, pre = '') {
  const out = [];
  for (const [k, v] of Object.entries(d || {})) { out.push(pre + k); if (depth > 1 && v && typeof v === 'object' && !Array.isArray(v)) out.push(...keyNames(v, depth - 1, `${pre}${k}.`)); }
  return out.sort();
}
/** Whitelisted values, Temperature as °C (1/100 °C in the entry, as tools/lib/iphone-run.mjs), adapter watts if any. */
export function pickBattery(d) {
  const o = {};
  for (const k of KEEP) if (typeof d[k] === 'number' || typeof d[k] === 'boolean') o[k] = d[k];
  if (typeof d.AdapterDetails?.Watts === 'number') o.AdapterWatts = d.AdapterDetails.Watts;
  if (typeof o.Temperature === 'number') o.tC = o.Temperature / 100;
  if (typeof o.VirtualTemperature === 'number') o.vtC = o.VirtualTemperature / 100;
  return o;
}

function run(cmd, args, { inherit = false } = {}) {
  return new Promise((res) => {
    const p = spawn(cmd, args, { cwd: REPO, stdio: inherit ? ['ignore', 'inherit', 'inherit'] : ['ignore', 'pipe', 'pipe'] });
    let out = '';
    p.stdout?.on('data', (d) => (out += d));
    p.on('error', (e) => res({ code: -1, out: '', err: e.code || e.message }));
    p.on('close', (code) => res({ code, out }));
  });
}
export async function readBattery() {
  const r = await run(process.env.FW_IDEVICEDIAGNOSTICS || 'idevicediagnostics', ['ioregentry', 'AppleSmartBattery']);
  if (r.code !== 0) return { error: `idevicediagnostics ${r.err || 'exit ' + r.code}` }; // no stderr: it may name the device
  try { const d = batteryDict(parsePlist(r.out)); return d ? { d } : { error: 'no AppleSmartBattery Temperature in the output' }; } catch (e) { return { error: e.message }; }
}

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i < 0 ? d : argv[i + 1]; };
const flag = (n) => argv.includes(`--${n}`);

async function segment() {
  const session = opt('session'), seg = opt('seg'), arm = opt('arm'), url = opt('url'), owner = opt('owner');
  if (!/^H[12]$/.test(session || '') || !/^\d+$/.test(seg || '') || !/^[FABX]$/.test(arm || '') || !url || !owner) throw new Error('segment needs --session H1|H2 --seg <n> --arm F|A|B|X --url <u> --owner <o>');
  const seconds = Number(opt('seconds', 360)), every = Number(opt('every', 30)), idlePhase = Number(opt('idle-phase', PRE.idlePhaseS)), dry = flag('dry-run');
  const out = resolve(REPO, opt('out', 'out/phone-heat/samples.jsonl'));
  mkdirSync(dirname(out), { recursive: true });
  const { lanSafeUrl } = await import(join(REPO, 'tools/lib/iphone-url.mjs'));
  const node = process.execPath, iphone = join(REPO, 'tools/iphone.mjs');
  const id = `${session}-${seg}${arm}`;
  // a segment is a measurement (I-070): one caffeinate -i -s assertion for this process, also over the idle phase,
  // where no iphone.mjs process runs (tools/lib/awake.mjs keepAwakeFor; its wrapsMeasurement does not see this command)
  if (!dry) (await import(join(REPO, 'tools/lib/awake.mjs'))).keepAwakeFor(`phone heat segment ${id}`);
  const sh =(args) => (dry ? (console.log(`DRY node tools/iphone.mjs ${args.join(' ')}`), Promise.resolve({ code: 0 })) : run(node, [iphone, ...args], { inherit: true }));
  const op = await sh(['open', url, '--owner', owner]);
  if (op.code !== 0) throw new Error(`open failed (exit ${op.code}): segment ${id} not started`);
  const t0 = Date.now(), sOf = () => Math.round((Date.now() - t0) / 100) / 10;
  const write = (o) => appendFileSync(out, JSON.stringify(o) + '\n');
  let pending = 0;
  const sample = async (sNominal) => {
    pending++;
    const b = await readBattery();
    write({ kind: 'sample', id, session, seg: Number(seg), arm, t: new Date().toISOString(), s: sOf(), sNominal, ...(b.error ? { error: b.error } : pickBattery(b.d)) });
    pending--;
  };
  let n = 0;
  const timers = [];
  for (let s = 0; s <= seconds; s += every) timers.push(setTimeout(() => sample(s), s * 1000));
  // phase 1, idle on the page: the page as `open` left it, at the top, untouched, no probe, no reload (always-on work)
  if (!dry) while (Date.now() - t0 < idlePhase * 1000) await new Promise((res) => setTimeout(res, 250));
  // phase 2, scroll cycles: back-to-back W runs until t = --seconds
  const cycles = [];
  let fails = 0;
  while (Date.now() - t0 < seconds * 1000 && fails < 2) {
    n++;
    const start = sOf();
    const r = await sh(['run', '--driver', 'window', '--probe', 'std', '--from', '0', '--to', '5000', '--idle', '20', '--hold', '3', '--sentinel', '0',
      '--settle', '8', '--no-park', '--low-power', 'off', '--arm', arm, '--block', `heat-${session}`, '--run', `${id}-c${n}`, '--label', `heat-${id}-c${n}`,
      '--owner', owner, '--doing', `phone heat ${id} cycle ${n}`]);
    cycles.push({ n, start, end: sOf(), exit: r.code });
    fails = r.code === 0 ? 0 : fails + 1;
    if (dry) await new Promise((res) => setTimeout(res, 50));
  }
  const voided = fails >= 2 ? 'two failed cycles in a row' : null;
  if (voided) timers.forEach(clearTimeout);
  while (pending || (!voided && Date.now() - t0 < seconds * 1000 + 500)) await new Promise((res) => setTimeout(res, 250));
  await sh(['park', '--owner', owner]);
  write({ kind: 'segment', id, session, seg: Number(seg), arm, url: lanSafeUrl(url), t0: new Date(t0).toISOString(), seconds, every, idlePhase, cycles, void: voided });
  console.log(`SEGMENT ${id} ${voided ? 'VOID (' + voided + ')' : 'DONE'}: ${cycles.length} cycles; ${out}`);
}

// ---- scoring (pre-registered) ----
export function ols(pts) {
  const n = pts.length, mx = pts.reduce((a, p) => a + p[0], 0) / n, my = pts.reduce((a, p) => a + p[1], 0) / n;
  let sxx = 0, sxy = 0;
  for (const [x, y] of pts) { sxx += (x - mx) ** 2; sxy += (x - mx) * (y - my); }
  return { slope: sxy / sxx, meanY: my };
}
export function scoreSegments(lines, pre = PRE) {
  const segs = lines.filter((l) => l.kind === 'segment');
  const res = [];
  for (const g of segs) {
    const ss = lines.filter((l) => l.kind === 'sample' && l.id === g.id && typeof l.tC === 'number');
    const win = ss.filter((l) => l.sNominal >= pre.windowS[0] && l.sNominal <= pre.windowS[1]);
    const start = ss.find((l) => l.sNominal === 0);
    const charging = ss.some((l) => l.IsCharging === true);
    const r = { id: g.id, session: g.session, arm: g.arm, n: win.length, startC: start?.tC ?? null, cycles: g.cycles?.length ?? 0, charging, void: g.void || (win.length < pre.minSamples ? `${win.length} samples in the window` : null) };
    if (win.length >= 2) {
      const f = ols(win.map((l) => [l.sNominal / 60, l.tC]));
      r.slope = round(f.slope); r.meanC = round(f.meanY, 2); r.corr = round(f.slope + pre.k * (f.meanY - pre.tRefC));
    }
    for (const [name, [a, b]] of [['idleSlope', pre.idleWinS], ['cycleSlope', pre.cycleWinS]]) {
      const w = ss.filter((l) => l.sNominal >= a && l.sNominal <= b);
      if (w.length >= 3) r[name] = round(ols(w.map((l) => [l.sNominal / 60, l.tC])).slope);
    }
    const pw = ss.filter((l) => typeof l.Voltage === 'number' && typeof (l.InstantAmperage ?? l.Amperage) === 'number').map((l) => (l.Voltage * (l.InstantAmperage ?? l.Amperage)) / 1e6);
    if (pw.length) r.batteryW = { median: round(median(pw), 2), n: pw.length, note: 'Voltage x InstantAmperage (else Amperage) / 1e6, units assumed mV and mA (UNRESOLVED until the pre-flight); battery share only on USB' };
    res.push(r);
  }
  return res;
}
const round = (x, d = 3) => Math.round(x * 10 ** d) / 10 ** d;
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2; };

/** The ticket's decision rules over scored segments. Primary = corrected slopes; raw = check. */
export function verdicts(segs, pre = PRE) {
  const ok = segs.filter((s) => !s.void && !s.charging && typeof s.corr === 'number');
  const get = (session, arm, f) => ok.find((s) => s.session === session && s.arm === arm)?.[f];
  const pair = (a, b, f) => ['H1', 'H2'].map((h) => { const x = get(h, a, f), y = get(h, b, f); return typeof x === 'number' && typeof y === 'number' ? round(x - y) : null; });
  const both = (d, p) => d.every((v) => v !== null && p(v));
  const decide = (dc, dr, more, same, words) => {
    if (dc.some((v) => v === null)) return { verdict: 'incomplete', dCorr: dc, dRaw: dr };
    let v = both(dc, (x) => x >= more) ? words[0] : both(dc, (x) => x <= -more) ? words[1] : both(dc, (x) => Math.abs(x) < same) ? words[2] : 'inconclusive';
    const rawSame = v === words[0] ? both(dr, (x) => x > 0) : v === words[1] ? both(dr, (x) => x < 0) : true;
    if (!rawSame) v += ' (start-sensitive: raw slopes disagree in sign)';
    return { verdict: v, dCorr: dc, dRaw: dr };
  };
  const out = {
    fastworkVsApple: decide(pair('B', 'A', 'corr'), pair('B', 'A', 'slope'), pre.moreC, pre.sameC, ['Fastwork heats more', 'apple.com heats more', 'about the same']),
    fixesVsBaseline: decide(pair('B', 'X', 'corr'), pair('B', 'X', 'slope'), pre.fixC, pre.fixC, ['the fixes cool the phone', 'the fixes heat the phone', 'no detectable change']),
  };
  out.floorCheck = ['H1', 'H2'].map((h) => { const f = get(h, 'F', 'corr'); const others = ['A', 'B', 'X'].map((a) => get(h, a, 'corr')).filter((x) => typeof x === 'number'); return f === undefined ? null : others.every((x) => x > f); });
  const ex = (a) => ['H1', 'H2'].map((h) => { const x = get(h, a, 'corr'), f = get(h, 'F', 'corr'); return typeof x === 'number' && typeof f === 'number' ? round(x - f) : null; });
  out.excessOverFloor = { A: ex('A'), B: ex('B'), X: ex('X') };
  return out;
}

async function score() {
  const inp = resolve(REPO, opt('in', 'out/phone-heat/samples.jsonl'));
  const lines = readFileSync(inp, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const segs = scoreSegments(lines);
  const v = verdicts(segs);
  for (const s of segs) console.log(`${s.id} ${s.arm}: start ${s.startC} mean ${s.meanC} slope ${s.slope} corr ${s.corr} C/min (idle ${s.idleSlope}, cycles ${s.cycleSlope}) n ${s.n} cycles ${s.cycles}${s.charging ? ' CHARGING' : ''}${s.void ? ' VOID ' + s.void : ''}${s.batteryW ? ' battery ' + s.batteryW.median + ' W' : ''}`);
  console.log(JSON.stringify(v, null, 1));
  const o = opt('out'); if (o) { writeFileSync(resolve(REPO, o), JSON.stringify({ pre: PRE, segments: segs, verdicts: v }, null, 1)); console.log(`saved ${o}`); }
}

async function main() {
  const cmd = argv[0];
  if (cmd === 'keys') { const b = await readBattery(); if (b.error) throw new Error(b.error); console.log(keyNames(b.d).join('\n')); return; }
  if (cmd === 'once') { const b = await readBattery(); console.log(JSON.stringify({ t: new Date().toISOString(), label: opt('label', ''), ...(b.error ? { error: b.error } : pickBattery(b.d)) })); return; }
  if (cmd === 'segment') return segment();
  if (cmd === 'score') return score();
  console.log('usage: node research/phone-heat/heat.mjs keys | once [--label l] | segment --session H1|H2 --seg n --arm F|A|B|X --url u --owner o [--seconds 360] [--every 30] [--out f] [--dry-run] | score [--in f] [--out f]');
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(e.message || e); process.exit(1); });
