// g0.0b (PR-034 rev 2): how far the Join waitlist button rises while it is still visible at the end of the page, per
// arm, from g0px.mjs end/join-phase stops (join.y, the button's top; nav.t, the nav bar's top; join.op, its opacity)
// or g0sim.mjs join-phase stops (jy, navt, jop; CSS px).
// PR-027's measure: the largest upward move of the button against the page while its opacity is above 0.01, and the
// part of it the whole nav bar accounts for. No browser, no lock.
//   node fixes/g0-revert/gates/rise.mjs out/g0/gates-b/join/join-430x775.json out/g0/simb-join/sim-join/g0sim.json [...]
import { readFileSync } from 'node:fs';
for (const f of process.argv.slice(2)) {
  const r = JSON.parse(readFileSync(f, 'utf8'));
  if (r.runs) { // g0sim.mjs: same fields under other names
    r.viewport = 'Simulator'; r.stops = {};
    for (const run of r.runs) r.stops[run.name] = (run.frames || []).map(({ stop, state: t }) => ({ stop, join: t.jy == null ? null : { y: t.jy, op: t.jop, tf: t.jtf }, nav: { t: t.navt } }));
  }
  for (const [arm, stops] of Object.entries(r.stops)) {
    const rest = stops.find((s) => s.stop === 'closed-rest');
    if (!rest?.join || rest.join.y === undefined) { console.log(f, arm, 'no join.y (older harness run)'); continue; }
    let rise = 0, navRise = 0, at = null;
    for (const s of stops) {
      if (!s.join || !(parseFloat(s.join.op) > 0.01) || !/^(open|rev-open|join-)/.test(s.stop)) continue;
      const d = rest.join.y - s.join.y, dn = rest.nav.t - s.nav.t;
      if (d > rise) { rise = d; navRise = dn; at = s.stop; }
    }
    console.log(`${r.viewport} ${arm}: button rise while visible ${rise.toFixed(2)} px (nav bar ${navRise.toFixed(2)} px, own ${(rise - navRise).toFixed(2)} px) at ${at}`);
  }
}
