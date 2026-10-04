import fs from 'node:fs';
const D = process.argv[2];
const files = fs.readdirSync(D).filter((x) => x.startsWith('t096-2026-10-04T13'));
const loads = files.flatMap((x) => JSON.parse(fs.readFileSync(D + '/' + x)).loads);
const keys = ['beginMainThreadFrame', 'drawFrame', 'droppedFrame', 'fireAnimationFrame', 'countdownRaf', 'countdownFunctionCalls', 'updateLayoutTree', 'layout', 'paint', 'commit', 'layerize', 'updateLayer'];
const out = { files };
for (const arm of ['A', 'A2', 'B']) {
  const L = loads.filter((l) => l.arm === arm);
  const o = (out[arm] = { n: L.length, served: [...new Set(L.map((l) => JSON.stringify(l.served)))].length });
  for (const w of ['R', 'S']) {
    o[w] = {};
    for (const k of keys) o[w][k] = L.map((l) => l.windows[w][k]);
    o[w].pipeline = L.map((l) => JSON.stringify(l.windows[w].pipeline));
    const rs = L.flatMap((l) => l.windows[w].rollStarts);
    const agg = (k) => rs.map((r) => r[k]);
    o[w].roll = { n: rs.length, commit: agg('commit'), layerize: agg('layerize'), paint: agg('paint'), paintedLayers: agg('paintedLayers'), layout: agg('layout'), updateLayoutTree: agg('updateLayoutTree'), updateLayer: agg('updateLayer') };
  }
  o.L = L.map((l) => l.layers.perRoll.map((r) => `+${r.added}/-${r.removed}`).join(' '));
}
console.log(JSON.stringify(out, (k, v) => (Array.isArray(v) && v.every((x) => typeof x === 'number') ? v.join(',') : v), 1));
