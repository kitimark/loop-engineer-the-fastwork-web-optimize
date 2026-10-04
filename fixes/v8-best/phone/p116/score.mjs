#!/usr/bin/env node
// P-116 scorer (v8 hero-flick (GH) attribution, G part H only; PHONE TICKET research/management/p116-v8-gh-attribution.md).
// Committed before any P-116 data. It imports P-105's committed scorer unchanged (fixes/v7-best/phone/score.mjs, sha256
// b9a29ffcc7bb, refused if changed) and uses its scoreG (moving frames, the 250 px bins, the G voids), applySentinel (the
// sentinel chain) and gate (the medians and deltas, minimum 3 valid runs per arm). Only the arms, the item names, the
// served check's arm lines and the verdict rule are P-116's.
//   node fixes/v8-best/phone/p116/score.mjs <item>:<file> ... [--json out.json]   (block order, VALID holds only)
// Items: wgC / wgX / wgY (warm-ups, skipped); sCo / sCc (S heat sentinels on C, uncounted); gHC<n> / gHX<n> / gHY<n>
//   (counted G part H; the served check log p116-<H>-check-<item>.log beside the run file; newest wins).
// Arms: C = v8-best (3e3e94cb6e9f / f836404b3728); X = v8 minus the countdown group (cd-strip + cd-roll-ca K +
//   countdown-faces + glue-heup; 65d72981246f / 4c9a9b4fc7bf); Y = v8 minus rest-script v4 (528c09e97de6 / f836404b3728).
// Served check (P-105's rule, P-116's arms): the log must have an "ok" line for each of B, C, X, Y and no WRONG; P-105's
//   scoreG checks B, C, V lines, so a log that passes P-116's check is handed to it as "B ok / C ok / V ok" and one that
//   fails as itself plus WRONG (scoreG then voids it with its own reason "served check not ok"); a missing log stays null.
// Sentinels (sCo / sCc): the S record's meta.sentinel.pass feeds P-105's applySentinel chain unchanged; an S record that
//   is not fw-iphone-run/1 driver S counts as "no data" (voids, as in P-105). Served JS/CSS not C's, or Low Power Mode, is
//   recorded on the sentinel (P-105's scoreS rule) but, as in P-105, only pass decides the chain.
// Verdict per removal arm A in {X, Y} (fixed before data): dA = median(A) - median(C) of moving frames > 50 per run;
//   CAUSE when dA < -2; PART when -2 <= dA <= -1; NOT THE CAUSE when dA > -1; threshold-sensitive when the class at > 46
//   or > 54 differs. Block: insufficient (< 3 valid runs in any arm) / BOTH (X and Y CAUSE) / COUNTDOWN (X CAUSE) / REST
//   (Y CAUSE) / SPLIT (no CAUSE, both PART) / NOT LOCATED (else); threshold-sensitive when the block verdict at > 46 or
//   > 54 differs.
// Reported, not gated: per run moving frames, > 50 per 100 moving frames, > 34, the largest moving dt (from scoreG's
//   moving frames > 34; "<= 34" when none); per arm the frames > 100 ms (dt@scrollY) and in how many runs; per arm the
//   250 px bins with a > 50 frame in >= 2 valid runs; Mac load1 per item (mac.start / mac.end).
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const here = dirname(fileURLToPath(import.meta.url));
const basePath = join(here, '../../../v7-best/phone/score.mjs');
const baseSha = createHash('sha256').update(readFileSync(basePath)).digest('hex');
const self = createHash('sha256').update(readFileSync(fileURLToPath(import.meta.url))).digest('hex');
export const BASE_SHA = 'b9a29ffcc7bbbf677f14c31b7b3af2900f032b0abb406c806538823decc38368';
if (baseSha !== BASE_SHA) { console.error(`P-105 scorer changed (${baseSha.slice(0, 12)}): refuse`); process.exit(3); }
export const S = await import(basePath);

const NODE = '/_app/immutable/nodes/2.DyWL8TcE.js', CSSP = '/_app/immutable/assets/2.gBuqKVzi.css';
export const P116 = {
  arms: ['C', 'X', 'Y'], checkArms: ['B', 'C', 'X', 'Y'],
  expect: {
    C: { js: '3e3e94cb6e9f4babfd8721b8002eec97220529428741347c661830409b29ab16', css: 'f836404b37286ca62be2f95d43a4d724765822576820ed5b54db19c84f123b43' },
    X: { js: '65d72981246f820cf70b74b926ac1243be5d09e370a1b9739a7246eb499070a3', css: '4c9a9b4fc7bf432c41b7bb3832558658d6f6b8b405c40da6821e2e7b24a5698a' },
    Y: { js: '528c09e97de66010d1f75395f765c6a625f51fb4602cc1cdf1e38a237c6f67cd', css: 'f836404b37286ca62be2f95d43a4d724765822576820ed5b54db19c84f123b43' },
  },
};
const ADAPTED_OK = 'B (P-116 check ok) ok\nC (P-116 check ok) ok\nV (P-116 check ok) ok\n';
const prefixOk = (full, short) => !!(full && short && (full.startsWith(short) || short.startsWith(full)));

