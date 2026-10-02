// Style-recalc census per Sim W run (srwin-sim <run>.json + <run>.tl.json; structure + attribution ms, no ms verdicts).
// View-rooted = the Layout's root covers 0,0 .. 430 x viewport height (as in rootscore.mjs); the D card counts these.
// (1) The #platform switch: the cE write (ScheduleStyleRecalculation whose top frame is `setAttribute<cE@...`) in y
//     window SW; the first outermost RecalculateStyles after it: total ms, nested Layouts (count, ms), self ms (total
//     minus nested); then every outermost Layout that starts within 40 ms after that RS ends and before the next
//     outermost RS (the "switch frame" Layout, wherever it runs), each with its root and top frame; rotator-tick
//     Layouts (F-111) are marked "rot" and the view-rooted non-rotator ones counted apart (P-061 (b)).
// (2) Over the scroll phase (marks.scroll .. marks.push end): outermost RS count, RS total ms, nested Layout count and
//     ms, outermost Layout count and ms (all Layouts outside RS).
// usage: node rsstat.mjs <run.json>...   env SW=2500-2760
import { readFileSync } from 'node:fs';
const [a0, b0] = (process.env.SW || '2500-2760').split('-').map(Number);
const top = (st) => { const f = (st?.callFrames || []).filter((c) => c.url && c.url !== '[native code]'); if (!f.length) return st ? (st.callFrames?.[0]?.functionName || 'native') : '-'; const c = f[0]; const n = st.callFrames[0]?.url === '[native code]' ? st.callFrames[0].functionName + '<' : ''; return `${n}${c.functionName || '?'}@${c.url.split('/').pop()}:${c.lineNumber + 1}`; };
const f1 = (x) => x.toFixed(1);
for (const file of process.argv.slice(2)) {
  const r = JSON.parse(readFileSync(file));
  const tl = JSON.parse(readFileSync(file.replace(/\.json$/, '.tl.json')));
  const off = tl.syncTL * 1000 - tl.syncT;
  const flat = [];
  const vh = r.vh0 || 775; const isView = (z) => { const q = z.data && z.data.root; return Array.isArray(q) && Math.round(q[0]) === 0 && Math.round(q[1]) === 0 && q[2] - q[0] >= 430 - 1 && q[5] - q[1] >= vh - 1; };
  const rootStr = (z) => { const q = z.data && z.data.root; return Array.isArray(q) ? (isView(z) ? 'VIEW' : `${Math.round(q[2] - q[0])}x${Math.round(q[5] - q[1])}`) : '?'; };
  const walk = (x, anc) => { flat.push({ type: x.type, s: x.startTime * 1000 - off, e: (x.endTime ?? x.startTime) * 1000 - off, anc, st: x.stackTrace, data: x.data }); for (const c of x.children || []) walk(c, [...anc, x.type]); };
  for (const x of tl.recs) walk(x, []);
  flat.sort((p, q) => p.s - q.s);
  const yAt = (t) => { let y = r.frames[0]?.[2] ?? 0; for (const fr of r.frames) { if (fr[0] > t) break; y = fr[2]; } return y; };
  const outerRS = flat.filter((z) => z.type === 'RecalculateStyles' && !z.anc.includes('RecalculateStyles'));
  const nestedIn = (x) => flat.filter((z) => z.type === 'Layout' && z.s >= x.s && z.e <= x.e && z.anc.includes('RecalculateStyles'));
  const outerL = flat.filter((z) => z.type === 'Layout' && !z.anc.includes('RecalculateStyles'));
  const label = file.split('/').pop().replace(/\.json$/, '');
  // (1) switch
  const ce = flat.find((z) => z.type === 'ScheduleStyleRecalculation' && /setAttribute<cE@/.test(top(z.st)) && (() => { const y = yAt(z.s); return y >= a0 && y <= b0; })());
  let sw = 'no cE write in window';
  if (ce) {
    const rs = outerRS.find((x) => x.s >= ce.s);
    const nested = nestedIn(rs); const nms = nested.reduce((s, z) => s + z.e - z.s, 0);
    const nextRS = outerRS.find((x) => x.s > rs.e);
    const after = outerL.filter((z) => z.s >= rs.e && z.s <= rs.e + 40 && (!nextRS || z.s < nextRS.s));
    const ams = after.reduce((s, z) => s + z.e - z.s, 0);
    // F-111: the hero avatar rotator's timer task (before<mi BSBv9QXB:2188, remove<lr :1662) can land in this window
    // in arms without rotator-st6; such Layouts are listed with "rot" and left out of the non-rotator view count.
    const isRot = (z) => /@BSBv9QXB\.js:(2188|1662)$/.test(top(z.st));
    const afterNR = after.filter((z) => !isRot(z) && isView(z));
    const nv = nested.filter(isView);
    sw = `switch y${yAt(rs.s)}: RS ${f1(rs.e - rs.s)} ms (self ${f1(rs.e - rs.s - nms)}, nested ${nested.length} = ${f1(nms)} ms, view-rooted ${nv.length} [${nested.map((z) => rootStr(z) + ' ' + f1(z.e - z.s)).join(' + ')}]); Layout after RS within 40 ms: ${after.length} = ${f1(ams)} ms [${after.map((z) => rootStr(z) + ' ' + f1(z.e - z.s) + (isRot(z) ? ' rot' : '') + ' ' + top(z.st)).join('; ')}], view-rooted non-rotator ${afterNR.length} = ${f1(afterNR.reduce((s, z) => s + z.e - z.s, 0))} ms (max ${f1(Math.max(0, ...afterNR.map((z) => z.e - z.s)))}); RS+after ${f1(rs.e - rs.s + ams)} ms`;
  }
  // (2) scroll phase
  const [t0] = r.marks.scroll; const t1 = r.marks.push ? r.marks.push[1] : r.marks.scroll[1];
  const inP = (z) => z.s >= t0 && z.s <= t1;
  const rsP = outerRS.filter(inP); const nP = rsP.flatMap(nestedIn); const lP = outerL.filter(inP);
  const sum = (xs) => xs.reduce((s, z) => s + z.e - z.s, 0);
  console.log(`${label}: ${sw} | scroll+push ${Math.round(t1 - t0)} ms: RS ${rsP.length} = ${f1(sum(rsP))} ms (nested Layouts ${nP.length} = ${f1(sum(nP))} ms, RS self ${f1(sum(rsP) - sum(nP))}); Layouts outside RS ${lP.length} = ${f1(sum(lP))} ms`);
}
