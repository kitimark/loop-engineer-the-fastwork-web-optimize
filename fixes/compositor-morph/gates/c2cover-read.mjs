// reads c2cover.json files: per arm, F() per y in both walks (panel closed on the way down, panel back from m 0.6 on the
// way up), the y range where F is constant, the distance of the nearest flip from endStart, and arm-vs-arm agreement.
//   node out/cm/c2cover-read.mjs <c2cover.json> ...
import { readFileSync } from 'node:fs';
for (const f of process.argv.slice(2)) {
  const r = JSON.parse(readFileSync(f, 'utf8'));
  const maps = {};
  for (const [k, a] of Object.entries(r.arms)) {
    const es = a.geo.endStart, t = a.geo.t;
    const d = new Map(a.down.map((x) => [x[0], x[1]])), u = new Map(a.up.map((x) => [x[0], x[1]]));
    maps[k] = { d, u };
    let both = 0, dis = 0; for (const [y, v] of d) if (u.has(y)) { both++; if (u.get(y) !== v) dis++; }
    const flipsD = []; for (let i = 1; i < a.down.length; i++) if (a.down[i][1] !== a.down[i - 1][1]) flipsD.push(a.down[i][0]);
    const flipsU = []; for (let i = 1; i < a.up.length; i++) if (a.up[i][1] !== a.up[i - 1][1]) flipsU.push(a.up[i][0]);
    const near = [...flipsD, ...flipsU].map((y) => es - y);
    const lo = Math.max(...flipsD, ...flipsU, -Infinity);
    const zoneVals = new Set(a.down.filter((x) => x[0] >= lo).map((x) => x[1]).concat(a.up.filter((x) => x[0] >= lo + 4).map((x) => x[1])));
    const mis = a.down.concat(a.up).filter((x) => x[1] !== x[2]).length;
    console.log(`${f.split('/').at(-2)} ${k}: h ${r.h} endStart ${es} t ${t} | same-y down/up ${both}, F differs ${dis} | flips down at y ${flipsD} up at y ${flipsU} = ${near.map((n) => n + ' px').join(', ')} above endStart (${near.map((n) => (n / a.geo.ih).toFixed(2) + ' ih').join(', ')}) | F from y ${lo} to ${es + 0.2 * t} (endStart+0.2t): {${[...zoneVals]}} | F != is-on-dark class: ${mis}`);
  }
  const ks = Object.keys(maps);
  if (ks.length === 2) {
    let n = 0, dis = 0; for (const w of ['d', 'u']) for (const [y, v] of maps[ks[0]][w]) if (maps[ks[1]][w].has(y)) { n++; if (maps[ks[1]][w].get(y) !== v) dis++; }
    console.log(`  ${ks[0]} vs ${ks[1]}: same-y positions ${n}, F differs ${dis}`);
  }
}