export function mapItem(item, cfg = P116) {
  const a = `[${cfg.arms.join('')}]`;
  if (new RegExp(`^wg${a}$`).test(item)) return { warmup: true, arm: item[2] };
  if (/^sC[oc]$/.test(item)) return { sentinel: true, arm: 'C' };
  const m = item.match(new RegExp(`^gH(${a})(\\d+)$`)); if (m) return { arm: m[1], run: +m[2] };
  throw new Error(`unknown item ${item}`);
}

export function checkOk(log, cfg = P116) {
  if (log == null) return null;
  return !/WRONG/.test(log) && cfg.checkArms.every((A) => new RegExp(`^${A} .* ok$`, 'm').test(log));
}

export function scoreSentinel(j, cfg = P116) {
  const m = j?.meta;
  if (!m || m.schema !== 'fw-iphone-run/1' || m.driver !== 'S') return { void: ['not an S run record'], sentinel: null, notes: [] };
  const notes = []; const sv = m.served || {}, e = cfg.expect.C;
  if (m.error) notes.push(`run error: ${String(m.error).slice(0, 80)}`);
  if (!(prefixOk(e.js, sv[NODE]) && prefixOk(e.css, sv[CSSP]))) notes.push(`served not arm C (JS ${sv[NODE] ?? 'none'}, CSS ${sv[CSSP] ?? 'none'})`);
  if (m.settings?.lowPowerMode === true || m.lowPowerSuspect) notes.push('Low Power Mode');
  return { void: [...notes], sentinel: m.sentinel ?? null, notes };
}

export const classify = (d) => (d == null ? null : d < -2 ? 'CAUSE' : d <= -1 ? 'PART' : 'NOT THE CAUSE');
export function blockVerdict(x, y) {
  if (x === 'CAUSE' && y === 'CAUSE') return 'BOTH';
  if (x === 'CAUSE') return 'COUNTDOWN';
  if (y === 'CAUSE') return 'REST';
  if (x === 'PART' && y === 'PART') return 'SPLIT';
  return 'NOT LOCATED';
}

const find = (o, k, d = 0) => { if (!o || typeof o !== 'object' || d > 4) return undefined; if (k in o) return o[k]; for (const v of Object.values(o)) { const x = find(v, k, d + 1); if (x !== undefined) return x; } };
const load1 = (x) => x?.load1 ?? (Array.isArray(x?.load) ? x.load[0] : x?.load) ?? null;
const r1 = (x) => Math.round(x * 10) / 10;

