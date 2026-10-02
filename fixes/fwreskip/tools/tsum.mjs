// Per-run Layout counts (>= MIN ms) in vfix T down-up-down runs: first descent and second descent in [D0, D1], up-pass
// in [U0, U1], each Layout with its initiators (as tlinit.mjs) and whether it has none.
// usage: MIN=3 node tsum.mjs <T-*.tl.json>...
import { readFileSync } from 'node:fs';
const MIN = +(process.env.MIN || 3), D0 = 2900, D1 = 3100, U0 = 2400, U1 = 3100, H0 = +(process.env.H0 || 3100), H1 = +(process.env.H1 || 3539); // hold: the parked spots in the band (P2 idle un-skip)
const top = (st) => { const f = (st?.callFrames || []).filter((c) => c.url && c.url !== '[native code]'); const nat = st?.callFrames?.[0]?.functionName || ''; if (!f.length) return nat || '-'; return `${nat}<${f.slice(0, 2).map((c) => `${c.functionName || '?'}:${c.lineNumber + 1}`).join('<')}`; };
for (const file of process.argv.slice(2)) {
  const tl = JSON.parse(readFileSync(file));
  const flat = [];
  const walk = (x, d) => { flat.push({ type: x.type, s: x.startTime * 1000 - tl.off, e: (x.endTime ?? x.startTime) * 1000 - tl.off, d, st: x.stackTrace }); for (const c of x.children || []) walk(c, d + 1); };
  for (const x of tl.recs) walk(x, 0);
  flat.sort((a, b) => a.s - b.s);
  const at = (t) => { let f = tl.fr[0]; for (const x of tl.fr) { if (x[0] > t) break; f = x; } return f; };
  const dir = (t) => (t >= tl.m.down[0] && t <= tl.m.down[1] ? 'down' : t >= tl.m.up[0] && t <= tl.m.up[1] ? 'up' : tl.m.down2 && t >= tl.m.down2[0] && t <= tl.m.down2[1] ? 'down2' : 'hold');
  const out = { down: [], up: [], down2: [], hold: [] };
  let last = -1e9;
  for (const L of flat) {
    if (L.type !== 'Layout' || L.e - L.s < MIN) continue;
    const w0 = Math.max(last, L.s - 60); last = L.e;
    const y = at(L.s)[2], d = dir(L.s);
    if (!out[d]) continue;
    const [lo, hi] = d === 'up' ? [U0, U1] : d === 'hold' ? [H0, H1] : [D0, D1];
    if (y < lo || y > hi) continue;
    const inits = [...new Set(flat.filter((x) => x.s >= w0 && x.s < L.s && /Invalidate|ScheduleStyle/.test(x.type) && x.st).map((x) => `${x.type.replace('ScheduleStyleRecalculation', 'SSR').replace('InvalidateLayout', 'IL').replace('InvalidateStyles', 'IS')}:${top(x.st)}`))];
    const muts = [...new Set((tl.mo || []).filter((m) => m[0] >= w0 - 2 && m[0] <= L.s + 1).map((m) => `${m[2]}.${m[3]}=${m[4]}`))];
    const none = !inits.some((i) => !/^IL:(-|loop)$/.test(i)) && !muts.length;
    out[d].push(`${(L.e - L.s).toFixed(1)}@${y}${none ? ' NOINIT' : ''} [${inits.join(' ')}${muts.length ? ' | ' + muts.slice(0, 4).join(' ') : ''}]`);
  }
  console.log(`== ${file.split('/').slice(-2).join('/')}: down ${out.down.length} | up ${out.up.length} | down2 ${out.down2.length} | hold ${out.hold.length}`);
  for (const d of ['down', 'up', 'down2', 'hold']) for (const x of out[d]) console.log(`   ${d.padEnd(5)} ${x}`);
}
