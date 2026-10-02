// For each Layout >= MIN ms in a vfix T run (T-<arm>.tl.json): y, direction, depth, duration, the initiators
// (stack tops of InvalidateLayout / ScheduleStyleRecalculation / InvalidateStyles records since the previous long
// Layout, at most 60 ms back) and the attribute mutations (MutationObserver stamps) in the same window.
// usage: MIN=3 Y0=2400 node tlinit.mjs <T-arm.tl.json>...
import { readFileSync } from 'node:fs';
const MIN = +(process.env.MIN || 3), Y0 = +(process.env.Y0 || 2400), Y1 = +(process.env.Y1 || 1e9);
const top = (st) => { const f = (st?.callFrames || []).filter((c) => c.url && c.url !== '[native code]'); const nat = st?.callFrames?.[0]?.functionName || ''; if (!f.length) return nat || '-'; return `${nat}<${f.slice(0, 2).map((c) => `${c.functionName || '?'}:${c.lineNumber + 1}`).join('<')}`; };
for (const file of process.argv.slice(2)) {
  const tl = JSON.parse(readFileSync(file));
  const off = tl.off;
  const flat = [];
  const walk = (x, d) => { flat.push({ type: x.type, s: x.startTime * 1000 - off, e: (x.endTime ?? x.startTime) * 1000 - off, d, st: x.stackTrace }); for (const c of x.children || []) walk(c, d + 1); };
  for (const x of tl.recs) walk(x, 0);
  flat.sort((a, b) => a.s - b.s);
  const at = (t) => { let f = tl.fr[0]; for (const x of tl.fr) { if (x[0] > t) break; f = x; } return f; };
  const dir = (t) => (t >= tl.m.down[0] && t <= tl.m.down[1] ? 'down' : t >= tl.m.up[0] && t <= tl.m.up[1] ? 'up' : tl.m.down2 && t >= tl.m.down2[0] && t <= tl.m.down2[1] ? 'down2' : 'hold');
  console.log(`== ${file.split('/').pop()}`);
  let last = -1e9;
  for (const L of flat) {
    if (L.type !== 'Layout') continue;
    if (L.e - L.s < MIN) { continue; }
    const f = at(L.s); const w0 = Math.max(last, L.s - 60);
    last = L.e;
    if (f[2] < Y0 || f[2] > Y1) continue;
    const inits = flat.filter((x) => x.s >= w0 && x.s < L.s && /Invalidate|ScheduleStyle/.test(x.type) && x.st).map((x) => `${x.type.replace('ScheduleStyleRecalculation', 'SSR').replace('InvalidateLayout', 'IL').replace('InvalidateStyles', 'IS')}:${top(x.st)}`);
    const muts = (tl.mo || []).filter((m) => m[0] >= w0 - 2 && m[0] <= L.s + 1 && m[3] !== 'fw-wc' || (m[3] === 'fw-wc' && m[0] >= w0 - 2 && m[0] <= L.s + 1 && m[4] !== undefined)).map((m) => `${m[2]}.${m[3]}=${m[4]}`);
    console.log(`  ${(L.e - L.s).toFixed(1).padStart(5)} ms y${f[2]} ${dir(L.s)} d${L.d} [${f[3]}/${f[4]}] | ${[...new Set(inits)].join(' ')} | mut: ${[...new Set(muts)].slice(0, 6).join(' ')}`);
  }
}