export function scoreP116(entries, cfg = P116) {
  const loads = [], skipped = [];
  const runs = entries.map(({ item, j, checkLog }) => {
    const m = mapItem(item, cfg);
    const mac = find(j, 'mac') || {};
    loads.push({ item, start: load1(mac.start), end: load1(mac.end) });
    if (m.warmup) { skipped.push(item); return { item, warmup: true, arm: m.arm, void: [] }; }
    if (m.sentinel) return { item, kind: 'S', arm: 'C', isSentinel: true, sentinelOnly: true, ...scoreSentinel(j, cfg) };
    const ck = checkOk(checkLog, cfg);
    const g = S.scoreG(j, 'H', ck === null ? null : ck ? ADAPTED_OK : `${checkLog}\nWRONG`);
    return { item, kind: 'G', part: 'H', arm: m.arm, run: m.run, isSentinel: false, servedCheck: ck, ...g };
  });
  const counted = runs.filter((r) => !r.warmup);
  S.applySentinel(counted);
  const valid = (a) => counted.filter((r) => r.kind === 'G' && r.arm === a && !r.void.length);
  const perRun = counted.filter((r) => r.kind === 'G').map((r) => ({
    item: r.item, arm: r.arm, valid: !r.void.length, frames: r.counts?.frames ?? null, gt50: r.counts?.gt50 ?? null,
    gt50per100: r.counts?.frames ? r1((100 * r.counts.gt50) / r.counts.frames) : null, gt34: r.counts?.gt34 ?? null,
    maxDt: (r.slow || []).length ? Math.max(...r.slow.map((s) => s.dt)) : (r.counts ? '<= 34' : null),
  }));
  const arms = {};
  for (const a of cfg.arms) {
    const rs = valid(a);
    const over100 = rs.flatMap((r) => r.slow.filter((s) => s.dt > 100).map((s) => ({ item: r.item, dt: s.dt, y: s.y })));
    const nb = new Map(); for (const r of rs) for (const b of r.bins.gt50) nb.set(b, (nb.get(b) || 0) + 1);
    arms[a] = {
      n: rs.length, gt50: rs.map((r) => r.counts.gt50), median: Object.fromEntries(['gt50', 'gt46', 'gt54', 'gt34'].map((k) => [k, S.median(rs.map((r) => r.counts[k]))])),
      over100, over100Runs: new Set(over100.map((o) => o.item)).size,
      bins2: [...nb].filter(([, c]) => c >= 2).sort((p, q) => p[0] - q[0]).map(([b, c]) => `${b * 250}-${b * 250 + 249} (${c} runs)`),
    };
  }
  const C = valid('C').map((r) => r.counts);
  const removal = {};
  for (const a of cfg.arms.filter((x) => x !== 'C')) {
    const g = S.gate(C, valid(a).map((r) => r.counts), 3);
    if (!g.delta) { removal[a] = { nC: g.nC, nA: g.nV, verdict: 'insufficient', note: g.verdict }; continue; }
    const cls = Object.fromEntries(['gt50', 'gt46', 'gt54'].map((k) => [k, classify(g.delta[k])]));
    removal[a] = { nC: g.nC, nA: g.nV, delta: g.delta, class: cls, verdict: cls.gt50, thresholdSensitive: cls.gt46 !== cls.gt50 || cls.gt54 !== cls.gt50 };
  }
  const out = { removal, arms, perRun, loads, skipped, runs };
  const rem = Object.values(removal);
  if (rem.some((r) => r.verdict === 'insufficient')) { out.verdict = 'insufficient'; out.thresholdSensitive = false; return out; }
  const bv = (k) => blockVerdict(removal.X.class[k], removal.Y.class[k]);
  out.verdict = bv('gt50'); out.verdictTwins = { gt46: bv('gt46'), gt54: bv('gt54') };
  out.thresholdSensitive = out.verdictTwins.gt46 !== out.verdict || out.verdictTwins.gt54 !== out.verdict || rem.some((r) => r.thresholdSensitive);
  return out;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const args = process.argv.slice(2); let jsonOut = null; const entries = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--json') { jsonOut = args[++i]; continue; }
    const k = args[i].indexOf(':'); const item = args[i].slice(0, k), file = args[i].slice(k + 1);
    let j = null; try { j = JSON.parse(readFileSync(file, 'utf8')); } catch {}
    let checkLog = null;
    try { const d = dirname(file); const f = readdirSync(d).filter((x) => x.endsWith(`-check-${item}.log`)).map((x) => join(d, x)).sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0]; if (f) checkLog = readFileSync(f, 'utf8'); } catch {}
    entries.push({ item, j, checkLog });
  }
  const out = scoreP116(entries);
  for (const r of out.runs) {
    if (r.warmup) continue;
    const what = r.kind === 'S' ? `sentinel ${r.sentinel?.pass ?? null}${r.notes?.length ? ' (' + r.notes.join('; ') + ')' : ''}` : `${JSON.stringify(r.counts)}; >50 bins ${JSON.stringify(r.bins?.gt50)}; slow ${(r.slow || []).map((s) => `${s.dt}@${s.y}`).join(' ')}`;
    console.log(`${r.item}: ${r.void.length ? 'VOID ' + r.void.join(' | ') : 'valid'}; ${what}`);
  }
  console.log(`skipped warm-ups: ${out.skipped.join(' ') || '-'}`);
  for (const p of out.perRun) console.log(`run ${p.item}: moving ${p.frames}; >50 ${p.gt50} (${p.gt50per100} per 100); >34 ${p.gt34}; max ${p.maxDt}${p.valid ? '' : ' (VOID)'}`);
  for (const [a, s] of Object.entries(out.arms)) console.log(`arm ${a}: n ${s.n}; >50 per run ${JSON.stringify(s.gt50)}; medians ${JSON.stringify(s.median)}; >100 ms ${s.over100.length} in ${s.over100Runs} runs ${s.over100.map((o) => `${o.dt}@${o.y}`).join(' ')}; >50 bins in >= 2 runs ${s.bins2.join(', ') || '-'}`);
  for (const [a, g] of Object.entries(out.removal)) console.log(`removal ${a}: ${JSON.stringify(g)}`);
  console.log(`load1 ${out.loads.map((l) => `${l.item} ${l.start ?? '-'}/${l.end ?? '-'}`).join(' ')}`);
  console.log(`VERDICT ${out.verdict}${out.thresholdSensitive ? ' (threshold-sensitive)' : ''}${out.verdictTwins ? ` (> 46 ${out.verdictTwins.gt46}, > 54 ${out.verdictTwins.gt54})` : ''}`);
  console.log(`scorer sha256 ${self}; base ${baseSha}`);
  if (jsonOut) writeFileSync(jsonOut, JSON.stringify({ ...out, scorer: self, base: baseSha }, null, 1));
}
