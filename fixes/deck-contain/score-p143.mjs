// P-143 frozen scorer (deck-contain). Reads sim-swipe.mjs holds (out/deck-contain/sim/<hold>/runs.jsonl) and
// chrome-swipe.mjs holds (out/deck-contain/chrome/<hold>/runs.jsonl); applies the card's rules; judges nothing else.
// Simulator: L = median Layout ms per frame over the deck band (frames whose drawn y has the deck in the viewport:
// deck.top - innerHeight < y < deck.bottom, from the run's own pre-swipe read). Ratio = arm L / mean L of the nearest
// valid C run before and after it in the same hold (one neighbour if only one exists). Calls: LOCATES <= 0.30,
// PARTIAL <= 0.70, NONE above. Chrome: per-frame means over the band of Layout events, dirtyObjects, UpdateLayoutTree
// elementCount; ratio arm / mean of all valid C runs of the hold.
// usage: node fixes/deck-contain/score-p143.mjs --sim <holdDir> [...] [--chrome <holdDir> ...] [--json out.json]
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
export const RULE = { LOCATES: 0.30, PARTIAL: 0.70, MIN_N: 60, AA_LO: 0.80, AA_HI: 1.25, DRIFT: 0.30, GEO_DOC: 2, GEO_DECK: 0.5 };
const med = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const mean = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
export const call = (r) => r == null ? 'n/a' : r <= RULE.LOCATES ? 'LOCATES' : r <= RULE.PARTIAL ? 'PARTIAL' : 'NONE';
export function band(rec) { const d = rec.deck; if (!d || !rec.frames) return []; return rec.frames.filter((f) => f.y > d.top - d.ih && f.y < d.bottom); }
export function readHold(dir) {
  const f = join(dir, 'runs.jsonl'); if (!existsSync(f)) return { dir, runs: [], missing: true };
  return { dir, runs: readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) };
}
// one run's validity: not dropped, no error, arm applied, swipe passed the deck's bottom, n >= MIN_N
export function runState(rec) {
  if (rec.dropped) return 'DROPPED';
  if (rec.voidHost != null) return 'VOID-HOST';
  if (rec.error) return 'ERROR';
  if (!rec.applied) return 'NOT-APPLIED';
  const b = band(rec);
  if (rec.swipe && rec.deck && rec.swipe.yMax < rec.deck.bottom) return 'SHORT';
  if (b.length < RULE.MIN_N) return 'LOW-N';
  return 'OK';
}
export function scoreSimHold(h) {
  const runs = h.runs.map((r) => ({ ...r, state: runState(r), n: band(r).length, L: med(band(r).map((f) => f.layMs)), Lmean: mean(band(r).map((f) => f.layMs)), layPerF: mean(band(r).map((f) => f.lay)) }));
  const out = { dir: h.dir, runs: [], hold: 'OK', notes: [] };
  if (h.missing) { out.hold = 'MISSING'; return out; }
  if (runs.some((r) => r.state === 'VOID-HOST')) { out.hold = 'VOID-HOST'; }
  const C = runs.filter((r) => r.arm === 'C');
  const cOk = C.filter((r) => r.state === 'OK');
  // replication gate: every C run OK, >= 2 of them; A/A: each inner C vs the mean of its outer neighbours; drift first -> last
  if (out.hold === 'OK') {
    if (cOk.length < 2 || cOk.length !== C.length) out.hold = 'NOT-REPRODUCED';
    else {
      for (let k = 1; k < cOk.length - 1; k++) { const aa = cOk[k].L / mean([cOk[k - 1].L, cOk[k + 1].L]); out.notes.push(`A/A ${cOk[k].step} ${aa.toFixed(3)}`); if (aa < RULE.AA_LO || aa > RULE.AA_HI) out.hold = 'NOT-REPRODUCED'; }
      const drift = Math.abs(cOk.at(-1).L - cOk[0].L) / cOk[0].L; out.drift = +drift.toFixed(3);
      if (out.hold === 'OK' && drift > RULE.DRIFT) out.hold = 'VOID';
    }
  }
  for (const [i, r] of runs.entries()) {
    const row = { step: r.step, arm: r.arm, state: r.state, n: r.n, L: r.L == null ? null : +r.L.toFixed(2), Lmean: r.Lmean == null ? null : +r.Lmean.toFixed(2), layPerF: r.layPerF == null ? null : +r.layPerF.toFixed(2), load1: [r.load1Start, r.load1End], deckH: r.deck?.h, docH: r.deck?.docH };
    if (r.arm !== 'C' && r.state === 'OK') {
      const before = [...runs.slice(0, i)].reverse().find((x) => x.arm === 'C' && x.state === 'OK');
      const after = runs.slice(i + 1).find((x) => x.arm === 'C' && x.state === 'OK');
      const nb = [before, after].filter(Boolean);
      if (nb.length) {
        row.ratio = +(r.L / mean(nb.map((x) => x.L))).toFixed(3); row.call = call(row.ratio);
        // GEOMETRY: the page or deck changed size against a neighbouring C (PC is a mechanism control: reported only)
        const geo = nb.some((x) => Math.abs(x.deck.docH - r.deck.docH) > RULE.GEO_DOC || Math.abs(x.deck.h - r.deck.h) > RULE.GEO_DECK);
        if (geo) { row.geometry = true; if (r.arm !== 'PC') row.call = 'GEOMETRY'; }
      } else row.call = 'NO-C';
    }
    out.runs.push(row);
  }
  const pc = out.runs.filter((r) => r.arm === 'PC' && r.ratio != null);
  if (out.hold === 'OK' && !pc.some((r) => r.call === 'LOCATES')) out.hold = 'CONTROL-FAILED';
  return out;
}
// an arm's call over the holds that may be read (OK holds): LOCATES when every valid run locates or the mean ratio <= 0.30
export function armCall(holds, arm) {
  const rs = holds.filter((h) => h.hold === 'OK').flatMap((h) => h.runs.filter((r) => r.arm === arm && r.ratio != null));
  if (!rs.length) return { arm, call: 'INSUFFICIENT', runs: 0 };
  if (rs.some((r) => r.call === 'GEOMETRY')) return { arm, call: 'GEOMETRY', runs: rs.length, ratios: rs.map((r) => r.ratio) };
  const m = mean(rs.map((r) => r.ratio));
  const c = rs.every((r) => r.call === 'LOCATES') || m <= RULE.LOCATES ? 'LOCATES' : m <= RULE.PARTIAL ? 'PARTIAL' : 'NONE';
  return { arm, call: c, runs: rs.length, ratios: rs.map((r) => r.ratio), mean: +m.toFixed(3) };
}
export function scoreChromeHold(h) {
  const runs = h.runs.map((r) => { const b = band(r); return { step: r.step, arm: r.arm, state: runState(r), n: b.length, lay: mean(b.map((f) => f.lay)), dirty: mean(b.map((f) => f.dirty)), ultEl: mean(b.map((f) => f.ultEl)), paints: mean(b.map((f) => f.paints)), deckH: r.deck?.h, docH: r.deck?.docH }; });
  const C = runs.filter((r) => r.arm === 'C' && r.state === 'OK');
  const out = { dir: h.dir, runs: [], hold: C.length >= 2 ? 'OK' : 'NOT-REPRODUCED' };
  const cm = (k) => mean(C.map((r) => r[k]));
  for (const r of runs) {
    const row = { ...r }; for (const k of ['lay', 'dirty', 'ultEl', 'paints']) row[k] = r[k] == null ? null : +r[k].toFixed(3);
    if (r.arm !== 'C' && r.state === 'OK' && C.length) for (const k of ['lay', 'dirty', 'ultEl']) row[k + 'Ratio'] = cm(k) ? +(r[k] / cm(k)).toFixed(3) : (r[k] ? Infinity : 1);
    out.runs.push(row);
  }
  return out;
}
async function main() {
  const a = process.argv.slice(2); const sims = [], chromes = []; let json = null;
  for (let i = 0; i < a.length; i++) { if (a[i] === '--sim') sims.push(a[++i]); else if (a[i] === '--chrome') chromes.push(a[++i]); else if (a[i] === '--json') json = a[++i]; }
  const sh = sims.map((d) => scoreSimHold(readHold(d))), chh = chromes.map((d) => scoreChromeHold(readHold(d)));
  for (const h of sh) { console.log(`SIM HOLD ${h.dir}: ${h.hold}${h.drift != null ? ' drift ' + h.drift : ''} ${h.notes.join('; ')}`); for (const r of h.runs) console.log(`  ${r.step.padEnd(6)} ${r.state.padEnd(11)} n ${r.n} L ${r.L} (mean ${r.Lmean}) lay/f ${r.layPerF}${r.ratio != null ? ' ratio ' + r.ratio + ' ' + r.call : r.call ? ' ' + r.call : ''} load1 ${r.load1.join('->')}`); }
  const arms = ['PC', 'A3', 'A4', 'R3'].map((x) => armCall(sh, x));
  for (const x of arms) console.log(`ARM ${x.arm}: ${x.call}${x.ratios ? ' ratios ' + x.ratios.join(', ') : ''}${x.mean != null ? ' mean ' + x.mean : ''}`);
  for (const h of chh) { console.log(`CHROME HOLD ${h.dir}: ${h.hold}`); for (const r of h.runs) console.log(`  ${r.step.padEnd(6)} ${r.state.padEnd(11)} n ${r.n} lay/f ${r.lay} dirty/f ${r.dirty} ultEl/f ${r.ultEl}${r.layRatio != null ? ` ratios lay ${r.layRatio} dirty ${r.dirtyRatio} ultEl ${r.ultElRatio}` : ''}`); }
  if (json) writeFileSync(json, JSON.stringify({ rule: RULE, sim: sh, arms, chrome: chh }, null, 1));
}
if (process.argv[1] && import.meta.url === new URL('file://' + process.argv[1]).href) await main();
