// Score onset.mjs output for P-056a (c2). usage: node onsetcmp.mjs <onset-*.json>...
// Per load and title: phase = currentTime at the first sample after the title first intersects; onset = rAF time of
// the first sample whose currentTime is above the first one (null if it never advances in 40 frames); onset relative
// to first visibility (IO callback), to the load event, and to the last scene=active write before it.
import { readFileSync } from 'node:fs';
const med = (a) => { const b = a.filter((x) => x != null).sort((x, y) => x - y); return b.length ? (b.length % 2 ? b[(b.length - 1) / 2] : (b[b.length / 2 - 1] + b[b.length / 2]) / 2) : null; };
const r1 = (x) => (x == null ? null : Math.round(x));
for (const f of process.argv.slice(2)) {
  const idx = JSON.parse(readFileSync(f, 'utf8'));
  console.log(`\n== ${f}`);
  const byArm = {};
  for (const [label, O] of Object.entries(idx)) {
    if (/^W\d/.test(label)) continue;
    const arm = label.replace(/r\d+$/, '');
    const scene = (O.ev || []).filter((e) => e[1] === 'scene');
    const firstSceneWrite = scene.length ? scene[0][0] : null;
    const line = [];
    for (const n of ['doc', 'earn', 'secure', 'organized']) {
      const r = O.titles?.[n];
      if (!r || r.vis == null || !r.samples.length) { line.push(`${n}: not visible`); continue; }
      const s = r.samples, ct0 = s[0][1];
      const i = s.findIndex((x, k) => k > 0 && x[1] != null && ct0 != null && x[1] > ct0);
      const on = i > 0 ? s[i][0] : null;
      const act = on == null ? null : scene.filter((e) => e[2] === 'active' && e[0] <= on).pop();
      const row = { phase: ct0, ps0: s[0][2], sp0: s[0][3], vis: r.vis, created: r.created, onVis: on == null ? null : on - r.vis, onLoad: on == null ? null : on - O.load,
        onScene: on == null || !act ? null : on - act[0], firstIOgap: firstSceneWrite == null ? null : r.vis - r.created };
      ((byArm[arm] ||= {})[n] ||= []).push(row);
      line.push(`${n}: ct0 ${r1(ct0)} ${row.ps0}${row.sp0 ? '/sp' : ''} on-vis ${r1(row.onVis)} on-load ${r1(row.onLoad)} on-scene ${r1(row.onScene)}`);
    }
    const sp = (O.ev || []).filter((e) => e[1] === 'sp').slice(0, 2).map((e) => `${e[0]} ${e[2]}=${e[3]}`).join(', ');
    const rd = (O.ev || []).filter((e) => e[1] === 'render').map((e) => `${e[0]} ${e[2]}`).join(', ');
    console.log(`${label.padEnd(12)} load ${O.load} y ${O.scrollY}${O.capped ? ' CAPPED' : ''} | ${line.join(' | ')}`);
    console.log(`${''.padEnd(12)} titles created ${O.titles?.doc?.created} first scene ${firstSceneWrite} sp ${sp} render ${rd}`);
  }
  console.log('-- medians per arm (ms): phase / onset-vis / onset-load / onset-scene');
  const arms = Object.keys(byArm);
  for (const n of ['doc', 'earn', 'secure', 'organized']) {
    const cells = arms.map((a) => { const rs = byArm[a][n] || []; return `${a} ${r1(med(rs.map((x) => x.phase)))} / ${r1(med(rs.map((x) => x.onVis)))} / ${r1(med(rs.map((x) => x.onLoad)))} / ${r1(med(rs.map((x) => x.onScene)))} (n=${rs.length})`; });
    console.log(`${n.padEnd(10)} ${cells.join(' | ')}`);
  }
}
