// P11 (P-028) readout from tlwin .json + .tl.json: for the slowest frame in y [Y0, Y1] (the rebuild frame) and for the
// whole scroll phase: Layout records nested inside RecalculateStyles (any depth), all Layout records, their ms.
// usage: node p11an.mjs <label> [Y0=1900] [Y1=2050]
import { readFileSync } from 'node:fs';
const [label, Y0 = 1900, Y1 = 2050] = process.argv.slice(2);
const r = JSON.parse(readFileSync(new URL(`./p11-${label}.json`, import.meta.url)));
const tl = JSON.parse(readFileSync(new URL(`./p11-${label}.tl.json`, import.meta.url)));
const off = tl.syncTL * 1000 - tl.syncT; // TL ms = page ms + off
const flat = [];
const walk = (rec, anc) => { flat.push({ type: rec.type, s: rec.startTime * 1000 - off, e: (rec.endTime ?? rec.startTime) * 1000 - off, inStyle: anc.includes('RecalculateStyles'), data: rec.data }); for (const ch of rec.children || []) walk(ch, [...anc, rec.type]); };
for (const rec of tl.recs) walk(rec, []);
const lay = (a, b) => flat.filter((x) => x.type === 'Layout' && x.s >= a && x.s <= b);
const sum = (L) => Math.round(L.reduce((t, x) => t + (x.e - x.s), 0) * 10) / 10;
const [sa, sb] = r.marks.scroll;
const sc = r.frames.filter(([t, , y]) => t >= sa && t <= sb + 2000 && y >= Number(Y0) && y <= Number(Y1));
const worst = sc.reduce((m, f) => (f[1] > m[1] ? f : m), [0, 0, 0]);
const fa = worst[0] - worst[1], fb = worst[0];
const L = lay(fa, fb), N = L.filter((x) => x.inStyle);
const all = lay(sa, sb + 2000), allN = all.filter((x) => x.inStyle);
const big = all.filter((x) => x.e - x.s >= 10);
const sp = r.frames.filter(([t]) => t >= sa && t <= sb);
const cnt = (th) => sp.filter((f) => f[1] > th).length;
console.log(`${label}: frames ${sp.length} >30/>34/>38 ${cnt(30)}/${cnt(34)}/${cnt(38)} >46/>50/>54 ${cnt(46)}/${cnt(50)}/${cnt(54)}`);
console.log(`${label}: rebuild frame ${Math.round(worst[1])} ms @y${worst[2]} | Layout in frame ${L.length} (${sum(L)} ms), nested in RecalcStyles ${N.length} (${sum(N)} ms) | scroll phase: Layout ${all.length} (${sum(all)} ms), nested ${allN.length} (${sum(allN)} ms), >=10 ms ${big.length}`);
