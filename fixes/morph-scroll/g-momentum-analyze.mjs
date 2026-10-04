// PR-018 rev 4 proof: glide after lift-off and rest positions from G records of fixes/morph-scroll/g-momentum-v1.json.
// Usage: node fixes/morph-scroll/g-momentum-analyze.mjs <dir with <ARM>-<n>.json> [--json out.json]
// Per marked stroke: lift = the stroke's touchend (page clock, recorder touches); yLift = scrollY of the last frame at or
// before the lift; rest = first frame after which scrollY holds still for >= 300 ms; glide = yRest - yLift (signed px),
// glideMs = time of the last scrollY change - lift; vLift = scroll speed over the 50 ms before lift (px/ms).
// End cases: Safari's toolbar changes innerHeight (ih), so the end of the scroll range moves with it: sH = the largest
// scrollY + ih in the segment (the document height; the script reaches the end), t = the largest ih (100lvh, toolbar
// collapsed), p = (y - (sH - ih - t)) / t with the frame's own ih. Arm V7 has no end screen: its p is not meaningful.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const dir = process.argv[2];
if (!dir) throw new Error('usage: g-momentum-analyze.mjs <dir> [--json out.json]');
const ji = process.argv.indexOf('--json');
const FLICKS = ['flick-up', 'flick-down'];
const ENDS = ['E1-close-half-hold', 'E2-open-half-hold', 'E3-close-small-hold', 'E4-close-flick'];
const med = (a) => { const s = a.filter((x) => x != null).sort((x, y) => x - y); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null; };
const r2 = (x, d = 0) => (x == null ? null : +x.toFixed(d));
const rows = [];
for (const f of readdirSync(dir).filter((n) => /^[A-Z0-9]+-\d+\.json$/.test(n)).sort()) {
  const [arm, n] = f.replace('.json', '').split('-');
  const doc = JSON.parse(readFileSync(join(dir, f), 'utf8'));
  const run = doc.run;
  for (const seg of run.segments || []) {
    const fr = seg.frames || [], tc = seg.touches || [], mk = seg.marks || [];
    if (!fr.length) continue;
    const sH = Math.max(...fr.map((x) => x[2] + x[3])), lvh = Math.max(...fr.map((x) => x[3]));
    const pOf = (x) => (x[2] - (sH - x[3] - lvh)) / lvh;
    const frAt = (t) => { let r = fr[0]; for (const x of fr) { if (x[0] > t) break; r = x; } return r; };
    const yAt = (t) => frAt(t)[2];
    for (const [mt, name] of mk) {
      const kind = FLICKS.includes(name) ? 'flick' : (ENDS.includes(name) || /^E\d/.test(name)) ? 'end' : null;
      if (!kind) continue;
      const ts = tc.find((x) => x[0] >= mt && x[1] === 's');
      const te = ts && tc.find((x) => x[0] > ts[0] && (x[1] === 'e' || x[1] === 'c') && x[2] === 0);
      if (!te) { rows.push({ arm, run: +n, name, error: 'no touch end found' }); continue; }
      const tl = te[0], y0 = yAt(ts[0]), yl = yAt(tl), yb = yAt(tl - 50);
      const after = fr.filter((x) => x[0] > tl);
      let restI = -1, lastChange = tl;
      for (let i = 0; i < after.length; i++) {
        if (i > 0 && after[i][2] !== after[i - 1][2]) lastChange = after[i][0];
        if (after[i][0] - lastChange >= 300 && (i === 0 || after[i][2] === after[i - 1][2])) { restI = i; break; }
      }
      const xr = restI >= 0 ? after[restI] : after.at(-1), yr = xr?.[2];
      const win = after.filter((x) => x[0] <= lastChange);
      // direction reversals of scrollY between lift and rest (a settle that fights the momentum shows >= 1)
      let rev = 0, sg = 0; for (let i = 1; i < win.length; i++) { const d = Math.sign(win[i][2] - win[i - 1][2]); if (d && sg && d !== sg) rev++; if (d) sg = d; }
      rows.push({
        arm, run: +n, name, kind,
        fingerPx: yl - y0, vLift: r2((yl - yb) / 50, 2),
        glide: yr - yl, glideMs: r2(lastChange - tl), rested: restI >= 0, rev,
        slow34: win.filter((x) => x[1] > 34).length, slow50: win.filter((x) => x[1] > 50).length,
        ...(kind === 'end' ? { pLift: r2(pOf(frAt(tl)), 3), pRest: r2(pOf(xr), 3), yLift: yl, yRest: yr, ihLift: frAt(tl)[3], ihRest: xr[3], sH, lvh } : {}),
      });
    }
  }
}
const arms = [...new Set(rows.map((r) => r.arm))];
console.log('Mid-page flicks (same script, robot finger): glide after lift-off, median over runs and flicks');
console.log('arm  dir   n  vLift px/ms  glide px  glide ms  frames >34/>50 ms in glide');
for (const arm of arms) for (const d of FLICKS) {
  const s = rows.filter((r) => r.arm === arm && r.name === d && !r.error);
  if (!s.length) continue;
  console.log(`${arm.padEnd(4)} ${d.replace('flick-', '').padEnd(5)} ${String(s.length).padStart(2)}  ${String(med(s.map((r) => r.vLift))).padStart(11)}  ${String(med(s.map((r) => Math.abs(r.glide)))).padStart(8)}  ${String(med(s.map((r) => r.glideMs))).padStart(8)}  ${s.reduce((a, r) => a + r.slow34, 0)}/${s.reduce((a, r) => a + r.slow50, 0)}  (glides ${s.map((r) => Math.abs(r.glide)).join(', ')})`);
}
console.log('\nEnd of page: p just before lift -> p at rest (0 = closed, 1 = open), per run');
for (const name of [...new Set(rows.filter((r) => r.kind === 'end' || /^E\d/.test(r.name)).map((r) => r.name))]) for (const arm of arms) {
  const s = rows.filter((r) => r.arm === arm && r.name === name);
  if (s.length) console.log(`${name.padEnd(20)} ${arm.padEnd(4)} ${s.map((r) => (r.error ? r.error : `${r.pLift} -> ${r.pRest} (${r.glideMs} ms${r.rev ? `, ${r.rev} rev` : ''}${r.rested ? '' : ', not rested'})`)).join(' | ')}`);
}
// rev 7 (g-fastshort-v1.json): hit = the menu rests at the end the flick was heading for (close: p <= 0.02, which
// includes a glide that leaves the extra screen; open: p >= 0.98); time = lift-off to rest (glideMs)
const fast = rows.filter((r) => /^E\d+-(open|close)-fast-/.test(r.name) && !r.error);
if (fast.length) {
  console.log('\nFast short flicks at the end: hits (rests where the flick was heading) per arm');
  const hit = (r) => (/-open-/.test(r.name) ? r.pRest >= 0.98 : r.pRest <= 0.02);
  for (const arm of arms) {
    const s = fast.filter((r) => r.arm === arm); if (!s.length) continue;
    const by = (re) => { const z = s.filter((r) => re.test(r.name)); return `${z.filter(hit).length}/${z.length}`; };
    const h = s.filter(hit);
    console.log(`${arm.padEnd(4)} all ${h.length}/${s.length}  open ${by(/-open-/)}  close ${by(/-close-/)}  60px ${by(/-60px-/)}  120px ${by(/-120px-/)}  200px ${by(/-200px-/)}  time to rest (hits) median ${med(h.map((r) => r.glideMs))} ms, max ${h.length ? Math.max(...h.map((r) => r.glideMs)) : null} ms; turned back ${s.filter((r) => r.rev).length}`);
  }
}
const errs = rows.filter((r) => r.error);
if (errs.length) console.log(`\n${errs.length} stroke(s) without a touch end`);
if (ji > 0) { writeFileSync(process.argv[ji + 1], JSON.stringify({ rows }, null, 1)); console.log('WROTE', process.argv[ji + 1]); }
