// the lead's fixed n=6 mount gate (README "Mount cost"): median(ws3) - median(H) for mount-frame dur and L+S, first-3-drag counts.
// Input: eop-mount.mjs results out/eopp/mount3/mount-{pH,phws3}-{1..6}.json. Usage: node fixes/g0-box/phone/eop-mountgate.mjs
import { readFileSync } from 'node:fs';
const D = new URL('../../../out/eopp/mount3/', import.meta.url).pathname;
const med = (a) => { const s = [...a].sort((x, y) => x - y); const n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; };
const r1 = (x) => Math.round(x * 10) / 10;
const get = (arm) => [1, 2, 3, 4, 5, 6].map((n) => JSON.parse(readFileSync(`${D}mount-${arm}-${n}.json`, 'utf8')));
const A = { H: get('pH'), ws3: get('phws3') };
const out = {};
for (const [k, L] of Object.entries(A)) {
  const dur = L.map((r) => r.mount.frame.dur), ls = L.map((r) => r.mount.frame.ls), g50 = L.map((r) => r.scrollPhase.gt50), g34 = L.map((r) => r.scrollPhase.gt34);
  out[k] = { dur, ls, g50, g34, mdur: med(dur), mls: med(ls), wheel: L.map((r) => r.wheelAdd?.pm ?? null) };
  console.log(`${k}: dur ${dur.join(', ')} (median ${r1(med(dur))}) | L+S ${ls.join(', ')} (median ${r1(med(ls))}) | drags >50 ${g50.join(',')} >34 ${g34.join(',')} | wheel add ms ${out[k].wheel.join(',')}`);
}
const dd = r1(out.ws3.mdur - out.H.mdur), dl = r1(out.ws3.mls - out.H.mls);
const ov = (a, b) => Math.max(...a) >= Math.min(...b) && Math.max(...b) >= Math.min(...a);
const drags = ov(out.H.g50, out.ws3.g50) && ov(out.H.g34, out.ws3.g34);
console.log(`GATE n=6: dur ${dd >= 0 ? '+' : ''}${dd} ms, L+S ${dl >= 0 ? '+' : ''}${dl} ms, drags overlap ${drags} -> ${dd <= 4 && dl <= 4 && drags ? 'PASS' : 'FAIL'}`);
