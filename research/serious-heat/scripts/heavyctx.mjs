// Where the heavy frames' largest outer Layout sits (ancestor chain) and its stack key (DESCRIPTIVE, post hoc).
//   node heavyctx.mjs <sim125 dir> <read-inval126.mjs path>
const [dir, readerPath] = process.argv.slice(2);
const { loadRun, stackKey } = await import(readerPath);
const names = ['C-H1', 'C-H2', 'C-H3', 'C-H4', 'C-H5', 'wpx-H1', 'wpx-H2', 'wc1-H1', 'wc1-H2'];
const ctx = {}, out = {};
for (const n of names) {
  const R = loadRun(dir, n);
  for (const q of R.frames) {
    if (!q.L) continue;
    const c = q.heavy ? 'heavy' : q.moving && q.view !== 1 && q.y < 3250 ? 'outStep' : null;
    if (!c) continue;
    const k = `${q.L.anc.includes('Composite') ? 'inside Composite' : 'outside Composite'} | parent ${q.L.parent?.type ?? 'none'} | stack ${stackKey(q.L.stack)}${q.L.stack?.callFrames?.[0]?.url === '[native code]' ? ':' + q.L.stack.callFrames[0].functionName : ''}`;
    (ctx[c] ||= {})[k] = ((ctx[c] ||= {})[k] || 0) + 1;
    (out[c] ||= []).push(q.L.dur);
  }
}
for (const [c, o] of Object.entries(ctx)) {
  const d = out[c].sort((a, b) => a - b);
  console.log(`${c}: ${d.length} frames, largest Layout median ${d[d.length >> 1].toFixed(1)} ms`);
  for (const [k, v] of Object.entries(o).sort((a, b) => b[1] - a[1])) console.log(`  ${v}  ${k}`);
}
