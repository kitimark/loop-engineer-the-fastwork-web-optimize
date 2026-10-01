// arch-sim class-3 scorer (README §4.3 rule 3 + amendment 7): recurring dt > 34 sections of the S probe's scroll
// phase, phone vs Simulator, compared by position (both are WebKit at 430x775 on the same snapshot, so their
// crossings coincide when docH matches; the scorer refuses otherwise).
// usage: node score3.mjs --phone <a.json,b.json,...> --sim <c.json,...> [--thr 34] [--label name]
//   A centre (every 10 px over [0, maxY]) is "slow" in a run when a scroll-phase frame with dt > thr has its
//   interval [yStart, yEnd] within ±60 px of it (yStart = previous frame's y). Recurring = slow in ≥ need runs
//   (phone: ceil(2/3 · n); Sim: 2 of 4, i.e. ceil(n/2)). Sections = maximal runs of contiguous recurring centres.
//   hit = share of phone sections overlapping a Sim recurring centre; false = share of Sim sections overlapping no
//   phone recurring centre. Chance: the Sim's recurring set shifted circularly by every 50 px step in
//   [250, maxY - 250] (positions kept, alignment broken): mean and max hit rate, mean false share.
//   Env JSON_OUT writes the result.
import fs from 'fs';
const a = process.argv.slice(2);
const opt = (n, d) => { const i = a.indexOf(`--${n}`); return i < 0 ? d : a[i + 1]; };
const thr = Number(opt('thr', 34));
const load = (list) => list.split(',').filter(Boolean).map((f) => { const r = JSON.parse(fs.readFileSync(f)); return { f: f.split('/').pop(), r: r.result || r }; });
const phone = load(opt('phone', ''));
const sim = load(opt('sim', ''));
const docs = [...phone, ...sim].map((x) => x.r.docH);
if (Math.max(...docs) - Math.min(...docs) > 5) { console.log(`REFUSED: docH differs (${[...new Set(docs)].join(', ')}): positions don't compare by raw y`); process.exit(3); }
const maxY = Math.max(...[...phone, ...sim].map((x) => x.r.maxY));
const STEP = 10, WIN = 60;
const centres = []; for (let y = 0; y <= maxY; y += STEP) centres.push(y);
function slowSet(r) {
  const [s0, s1] = r.marks.scroll;
  const fr = r.frames;
  const iv = [];
  for (let i = 1; i < fr.length; i++) { const [t, dt, y] = fr[i]; if (t >= s0 && t <= s1 && dt > thr) { const y0 = fr[i - 1][2]; iv.push([Math.min(y0, y) - WIN, Math.max(y0, y) + WIN]); } }
  return centres.map((c) => iv.some(([lo, hi]) => c >= lo && c <= hi));
}
const recurring = (runs, need) => { const sets = runs.map((x) => slowSet(x.r)); return centres.map((_, i) => sets.filter((s) => s[i]).length >= need); };
const sections = (rec) => { const out = []; let st = -1; rec.forEach((v, i) => { if (v && st < 0) st = i; if ((!v || i === rec.length - 1) && st >= 0) { out.push([st, v ? i : i - 1]); st = -1; } }); return out; };
const overl = ([i0, i1], rec) => { for (let i = i0; i <= i1; i++) if (rec[i]) return true; return false; };
const needP = Math.ceil((2 / 3) * phone.length), needS = Math.ceil(sim.length / 2);
const recP = recurring(phone, needP), recS = recurring(sim, needS);
const secP = sections(recP), secS = sections(recS);
const score = (rS) => { const sS = sections(rS); return { hit: secP.length ? secP.filter((s) => overl(s, rS)).length / secP.length : NaN, fals: sS.length ? sS.filter((s) => !overl(s, recP)).length / sS.length : NaN }; };
const real = score(recS);
const shifts = []; for (let d = 250; d <= maxY - 250; d += 50) { const k = d / STEP; shifts.push(score(recS.map((_, i) => recS[(i + k) % recS.length]))); }
const mean = (v) => v.reduce((x, y) => x + y, 0) / v.length;
const fmt = (secs) => secs.map(([i, j]) => `${centres[i]}-${centres[j]}`).join(' ');
const cover = (rec) => Math.round((100 * rec.filter(Boolean).length) / rec.length);
const res = { label: opt('label', ''), thr, nPhone: phone.length, needPhone: needP, nSim: sim.length, needSim: needS, maxY, phoneSections: fmt(secP), simSections: fmt(secS), nPhoneSec: secP.length, nSimSec: secS.length, coverPhone: cover(recP), coverSim: cover(recS), hit: +real.hit.toFixed(3), fals: +real.fals.toFixed(3), chance: { hitMean: +mean(shifts.map((s) => s.hit)).toFixed(3), hitMax: +Math.max(...shifts.map((s) => s.hit)).toFixed(3), falsMean: +mean(shifts.map((s) => s.fals)).toFixed(3), n: shifts.length } };
const verdict = res.hit >= 0.8 && res.fals <= 0.25 ? 'usable' : res.hit >= 0.5 ? 'lead generator only' : 'not usable';
res.ruleVerdict = verdict;
console.log(`== ${res.label} dt>${thr}: phone ${phone.length} runs (need ${needP}), Sim ${sim.length} (need ${needS}), maxY ${maxY}`);
console.log(`   phone sections (${secP.length}, cover ${res.coverPhone} %): ${res.phoneSections}`);
console.log(`   Sim sections   (${secS.length}, cover ${res.coverSim} %): ${res.simSections}`);
console.log(`   hit ${(100 * res.hit).toFixed(0)} %  false ${(100 * res.fals).toFixed(0)} %  -> ${verdict} | chance (shifted Sim): hit mean ${(100 * res.chance.hitMean).toFixed(0)} % max ${(100 * res.chance.hitMax).toFixed(0)} %, false mean ${(100 * res.chance.falsMean).toFixed(0)} %`);
if (process.env.JSON_OUT) fs.writeFileSync(process.env.JSON_OUT, JSON.stringify(res, null, 1));
